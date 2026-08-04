// v30: service worker con ciclo de vida estándar (banner "Actualizar ahora")
// y estrategia network-first a prueba de fallos.
//
// El SW nuevo se instala y se queda EN ESPERA (sin skipWaiting automático).
// app.js detecta esa espera y muestra el banner; solo cuando el usuario pulsa
// "Actualizar ahora" recibimos el mensaje 'skipWaiting' y tomamos el control.
// Así el usuario ve claramente cuándo hay versión nueva y decide cuándo aplicarla.
//
// IMPORTANTE — qué se eliminó respecto a versiones anteriores y por qué:
//   * Ya NO forzamos recargas ni navegaciones (clients.navigate) ni skipWaiting
//     automático en 'install'. Ese "rescate" navegaba las pestañas a su propia
//     URL; cuando esa URL era /index.html (redirigida a / por Cloudflare Pages),
//     la navegación fallaba con ERR_FAILED y dejaba la PWA atascada (llegando a
//     colgar la red en algunos móviles). Ahora la actualización solo se aplica
//     cuando el usuario la confirma en el banner (o, si no hay pestañas abiertas,
//     el navegador activa la versión en espera de forma nativa al reabrir la app).
//   * El handler de fetch NUNCA relanza un error en una navegación: si no hay
//     red ni caché, devuelve una respuesta controlada. Una promesa rechazada en
//     respondWith se traduce en ERR_FAILED, justo lo que queremos evitar.
const CACHE_NAME = 'pizza-calc-v59';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css',
  './js/i18n.js',
  './js/units.js',
  './js/dough.js',
  './js/flours.js',
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
  // Precachea la versión nueva y se queda EN ESPERA (ciclo de vida estándar).
  // NO llamamos a skipWaiting aquí: así el usuario controla cuándo se aplica
  // la actualización, mediante el banner "Actualizar ahora" (ver app.js).
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS_TO_CACHE)).catch(() => {})
  );
});

// Compatibilidad: si una versión antigua de la app envía la orden, la atendemos.
self.addEventListener('message', (event) => {
  if (event.data && event.data.action === 'skipWaiting') {
    self.skipWaiting();
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    // Limpia cachés de versiones anteriores.
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)));
    // Empieza a controlar las pestañas ya abiertas (sin recargarlas a la fuerza).
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;

  // Solo intervenimos en GET sobre http/https. POST, chrome-extension://, etc.
  // los dejamos pasar al navegador tal cual (cache.put lanzaría con ellos).
  if (req.method !== 'GET' || !req.url.startsWith('http')) return;

  const isNavigate = req.mode === 'navigate';

  event.respondWith((async () => {
    try {
      // network-first: 'no-cache' revalida contra el servidor (petición
      // condicional) para no servir HTML/JS viejo. En NAVEGACIONES pedimos por
      // URL con redirect:'follow' para tolerar la redirección /index.html -> /
      // de Cloudflare Pages: devolver una respuesta 'redirected' a una
      // navegación (modo 'manual') daría ERR_FAILED, así que la seguimos y
      // reconstruimos una respuesta "limpia".
      const net = isNavigate
        ? await fetch(req.url, { cache: 'no-cache', redirect: 'follow' })
        : await fetch(req, { cache: 'no-cache' });

      let response = net;
      if (net.redirected) {
        const body = await net.clone().arrayBuffer();
        response = new Response(body, {
          status: net.status,
          statusText: net.statusText,
          headers: net.headers
        });
      }

      if (net.ok) {
        const copy = response.clone();
        // Aislado: si el put falla (cuota, etc.) no debe romper la respuesta.
        caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => {});
      }
      return response;
    } catch (e) {
      // Sin red: servir de caché. Para navegaciones, caer al shell de la app.
      const cached = await caches.match(req);
      if (cached) return cached;
      if (isNavigate) {
        const shell = (await caches.match('./index.html')) || (await caches.match('./')) || (await caches.match('/'));
        if (shell) return shell;
      }
      // Último recurso: respuesta controlada. NUNCA relanzamos (throw), porque
      // un rechazo en respondWith produce ERR_FAILED en la navegación.
      return new Response('Sin conexión.', {
        status: 503,
        statusText: 'Service Unavailable',
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});
