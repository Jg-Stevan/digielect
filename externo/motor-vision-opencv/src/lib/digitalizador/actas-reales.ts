// ============================================================
// DIGITALIZADOR E-14 — Actas E-14 REALES de ejemplo
// Proceden del repositorio oficial (Jg-Stevan/digielect →
// DOCUMENTACION/ACTAS DE EJEMPLO, PDFs convertidos a JPEG).
// El escáner NO depende de ellas: acepta cualquier documento
// por cámara o galería; estas sirven de muestra real.
// ============================================================

export interface ActaReal {
  id: string;
  /** Etiqueta corta para el selector */
  etiqueta: string;
  /** Página del ejemplar (1 o 2) */
  pagina: number;
  url: string;
  miniUrl: string;
}

function acta(
  id: string,
  codigo: string,
  pagina: number,
  archivo: string
): ActaReal {
  return {
    id,
    etiqueta: `Acta ${codigo} · P${pagina}`,
    pagina,
    url: `/actas/${archivo}.jpg`,
    miniUrl: `/actas/mini/${archivo}.jpg`,
  };
}

export const ACTAS_REALES: ActaReal[] = [
  acta("a1", "495-010-02", 1, "E14_XXX_X_88_495_010_02_000_X_XXX-1"),
  acta("a2", "495-010-02", 2, "E14_XXX_X_88_495_010_02_000_X_XXX-2"),
  acta("b1", "335-005-02", 1, "E14_XXX_X_88_335_005_02_000_X_XXX-1"),
  acta("b2", "335-005-02", 2, "E14_XXX_X_88_335_005_02_000_X_XXX-2"),
  acta("c1", "335-005-81", 1, "E14_XXX_X_88_335_005_81_000_X_XXX-1"),
  acta("c2", "335-005-81", 2, "E14_XXX_X_88_335_005_81_000_X_XXX-2"),
  acta("d1", "355-003-08", 1, "E14_XXX_X_88_355_003_08_000_X_XXX-1"),
  acta("d2", "355-003-08", 2, "E14_XXX_X_88_355_003_08_000_X_XXX-2"),
];
