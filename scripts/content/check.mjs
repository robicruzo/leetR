#!/usr/bin/env node
// Check every track's content inside webR and write it as JSON for the app.
//
//   npm run content            (runs after `npm run assets`, before dev/build)
//   npm run content -- --force (rebuild even if nothing changed)
//
// For each content/<track>/ with a track.yml:
//   1. scripts/content/build.R runs every animation step, solution, fix-it
//      starter and `verify` line, and writes src/lib/generated/track-<dir>.json
//   2. scripts/content/selftest.R grades every challenge with the app's own
//      grader (src/lib/r/grader.R), so grading gaps fail the build too.
//
// R packages are installed from static/webr-repo/, the mirror the app ships,
// served on a throwaway local port. So the content is checked against exactly
// the package builds learners will run. Versions go to content/packages.lock.json.

import { WebR } from 'webr';
import { createHash } from 'node:crypto';
import { createServer } from 'node:http';
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const force = process.argv.includes('--force');
const config = JSON.parse(readFileSync(join(root, 'r-packages.json'), 'utf8'));
const webrVersion = JSON.parse(readFileSync(join(root, 'node_modules/webr/package.json'), 'utf8')).version;
const repoDir = join(root, 'static/webr-repo');
const outDir = join(root, 'src/lib/generated');
const hashFile = join(outDir, '.content-hash');

const tracks = readdirSync(join(root, 'content'))
	.filter((d) => existsSync(join(root, 'content', d, 'track.yml')))
	.sort();

if (!existsSync(join(repoDir, 'bin'))) {
	console.error('static/webr-repo is missing: run `npm run assets` first.');
	process.exit(2);
}

// ---- skip when nothing that affects the output has changed -----------------
function filesUnder(p) {
	if (!existsSync(p)) return [];
	if (statSync(p).isFile()) return [p];
	return readdirSync(p).sort().flatMap((f) => filesUnder(join(p, f)));
}
const inputs = [
	join(root, 'content'),
	join(root, 'scripts/content'),
	join(root, 'src/lib/r/grader.R'),
	join(root, 'r-packages.json'),
	join(repoDir, 'bin/emscripten/contrib', config.rVersion, 'PACKAGES')
].flatMap(filesUnder).filter((f) => !f.endsWith('packages.lock.json'));
const hash = createHash('sha256');
hash.update(webrVersion);
for (const f of inputs) hash.update(relative(root, f)).update(readFileSync(f));
const digest = hash.digest('hex');
const outputs = tracks.map((t) => join(outDir, `track-${t}.json`));
if (!force && existsSync(hashFile) && readFileSync(hashFile, 'utf8') === digest && outputs.every(existsSync)) {
	console.log(`Content unchanged (${tracks.join(', ')}); skipping the webR check.`);
	process.exit(0);
}
mkdirSync(outDir, { recursive: true });

// ---- serve the package mirror locally ---------------------------------------
const server = createServer((req, res) => {
	const file = join(repoDir, decodeURIComponent(new URL(req.url, 'http://x').pathname));
	if (!file.startsWith(repoDir) || !existsSync(file) || !statSync(file).isFile()) {
		res.writeHead(404).end();
		return;
	}
	res.writeHead(200).end(readFileSync(file));
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const repoUrl = `http://127.0.0.1:${server.address().port}`;

// ---- start webR and install the packages ------------------------------------
const webR = new WebR({ interactive: false });
await webR.init();
await webR.FS.mkdir('/work');
await webR.FS.mount('NODEFS', { root }, '/work');
const shelter = await new webR.Shelter();

async function run(code) {
	const res = await shelter.captureR(code, { withAutoprint: false, captureConditions: false });
	for (const line of res.output) if (line.type === 'stdout' || line.type === 'stderr') console.log(line.data);
	return res;
}
const rstr = async (code) => (await webR.evalRString(code)).trim();

let status = 0;
try {
	console.log(`${await rstr('R.version.string')} (webR ${webrVersion})`);
	const pkgs = [...config.packages, ...(config.buildPackages ?? [])];
	await webR.installPackages(pkgs, { repos: [repoUrl], quiet: true, mount: true });
	const missing = await rstr(
		`paste(setdiff(c(${pkgs.map((p) => `"${p}"`).join(', ')}), rownames(installed.packages())), collapse = ", ")`
	);
	if (missing) throw new Error(`Could not install from static/webr-repo: ${missing}`);

	// Record exactly what the content was checked against.
	await run(`local({
		ip <- installed.packages()
		ip <- ip[is.na(ip[, "Priority"]) | ip[, "Priority"] != "base", , drop = FALSE]
		ip <- ip[order(ip[, "Package"]), , drop = FALSE]
		ip <- ip[!duplicated(ip[, "Package"]), , drop = FALSE]
		lock <- list(webr = "${webrVersion}", r = R.version.string,
		             packages = as.list(setNames(ip[, "Version"], ip[, "Package"])))
		writeLines(jsonlite::toJSON(lock, auto_unbox = TRUE, pretty = TRUE), "/work/content/packages.lock.json")
	})`);

	for (const t of tracks) {
		const out = `/work/src/lib/generated/track-${t}.json`;
		console.log(`\n── ${t} ──`);
		await run(`.build_args <- c("/work/content/${t}", "${out}"); .build_status <- 0L
		           source("/work/scripts/content/build.R", local = new.env())`);
		if (Number(await rstr('as.character(.build_status)')) !== 0) {
			status = 1;
			continue;
		}
		await run(`.selftest_args <- c("${out}", "/work/src/lib/r/grader.R"); .selftest_status <- 0L
		           source("/work/scripts/content/selftest.R", local = new.env())`);
		if (Number(await rstr('as.character(.selftest_status)')) !== 0) status = 1;
	}
} catch (err) {
	console.error(String(err?.message ?? err));
	status = 2;
} finally {
	webR.close();
	server.close();
}

if (status === 0) {
	writeFileSync(hashFile, digest);
	console.log(`\nWrote ${outputs.map((o) => relative(root, o)).join(', ')}. Package versions: content/packages.lock.json.`);
} else {
	console.log('\nContent check failed: fix the problems listed above.');
}
process.exit(status);
