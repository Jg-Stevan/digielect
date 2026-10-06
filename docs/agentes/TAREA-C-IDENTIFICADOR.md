# 🔑 TAREA C — Identificador determinista de actas (rol orquestador)

> **Asignada a**: Z.ai Code (orquestador).
> **Estado**: núcleo implementado, validado e **integrado en main** —
> `src/lib/identificacion-acta.ts` (typecheck + lint limpios, **42/42
> checks** contra los datos reales; batería ampliada y re-ejecutada en
> C-2, ver worklog). La rama original se perdió al agotarse el contexto
> de una sesión; el módulo fue recreado desde el contrato de CONVENIOS §2.

---

## 1. El descubrimiento (evidencia, para que nadie lo dude)

### 1.1 El código entre las X = `idTransmissionCode` del visor

| Acta física | Impreso | BD Registraduría | Veredicto |
|---|---|---|---|
| El Cairo — Egipto 335, Z 05, P 02, M 001 | `X 7-23-10-19 X` | `idTransmissionCode: "7231019"` | ✅ exacto |
| Barcelona-Girona — España 355, Z 03, P 08, M 001 | `X 3-73-56-16 X` | `idTransmissionCode: "3735616"` | ✅ exacto |

Verificado sobre `prisma/data/exterior-actas.json` (3.670 actas):

- **Todos** los códigos tienen **exactamente 7 dígitos**.
- **3.670 códigos únicos / 3.670 actas** → cero colisiones.
- El registro trae mesa (`numberStand`), consulado completo (`idStand`,
  `standCode`, `idZoneCode`, `municipalityCode`) y el hash del PDF oficial
  (`expectedName`).

**Consecuencia**: la identificación NO necesita IA ni QR. OCR de texto
impreso grande (la zona X es una de las zonas más legibles del formulario)
+ búsqueda exacta en el índice = asignación determinista de la hoja.

### 1.2 El QR es una firma, no un mensaje

Los 4 payloads escaneados por el humano:

```
PdZiNVrwDCC8Xg7sqEjhTYy2zgYat2jWFv83E5hu37Y=   (Cairo p1)
LcyzMYaRFQAksxU26WzUETABJVEby2H4qP3QHKmjxwo=   (Cairo p2)
ut6rBA1gRQVEQQcxmRsF8vyxGusb9HWEJn+rAxz2Vpg=   (Barcelona p1)
H77b0HPu0jUmuXIp2HEVF66LNr/fwpn0FugAdlMI+vU=   (Barcelona p2)
```

- 44 chars base64url → **32 bytes** → digest SHA-256/HMAC.
- Verificado que NO coincide con `expectedName` (0/4) ni con el hash de los
  PDFs locales (re-renderizados). Conclusión: firma con clave privada de la
  Registraduría → **no reversible, y no hace falta**.
- Uso legítimo: `qrFingerprint` para deduplicación (misma hoja re-escaneada)
  y exhibición como "verificación criptográfica" en la UI.

### 1.3 Página y tipo sin barcode (el problema de las páginas cruzadas)

Las dos hojas comparten el código de transmisión, y el "Pag: 1 de 2" impreso
es pequeño (se vuelve ilegible con blur). Estrategia por señales:

| Señal | Peso | Qué aporta |
|---|---|---|
| **barcode15** (dígitos 12-13 = página; dígito 9 = tipo) | 0.5 | Determinista cuando es legible (ya existe `parseBarcode15`) |
| **Anclas de texto** impresas grandes | 0.35 | Pág 2: "CONSTANCIAS DE LOS JURADOS", "FIRMA JURADO", "HUBO RECUENTO", "SOLICITADO POR". Pág 1: "NIVELACIÓN DE LA MESA", "CANDIDATO", "VOTACIÓN", "SUMA TOTAL", "VOTOS EN BLANCO/NULOS". Tipo: banner "TRANSMISIÓN" / "CÓNSUL(EMBAJADOR)"(=DELEGADOS) / "DELEGADOS" |
| **Perfil de tinta** (opcional, sin OCR) | 0.2 | Rejilla de firmas abajo → p2 · tercio medio denso (fotos candidatos) → p1 |

Regla: **unanimidad ponderada**. Si las señales se contradicen → `pagina:
null` → el guard manda ANOMALÍA `ID_PAGINA_O_TIPO_INDETERMINADO` (rescan),
NUNCA se adivina. Así es imposible almacenar una página cruzada en silencio.

## 2. Lo implementado (`src/lib/identificacion-acta.ts`)

Módulo puro, sin dependencias de DOM/Prisma/z-ai, usable en cliente y
servidor. API completa documentada en [`CONVENIOS.md`](./CONVENIOS.md) §2.

- `crearIndiceActas()` — Map de 3.670 entradas por código de transmisión.
- `normalizarCodigoTransmision()` — limpia "X 7-23-10-19 X", corrige
  confusables seguros (O→0, I/l→1), valida 7 dígitos. Los ambiguos (S/5,
  B/8) NO se corrigen en automático: van a humano.
- `identificarActa()` — match exacto (conf 0.95-0.99 con encabezado
  consistente) + respaldo Hamming-1 desempatado por encabezado DIVIPOL +
  detección de encabezados contradictorios (≥2 mismatches → confianza 0.4).
- `clasificarEjemplar()` — votación ponderada barcode/texto/estructura con
  conflicto ⇒ null. Barcode determinista tiene piso de confianza 0.95.
- `decidirAlmacenamiento()` — guard de integridad: anomalías `ID_*`,
  dedupe por `qrFingerprint`, protección de ranura
  `(mesa,tipo,página)` ocupada con hoja distinta.

## 3. Cómo validar (reproducible, sin dejar tests en el repo)

```bash
git checkout feature/identificador-actas
bun install
bun -e '
import { crearIndiceActas, identificarActa, clasificarEjemplar, decidirAlmacenamiento } from "./src/lib/identificacion-acta";
import data from "./prisma/data/exterior-actas.json";
const idx = crearIndiceActas(data.actas);
const r = identificarActa({ codigoCrudo: "X 7-23-10-19 X",
  encabezado: { pais: "335", zona: "05", puesto: "02", mesa: "001" }, indice: idx });
console.log(r.estado, r.entrada?.mesaNumero, r.confianza); // IDENTIFICADA 1 0.99
'
```

La batería completa (42 checks: índice/normalización/confusables, Hamming-1,
ambiguos, barcode p1/p2/tipo, anclas de texto, conflictos, guard de
almacenamiento) está documentada en el worklog (Task C-1) y corre contra
`prisma/data/exterior-actas.json`.

## 4. Próximos pasos del rol C

1. **[FASE 1]** Integrar el identificador al flujo del digitalizador junto
   al rol A: `CapturaProcesada` → `identificarActa` → `clasificarEjemplar`
   → `decidirAlmacenamiento` → pantalla de revisión con la asignación.
2. **[FASE 1]** Definir y congelar la fórmula del score 0-10 (RN-02) con el
   rol A (propuesta en `TAREA-A-DIGITALIZADOR.md` §4).
3. **[FASE 4]** Diseñar el protocolo BATCH "procesa-en-tu-dispositivo"
   (contrato de trabajos y resultados) junto al rol B.
4. **[FASE 6]** Especificar VLM local opcional (solo modo completo, solo
   actas con score bajo; p. ej. Ollama en la laptop del operador) — nunca en
   la demo de Pages, nunca con terceros.
5. Mantener este documento y el panel de coordinación al día.

## 5. Decisiones abiertas (requieren humano o rol A/B)

- ¿El OCR de la zona X se hace con Tesseract.js en el teléfono en cada
  captura, o solo sobre el recorte del tercio superior (más rápido)?
  → decidir con rol A tras medir en dispositivo real.
- ¿`ID_NO_ENCONTRADA` (código válido de OTRA jurisdicción/elección) se
  rechaza o va a bandeja? → proposer: bandeja con severidad media.
- ¿Se expone `pdfHash` en la UI para verificación contra el visor oficial?
  → decisión de producto (humano).
