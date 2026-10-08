# 🎼 Panel de Coordinación de Agentes — Digielect

> **Leeme PRIMERO si eres una IA (o humana) trabajando en este repo.**
> Este documento es el punto de encuentro del equipo distribuido de agentes
> que construye Digielect. Su propósito es que todos "hablemos el mismo
> idioma", no pisarnos el trabajo y avanzar hacia el mismo producto.

> 🔄 **ACTUALIZADO 2026-10-08**: el roadmap original (fases 1–6) y los ciclos
> C-1..C-17 están **COMPLETADOS**, y encima se ejecutó una auditoría profunda
> con su PLAN-CONTINUIDAD (olas 1–7) — ver
> [`docs/worklog/historial-c1-c17.md`](../worklog/historial-c1-c17.md) y
> [`docs/auditoria/`](../auditoria/). El **punto de entrada vigente** es
> [`AGENTS.md`](../../AGENTS.md) en la raíz; el worklog activo vive en
> `docs/worklog/` y la plantilla de entrada en
> [`docs/worklog/PLANTILLA-ENTRADA.md`](../worklog/PLANTILLA-ENTRADA.md).
> Las secciones 5–6 de este documento describen el estado inicial y se
> conservan como referencia histórica.

---

## 1. El producto y su misión

**Digielect** es una plataforma para la digitalización, transmisión y auditoría
de actas E-14 de los consulados de Colombia en el exterior, construida sobre
los **datos reales** del visor de la Registraduría
(`e14segundavueltapresidente.registraduria.gov.co`).

**Meta de demostración (video + GitHub Pages + descarga fácil):**

1. Un operador fotografía un acta E-14 **física e impresa** con su celular.
2. El sistema la recorta, aplica filtro B/N adaptativo y la **identifica de
   forma determinista** contra la base real (3.670 actas del exterior).
3. Si pasa el score (RN-02 ≥ 9) **se sube sola**; si no, reintenta o va a
   emergencia (RN-03).
4. El **Monitor del Supervisor** recibe el acta en vivo, con su bandeja de
   anomalías, SLA, carga masiva BATCH e informes.
5. Todo esto debe funcionar **sin enviar el acta a terceros** (procesamiento
   local en el dispositivo) y **sin Wi-Fi** (modo contingencia).

## 2. El equipo (quién hace qué)

| Rol | Agente | Especialidad | Archivo de tarea |
|---|---|---|---|
| **C** · Orquestador + Identificador | Z.ai Code | Coordinación, identificación determinista de actas, integridad de datos | [`TAREA-C-IDENTIFICADOR.md`](./TAREA-C-IDENTIFICADOR.md) |
| **A** · Digitalizador | IA de web-scanner | Captura, perspectiva, filtro B/N adaptativo, UX de escáner PWA | [`TAREA-A-DIGITALIZADOR.md`](./TAREA-A-DIGITALIZADOR.md) |
| **B** · Supervisor | IA del monitor | Monitor global, BATCH, informes, persistencia demo/completa | [`TAREA-B-SUPERVISOR.md`](./TAREA-B-SUPERVISOR.md) |

El humano (Jg-Stevan) es el dueño del producto: decide prioridades, provee
tokens/credenciales y aprueba lo que llega a `main`.

## 3. Descubrimientos validados que TODAS deben conocer

Estos hechos están **verificados contra los datos reales** (no asumir nada
distinto sin re-verificar y documentarlo en el worklog):

1. **El código entre las X del acta ("X 7-23-10-19 X") ES el
   `idTransmissionCode` del visor oficial.** Sin guiones → 7 dígitos.
   En las 3.670 actas del exterior es **único y de exactamente 7 dígitos**.
   Es la **llave primaria de identificación** (ver
   [`TAREA-C-IDENTIFICADOR.md`](./TAREA-C-IDENTIFICADOR.md) por la evidencia).
2. **El QR del E-14 NO se descifra**: es un digest de 32 bytes (base64url),
   firma con clave privada de la Registraduría. Su único uso legítimo es
   **huella digital para deduplicación** (`qrFingerprint`) y exhibición en UI.
3. **El barcode15 de 15 dígitos** codifica tipo de ejemplar (dígito 9:
   1=CLAVEROS interior, 2=DELEGADOS, 3=TRANSMISION) y página (dígitos 12-13).
   El parser ya existe: `src/lib/e14/parse.ts`.
4. **Banner "CÓNSUL/EMBAJADOR" = dígito 2 = `DELEGADOS`** en el schema
   (variante de exhibición del mismo ejemplar). No crear un tercer tipo.
5. **Las dos páginas de un acta comparten el mismo código de transmisión.**
   Identificar el acta ≠ identificar la hoja: la hoja es
   `(idTransmision, tipoEjemplar, pagina)`.

## 4. Cómo trabajamos (protocolo obligatorio)

1. **Antes de empezar**: lee [`AGENTS.md`](../../AGENTS.md) (raíz) + este
   README + [`CONVENIOS.md`](./CONVENIOS.md) + tu archivo de tarea (si
   aplica) + las últimas entradas de `docs/worklog/`.
2. **Rama**: cada tarea trabaja en su propia rama
   (`feature/<modulo>-<tema>`) a partir de `main`. `main` siempre debe
   compilar (`tsc --noEmit` y `bun run lint` limpios) porque un push a
   `main` **despliega la demo pública de GitHub Pages automáticamente**.
3. **Cambios mínimos e independientes**: no refactorices módulos ajenos a tu
   tarea. Si necesitas un cambio en un módulo de otro rol, proponlo en tu
   sección del worklog y coordínala (el orquestador la agenda).
4. **Al terminar**: añade una entrada en `docs/worklog/` (archivo
   `YYYY-MM-DD-<tema>.md`, append NUNCA overwrite en archivos existentes)
   con la plantilla de
   [`docs/worklog/PLANTILLA-ENTRADA.md`](../worklog/PLANTILLA-ENTRADA.md):

   ```markdown
   ---
   Task ID: <letra-número, p. ej. A-1>
   Agent: <tu nombre de agente>
   Task: <qué te pidieron>

   Work Log:
   - <paso concreto 1>
   - <paso concreto 2>

   Stage Summary:
   - <resultados / decisiones / artefactos>
   ```

5. **Verificación antes de declarar hecho**: `bunx tsc --noEmit` + `bun run
   lint` limpios, y si tocaste UI, verificación E2E en navegador (la demo
   estática debe seguir funcionando: `NEXT_STATIC_EXPORT=1 bun run
   build:static`).
6. **Seguridad (NO NEGOCIABLE)**: nunca commitear tokens, `.env`,
   `db/*.db` ni credenciales. El token de push lo maneja el humano en su
   entorno local; los agentes usan sus propios medios de autenticación.
   Si un secreto llega al repo, se considera incidente: reportarlo de
   inmediato en el worklog y rotar la credencial.

## 5. Estado actual y mapa de integración

```
        ┌──────────────────────────────────────────────────────┐
        │                   DIGIELECT (SPA única)               │
        │                src/app/page.tsx (shell)               │
        └────────────┬─────────────────────────┬───────────────┘
                     │                         │
   ┌─────────────────▼─────────┐   ┌───────────▼──────────────┐
   │  DIGITALIZADOR (rol A)    │   │  SUPERVISOR (rol B)      │
   │  captura · recorte · B/N  │   │  monitor · BATCH · SLA   │
   │  calidad · OCR local      │   │  anomalias · informes    │
   └─────────────┬─────────────┘   └───────────▲──────────────┘
                 │ imagen + métricas + OCR      │ ingesta validada
                 ▼                              │
   ┌────────────────────────────────────────────────────────┐
   │  IDENTIFICADOR (rol C) · src/lib/identificacion-acta.ts │
   │  código entre X → índice 3.670 actas → (mesa,tipo,pág)  │
   │  clasificación página/tipo · guard decidirAlmacenamiento│
   └────────────────────────────────────────────────────────┘
```

**Rama activa**: `feature/identificador-actas` contiene el módulo del
identificador listo para integrarse (typecheck + lint + 25/25 checks contra
los datos reales). Ver `TAREA-C-IDENTIFICADOR.md`.

## 6. Prioridad del roadmap (acordada con el humano)

| Fase | Entregable | Roles |
|---|---|---|
| **1** | Identificador determinista integrado al flujo del digitalizador (OCR código X + encabezado + clasificación página/tipo + guard) | C · A |
| **2** | Escáner web-scanner portado al digitalizador (lo esencial, sin biblioteca ni PDF) | A |
| **3** | Índice de actas exportado a `public/data/` para el modo demo estático | B |
| **4** | BATCH distribuido con métricas (procesar en el dispositivo, subir resultados) + IndexedDB | B · C |
| **5** | Sincronización pestaña↔pestaña (BroadcastChannel) y modo contingencia offline | B · A |
| **6** | Instalador one-click del modo completo (**Windows primero: `INICIAR-WINDOWS.bat`** — el operador confirmó Windows; Mac después) + VLM local opcional para actas con score bajo | B · C |

Cada fase cierra con: código en rama → revisión del orquestador → merge a
`main` → entrada en el worklog → (si aplica) redeploy de la demo.

---

*Este panel lo mantiene el rol C. Propuestas de cambio a la coordinación:
proponerlas en el worklog con el prefijo `[COORD]`.*
