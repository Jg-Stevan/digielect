Esta interfaz corresponde al **Módulo de Carga Masiva de Actas**, el cual funciona como un sistema de contingencia para la ingesta manual de actas E-14, permitiendo el procesamiento por lotes con reconocimiento automático de ubicación vía código de barras.

A continuación se detalla la explicación técnica y funcional de la pantalla:
### 1. Encabezado y Zona de Ingesta (Drag & Drop)

Ubicada en la parte superior izquierda del área de trabajo principal:

- **Título y Descripción:** Define el propósito del módulo como canal de contingencia para procesar lotes masivos de actas en alta resolución.
    
      
    
- **Área de Arrastre (Dropzone):** Espacio delimitado con borde discontinuo para soltar archivos compatibles (`ZIP`, `PDF`, `JPG`, `PNG`, targ, etc).
    
      
    
- **Botón de Exploración:** Opción **`EXPLORAR ARCHIVOS`** para la selección manual desde el equipo.
    
      
    
- **Restricción de Tamaño:** Indica el límite de capacidad de los lotes (`LOTES DE HASTA X MB / APROX X ACTAS EN ALTA RESOLUCIÓN`).
    
      
    

### 2. Panel de Estado del Servidor OCR

Ubicado en la parte superior derecha, monitorea el rendimiento del motor de procesamiento inteligente:

  
- **Capacidad de Cola:** Mide el rendimiento de procesamiento en tiempo real (`850 / 1000 MB/s`).

### 3. Cola de Procesamiento y Resumen de Lote

Tabla central interactiva que detalla el estado de los archivos ingresados:

  

- **Contador de Estados del Lote:** Desglose rápido del total de elementos procesados:
    
      
    - **Reconocido (16):** Archivos leídos y estructurados exitosamente.
        
          
        
    - **Manual (4):** Archivos que requieren intervención humana por ambigüedad.
        
          
        
    - **Error (0):** Archivos rechazados por fallas críticas de lectura.
        
          
        
- **Columnas de la Tabla:**
    
      
    - **`#` / `ARCHIVO / VISTA PREVIA`:** Miniatura del documento y nombre del archivo con su respectivo peso y formato (ej. `E14_EGIPTO_CAIRO_M1_P1_alta.jpg`, 4.2 MB).
        h          
        
    - **`UBICACIÓN ESTRUCTURAL MAPEADA`:** Ruta geopolítica interpretada, acompañada de subtítulos de advertencia o estado.
        
          
        
    - **`ESTADO OCR` / Acciones por Registro:**
        
          
        - **Registro 01:** Etiquetado como `DUPLICADO (YA EXISTE)` con la opción de mantenerlo `OMITIDO`.
            
              
            
        - **Registro 02:** Detecta una alerta previa, mostrando el botón `RESUELVE ALERTA`.
            
              
            
        - **Registro 03:** Muestra el estado `NUEVO REGISTRO` listo para agregarse al sistema.
              
        
- **Paginador de Lote:** Controles inferiores para navegar entre los bloques de archivos cargados (`Mostrando 3 de 20 archivos en lote actual`, `Pág 1 de 7`).
    
      
    

### 4. Barra de Progreso Inferior y Consolidación

Ubicada en el pie de página del sistema para el control final del lote:

  

- **Indicador de Avance:** Muestra el progreso actual del análisis (`Analizando lote actual... Procesados 16 de 20 archivos — 80%`) con su respectiva barra gráfica de carga.
    
      
    
- **Botón de Integración Final:** **`INTEGRAR AL MONITOR GLOBAL`** (en verde destacado), habilitado para volcar los registros procesados y validados directamente en el sistema general de supervisión electoral.


