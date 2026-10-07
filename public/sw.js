// ============================================================
// DIGIELECT · Service Worker mínimo (FASE 2.1 — rol A, A-01)
// Objetivo del canon: la jornada electoral NO depende de la red.
//
// Estrategia:
//   · Shell de la PWA (navegación)  → network-first con fallback
//     al cache (queda navegable si la red cae) y al shell offline.
//   · Assets estáticos (/_next/, /vendor/, /data/, /e14/,
//     /actas-ejemplo/, manifest, iconos) → cache-first.
//     El vendor (Tesseract/heic2any + índice de actas) se
//     precachea tras la activación → el OCR funciona SIN RED.
//   · /api/** y cualquier POST/PUT/DELETE → SIEMPRE red (el
//     backend y la ingesta jamás se sirven del cache).
//
// El base path (p. ej. /digielect en GitHub Pages) se deriva del
// scope de registro: el mismo sw.js sirve en dev, en Pages y en
// el servidor completo de Windows.
// ============================================================

const VERSION = "v1.3.0"; // C-16: reemplazo digitalizador v2 (ZIP del usuario) — renueva caches en dispositivos
const CACHE_SHELL = `digielect-shell-${VERSION}`;
const CACHE_VENDOR = `digielect-vendor-${VERSION}`;
const CACHE_RUNTIME = `digielect-runtime-${VERSION}`;

/** Rutas relativas al scope (el prefijo lo añade base()) */
const SHELL_REL = ["", "manifest.webmanifest", "e14/icono-pwa.svg"];

// [COORD C-16] Precache del digitalizador v2 (reemplazo ZIP):
//   · e14/deteccion-worker.js → motor de detección de bordes
//   · actas/*.jpg + actas/mini/*.jpg → galería "ACTAS REALES E-14"
//     (fixtures del flujo; el escáner también funciona sin ellas)
// El vendor antiguo (Tesseract/OpenCV/índice OCR) sigue servido
// cache-first a demanda vía CACHE_RUNTIME; ya no se precachea.
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
      // Precache ATÓMICO del shell (pequeño). Si algo falla, el
      // install se aborta y se reintenta en la próxima visita.
      await Promise.allSettled(
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
