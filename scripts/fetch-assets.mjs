#!/usr/bin/env node
// Build-time asset fetcher. Makes the app fully offline-capable by:
//   1. copying the webR runtime out of node_modules into static/webr/
//   2. mirroring the R packages we need (plus their recursive deps) from
//      repo.r-wasm.org into static/webr-repo/, laid out like a CRAN repo,
//      so webR's installPackages() can be pointed at our own origin.
//
// Run with: npm run assets   (also runs automatically before dev/build)

import { createHash } from 'node:crypto';
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const config = JSON.parse(await readFile(path.join(root, 'r-packages.json'), 'utf8'));

const R_MINOR = config.rVersion; // e.g. "4.6" - must match the webR build's R version
const REMOTE = `https://repo.r-wasm.org/bin/emscripten/contrib/${R_MINOR}`;
const LOCAL_REPO = path.join(root, 'static', 'webr-repo');
const LOCAL_CONTRIB = path.join(LOCAL_REPO, 'bin', 'emscripten', 'contrib', R_MINOR);

// Packages that ship with R itself (never fetched).
const BASE = new Set([
	'R', 'base', 'compiler', 'datasets', 'grDevices', 'graphics', 'grid', 'methods',
	'parallel', 'splines', 'stats', 'stats4', 'tcltk', 'tools', 'utils', 'webr'
]);

async function copyWebR() {
	const src = path.join(root, 'node_modules', 'webr', 'dist');
	const dest = path.join(root, 'static', 'webr');
	const pkg = JSON.parse(await readFile(path.join(root, 'node_modules', 'webr', 'package.json'), 'utf8'));
	const marker = path.join(dest, '.version');
	if (existsSync(marker) && (await readFile(marker, 'utf8')) === pkg.version) {
		console.log(`webR ${pkg.version} runtime already in static/webr`);
		return;
	}
	await rm(dest, { recursive: true, force: true });
	await cp(src, dest, {
		recursive: true,
		// Drop things the browser never needs.
		filter: (p) => !/\.(map|d\.ts|cjs)$/.test(p) && !/[/\\](tests|repl)([/\\]|$)/.test(p)
	});
	await writeFile(marker, pkg.version);
	console.log(`Copied webR ${pkg.version} runtime to static/webr`);
}

function parseDCF(text) {
	const records = [];
	for (const block of text.split(/\n\s*\n/)) {
		const rec = {};
		let key = null;
		for (const line of block.split('\n')) {
			if (/^\s/.test(line) && key) rec[key] += ' ' + line.trim();
			else {
				const m = line.match(/^([^:]+):\s*(.*)$/);
				if (m) rec[(key = m[1])] = m[2];
			}
		}
		if (rec.Package) records.push(rec);
	}
	return records;
}

const depNames = (field) =>
	(field ?? '')
		.split(',')
		.map((s) => s.trim().replace(/\s*\(.*\)$/, ''))
		.filter(Boolean);

async function mirrorPackages() {
	console.log(`Fetching package index for R ${R_MINOR}...`);
	const res = await fetch(`${REMOTE}/PACKAGES`);
	if (!res.ok) throw new Error(`PACKAGES: HTTP ${res.status}`);
	const index = new Map(parseDCF(await res.text()).map((r) => [r.Package, r]));

	// Resolve hard dependencies recursively.
	const needed = new Map();
	// The app installs `packages`; the content check (scripts/content/check.mjs)
	// also needs `buildPackages`, and installs them from this same mirror.
	const queue = [...config.packages, ...(config.buildPackages ?? [])];
	while (queue.length) {
		const name = queue.shift();
		if (BASE.has(name) || needed.has(name)) continue;
		const rec = index.get(name);
		if (!rec) throw new Error(`Package "${name}" is not available for webR (R ${R_MINOR})`);
		needed.set(name, rec);
		queue.push(...depNames(rec.Depends), ...depNames(rec.Imports), ...depNames(rec.LinkingTo));
	}

	await mkdir(LOCAL_CONTRIB, { recursive: true });
	let bytes = 0;
	for (const rec of needed.values()) {
		const file = path.join(LOCAL_CONTRIB, rec.File);
		let buf;
		if (existsSync(file)) buf = await readFile(file);
		else {
			const r = await fetch(`${REMOTE}/${rec.File}`);
			if (!r.ok) throw new Error(`${rec.File}: HTTP ${r.status}`);
			buf = Buffer.from(await r.arrayBuffer());
			const md5 = createHash('md5').update(buf).digest('hex');
			if (rec.MD5sum && md5 !== rec.MD5sum) throw new Error(`${rec.File}: MD5 mismatch`);
			await writeFile(file, buf);
			console.log(`  ↓ ${rec.File}`);
		}
		bytes += buf.length;
	}

	// Write a trimmed index containing only what we ship.
	const fields = ['Package', 'Version', 'Depends', 'Imports', 'LinkingTo', 'License', 'MD5sum', 'File'];
	const dcf =
		[...needed.values()]
			.map((r) => fields.filter((f) => r[f]).map((f) => `${f}: ${r[f]}`).join('\n'))
			.join('\n\n') + '\n';
	await writeFile(path.join(LOCAL_CONTRIB, 'PACKAGES'), dcf);
	await writeFile(path.join(LOCAL_CONTRIB, 'PACKAGES.gz'), gzipSync(dcf));
	// R looks for PACKAGES.rds first. It falls back fine without it but logs a
	// 404, so write one when a native R is around to do it.
	const rds = spawnSync(
		'Rscript',
		['-e', `saveRDS(read.dcf(file.path(commandArgs(TRUE)[1], "PACKAGES")), file.path(commandArgs(TRUE)[1], "PACKAGES.rds"))`, LOCAL_CONTRIB],
		{ stdio: 'ignore' }
	);
	if (rds.status !== 0) console.log('  (Rscript not found: skipping PACKAGES.rds; webR falls back to PACKAGES)');
	console.log(
		`Mirrored ${needed.size} packages (${(bytes / 1e6).toFixed(1)} MB) for: ${[...config.packages, ...(config.buildPackages ?? [])].join(', ')}`
	);
}

await copyWebR();
await mirrorPackages();
