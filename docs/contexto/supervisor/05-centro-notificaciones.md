Esta interfaz corresponde al **Centro de Notificaciones y Control de Mora Operativa (SLA)**, diseñado para el seguimiento en tiempo real de los tiempos de tolerancia de escaneo post-cierre de urnas y el escalamiento progresivo de alertas en consulados y puestos de votación en el exterior.

A continuación se detalla la explicación técnica y funcional de la pantalla:
### 1. Cabecera y Herramientas del SLA Engine

Ubicados en la parte superior para la configuración global de las reglas de negocio y frecuencia del monitoreo:

  

- **Título y Descripción:** Define el módulo enfocado en monitorear la tolerancia de tiempo de escaneo e interacciones de escalamiento.
    
      
    
- **Badges de Configuración y Control:**
    
      
    - **`MATRIZ SLA POR PUESTO`:** Enlace o vista rápida de métricas agrupadas.
        
          
        
    - **`SLA ENGINE: EN VIVO (INTERVALO 30s)`:** Muestra la ejecución del motor de reglas en segundo plano refrescando métricas cada 30 segundos.
        
          
        
    - **`CONFIGURAR UMBRALES SLA`:** Acceso directo para modificar los parámetros de minutos por fase.
        
          
        
    - **`EXPORTAR REPORTE MORA`:** Permite generar un informe consolidado con los registros 
        
          
        
- **Barra de Subcabecera:** Muestra el badge `CONTROL DE MORA OPERATIVA (SLA) - 08`, la `Ventana de tolerancia activa: POST-CIERRE 16:00` y el acceso a `Auditoría Legal SLA`.
    
      
    

### 2. Tarjetas de Monitoreo de Fases de Escalamiento (KPIs SLA)

Segmentan el estado de las mesas de acuerdo con el tiempo transcurrido desde la hora oficial de cierre local:

  

- **FASE 1 - RITMO NORMAL (0-40 MIN):**
    
      
    - **42 Mesas (84.8%):** Representa las mesas dentro de la ventana estándar aceptable post-cierre.
        
          
        
- **FASE 2 - ADVERTENCIA PREVENTIVA (40-60 MIN):**
    
      
    - **05 Mesas (Alerta 1):** Mesas que superaron el primer umbral. Se dispara una notificación automática de Nivel 1 vía WhatsApp a los digitalizadores.
        
          
        
- **FASE 3 - MORA CRÍTICA (> 2 HR):**
    
      
    - **03 Mesas (Escalado):** Casos graves con retraso prolongado. Activa la notificación de Nivel 2 y el escalamiento directo al Delegado Consular.
        
          
        
- **TIEMPO PROMEDIO RECEPCIÓN 1ª PÁGINA:**
    
      
    - **18.4 min (SLA Meta < 25 min):** Métrica consolidada global con un `Cumplimiento global SLA: 91.2%`.
        
          
        

### 3. Filtros y Búsqueda de Mora

Ubicados encima de la matriz principal para filtrar el listado operativo:

  

- **Buscador Directo:** Permite buscar por puesto, consulado o mesa.
    
      
    
- **Desplegables Multivariable:** Filtros por _País_, _Región_ (Europa, América, Asia), _Fase_ (Fase 1, 2, 3) y _Estado de Notificación_.
    
      
    
- **Casilla de Verificación:** `OCULTAR EN RITMO NORMAL (<20M)` para enfocar el trabajo exclusivamente en mesas fuera de tolerancia.
    
      
    

### 4. Matriz de Seguimiento de Mora por Puesto (Tabla Principal)

Tabla central que detalla los casos en atención prioritaria con corte de auditoría en tiempo real (ej. `16:55:00 UTC`):

  

- **`PUESTO / UBICACIÓN`:** Identificación del consulado, país, zona y puesto (ej. _EL CAIRO - CONSULADO_, _LONDRES - CONSULADO_, _FRANKFURT - CONSULADO_, _MILÁN - CONSULADO_, _PARÍS - CONSULADO_).
    
      
    
- **`MESAS INACTIVAS`:** Identificadores visuales de las mesas con retraso en el envío de actas (ej. `Mesa 001`, `Mesa 002`, `Mesa 008`).
    
      
    
- **`HORA CIERRE LOCAL`:** Hora oficial fijada para la finalización de votaciones (`16:00 Local`).
    
      
    
- **`TIEMPO TRANSCURRIDO (MORA)`:** Contador dinámico resaltado por color (ej. `+55 min`, `+48 min` en rojo crítico; `+32 min`, `+26 min`, `+22 min` en amarillo de advertencia).
    
      
    
- **`FASE / NIVEL DE ALERTA`:** Clasificación del estado (ej. _FASE 3 - CRÍTICA: Mora 2 hrs sin lote inicial_; _FASE 2 - ADVERTENCIA: Supera tolerancia fase 1_).
    
      
    
- **`TRAZABILIDAD ÚLTIMA NOTIFICACIÓN`:** Historial multicanal del flujo de alertas enviadas:
    
      
    - **Canales:** Indica el medio utilizado (`WA`, `SMS`, `EMAIL`).
        
          
        
    - **Estado de entrega:** `Despachado`, `Entregado`, `Leído`, `Acuse verificado` o `Sin acuse recibido A (Reintento pendiente)`.
        
          
        
    - **Timestamps:** Registro de la hora exacta de interacción (ej. `16:45`, `16:48`, `16:22`).
        
          
        

### 5. Columna de Acción Operativa

Proporciona canales de intervención inmediata para romper el cuello de botella:

  

- **`CHAT WA` (Verde):** Inicia una conversación directa por WhatsApp con el delegado responsable de la mesa.
    
      
    
- **`CORREO` / `REENVIAR CORREO`:** Dispara nuevamente las alertas o requerimientos formales a las cuentas de correo institucionales.
    
      
    
- **Pie de Página:** Indica que se muestran `5 de 8 consulados con mesas fuera de SLA (>20 min)` y reporta un `Monitor de latencia operacional: 8.8s`.