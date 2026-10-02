Esta interfaz corresponde al **Panel de Control y Supervisión Global** del Sistema de Monitoreo Electoral E-14, diseñada específicamente para la supervisión de las actas E-14 a nivel directivo o de auditoría en tiempo real.
### 1. Indicadores Clave de Rendimiento (KPIs Superiores)

Ubicados en la parte superior para una lectura macro inmediata del estado de la jornada electoral:

  

- **Total Puestos (20):** Muestra el universo total de puestos de votación bajo control.
    
      
    
- **Segmentación por Estado:**
    
      
    
      
    - **Completo (5):** Puestos con actas transmitidas y auditadas correctamente.
        
          
        
    - **Crítico (1):** Puestos que requieren intervención prioritaria (por retrasos graves o fallas en el flujo).
        
          
        
    - **Pendiente (4):** Puestos en proceso de transmisión o verificación.
        
          
        
    - **No Iniciado (10):** Puestos pendientes de apertura de digitalización.
        
          
        

### 2. Barra de Filtros y Búsqueda Avanzada

Permite a los supervisores acotar la información según la estructura geopolítica:

  

- **Filtros Multivariable:** Selección por _País_, _Fecha_, _Zona_, _Puesto de Votación_ y _Estado Global_.
    
      
    
- **Búsqueda Rápida:** Campo de texto predictivo para localizar un puesto o mesa específico por su ID o nombre.
    
      
    

### 3. Matriz de Monitoreo y Cierre (Visión Macro por Puesto)

En la tabla principal se desglosa el avance territorial priorizando el huso horario y el tiempo transcurrido:

  

- **Sincronización Horaria (Hora Colombia vs. Hora Local):** Crucial para consulados y puestos en el exterior (ej. Italia, España, Inglaterra), comparando la hora oficial del país receptor frente al horario de corte colombiano.
    
      
    
- **Control de Tiempos de Cierre (`> 3 Hrs`, `< 1 Hr`):** Resaltado en colores de alerta para identificar retrasos críticos en el envío de actas tras el cierre de las urnas.
    
      
    
- **Barra de Avance por Fase:** Muestra las métricas de digitalización divididas en las dos actas principales: **E-14 Delegados** y **E-14 Transmisión**.
    
      
    
- **Columna Acciones:** Ofrece herramientas directas de auditoría y gestión rápida sobre el puesto seleccionado:
    
      
    - **Icono Ojo (Visualizar / Inspeccionar):** Despliega el resumen macro o la galería de imágenes de las actas correspondientes a ese puesto.
        
          
        
    - **Icono Campana (Notificar / Alertas):** Envía una notificación de alerta o recordatorio directo a los supervisores o delegados de campo asignados a dicho puesto.
        
          
        

### 4. Desglose Detallado por Mesa (Fila Expandida - Ej. Italia)

Al desplegar un puesto de votación (como _495 - ITALIA, Roma_), se activa la vista operativa mesa por mesa:

  

- **Estado de Delegados y Transmisión ($P1$, $P2$):** Seguimiento del flujo de verificación de las páginas de cada acta E-14.
    
      
    
- **Identificación Directa de Errores (`Rescaneo`):** Detecta anomalías específicas como fallas en la calidad de la imagen o ilegibilidad.
    
      
    
- **Botones de Acción Inmediata:**
    
      
    
      
    - **`REINSPECCIONAR`:** Opens the direct visualization of the digitized E-14 form to start an emergency visual audit.
        
          
        
    - **`NOTIFICAR`:** Envía alertas directas al operador de campo o delegado asignado a esa mesa para agilizar el envío o corrección del acta.
        
          
        

### 5. Barra Lateral de Navegación y Accesos

Mantiene la estructura modular del sistema visible a la izquierda:

  

- **Monitor Global:** Pantalla principal de control en tiempo real (vista actual).
    
      
    
- **Auditor de Actas & Carga Masiva:** Módulos para la ingesta por lotes, cotejo visual y verificación individual de imágenes.
    
      
    
- **Centro de Notificaciones con Badge (`RESCANEO`):** Indica en tiempo real la cantidad de solicitudes de re-procesamiento o re-escaneo pendientes.
    
      
    
- **Generar Informes:** Módulo dedicado a la exportación de reportes ejecutivos, consolidado de avance, actas digitalizadas y trazabilidad de auditoría en formatos estándar (PDF, Excel, CSV) para entrega a entes de control o directivos.
    
      
    
- **Revisión de Anomalías:** Bandeja de entrada centralizada para incidentes detectados automáticamente por el sistema de visión artificial o reportados manualmente. Requiere acción inmediata del supervisor.
    
      
    

¿Te gustaría agregar algún detalle específico sobre los formatos de exportación en el módulo de informes o sobre algún indicador de la tabla?