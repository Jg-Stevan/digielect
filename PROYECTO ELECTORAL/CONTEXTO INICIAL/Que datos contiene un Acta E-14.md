El **Formulario E-14** es el acta de escrutinio diligenciada por los jurados de votación al cierre de las mesas en Colombia. Consta de elementos preimpresos de identificación, seguridad física y óptica, así como de las secciones de registro manuscrito.
## 1. Cabecera, Metadatos de Control y Seguridad Óptica

Esta sección superior contiene la información preimpresa para la identificación geográfica, control de imprenta y guías de procesamiento digital:

- **Código QR y Tipo de Ejemplar / Destino (Ubicación Central Superior):**
    
      
    - **Tipo de Ejemplar (Texto y Código cerca del QR):** Indica explícitamente el destino y uso del formulario dentro de la trilogía de actas impresas:
        
          
        - **DELEGADOS / CÓNSIUL (Dígito `2`):** Ejemplar oficial de ingesta masiva y consulta pública con valor probatorio.
            
              
            
        - **TRANSMISIÓN (Dígito `3`):** Ejemplar destinado al reporte rápido telefónico/digital para el preconteo informativo.
            
              
            
        - **CLAVEROS (Dígito `1` / Custodia):** Ejemplar introducido en el arca triclave sellada con máxima preferencia jurídica para el escrutinio oficial.
            
              
            
    - **Contenido del Código QR:** Matriz bidimensional cifrada que condensa los metadatos DIVIPOL, kit, tipo de ejemplar y paginación para agilizar la lectura e ingesta desde aplicaciones móviles o escáneres.
        
          
        
- **Código de Barras (15 dígitos):** Código único de la hoja que decodifica los datos clave del formulario:
    
      
    - _Dígitos 1-2:_ Tipo de Elección (ej. `71` = Presidencia).
        
          
        
    - _Dígitos 3-8:_ Número de Kit / Formulario secuencial de la mesa (ej. `000399`).
        
          
        
    - _Dígito 9:_ Tipo de Ejemplar / Destino (`2` = Delegados/Cónsul, `3` = Transmisión).
        
          
        
    - _Dígitos 10-11:_ Versión de diagramación aprobada (ej. `01`).
        
          
        
    - _Dígitos 12-13:_ Número de página actual (ej. `01`).
        
          
        
    - _Dígitos 14-15:_ Total de páginas del acta (ej. `02`).
        
          
        
- **Encabezado Institucional:** Título oficial (_Registraduría Nacional del Estado Civil_), denominación del proceso electoral, fecha y versión del diseño.
    
      
    
- **Identificación Geográfica (DIVIPOL):** Códigos y nombres territoriales asignados (Departamento/Consulado, Municipio/País, Zona, Puesto y Mesa de votación).
    
      
    
- **Código entre las "X X" (Patrón Central de Imprenta):** Identificador interno ubicado en la parte superior central (ejemplo: `X 7-23-10-19 X`). Cambia según el lote/kit y sirve como patrón de verificación tipográfica para validar la autenticidad del pliego físico e impedir falsificaciones.
    
      
    
- **Puntos Fiduciales (Marcadores en las 4 Esquinas):** Cuadrados negros macizos en los vértices del papel que sirven como guías de calibración óptica para software OMR/OCR/ICR:
    
      
    1. Detectan automáticamente la orientación de la página (evitan lecturas al revés).
        
          
        
    2. Aplican corrección geométrica de perspectiva (_deskew_).
        
          
        
    3. Mapean las coordenadas $(X, Y)$ exactas de las casillas de votación.
        
          
        

## 2. Nivelación de Mesa (Módulo de Cuadre)

Sección donde los jurados registran los datos numéricos iniciales del conteo en mesa:

  

- **Total Votantes Formulario E-11:** Cantidad total de ciudadanos registrados que ejercieron su voto según la lista física de votantes.
    
      
    
- **Total Votos en la Urna:** Cantidad de tarjetas electorales depositadas en la urna física.
    
      
    
- **Total Votos Incinerados:** Registro de tarjetas sobrantes o destruidas durante la apertura de la mesa.
    
      
    

## 3. Cuerpo de Votación (Resultados del Conteo)

Estructura central que contiene el desglose de los votos depositados:

  

- **Candidatos y Agrupaciones Políticas:** Listado ordenado de partidos, coaliciones, listas y candidatos registrados para la contienda.
    
      
    
- **Casillas de Votación (Diligenciamiento Manuscrito):** Celdas numéricas individuales para registrar los votos de cada opción.
    
      
    
- **Votos Informativos y Totales:** Desglose para **Votos en Blanco**, **Votos Nulos**, **Tarjetas no Marcadas** y la **Suma Total**. La suma total debe cuadrar exactamente con el total de votos en la urna.
    
      
    

## 4. Cierre, Constancias y Firmas (Última Página)

Sección ubicable al final del documento para validar la transparencia del proceso:

  

- **Constancias de los Jurados:** Novedades u observaciones escritas durante la jornada, incluyendo solicitudes de recuento de votos.
    
      
    
- **Firmas y Cédulas de los Jurados:** Nombres completos, números de cédula y firmas manuscritas en bolígrafo de los jurados asignados.
    
      
    
- **Controles de Seguridad (Inhabilitación):** Neutralización de casillas vacías mediante guiones o asteriscos para evitar adulteraciones posteriores.
    
      
    

## 5. Pie de Página: Consecutivos de Control y Custodia

Ubicados en la parte inferior del formulario para garantizar la trazabilidad del papel:

  

- **No. Form:** Identificador secuencial del formulario asignado a la mesa (ejemplo: `No. Form: 399`). Coincide con los dígitos 3 al 8 del código de barras.
    
      
    
- **KIT:** Número del paquete físico de material electoral entregado a la mesa (ejemplo: `KIT 399`).
    
      
    
- **Civ:** Consecutivo de impresión de seguridad / papel valor (ejemplo: `Civ 797`). Permite auditar el origen y la custodia física de la hoja desde la imprenta oficial.
    

## Esquema Visual Actualizado de la Cabecera y Estructura E-14

Plaintext

```
  [■ Marcador Fiducial]                                            [■ Marcador Fiducial]
  ┌──────────────────────────────────────────────────────────────────────────────────┐
  │ [ QR ]  EJEMPLAR: DELEGADOS (2)    [ Código de Barras 15D ]   Ver: 01 Pág: 1 de 2 │
  │                                                                                  │
  │                     REGISTRADURÍA NACIONAL DEL ESTADO CIVIL                      │
  │                       ACTA DE ESCRUTINIO DE LOS JURADOS                          │
  │                                                                                  │
  │  CONSULADO/DEPTO: 88    PAÍS/MUNICIPIO: 335    ZONA: 05   PUESTO: 02   MESA: 001 │
  │                                                                                  │
  │                               X  7-23-10-19  X                                   │
  │                         (Código de Imprenta Central)                             │
  ├──────────────────────────────────────────────────────────────────────────────────┤
  │                                                                                  │
  │  [1] NIVELACIÓN DE MESA (Votantes E-11, Votos Urna, Incinerados)                 │
  │                                                                                  │
  │  [2] CUERPO DE VOTACIÓN (Candidatos, Votos en Blanco, Nulos, No Marcados, Total) │
  │                                                                                  │
  │  [3] FIRMAS DE JURADOS, CÉDULAS Y CONSTANCIAS (Última Página)                    │
  │                                                                                  │
  ├──────────────────────────────────────────────────────────────────────────────────┤
  │ No. Form: 399                 KIT: 399                       Civ: 797            │
  └──────────────────────────────────────────────────────────────────────────────────┘
  [■ Marcador Fiducial]                                            [■ Marcador Fiducial]
```