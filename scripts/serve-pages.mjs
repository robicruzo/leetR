#!/usr/bin/env node
// Serve build/ the way GitHub Pages does, to test a Pages build locally:
//   BASE_PATH=/leetR npm run build
//   npm run serve:pages            (http://localhost:4175/leetR/)
//
// Like Pages: the site lives under BASE_PATH, folders redirect to their
// trailing-slash form and serve index.html, unknown paths get 404.html, HEAD
// and byte ranges work, and NO Cross-Origin-Opener/Embedder-Policy headers
// are sent. So webR's SharedArrayBuffer channel only works if the service
// worker adds those headers itself.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(import.meta.url), '../../build');
const base = (process.env.BASE_PATH ?? '/leetR').replace(/\/$/, '');
const port = Number(process.env.PORT ?? 4175);

const TYPES = {
	'.html': 'text/html; charset=utf-8',
	'.js': 'text/javascript; charset=utf-8',
	'.mjs': 'text/javascript; charset=utf-8',
	'.css': 'text/css; charset=utf-8',
	'.json': 'application/json',
	'.webmanifest': 'application/manifest+json',
	'.svg': 'image/svg+xml',
	'.wasm': 'application/wasm',
	'.txt': 'text/plain; charset=utf-8',
	'.pem': 'text/plain; charset=utf-8',
	'.conf': 'text/plain; charset=utf-8',
	'.ttf': 'font/ttf'
};

function send(req, res, file, status = 200) {
	const size = statSync(file).size;
	const headers = {
		'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream',
		'Accept-Ranges': 'bytes',
		'Cache-Control': 'max-age=600' // what Pages sends
	};
	const range = status === 200 ? req.headers.range?.match(/^bytes=(\d+)-(\d*)$/) : null;
	if (range) {
		const start = Number(range[1]);
		const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
		res.writeHead(206, { ...headers, 'Content-Range': `bytes ${start}-${end}/${size}`, 'Content-Length': end - start + 1 });
		if (req.method === 'HEAD') return res.end();
		return createReadStream(file, { start, end }).pipe(res);
	}
	res.writeHead(status, { ...headers, 'Content-Length': size });
	if (req.method === 'HEAD') return res.end();
	createReadStream(file).pipe(res);
}

createServer((req, res) => {
	const url = new URL(req.url, 'http://localhost');
	if (url.pathname === '/' || url.pathname === base) {
		res.writeHead(301, { Location: base + '/' });
		return res.end();
	}
	if (!url.pathname.startsWith(base + '/')) {
		res.writeHead(404).end('Not under ' + base);
		return;
	}
	const rel = normalize(decodeURIComponent(url.pathname.slice(base.length)));
	const file = join(root, rel);
	if (!file.startsWith(root)) return res.writeHead(403).end();
	if (existsSync(file) && statSync(file).isDirectory()) {
		if (!url.pathname.endsWith('/')) {
			res.writeHead(301, { Location: url.pathname + '/' + url.search });
			return res.end();
		}
		if (existsSync(join(file, 'index.html'))) return send(req, res, join(file, 'index.html'));
	} else if (existsSync(file)) {
		return send(req, res, file);
	}
	send(req, res, join(root, '404.html'), 404);
}).listen(port, () => console.log(`Serving build/ like GitHub Pages at http://localhost:${port}${base}/ (no COOP/COEP headers)`));
