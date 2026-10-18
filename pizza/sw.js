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
const CACHE_NAME = 'pizza-calc-v51';
const ASSETS_TO_CACHE = [
  './',
  './index.html',
  './css/styles.css?v=51',
  './js/i18n.js?v=51',
  './js/units.js?v=51',
  './js/dough.js?v=51',
  './js/flours.js?v=51',
  './js/calculator.js?v=51',
  './js/app.js?v=51',
  './manifest.json',
  './manifest.webmanifest',
  './favicon.png',
  './logo-hero.png',
  './apple-touch-icon.png',
  './apple-touch-icon-180.png',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  './pizza-slice.png',
  './planner-slice.png',
  './whatsnew-slice.png',
  './ing-harina.png',
  './ing-agua.png',
  './ing-sal.png',
  './ing-levadura.png',
  './wn-reloj.png',
  './wn-paso.png',
  './wn-compartir.png',
  './wn-camara.png',
  './wn-estrella.png',
  './wn-martillo.png'
];

self.addEventListener('install', (event) => {
  // FUERZA A SACO: skipWaiting automático. 
  // Al instalarse la nueva versión, toma el control de inmediato.
  // app.js detectará el cambio y forzará un reload automático de la pestaña.
  self.skipWaiting();
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

// Manejo de clic en notificaciones locales programadas
self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if (client.url && 'focus' in client) return client.focus();
      }
      if (clients.openWindow) return clients.openWindow('./');
    })
  );
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
      const cached = await caches.match(req, { ignoreSearch: true });
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
