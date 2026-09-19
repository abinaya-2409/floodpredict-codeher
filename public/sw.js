/* eslint-env serviceworker */
/**
 * FloodyPredict service worker.
 *
 * The point of this file is narrow: the app has to open and be useful on a
 * phone with no network, because that is the situation it exists for. A flood
 * that takes out the cell towers is exactly when someone opens this.
 *
 * Caching is split by what each kind of request actually needs:
 *
 *   - Navigation (the HTML): network first, falling back to the cached shell.
 *     HTML is the one file whose URL never changes, so serving it from cache
 *     first would pin people to an old build indefinitely.
 *   - Hashed build assets (/assets/*): cache first. Vite puts a content hash
 *     in the filename, so a given URL's bytes can never change - going to the
 *     network to re-confirm that is pure latency.
 *   - App data (/data/*, /icons/*): stale-while-revalidate. Serve instantly,
 *     refresh in the background.
 *   - Map tiles: stale-while-revalidate with a hard cap. Tiles are what make
 *     a map usable offline and also what would happily eat a phone's whole
 *     disk, so the cache is trimmed to the most recent MAX_TILES entries.
 *
 *     These were cache-first, and that was a trap. A cross-origin tile
 *     arrives as an opaque response: status 0, ok false, no readable headers
 *     and no readable body. A tile server's 404, its 500 and its rate-limit
 *     page are all opaque too, and all indistinguishable from a real tile.
 *     Cache-first with no expiry therefore stored whatever came back the
 *     first time and served it forever - so one bad minute from the tile CDN
 *     left the map permanently black for that person, on every later visit,
 *     with a full set of <img> elements that had all "loaded". Serving the
 *     cached copy and refreshing behind it keeps the offline guarantee and
 *     lets a poisoned entry heal itself on the next look.
 *   - /api/*: network only. A cached flood forecast is worse than a visible
 *     failure, because it looks current and is not.
 *
 * Nothing here precaches a build manifest. Vite's filenames are hashed at
 * build time, so a hand-written list would go stale the moment anything
 * changed; instead the shell is precached by URL and assets are cached as the
 * first visit fetches them. One online visit is enough to make the app work
 * offline afterwards.
 */

// Bumped to v4 to drop every cache from v3, including any tiles poisoned by
// the cache-first bug above. The activate handler deletes anything not in the
// current set, so this is what repairs an already-black map.
const VERSION = 'v4';
const SHELL_CACHE = `floody-shell-${VERSION}`;
const ASSET_CACHE = `floody-assets-${VERSION}`;
const DATA_CACHE = `floody-data-${VERSION}`;
const TILE_CACHE = `floody-tiles-${VERSION}`;

const MAX_TILES = 600;

/** Enough to boot the app with no network at all. */
const SHELL = [
  '/',
  '/manifest.webmanifest',
  '/favicon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(SHELL_CACHE);
      // addAll rejects the whole install if any single URL 404s, which would
      // leave the app with no service worker at all over one stale filename.
      await Promise.all(
        SHELL.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => {
            /* one missing shell file must not block the install */
          })
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      const keep = new Set([SHELL_CACHE, ASSET_CACHE, DATA_CACHE, TILE_CACHE]);
      for (const name of await caches.keys()) {
        if (name.startsWith('floody-') && !keep.has(name)) await caches.delete(name);
      }
      await self.clients.claim();
    })()
  );
});

/** Lets the page tell a waiting worker to take over immediately. */
self.addEventListener('message', (event) => {
  if (event.data === 'skip-waiting') self.skipWaiting();
});

/** Keeps a cache from growing without bound, oldest entries first. */
async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  if (keys.length <= max) return;
  await Promise.all(keys.slice(0, keys.length - max).map((k) => cache.delete(k)));
}

async function cacheFirst(request, cacheName, { max } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  if (hit) return hit;
  const response = await fetch(request);
  // Opaque responses (cross-origin, no CORS) are cacheable and are how map
  // tiles arrive; status 0 is normal for them and must not be treated as a
  // failure.
  if (response && (response.ok || response.type === 'opaque')) {
    await cache.put(request, response.clone());
    if (max) void trim(cacheName, max);
  }
  return response;
}

async function staleWhileRevalidate(request, cacheName, { max } = {}) {
  const cache = await caches.open(cacheName);
  const hit = await cache.match(request);
  const network = fetch(request)
    .then((response) => {
      // `opaque` is how every cross-origin tile comes back, so it has to be
      // storable or the map never works offline. It is also how that
      // server's errors come back, which is why this path refreshes rather
      // than trusting what it already has.
      if (response && (response.ok || response.type === 'opaque')) {
        cache.put(request, response.clone()).then(() => {
          if (max) void trim(cacheName, max);
        });
      }
      return response;
    })
    .catch(() => null);
  return hit || (await network) || Response.error();
}

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  const sameOrigin = url.origin === self.location.origin;

  // A stale forecast that looks live is worse than an obvious failure.
  if (sameOrigin && url.pathname.startsWith('/api/')) return;

  // The HTML shell: fresh when possible, cached when not.
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          const response = await fetch(request);
          const cache = await caches.open(SHELL_CACHE);
          cache.put('/', response.clone());
          return response;
        } catch {
          const cache = await caches.open(SHELL_CACHE);
          return (await cache.match(request)) || (await cache.match('/')) || Response.error();
        }
      })()
    );
    return;
  }

  if (sameOrigin && url.pathname.startsWith('/assets/')) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (sameOrigin && (url.pathname.startsWith('/data/') || url.pathname.startsWith('/icons/'))) {
    event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
    return;
  }

  // Map tiles. Served from cache for speed and for offline, refreshed behind
  // the scenes so a tile cached during an outage does not stay wrong.
  if (/tile|arcgisonline|basemaps|openstreetmap|tiles\./i.test(url.hostname + url.pathname)) {
    event.respondWith(staleWhileRevalidate(request, TILE_CACHE, { max: MAX_TILES }));
    return;
  }
  if (/fonts\.(googleapis|gstatic)\.com$/.test(url.hostname)) {
    event.respondWith(cacheFirst(request, ASSET_CACHE));
    return;
  }

  if (sameOrigin) event.respondWith(staleWhileRevalidate(request, DATA_CACHE));
});
