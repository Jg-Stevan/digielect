// ============================================================
// DIGITALIZADOR E-14 — Utilidades de imagen (cliente)
// Solo lo que sigue en uso tras la v2 del escáner: compresión
// para el análisis VLM y el respaldo del modo manual.
// ============================================================

/** Carga un data URL en un Image */
function cargarImagen(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("No se pudo cargar la imagen"));
    img.src = src;
  });
}

/** Comprime/redimensiona un data URL a JPEG para envío (≤ maxPx, calidad q) */
export async function comprimirImagen(
  dataUrl: string,
  maxPx = 1600,
  calidad = 0.82
): Promise<string> {
  const img = await cargarImagen(dataUrl);
  const escala = Math.min(1, maxPx / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * escala);
  const h = Math.round(img.naturalHeight * escala);
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, w, h);
  return canvas.toDataURL("image/jpeg", calidad);
}
