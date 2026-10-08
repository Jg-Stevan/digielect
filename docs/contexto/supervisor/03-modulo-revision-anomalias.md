
Esta interfaz corresponde al módulo de **Revisión de Anomalías**, el cual actúa como la bandeja de entrada centralizada para incidentes detectados automáticamente por el sistema de visión artificial o reportados manualmente, requiriendo la acción inmediata del supervisor para su resolución.

A continuación se detalla la explicación técnica y funcional de la pantalla:

### 1. Encabezado y Control de Sincronización

Ubicados en la parte superior para contextualizar la bandeja de trabajo:


- **Título y Definición Operativa:** Define el propósito del módulo como centro de gestión de alertas prioritarias sobre actas en conflicto.
    
      
    
- **Indicador de Actualización:** Muestra el timestamp del último refresco de datos (`ÚLTIMA ACTUALIZACIÓN: HACE 2 MIN`) acompañado de un botón para forzar la recarga manual de la bandeja.
    
      
    

### 2. Filtros Rápidos por Tipo de Incidentes (KPIs de Categorización)

Permiten segmentar la bandeja según la naturaleza del problema detectado:


- **`TODAS (8)`:** Vista global de todas las anomalías pendientes de atención.
    
      
    
- **`SIN FIRMAS (3)`:** Filutra actas donde el motor de visión artificial identificó la ausencia o ilegibilidad de la firma de uno o más jurados.
    
      
    
- **`ILEGIBLES / RESCANEO (4)`:** Agrupa solicitudes de corrección por baja calidad de imagen, manchas o inconsistencias en la captura visual.
    
      
    
- **`CÓDIGO NO DETECTADO (1)`:** Identifica archivos cuya cabecera o código de barras no pudo ser interpretado automáticamente.
    
      
    

### 3. Matriz de Anomalías e Incidentes (Tabla Detallada)

Estructura en filas cada uno de los casos críticos reportados:

  

- **`HORA ALERTA`:** Sincronización horaria doble mostrando la hora del país de origen y la hora oficial de Colombia (ej. `14:20 LOCAL` / `12:20 COL`).
    
      
    
- **`UBICACIÓN`:** Mapeo de circunscripción electoral y mesa afectada (ej. `ITALIA > ROMA - MESA 001`, `ESPAÑA > MADRID - MESA 045`).
    
      
    
- **`FORMULARIO`:** Especifica el tipo de acta y la página concreta donde se identificó el fallo (ej. `TRANSMISIÓN - PÁGINA 2`).
    
      
    
- **`TIPO DE ANOMALÍA`:** Etiqueta gráfica distintiva con el diagnóstico del sistema:
    
      
    - `SIN FIRMAS DETECTADAS` (Alerta de validación formal).
        
          
        
    - `SOLICITUD RESCANEO` (Alerta operativa de captura).
        
          
        
    - `CÓDIGO NO DETECTADO` (Alerta de lectura/ingesta).
        
          
        
- **`SLA` (Tiempo Transcurrido):** Contador de tiempo de atención pendiente (ej. `15m`, `45m`, `2h`) para garantizar el cumplimiento de los tiempos límite de resolución de auditoría.
    
      
    

### 4. Acciones de Resolución Directa

Ubicadas en la columna final de la tabla:

  

- **Botón `RESOLVER` (Verde):** Abre directamente el **Modal de Auditoría** enfocado en el registro seleccionado, permitiendo al supervisor inspeccionar el fallo en detalle, autorizar un rescaneo o validar manualmente la anomalía con justificación guardada en el historial de trazabilidad.
    
      
    
- **Paginador Inferior:** Control de navegación para la bandeja (`Mostrando 1 - 3 de 8 anomalías`).