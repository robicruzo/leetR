import adapter from '@sveltejs/adapter-static';
import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig, type Plugin } from 'vite';

// webR's fastest channel (and reliable interrupts) needs SharedArrayBuffer,
// which browsers only expose to cross-origin isolated pages. In dev/preview we
// send the headers from Vite; in production the service worker injects them
// (see src/service-worker/index.ts), so any static host works, even GitHub Pages.
const crossOriginIsolation = {
	'Cross-Origin-Opener-Policy': 'same-origin',
	'Cross-Origin-Embedder-Policy': 'require-corp'
};

// Vite's static file server sends `.gz` files with `Content-Encoding: gzip`,
// so the browser unzips them on the way in. webR's filesystem images
// (static/webr/vfs/**/*.data.gz, e.g. R's share/ with the time-zone files)
// are unzipped by webR itself, and unzipping twice broke every file in them:
// any date-time in a real time zone failed with an empty error. Serve them as
// plain application/gzip bytes, like GitHub Pages does.
type Res = import('node:http').ServerResponse;
function rawGzip(url: string | undefined, res: Res) {
	if (!url?.split('?')[0].endsWith('.gz')) return;
	const fix = (k: string, v: unknown) =>
		k.toLowerCase() === 'content-encoding' ? null : k.toLowerCase() === 'content-type' ? 'application/gzip' : v;
	const setHeader = res.setHeader.bind(res);
	res.setHeader = ((k: string, v: never) => {
		const out = fix(k, v);
		return out === null ? res : setHeader(k, out as never);
	}) as Res['setHeader'];
	const writeHead = res.writeHead.bind(res) as (...a: unknown[]) => Res;
	res.writeHead = ((code: number, ...rest: unknown[]) => {
		const headers = rest.find((r) => r && typeof r === 'object') as Record<string, unknown> | undefined;
		if (headers) {
			for (const k of Object.keys(headers)) {
				const out = fix(k, headers[k]);
				if (out === null) delete headers[k];
				else headers[k] = out;
			}
		}
		res.removeHeader('Content-Encoding');
		return writeHead(code, ...rest);
	}) as Res['writeHead'];
}

// server.headers doesn't cover SvelteKit's own HTML responses, so set them in middleware.
const isolate: Plugin = {
	name: 'leetr-cross-origin-isolation',
	configureServer(server) {
		server.middlewares.use((req, res, next) => {
			for (const [k, v] of Object.entries(crossOriginIsolation)) res.setHeader(k, v);
			rawGzip(req.url, res);
			next();
		});
	},
	configurePreviewServer(server) {
		server.middlewares.use((req, res, next) => {
			for (const [k, v] of Object.entries(crossOriginIsolation)) res.setHeader(k, v);
			rawGzip(req.url, res);
			next();
		});
	}
};

export default defineConfig({
	plugins: [
		isolate,
		sveltekit({
			compilerOptions: {
				// Force runes mode for the project, except for libraries. Can be removed in svelte 6.
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			// Fully static output: every page is prerendered, no server.
			adapter: adapter({ fallback: '404.html' }),
			// Set BASE_PATH=/repo-name when deploying to a sub-path (e.g. GitHub Pages).
			paths: { base: (process.env.BASE_PATH ?? '') as '' | `/${string}` },
			// Registered manually in production only (precaching ~70 MB in dev is no fun).
			serviceWorker: { register: false }
		})
	],
	optimizeDeps: { exclude: ['webr'] }
});
