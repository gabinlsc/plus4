/* Service worker : coquille de l'appli hors ligne, jamais le jeu lui-même.
 * - navigation : réseau d'abord (une mise à jour du jeu est vue tout de suite), page en cache si pas de réseau ;
 * - /assets/ (fichiers à empreinte) : cache d'abord ;
 * - WebSocket, /socket.io, /health, /api et tout ce qui vient d'ailleurs : jamais touché. */
const VERSION = 'v1';
const SHELL_CACHE = `glsc-shell-${VERSION}`;
const ASSET_CACHE = `glsc-assets-${VERSION}`;
const MAX_ASSETS = 80;
const BYPASS = ['/socket.io', '/health', '/api'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(SHELL_CACHE)
      .then((cache) => cache.addAll(['/', '/favicon.svg', '/icon-192.png']))
      .catch(() => {})
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys.filter((k) => k !== SHELL_CACHE && k !== ASSET_CACHE).map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

async function trim(cache) {
  const keys = await cache.keys();
  await Promise.all(
    keys.slice(0, Math.max(0, keys.length - MAX_ASSETS)).map((k) => cache.delete(k)),
  );
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (BYPASS.some((p) => url.pathname === p || url.pathname.startsWith(p + '/'))) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(SHELL_CACHE).then((c) => c.put('/', copy));
          }
          return res;
        })
        .catch(() =>
          caches.match('/').then(
            (r) =>
              r ||
              new Response('Hors ligne : reconnecte-toi pour jouer.', {
                status: 503,
                headers: { 'content-type': 'text/plain; charset=utf-8' },
              }),
          ),
        ),
    );
    return;
  }

  if (url.pathname.startsWith('/assets/')) {
    event.respondWith(
      caches.open(ASSET_CACHE).then(async (cache) => {
        const hit = await cache.match(req);
        if (hit) return hit;
        const res = await fetch(req);
        if (res.ok) {
          cache.put(req, res.clone());
          trim(cache);
        }
        return res;
      }),
    );
  }
});
