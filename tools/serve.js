#!/usr/bin/env node
// Minimal static file server for local development.
//
// Node is already required for the tests and the desktop build, so serving the
// app with it too means the launcher has a single prerequisite instead of also
// needing Python on PATH.
//
//   node tools/serve.js [port]

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const PORT = Number(process.argv[2]) || Number(process.env.PORT) || 8000;
const OPEN = !process.argv.includes('--no-open');

const MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.ttf': 'font/ttf',
    '.woff2': 'font/woff2',
    '.pdf': 'application/pdf',
    // .asc and .asy are plain text; serving them as such lets the app fetch
    // symbol definitions and the bundled examples.
    '.asc': 'text/plain; charset=utf-8',
    '.asy': 'text/plain; charset=utf-8',
    '.md': 'text/markdown; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
};

const server = http.createServer((req, res) => {
    let rel;
    try {
        rel = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
    } catch {
        res.writeHead(400).end('Bad request');
        return;
    }
    if (rel === '/' || rel === '') rel = '/index.html';

    // Resolve inside ROOT only — never serve a path that escapes the repo.
    const target = path.resolve(ROOT, '.' + rel);
    if (target !== ROOT && !target.startsWith(ROOT + path.sep)) {
        res.writeHead(403).end('Forbidden');
        return;
    }

    fs.stat(target, (err, stat) => {
        if (err || stat.isDirectory()) {
            res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
            res.end(`404  ${rel}`);
            return;
        }
        res.writeHead(200, {
            'Content-Type': MIME[path.extname(target).toLowerCase()] || 'application/octet-stream',
            'Content-Length': stat.size,
            // Always revalidate: stale scripts during development are a trap.
            'Cache-Control': 'no-store',
        });
        fs.createReadStream(target).pipe(res);
    });
});

server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
        console.error(`\n  Port ${PORT} is already in use.`);
        console.error(`  Either close the other server, or run: node tools/serve.js ${PORT + 1}\n`);
        process.exit(1);
    }
    throw err;
});

server.listen(PORT, () => {
    const url = `http://localhost:${PORT}/`;
    console.log(`\n  Serving ${ROOT}`);
    console.log(`  ${url}`);
    console.log('\n  Press Ctrl+C to stop.\n');

    if (OPEN && process.platform === 'win32') {
        execFile('cmd', ['/c', 'start', '', url], () => {});
    } else if (OPEN && process.platform === 'darwin') {
        execFile('open', [url], () => {});
    } else if (OPEN) {
        execFile('xdg-open', [url], () => {});
    }
});
