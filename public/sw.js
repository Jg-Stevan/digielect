// ============================================================
// DIGIELECT · Service Worker mínimo (FASE 2.1 — rol A, A-01)
// Objetivo del canon: la jornada electoral NO depende de la red.
//
// Estrategia:
//   · Shell de la PWA (navegación)  → network-first con fallback
//     al cache (queda navegable si la red cae) y al shell offline.
//   · Assets estáticos (/_next/, /vendor/, /e14/,
//     /actas/, manifest, iconos) → cache-first.
//     El vendor (Tesseract/heic2any + índice de actas) se
//     precachea tras la activación → el OCR funciona SIN RED.
//   · /data/*.json → network-first (OLA6 6.6): los JSON de la demo
//     se regeneran con `bun run demo:export` SIN bump de versión
//     del SW; congelarlos en cache-first dejaba la demo desactualizada
//     hasta el próximo VERSION. Red → cache → 503.
//   · /api/** y cualquier POST/PUT/DELETE → SIEMPRE red (el
//     backend y la ingesta jamás se sirven del cache).
//
// El base path (p. ej. /digielect en GitHub Pages) se deriva del
// scope de registro: el mismo sw.js sirve en dev, en Pages y en
// el servidor completo de Windows.
// ============================================================

const VERSION = "v1.5.0"; // OLA6 6.6: shell atómico (Promise.all), LRU del CACHE_RUNTIME (≤80), network-first para /data/*.json
const CACHE_SHELL = `digielect-shell-${VERSION}`;
const CACHE_VENDOR = `digielect-vendor-${VERSION}`;
const CACHE_RUNTIME = `digielect-runtime-${VERSION}`;

/** Rutas relativas al scope (el prefijo lo añade base()) */
const SHELL_REL = ["", "manifest.webmanifest", "e14/icono-pwa.svg"];

// [COORD C-16] Precache del digitalizador v2 (reemplazo ZIP):
//   · e14/deteccion-worker.js → motor de detección de bordes
//   · actas/*.jpg + actas/mini/*.jpg → galería "ACTAS REALES E-14"
//     (fixtures del flujo; el escáner también funciona sin ellas)
// El vendor (Tesseract/heic2any) se sirve cache-first a
// demanda vía CACHE_RUNTIME; ya no se precachea (el stack
// OpenCV fue eliminado en OLA 6 · 6.7, auditoría A-5).
const VENDOR_REL = [
  "e14/deteccion-worker.js",
  "actas/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg",
  "actas/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg",
  "actas/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg",
  "actas/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg",
  "actas/E14_XXX_X_88_335_005_81_000_X_XXX-1.jpg",
  "actas/E14_XXX_X_88_335_005_81_000_X_XXX-2.jpg",
  "actas/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg",
  "actas/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg",
  "actas/mini/E14_XXX_X_88_495_010_02_000_X_XXX-1.jpg",
  "actas/mini/E14_XXX_X_88_495_010_02_000_X_XXX-2.jpg",
  "actas/mini/E14_XXX_X_88_335_005_02_000_X_XXX-1.jpg",
  "actas/mini/E14_XXX_X_88_335_005_02_000_X_XXX-2.jpg",
  "actas/mini/E14_XXX_X_88_335_005_81_000_X_XXX-1.jpg",
  "actas/mini/E14_XXX_X_88_335_005_81_000_X_XXX-2.jpg",
  "actas/mini/E14_XXX_X_88_355_003_08_000_X_XXX-1.jpg",
  "actas/mini/E14_XXX_X_88_355_003_08_000_X_XXX-2.jpg",
];

function basePath() {
  return new URL(self.registration.scope).pathname.replace(/\/$/, "");
}

// ------------------------------------------------------------
// [OLA6 6.6] LRU de CACHE_RUNTIME
// ------------------------------------------------------------
// El runtime cache crecía sin cota (cada asset cache-first nuevo se
// quedaba para siempre). La Cache API no expone marcas de tiempo, así
// que el orden de uso se lleva EN MEMORIA: array de URLs con la más
// reciente al final. Cada runtime.put() empuja/mueve la URL y, si se
// supera MAX_RUNTIME, se borra del cache la más vieja en segundo plano.
// Tradeoff honesto: al reiniciarse el SW el array parte vacío y se
// reconstruye con el uso — las entradas ya presentes en el cache que
// no vuelvan a solicitarse pueden sobrevivir a esa ventana de gracia
// (el purge por bump de VERSION en activate sigue siendo el reset
// total). Es el costo asumido por no persistir el orden en IndexedDB.
const MAX_RUNTIME = 80;
let lruRuntime = [];

/** Registra el uso de una URL del runtime y recorta la más vieja. */
function recordarRuntime(url) {
  const ya = lruRuntime.indexOf(url);
  if (ya >= 0) lruRuntime.splice(ya, 1); // re-uso: mover al final
  lruRuntime.push(url);
  if (lruRuntime.length > MAX_RUNTIME) {
    const vieja = lruRuntime.shift();
    if (!vieja) return;
    // Fire-and-forget: si el delete falla, sólo se pierde el recorte
    // (nunca la respuesta que ya se devolvió a la página).
    caches
      .open(CACHE_RUNTIME)
      .then((runtime) => runtime.delete(vieja))
      .catch(() => {});
  }
}

function notificar(mensaje) {
  self.clients.matchAll({ type: "window" }).then((todos) => {
    todos.forEach((c) => c.postMessage(mensaje));
  });
}

/** Precache del VENDOR en segundo plano (no atómico: si el dispositivo
 *  se apaga a mitad, el runtime cache-first completa los faltantes al
 *  primer uso y la página puede re-dispararlo con "precache-vendor"). */
async function precacheVendor() {
  const base = basePath();
  const vendor = await caches.open(CACHE_VENDOR);
  await Promise.allSettled(
    VENDOR_REL.map((rel) =>
      vendor
        .add(new Request(`${base}/${rel}`, { cache: "reload" }))
        .catch(() => {})
    )
  );
  notificar("vendor-precache-done");
}

self.addEventListener("install", (event) => {
  const base = basePath();
  event.waitUntil(
    (async () => {
      const shell = await caches.open(CACHE_SHELL);
      // Precache ATÓMICO del shell (3 assets pequeños). [OLA6 6.6]
      // Promise.all — si ALGUNO falla el install se aborta y se
      // reintenta en la próxima visita: el shell nunca queda a
      // medias (con allSettled un icono caído dejaba el fallback
      // offline roto hasta el próximo bump de versión).
      await Promise.all(
        SHELL_REL.map((rel) =>
          shell.add(new Request(`${base}/${rel}`, { cache: "reload" }))
        )
      );
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const nombres = await caches.keys();
      await Promise.all(
        nombres
          .filter(
            (n) =>
              n.startsWith("digielect-") &&
              ![CACHE_SHELL, CACHE_VENDOR, CACHE_RUNTIME].includes(n)
          )
          .map((n) => caches.delete(n))
      );
      await self.clients.claim();
      // Vendor en segundo plano tras quedar activo
      await precacheVendor();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  // Sólo GET y mismo origen: /api/ y terceros SIEMPRE red directa
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes("/api/")) return;

  // Navegación (SPA de una página): red → cache → shell offline
  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const base = basePath();
        try {
          const fresca = await fetch(req);
          const shell = await caches.open(CACHE_SHELL);
          shell.put(url.pathname, fresca.clone());
          return fresca;
        } catch {
          const shell = await caches.open(CACHE_SHELL);
          return (
            (await shell.match(url.pathname)) ??
            (await shell.match(`${base}/`)) ??
            (await shell.match(base)) ??
            new Response("Sin conexión y sin shell cacheado", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            })
          );
        }
      })()
    );
    return;
  }

  // [OLA6 6.6] /data/*.json → network-first: los JSON de la demo se
  // regeneran con `bun run demo:export` sin bump de versión del SW;
  // cache-first los congelaba hasta el próximo VERSION. Se intenta la
  // red (éxito → clon a CACHE_RUNTIME + retorno); si la RED falla se
  // cae al cache y, de último, 503 (mismo patrón de error del SW).
  // Una respuesta HTTP no-ok se devuelve tal cual: la red es la
  // verdad (un 404 significa que el archivo NO existe en el server).
  {
    const prefijoDatos = `${basePath()}/data/`;
    if (url.pathname.startsWith(prefijoDatos) && url.pathname.endsWith(".json")) {
      event.respondWith(
        (async () => {
          const runtime = await caches.open(CACHE_RUNTIME);
          try {
            const fresca = await fetch(req);
            // Sólo cachear respuestas completas same-origin (básicas).
            // Fire-and-forget: un fallo de cuota del put NO debe tirar
            // la respuesta fresca que ya tenemos en la mano.
            if (fresca && fresca.ok && fresca.type === "basic") {
              runtime.put(req, fresca.clone()).catch(() => {});
              recordarRuntime(req.url);
            }
            return fresca;
          } catch {
            const enCache = await runtime.match(req);
            if (enCache) return enCache;
            return new Response("Datos no disponibles sin conexión", {
              status: 503,
              headers: { "Content-Type": "text/plain; charset=utf-8" },
            });
          }
        })()
      );
      return;
    }
  }

  // Assets estáticos: cache-first (los _next tienen hash; el vendor
  // y los datos cambian con la versión del SW)
  event.respondWith(
    (async () => {
      const vendor = await caches.open(CACHE_VENDOR);
      const enVendor = await vendor.match(req);
      if (enVendor) return enVendor;

      const shell = await caches.open(CACHE_SHELL);
      const enShell = await shell.match(req);
      if (enShell) return enShell;

      const runtime = await caches.open(CACHE_RUNTIME);
      const enRuntime = await runtime.match(req);
      if (enRuntime) return enRuntime;

      try {
        const res = await fetch(req);
        // Sólo cacheamos respuestas completas same-origin (básicas)
        if (res && res.ok && res.type === "basic") {
          runtime.put(req, res.clone());
          // [OLA6 6.6] LRU: el runtime queda acotado a MAX_RUNTIME
          recordarRuntime(req.url);
        }
        return res;
      } catch {
        return new Response("Recurso no disponible sin conexión", {
          status: 504,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      }
    })()
  );
});

// Mensajes desde la página (re-intentar el precache del vendor)
self.addEventListener("message", (event) => {
  if (event.data === "precache-vendor") {
    event.waitUntil(precacheVendor());
  }
});
