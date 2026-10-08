# 📚 Contexto de negocio — Digielect

> Documentos de **origen y diseño inicial** del proyecto, restaurados del
> historial de git (`b4da5e6`) el 2026-10-08 y reorganizados.

## ⚠️ Cómo interpretar esta documentación

Estos documentos describen la **intención de diseño y el dominio electoral**.
El proyecto ha evolucionado desde su escritura (ver
[`docs/worklog/historial-c1-c17.md`](../worklog/historial-c1-c17.md) y
[`docs/auditoria/`](../auditoria/)). Cuando un documento de aquí **contradiga
el código actual**, manda el código y
[`docs/arquitectura/ARQUITECTURA.md`](../arquitectura/ARQUITECTURA.md);
este material conserva valor como fuente del **dominio de negocio** (qué es un
acta E-14, el código de barras, el proceso electoral, los módulos previstos).

## Índice

### `negocio/` — el dominio electoral
| # | Documento | Qué explica |
|---|---|---|
| 01 | [Que datos contiene un acta E-14](./negocio/01-que-datos-contiene-un-acta-e14.md) | Anatomía del formulario E-14 |
| 02 | [Estructura del código de barras E-14](./negocio/02-estructura-codigo-barras-e14.md) | barcode15: elección, kit, tipo, versión, página |
| 03 | [Proceso de digitalización E-14](./negocio/03-proceso-digitalizacion-e14.md) | Del papel a la transmisión |
| 04 | [Digitalización en el exterior](./negocio/04-digitalizacion-en-el-exterior.md) | El caso consular específico |
| 05 | [Elecciones presidenciales 2026](./negocio/05-elecciones-presidenciales-2026.md) | Contexto electoral (segunda vuelta) |
| 06 | [Elecciones congreso 2026](./negocio/06-elecciones-congreso-2026.md) | Contexto electoral (cámara/senado) |
| 07 | [Cuántas mesas hay en el exterior](./negocio/07-cuantas-mesas-hay-exterior.md) | Dimensionamiento (3.670 actas / 949 puestos) |
| 08 | [ERS — Especificación de Requerimientos](./negocio/08-ers-requerimientos-software.md) | Requerimientos funcionales/no funcionales del sistema |
| 09 | [Flujo de validación y aprobación operativa](./negocio/09-flujo-validacion-aprobacion-operativa.md) | Reglas de negocio de validación (RN-01..RN-06) |

### `pwa/` — la app del digitalizador consular
| # | Documento | Qué explica |
|---|---|---|
| 01 | [Estados del acta E-14 en la PWA](./pwa/01-estados-acta-e14-pwa.md) | Máquina de estados del acta |
| 02 | [Interfaz gráfica (Digitalizador)](./pwa/02-interfaz-grafica-digitalizador.md) | Diseño de las pantallas de captura |
| 03 | [Perfil operativo a la arquitectura](./pwa/03-perfil-operativo-arquitectura.md) | Cómo el uso real moldea la arquitectura |

### `supervisor/` — el sistema de monitoreo
| # | Documento | Qué explica |
|---|---|---|
| 01 | [Panel de control y supervisión global](./supervisor/01-panel-control-supervision-global.md) | Monitor global |
| 02 | [Revisión de acta E-14](./supervisor/02-revision-acta-e14.md) | Flujo de revisión/auditoría del acta |
| 03 | [Módulo de revisión de anomalías](./supervisor/03-modulo-revision-anomalias.md) | Bandeja de anomalías |
| 04 | [Módulo de carga masiva de actas](./supervisor/04-modulo-carga-masiva-actas.md) | BATCH: carga y procesamiento masivo |
| 05 | [Centro de notificaciones](./supervisor/05-centro-notificaciones.md) | Alertas y contacto con delegados |
