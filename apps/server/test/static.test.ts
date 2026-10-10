import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createUnoServer, type UnoServerInstance } from '../src/app';
import { loadConfig } from '../src/config';

let server: UnoServerInstance;
let port: number;

beforeAll(async () => {
  const dir = mkdtempSync(join(tmpdir(), 'uno-static-'));
  mkdirSync(join(dir, 'assets'));
  writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Uno</title>');
  writeFileSync(join(dir, 'assets', 'app-123.js'), 'console.log(1)');
  writeFileSync(join(dir, 'favicon.svg'), '<svg/>');
  server = createUnoServer({ corsOrigins: [], staticDir: dir });
  port = await server.listen(0);
});

afterAll(async () => {
  await server.close();
});

/** Raw request so that `..` segments are sent as-is (fetch would normalize them). */
function get(
  path: string,
): Promise<{ status: number; headers: Record<string, unknown>; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request({ port, path, method: 'GET' }, (res) => {
      let body = '';
      res.on('data', (chunk) => (body += chunk));
      res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

describe('static web client', () => {
  it('serves index.html at the root and for client routes', async () => {
    for (const path of ['/', '/lobby']) {
      const res = await get(path);
      expect(res.status).toBe(200);
      expect(res.headers['content-type']).toContain('text/html');
      expect(res.headers['cache-control']).toBe('no-cache');
      expect(res.body).toContain('<title>Uno</title>');
    }
  });

  it('serves hashed assets with long-term caching', async () => {
    const res = await get('/assets/app-123.js');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('text/javascript');
    expect(res.headers['cache-control']).toContain('immutable');
  });

  it('returns 404 for missing files', async () => {
    expect((await get('/missing.png')).status).toBe(404);
  });

  it('never serves a file outside the root', async () => {
    // URL normalization keeps these inside the root: they fall back to the app shell.
    for (const path of ['/../../etc/passwd', '/%2e%2e/%2e%2e/etc/passwd']) {
      const res = await get(path);
      expect(res.body).toContain('<title>Uno</title>');
      expect(res.body).not.toContain('root:');
    }
    // Encoded separators survive URL parsing and are caught by the traversal guard.
    expect((await get('/..%2f..%2f..%2fetc%2fpasswd')).status).toBe(404);
  });

  it('keeps the health endpoint', async () => {
    expect((await get('/health')).status).toBe(200);
  });
});

describe('loadConfig', () => {
  it('reads port, CORS origins and static dir from the environment', () => {
    const config = loadConfig({
      PORT: '8080',
      CORS_ORIGIN: 'https://a.com, https://b.com',
      STATIC_DIR: '/srv/web',
    });
    expect(config).toEqual({
      port: 8080,
      corsOrigins: ['https://a.com', 'https://b.com'],
      staticDir: '/srv/web',
    });
  });

  it('rejects an invalid port', () => {
    expect(() => loadConfig({ PORT: 'abc' })).toThrow();
  });
});
