
El código de barras impreso en la cabecera del formulario E-14 actúa como la **identificación única (cédula) de cada hoja** de papel. Se genera e imprime **antes de la jornada electoral**, por lo que no contiene los votos manuscritos, sino la **ubicación, tipo de documento y metadatos de diagramación** necesarios para el procesamiento automatizado por escáneres e Inteligencia Artificial (OCR/ICR).

---

## 1. Ejemplo de Desglose de Cadena

Tomando como referencia la cadena del acta de Egipto: **`710003992010102`**
[[EL CAIRO D - DOMINGO.pdf]]

| Tramo de Dígitos  | Valor en Ejemplo | Significado / Campo            | Descripción                                                                                              |
| :---------------- | :--------------: | :----------------------------- | :------------------------------------------------------------------------------------------------------- |
| **Dígitos 1-2**   |       `71`       | **Tipo de Elección**           | Identifica la contienda electoral (ej. Presidencia y Vicepresidencia).                                   |
| **Dígitos 3-8**   |     `000399`     | **Número de Kit / Formulario** | Identificador secuencial único del paquete físico asignado a la mesa (`No. Form: 399` / `KIT 399`).      |
| **Dígito 9**      |       `2`        | **Tipo de Ejemplar (Destino)** | Define el uso del acta E-14: <br> • **`2`**: Delegados / Cónsul o Embajador.<br> • **`3`**: Transmisión. |
| **Dígitos 10-11** |       `01`       | **Versión de Diagramación**    | Versión de diseño del formulario aprobada por la Registraduría (`Ver: 01`).                              |
| **Dígitos 12-13** |       `01`       | **Número de Página Actual**    | Identifica la hoja leída en el momento (Página 1).                                                       |
| **Dígitos 14-15** |       `02`       | **Total de Páginas del Acta**  | Indica la cantidad de hojas que conforman el juego completo de esa mesa (2 Páginas).                     |

---

## 2. Diagrama de la Lectura del Código

```text
 71  000399  2  01  01  02
 ──  ──────  ─  ──  ──  ──
 │     │     │  │   │   └──────── Total de Páginas del Acta (2)
 │     │     │  │   └──────────── Página Actual (Página 1)
 │     │     │  └──────────────── Versión del Formulario (Ver 01)
 │     │     └─────────────────── Tipo de Ejemplar (2 = Delegados / Cónsul)
 │     └───────────────────────── Número Consecutivo de Kit / Formulario (Mesa 001)
 └─────────────────────────────── Tipo de Elección (71 = Presidencia)

