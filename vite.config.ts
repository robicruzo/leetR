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

// server.headers doesn't cover SvelteKit's own HTML responses, so set them in middleware.
const isolate: Plugin = {
	name: 'leetr-cross-origin-isolation',
	configureServer(server) {
		server.middlewares.use((_req, res, next) => {
			for (const [k, v] of Object.entries(crossOriginIsolation)) res.setHeader(k, v);
			next();
		});
	},
	configurePreviewServer(server) {
		server.middlewares.use((_req, res, next) => {
			for (const [k, v] of Object.entries(crossOriginIsolation)) res.setHeader(k, v);
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
