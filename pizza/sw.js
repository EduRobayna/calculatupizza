// v3: el usuario decide cuándo actualizar (banner "Actualizar") en vez de recarga forzada.
// Sigue usando estrategia "red primero" para que el contenido esté siempre al día.
const CACHE_NAME = 'pizza-calc-v9';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/i18n.js',
  './js/units.js',
  './js/dough.js',
  './js/calculator.js',
  './js/app.js',
  './manifest.json',
  './favicon.png',
  './logo-hero.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  // Ya NO forzamos skipWaiting aquí: el nuevo SW se queda "en espera"
  // hasta que el usuario pulsa el botón "Actualizar" del banner.
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE))
  );
});

// Escucha la orden que envía el botón "Actualizar" del banner
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((cacheNames) =>
        Promise.all(
          cacheNames.map((cache) => {
            if (cache !== CACHE_NAME) return caches.delete(cache);
          })
        )
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  // Solo cacheamos GET sobre http/https. Peticiones POST o esquemas como
  // chrome-extension:// hacen que cache.put() lance una excepción.
  const cacheable = req.method === 'GET' && req.url.startsWith('http');

  event.respondWith(
    fetch(req)
      .then((networkResponse) => {
        if (cacheable && networkResponse && networkResponse.ok) {
          const responseClone = networkResponse.clone();
          // El put se aísla: si falla (respuesta opaca, cuota, etc.) no debe
          // romper la respuesta al navegador ni generar un rechazo sin capturar.
          caches.open(CACHE_NAME)
            .then((cache) => cache.put(req, responseClone))
            .catch(() => {});
        }
        return networkResponse;
      })
      .catch(() => caches.match(req))
  );
});
