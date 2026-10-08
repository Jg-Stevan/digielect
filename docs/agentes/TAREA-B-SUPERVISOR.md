> 📦 **REFERENCIA HISTÓRICA** — esta tarea se completó durante los ciclos C-1..C-17
> (ver [`docs/worklog/historial-c1-c17.md`](../worklog/historial-c1-c17.md)).
> El protocolo vigente y el punto de entrada están en [`AGENTS.md`](../../AGENTS.md).

# 🖥️ TAREA B — Supervisor: índice estático, BATCH distribuido y persistencia demo

> **Asignada a**: la IA que construyó el módulo de monitoreo/supervisor de
> Digielect (MonitorGlobal, anomalias, SLA, BATCH, informes).
> **Rol**: B · **Coordina con**: C (contratos de identificación y anomalías)
> · A (cola de contingencia)
> **Prioridad**: FASES 3-5 del roadmap.

---

## 1. Objetivo

Preparar el módulo Supervisor para la demo real:

1. Que el **modo demo estático** (GitHub Pages) tenga el índice de actas con
   `idTransmissionCode` disponible en el cliente (FASE 3).
2. Que el almacenamiento de imágenes del demo migre de `localStorage` a
   **IndexedDB** (cuota de ~5 MB → cientos de MB) (FASE 4).
3. Que el **BATCH** procese las imágenes **en el dispositivo** (Web Workers)
   y suba solo resultados+metadatos, con métricas de tiempo/precisión (FASE 4).
4. Que el Monitor y el Digitalizador se sincronicen **pestaña↔pestaña en el
   mismo navegador** vía `BroadcastChannel`, para que la ingesta del
   digitalizador aparezca en vivo en el Monitor (FASE 5).

## 2. FASE 3 — Exportar el índice de identificación a `public/data/`

**Problema**: en modo completo el índice sale de Prisma; en modo demo el
cliente no tiene las 3.670 actas con su código de transmisión.

**Solución**: extender `scripts/export-static-data.ts` para generar:

```
public/data/indice-actas.json
// [{ idTransmissionCode, numberStand, expectedName, idTransmissionCodeStatus,
//     idStand, standCode, idZoneCode, idDepartmentCode, municipalityCode }]
```

(Exactamente la forma `ActaVisoItem` de `src/lib/identificacion-acta.ts`,
rama `feature/identificador-actas`). Peso esperado ~1 MB (aceptable; puede
comprimirse a eager-load perezoso con `fetch` on demand al abrir el
digitalizador). El cliente construye el índice con `crearIndiceActas()`.

## 3. FASE 4 — IndexedDB + BATCH distribuido con métricas

### 3.1 Migración del almacenamiento

- Imágenes (data URLs / blobs) → **IndexedDB** (object stores:
  `hojas`, `cola-contingencia`, `metricas-batch`).
- Metadatos ligeros y estado de UI pueden seguir en `localStorage`/zustand.
- Mantener el botón **REINICIAR DEMO** (debe limpiar ambos).
- Añadir **Exportar/Importar JSON** (respaldo portátil de la sesión demo).

### 3.2 BATCH que respeta la filosofía "procesar en el dispositivo"

El servidor (o el demo-store en Pages) NO debe recibir imágenes crudas para
procesarlas. El flujo BATCH:

```
operador selecciona N imágenes (galería/carpeta)
  → en el CLIENTE: cola con navigator.hardwareConcurrency workers
      · recorte/BN si hace falta (rol A provee el pipeline)
      · OCR texto superior + zona X + barcode15 (Tesseract.js local)
      · identificarActa + clasificarEjemplar + decidirAlmacenamiento
  → se sube SOLO: imagen comprimida + metadatos + resultado identificación
  → el servidor/demo-store valida con el mismo guard y persiste
```

- Backpressure: máximo `hardwareConcurrency` tareas en vuelo; cancelables.
- Reanudable: si la pestaña se cierra, la cola persiste en IndexedDB.
- **Métricas por lote** (nuevo panel del BATCH, consumir `metricas-batch`):
  actas/min, % identificadas a la primera, % por Hamming-1, % anomalías por
  código (`ID_*`), tiempo medio por hoja, dispositivo (userAgent resumido).
- En modo completo las mismas métricas se registran server-side (audit trail).

## 4. FASE 5 — Sincronización misma-máquina (BroadcastChannel)

- Canal `digielect-sync`: eventos `hoja:ingestada {mesa, tipo, pagina, estado}`,
  `anomalia:nueva`, `batch:progreso`.
- El Monitor se suscribe y actualiza las vistas reactivamente (zustand) sin
  recargar. Debe degradarse silenciosamente donde no exista (Safari privado).
- **Alcance explícito**: esto sincroniza pestañas del MISMO navegador.
  Multi-dispositivo real requiere el modo completo con backend
  (laptop + túnel) — documentarlo en la UI de la demo para evitar confusiones
  durante la presentación.

## 5. Contratos con el rol C (NO duplicar)

- La validación de ingesta (dónde se guarda cada hoja) es SIEMPRE
  `decidirAlmacenamiento()` del identificador. El supervisor no re-deriva
  ubicaciones por su cuenta.
- Los códigos de anomalía `ID_*` entran a la bandeja mapeados a
  `TipoAnomalia` (extender la unión si hace falta — proponer en worklog con
  `[COORD]`).
- `MesaDetail.{delegados,transmision}.{p1,p2}` es la fuente de verdad de
  qué ranuras están ocupadas → alimentar `RegistroExistente.paginas` del guard.

## 6. Criterios de aceptación

1. Demo en Pages: digitalizar 3 hojas (p1 transmision, p2 transmision,
   p1 delegados de la misma mesa) y ver la mesa completa en el Monitor
   **sin recargar** (BroadcastChannel funcionando).
2. BATCH con ≥ 30 imágenes de `public/actas-ejemplo/` (repetidas/variadas)
   genera el panel de métricas sin congelar la UI y sin pasarse de cuota.
3. REINICIAR DEMO deja el sistema en estado semilla (localStorage + IndexedDB).
4. `tsc` + `lint` + build estático limpios; worklog con Task ID `B-<n>`.
