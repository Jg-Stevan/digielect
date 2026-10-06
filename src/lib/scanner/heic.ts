// ============================================================
// DIGIELECT · Importación robusta de imágenes (rol A)
// Puerto de la cascada de web-scanner para la galería:
//   1. decodificación NATIVA (los navegadores modernos aplican
//      la orientación EXIF automáticamente al decodificar)
//   2. si el archivo es HEIC/HEIF y el navegador no lo soporta
//      → heic2any (libheif WASM) bajo demanda desde CDN, con
//      caché de la promesa para no recargar el script
//   3. compresión final al tope de importación (3200 px)
// FALLA SUAVE: sin red, la conversión HEIC simplemente falla con
// un error claro para la UI (el resto de formatos sigue igual).
// ============================================================

const HEIC2ANY_CDN =
  "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
const LADO_IMPORT = 3200;

/** Compresión en canvas (igual que comprimirImagen de shared.ts) */
function comprimirDataUrl(dataUrl: string): Promise<string> {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      try {
        const escala = Math.min(1, LADO_IMPORT / Math.max(img.width, img.height));
        const w = Math.max(1, Math.round(img.width * escala));
        const h = Math.max(1, Math.round(img.height * escala));
        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(dataUrl);
          return;
        }
        ctx.drawImage(img, 0, 0, w, h);
        resolve(canvas.toDataURL("image/jpeg", 0.92));
      } catch {
        reject(new Error("Error comprimiendo la imagen en canvas"));
      }
    };
    img.onerror = () => reject(new Error("Imagen no válida"));
    img.src = dataUrl;
  });
}

let heicProm: Promise<unknown | null> | null = null;

function cargarHeic2Any(): Promise<unknown | null> {
  if (heicProm) return heicProm;
  heicProm = new Promise((resolve) => {
    try {
      const w = window as unknown as { heic2any?: unknown };
      if (w.heic2any) {
        resolve(w.heic2any);
        return;
      }
      const script = document.createElement("script");
      script.src = HEIC2ANY_CDN;
      script.async = true;
      script.onload = () => resolve(w.heic2any ?? null);
      script.onerror = () => resolve(null);
      document.head.appendChild(script);
    } catch {
      resolve(null);
    }
  });
  return heicProm;
}

function esHeic(file: File): boolean {
  if (/\.hei[cf]$/i.test(file.name)) return true;
  if (file.type === "image/heic" || file.type === "image/heif") return true;
  return false;
}

/** ¿El navegador puede decodificar este dataUrl como imagen? */
function puedeDecodificar(dataUrl: string): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => resolve(ok);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    // Marca de tiempo de seguridad: algunos navegadores tardan en fallar
    setTimeout(() => done(img.complete && img.naturalWidth > 0), 4000);
    img.src = dataUrl;
  });
}

interface Heic2AnyFn {
  (input: Blob | Blob[], opts?: Record<string, unknown>): Promise<Blob | Blob[]>;
}

/**
 * Lee un archivo de galería y lo deja listo para el pipeline:
 * JPEG dataUrl a ≤ 3200px. Soporta HEIC/HEIF vía libheif.
 */
export async function archivoACapturaDataUrl(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(new Error("no_se_pudo_leer"));
    reader.readAsDataURL(file);
  });

  // 1. Decodificación nativa (JPEG/PNG/WebP y HEIC en Safari)
  if (await puedeDecodificar(dataUrl)) {
    return comprimirDataUrl(dataUrl);
  }

  // 2. HEIC vía libheif (navegadores sin soporte nativo)
  if (esHeic(file)) {
    const heic2any = (await cargarHeic2Any()) as Heic2AnyFn | null;
    if (!heic2any) {
      throw new Error("formato_heic_no_soportado");
    }
    const blob = await (await fetch(dataUrl)).blob();
    const salida = await heic2any(blob, { toType: "image/jpeg", quality: 0.92 });
    const jpeg = Array.isArray(salida) ? salida[0] : salida;
    const jpegUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(new Error("no_se_pudo_leer"));
      reader.readAsDataURL(jpeg);
    });
    return comprimirDataUrl(jpegUrl);
  }

  throw new Error("formato_no_soportado");
}
