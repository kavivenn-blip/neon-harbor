// Neon Harbor — serve.ts
// A tiny static file server for playing the game over HTTP on a desktop
// browser, the same way the starter kit serves its game:
//
//   node serve.ts            serves on http://localhost:8080
//   node serve.ts 18081      serves on http://localhost:18081
//
// The root path serves game/index.html, so opening the server in a browser
// starts the game. Nothing is served from outside the game directory: a path
// that climbs out of it with `..` (even URL-encoded) is refused with
// 403, and a missing file answers 404. No directory listing, no uploads,
// no network fetches of any kind — the game itself loads only local files.
//
// Node 22, standard library only. Run it from the repository root.

import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

// ------------------------------------------------------------------ setup

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)));
const GAME_DIR = join(REPO_ROOT, 'game');

// The port is the first argument, then the PORT environment variable, then
// the kit's usual 8080. Anything that is not a plain port number is refused
// instead of silently falling back, so a typo fails loudly.
function portFrom(argv: string[]): number {
  const raw = argv[2] ?? process.env.PORT ?? '8080';
  if (!/^[0-9]+$/.test(raw)) throw new Error(`serve.ts: port ${JSON.stringify(raw)} is not a number`);
  const port = Number(raw);
  if (port < 1 || port > 65535) throw new Error(`serve.ts: port ${port} is out of range`);
  return port;
}

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

const mimeFor = (path: string): string =>
  MIME[extname(path).toLowerCase()] ?? 'application/octet-stream';

// ------------------------------------------------------------------ routing

// Resolve a request path to a file under the game directory, which is
// the web root: the page is served as /index.html and its relative
// imports resolve as /src/..., /vendor/..., so the game directory —
// not the repository root — is the base. The root itself and any
// directory answer with that directory's index.html; anything else
// answers with the file. A path that climbs out of the game directory
// is refused with null (the handler answers 403).
function resolveRequest(urlPath: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  // Strip any query or fragment that slipped through, then normalise.
  const cut = decoded.search(/[?#]/);
  const clean = cut < 0 ? decoded : decoded.slice(0, cut);
  const joined = normalize(join(GAME_DIR, clean));
  if (joined !== GAME_DIR && !joined.startsWith(GAME_DIR + sep)) return null;
  // normalize() keeps a trailing slash on the root itself
  // ("/game/"), so the root test must accept that form too.
  if (joined === GAME_DIR || joined === GAME_DIR + sep) return join(GAME_DIR, 'index.html');
  if (existsSync(joined) && statSync(joined).isDirectory()) {
    return join(joined, 'index.html');
  }
  return joined;
}

// ------------------------------------------------------------------ server

const server = createServer((req, res) => {
  const started = Date.now();
  const send = (status: number, body: string): void => {
    res.writeHead(status, { 'content-type': 'text/plain; charset=utf-8' });
    res.end(body);
  };
  try {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      send(405, 'Method not allowed\n');
      return;
    }
    const file = resolveRequest(url.pathname);
    if (file === null) {
      send(403, 'Forbidden\n');
      return;
    }
    if (!existsSync(file) || !statSync(file).isFile()) {
      send(404, `Not found: ${url.pathname}\n`);
      return;
    }
    res.writeHead(200, {
      'content-type': mimeFor(file),
      'content-length': statSync(file).size,
      'cache-control': 'no-cache',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    createReadStream(file).pipe(res);
    res.on('finish', () => {
      const ms = Date.now() - started;
      console.log(`${req.method} ${url.pathname} 200 ${ms}ms`);
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`serve.ts: ${message}`);
    if (!res.headersSent) send(500, 'Internal server error\n');
  }
});

const port = portFrom(process.argv);
server.listen(port, () => {
  console.log(`Neon Harbor at http://localhost:${port}/`);
});
