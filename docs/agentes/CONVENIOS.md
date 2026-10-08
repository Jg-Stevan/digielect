# 🤝 Convenios del equipo — el "mismo idioma"

> Contratos, glosario y reglas compartidas. Si algo de tu implementación
> contradice este documento, **tu código está mal**, no el convenio
> (o propón el cambio con `[COORD]` en el worklog antes de desviarte).

> 🔄 **ACTUALIZADO 2026-10-08 (post-auditoría)**: sigue siendo LA LEY del
> dominio. Adiciones post-auditoría: seguridad/sesión (`src/lib/sesion.ts`,
> `src/lib/rate-limit.ts`, endpoints `/api/auth/sesion` y `/api/auth/logout`),
> validación (`src/lib/validacion.ts`, `src/lib/reglas-e14.ts`) y SLA
> (`src/lib/sla.ts`). La fuente de imágenes de actas reales es ahora
> `public/actas/` (con miniaturas en `public/actas/mini/`); el antiguo
> `public/actas-ejemplo/` fue eliminado por duplicado. Ver
> [`docs/arquitectura/ARQUITECTURA.md`](../arquitectura/ARQUITECTURA.md).

---

## ⚠️ REGLA DE PRODUCTO (NO NEGOCIABLE — grabada para todos los agentes y todos los módulos)

> **LOS VOTOS (CAMPOS MANUSCRITOS) NO SE LEEN Y NO INTERESAN POR EL MOMENTO.**
> No se OCRIZAN, no se procesan, no se extraen. Ningún módulo debe intentar reconocer
> manuscritos. La meta de la aplicación es exactamente esta:
>
> 1. **Escanear en alta calidad** el acta E-14.
> 2. **Extraer con precisión los datos IMPRESOS de ruteo** (número de mesa, departamento,
>    municipio, zona, puesto) mediante OCR por zonas.
> 3. **Ubicar y guardar el acta en el lugar correcto** (match contra el catálogo de mesas).
>
> Lo manuscrito lo revisa un humano en el panel del supervisor si el score de calidad es
> bajo/intermedio. Si un agente propone leer manuscritos, LA PROPUESTA ESTÁ FUERA DE ALCANCE.

---

## 1. Glosario canónico

| Término | Definición exacta | Dónde vive |
|---|---|---|
| **Código de transmisión** (`idTransmision`) | Los 7 dígitos impresos entre las X del acta. Único por ACTA en el exterior. | visor E-14 · `exterior-actas.json` · `Acta.idTransmision` |
| **Hoja** | Una página física: `(idTransmision, tipoEjemplar, pagina)` | regla de negocio |
| **Acta** | El formulario completo (2 páginas). El código la identifica. | `Acta` (Prisma) |
| **Mesa** | `(consulado, numberStand)` · `MesaDetail.mesaNumber` | BD/demo-store |
| **tipoEjemplar** | `DELEGADOS \| TRANSMISION`. El banner "CÓNSUL/EMBAJADOR" **es** DELEGADOS. | `types.ts` |
| **barcode15** | 15 dígitos: `[elección 2][kit 6][tipo 1][versión 2][pág 2][total 2]` | `e14/parse.ts` |
| **qrFingerprint** | Texto base64url de 44 chars del QR (32 bytes). SOLO deduplicación. | `Acta.qrFingerprint` |
| **pdfHash** | `expectedName` del visor sin `.pdf` (SHA-256 hex del PDF publicado) | `exterior-actas.json` |
| **RN-02** | Auto-envío si score ≥ 9. | UI digitalizador |
| **RN-03** | Reintentos + envío de emergencia con advertencia. | UI digitalizador |
| **Modo demo** | Build estático (GH Pages): datos de `public/data/*.json` + almacenamiento del navegador. | `lib/env.ts` |
| **Modo completo** | Backend Next.js + Prisma/SQLite + VLM real server-side. | `bun run dev` |

## 2. Contratos de datos del identificador (`src/lib/identificacion-acta.ts`)

Módulo puro en rama `feature/identificador-actas`. API pública:

```ts
// Índice: construirlo UNA vez por sesión y reutilizarlo (Map en memoria)
crearIndiceActas(items: ActaVisoItem[]): Map<string, EntradaIndice>

// 1) Normalizar la lectura OCR de la zona "X ··· X"
normalizarCodigoTransmision(crudo: string | null): CodigoNormalizado
//   → { codigo: "7231019" | null, correcciones: ["O→0"], notas: [] }

// 2) Identificar el acta (match exacto + respaldo Hamming-1 + encabezado)
identificarActa({ codigoCrudo, encabezado, indice }): ResultadoIdentificacion
//   → estado: IDENTIFICADA | AMBIGUA | NO_ENCONTRADA | CODIGO_ILEGIBLE
//   → entrada: { mesaNumero, consulado{departamento,municipio,zona,puesto}, pdfHash }

// 3) Clasificar hoja: página (1|2) y tipoEjemplar sin depender del barcode
clasificarEjemplar({ textoOcr, barcode15, perfilTinta }): ClasificacionEjemplar
//   → pagina: 1|2|null (null = conflicto de señales = ILEGIBLE_RESCANEO)
//   → tipo: "DELEGADOS" | "TRANSMISION" | null

// 4) Guard de integridad ANTES de persistir
decidirAlmacenamiento({ identificacion, clasificacion, qrFingerprint, existente })
//   → accion: ALMACENAR | REEMPLAZAR | ANOMALIA | DESCARTAR
//   → anomalias: ["ID_RANURA_OCUPADA_DISTINTA", ...] → bandeja del supervisor
//   → estadoSugerido: VALIDADO | EN_COLA | ANOMALIA | RECHAZADO
```

**Reglas de oro de la integridad (implementadas en el guard):**

- Nunca se almacena una hoja sin `(mesa, tipo, página)` determinados.
- Nunca se "adivina" la página ante conflicto de señales: `null` → rescan.
- Misma huella QR re-escaneada: DESCARTAR si ya está VALIDADO, si no REEMPLAZAR.
- Ranura `(mesa,tipo,página)` ocupada con huella distinta → ANOMALÍA.
- Encabezado DIVIPOL que contradice ≥2 campos al código → ANOMALÍA.

**Códigos de anomalía del identificador** (prefijo `ID_`, para la bandeja
del rol B; mapear a `TipoAnomalia` existente o extender la unión):
`ID_CODIGO_ILEGIBLE` · `ID_AMBIGUA` · `ID_NO_ENCONTRADA` ·
`ID_ENCABEZADO_INCONSISTENTE` · `ID_PAGINA_O_TIPO_INDETERMINADO` ·
`ID_RANURA_OCUPADA_DISTINTA`

## 3. Fronteras de arquitectura

| Capa | Permitido | Prohibido |
|---|---|---|
| `lib/*` puro (parse, identificacion, verificar) | TypeScript puro, sin DOM/Prisma/z-ai; funciona en cliente Y servidor | imports de React, `window`, `fs` |
| Componentes cliente | hooks, cámara, canvas, Web Workers, IndexedDB | `z-ai-web-dev-sdk`, Prisma |
| API routes (`app/api/*`) | Prisma, z-ai SDK, lógica servidor | lógica de UI duplicada |
| Modo demo (`demo-store`) | localStorage/IndexedDB/BroadcastChannel | llamadas a `/api/*` |

La elección de modo se hace con `IS_STATIC_EXPORT` (`lib/env.ts`) a través
de `lib/api-client.ts`. **Un solo código, dos builds.** No crear ramas de
código por modo: ramificar por entorno de BUILD, no por `if` dispersos.

## 4. Convenciones de código

- **Idioma**: UI y comentarios en español; identificadores de código en
  español cuando el dominio lo pide (`identificarActa`) o inglés técnico
  estándar (`Map`, `fetch`). Consistencia > purismo.
- **Tipos**: dominio en `src/lib/types.ts`. Los módulos puros definen sus
  interfaces locales si solo ellas las usan. Cero `any` (usar `unknown` +
  narrowing).
- **Módulos puros primero**: la lógica de decisión (identificar, clasificar,
  puntuar) vive en funciones puras testeables; los componentes solo pintan.
- **Estados de acta**: usar SIEMPRE la unión `ActaEstado`
  (`PENDIENTE|VALIDADO|RECHAZADO|ANOMALIA|OFFLINE|EN_COLA`). No inventar
  estados paralelos.
- **Score**: entero 0–10. ≥9 auto-envío (RN-02). La calidad de imagen
  (nitidez Laplaciano, contraste, brillo) alimenta el score junto con la
  confianza de identificación; la fórmula consolidada la define el rol A
  en `TAREA-A` y la firma el rol C.

## 5. Commits y ramas

- Formato (ya usado en el repo): `fix(digitalizador): cámara operativa — …`,
  `feat(supervisor): …`, `docs(agentes): …`.
- Una rama por tarea: `feature/<rol>-<tema>` (p. ej. `feature/a-escaner-pwa`).
- `main` se actualiza por merge de rama verificada (nunca push directo de
  trabajo sin verificar). El orquestador fusiona.
- Cada commit debe dejar el proyecto compilando.

## 6. Comandos de verificación (obligatorios antes de cerrar tarea)

```bash
bun install
bunx tsc --noEmit        # tipos limpios
bun run lint             # ESLint limpio
NEXT_STATIC_EXPORT=1 bun run build:static   # la demo de Pages sigue compilando
```

Para verificar el identificador contra los datos reales (sin dejar rastro
de tests en el repo):

```bash
# script ad-hoc fuera del repo; ver TAREA-C para el snippet completo
bun -e "const {crearIndiceActas}=require('./src/lib/identificacion-acta'); /* … */"
```

## 7. Datos reales (fuente de verdad)

- `prisma/data/exterior-actas.json` — 3.670 actas del exterior
  (949 consulados, 67 países) con `idTransmissionCode` único.
- `prisma/data/exterior-tree.json` — árbol geográfico (país → ciudad → puesto).
- `prisma/data/avance-*.json` — avance nacional real del visor.
- `public/actas/` — 8 imágenes E-14 reales (con `mini/`) para probar flujos
  (incluyen El Cairo y Barcelona-Girona usadas en las validaciones).
- `public/data/*.json` — export estático para el modo demo (`bun run demo:export`).

> Si la Registraduría actualiza el visor, regenerar con `bun run db:seed`
> y `bun run demo:export`, y anotarlo en el worklog.
