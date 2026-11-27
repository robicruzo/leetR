
// One service worker, two jobs:
//   1. Offline: precache the app shell, every prerendered page, the webR
//      runtime and the mirrored R packages, then serve cache-first.
//   2. Cross-origin isolation: add COOP/COEP headers to every response so the
//      page gets SharedArrayBuffer (webR's fast channel + interrupts) even on
//      static hosts that can't set headers, like GitHub Pages.

import { self as sw } from '$app/service-worker';
import { immutable, assets, prerendered } from '$app/manifest';
import { version } from '$app/env';
import { resolve } from '$app/paths';

// Manifest paths are relative to the base path.
const base = resolve('/').replace(/\/$/, '');
const CACHE = `leetr-${version}`;
const ASSETS = [...new Set([...immutable, ...assets, ...prerendered].map((f) => base + '/' + f.path.replace(/^\//, '')))].filter(
	(p) => !p.endsWith('/.version')
);

sw.addEventListener('install', (event) => {
	event.waitUntil(
		(async () => {
			const cache = await caches.open(CACHE);
			// Add in small batches: ~70 MB in one addAll() is fragile.
			for (let i = 0; i < ASSETS.length; i += 20) {
				await cache.addAll(ASSETS.slice(i, i + 20));
			}
			await sw.skipWaiting();
		})()
	);
});

sw.addEventListener('activate', (event) => {
	event.waitUntil(
		(async () => {
			for (const key of await caches.keys()) if (key !== CACHE) await caches.delete(key);
			await sw.clients.claim();
		})()
	);
});

function isolate(res: Response): Response {
	if (res.status === 0 || res.type === 'opaque') return res;
	const headers = new Headers(res.headers);
	headers.set('Cross-Origin-Opener-Policy', 'same-origin');
	headers.set('Cross-Origin-Embedder-Policy', 'require-corp');
	headers.set('Cross-Origin-Resource-Policy', 'same-origin');
	return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

// webR's lazy filesystem (Emscripten lazy files) probes each file with a
// synchronous HEAD request, then may fetch it in byte ranges. Both must be
// answerable from the cache or R can't start offline.
async function fromCache(cached: Response, req: Request): Promise<Response> {
	if (req.method === 'HEAD') {
		return new Response(null, { status: cached.status, statusText: cached.statusText, headers: cached.headers });
	}
	const range = req.headers.get('Range')?.match(/^bytes=(\d+)-(\d*)$/);
	if (!range) return cached;
	const buf = await cached.arrayBuffer();
	const start = Number(range[1]);
	const end = range[2] ? Math.min(Number(range[2]), buf.byteLength - 1) : buf.byteLength - 1;
	const headers = new Headers(cached.headers);
	headers.set('Content-Range', `bytes ${start}-${end}/${buf.byteLength}`);
	headers.set('Content-Length', String(end - start + 1));
	return new Response(buf.slice(start, end + 1), { status: 206, statusText: 'Partial Content', headers });
}

// The R package index is the one file that changes without changing its name.
// During an update the old service worker still controls the page, so a page
// that is new in the update (fetched from the network) could get the old,
// cached index and fail to find a newly added package. Fetch it network-first,
// and fall back to the cache only when offline.
const PACKAGE_INDEX = /\/webr-repo\/.*\/PACKAGES(\.gz|\.rds)?$/;

async function networkFirst(req: Request, cache: Cache): Promise<Response> {
	try {
		const res = await fetch(req, { cache: 'no-cache' });
		if (res.ok && req.method === 'GET') cache.put(req, res.clone());
		return isolate(res);
	} catch (err) {
		const cached = await cache.match(req.url, { ignoreVary: true });
		if (cached) return isolate(await fromCache(cached, req));
		throw err;
	}
}

sw.addEventListener('fetch', (event) => {
	const req = event.request;
	if (req.method !== 'GET' && req.method !== 'HEAD') return;
	const url = new URL(req.url);
	if (url.origin !== sw.location.origin) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);
			if (PACKAGE_INDEX.test(url.pathname)) return networkFirst(req, cache);
			// Cache keys are GET requests; match HEAD/Range requests against them by URL.
			const key = req.method === 'GET' && !req.headers.has('Range') ? req : req.url;
			// ignoreVary: hosts often send `Vary: Origin`, and module imports carry an
			// Origin header that the precache requests did not, so they would never match.
			const cached = await cache.match(key, { ignoreSearch: req.mode === 'navigate', ignoreVary: true });
			if (cached) return isolate(await fromCache(cached, req));
			try {
				const res = await fetch(req);
				if (res.ok && res.status === 200 && res.type === 'basic' && req.method === 'GET') {
					cache.put(req, res.clone());
				}
				return isolate(res);
			} catch (err) {
				if (req.mode === 'navigate') {
					const fallback = (await cache.match(`${base}/`)) ?? (await cache.match(`${base}/404.html`));
					if (fallback) return isolate(fallback);
				}
				throw err;
			}
		})()
	);
});
