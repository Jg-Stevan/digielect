# `src/lib/contrato/` — SOURCE OF TRUTH del contrato

> Este folder es la única fuente de verdad del contrato de datos/API entre
> `digielect` (supervisor + API + BD) y `digielect-digitalizador` (PWA del jurado).
>
> **No editar en el repo del digitalizador.** Se sincroniza hacia allá vía
> `bun run sync:contrato` (ver `scripts/sync-contrato.mjs` en el repo nuevo).
> Los cambios de contrato se hacen AQUÍ y bajan por PR con informe.

## Contenido

- `VERSION` — versión semver del contrato (MAYOR rompe compatibilidad, MENOR agrega campos).
- `types.ts` — tipos canónicos compartidos (geometría del escáner, calidad, OCR de ruteo,
  `ActaDigitalizadaResultado`, catálogo de mesas, `PuestoAsignado`).
- `api.ts` — rutas y esquemas wire-level de la API de ingesta.

## Reglas grabadas

1. **Los votos (campos manuscritos) no se leen.** El contrato solo describe
   ruteo por campos IMPRESOS + imágenes + metadatos de calidad.
2. **Quad SIEMPRE en fracciones 0–1** (orden TL, TR, BR, BL) en todo el contrato.
3. **El OCR del dispositivo es un HINT**: el servidor valida contra el catálogo.
4. **Integración por datos** (API de ingesta HTTP), nunca por código compartido.
5. Subir la versión MENOR al agregar campos; MAYOR al romper compatibilidad.
