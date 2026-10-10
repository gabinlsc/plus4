import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { extname, join, normalize, resolve, sep } from 'node:path';

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function isFile(path: string): Promise<boolean> {
  try {
    return (await stat(path)).isFile();
  } catch {
    return false;
  }
}

/**
 * Serves the built web client. Hashed assets are cached forever; any other
 * extension-less path falls back to index.html (single-page app).
 * Resolves to `false` when the request is not for a static file.
 */
export function createStaticHandler(rootDir: string) {
  const root = resolve(rootDir);

  return async (req: IncomingMessage, res: ServerResponse): Promise<boolean> => {
    if (req.method !== 'GET' && req.method !== 'HEAD') return false;
    let pathname: string;
    try {
      pathname = decodeURIComponent(new URL(req.url ?? '/', 'http://localhost').pathname);
    } catch {
      return false;
    }
    const candidate = normalize(join(root, pathname));
    // Path traversal guard: never serve outside the root directory.
    if (candidate !== root && !candidate.startsWith(root + sep)) return false;

    let file = candidate;
    if (!(await isFile(file))) {
      if (extname(pathname) !== '') return false;
      file = join(root, 'index.html');
      if (!(await isFile(file))) return false;
    }

    const immutable = file.startsWith(join(root, 'assets') + sep);
    res.writeHead(200, {
      'content-type': MIME[extname(file)] ?? 'application/octet-stream',
      'cache-control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      'x-content-type-options': 'nosniff',
    });
    if (req.method === 'HEAD') {
      res.end();
      return true;
    }
    await new Promise<void>((done) => {
      createReadStream(file)
        .on('error', () => res.destroy())
        .on('close', done)
        .pipe(res);
    });
    return true;
  };
}
