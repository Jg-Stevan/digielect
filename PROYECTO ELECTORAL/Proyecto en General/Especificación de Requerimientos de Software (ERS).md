
**Proyecto:** Plataforma de Digitalización, Transmisión y Auditoría de Actas E-14 (Consulados / Exterior)

  

**Entorno:** Elecciones de Colombia (Exterior)

  

**Estado:** Documento de Especificación Técnica Consolidado (Versión Pre-Desarrollo)

  

## 1. Alcance General del Sistema

### 1.1 Objetivo del Proyecto

El sistema tiene como objetivo automatizar la ingesta, validación de calidad, transmisión y auditoría operativa de las actas de escrutinio E-14 generadas en los puestos de votación del exterior.

  

### 1.2 Delimitación Operativa (Exterior)

- **Duración:** 7 días consecutivos de votación (Lunes a Domingo).
    
      
    
- **Cierre Diario:** 16:00 h hora local de cada país receptor.
    
      
    
- **Volumen:** 1.489 mesas (lunes a sábado) y hasta 2.181 mesas consolidadas el domingo pico.
    
      
    
- **Ejemplares a Procesar:** Exclusivamente 2 ejemplares por mesa:
    
      
    1. **E-14 Delegados** (Prioridad ALTA para escrutinio oficial con valor probatorio).
        
          
        
    2. **E-14 Transmisión** (Prioridad SECUNDARIA para preconteo informativo).
        
        _(El ejemplar de Claveros va archivado en la bolsa triclave y no ingresa a este pipeline digital)_.
        
          
        

## 2. Reglas de Negocio (RN)

- **RN-01 (Priorización de Ingesta):** El pipeline de comunicación y procesamiento en la PWA y en el backend debe dar prioridad estricta al envío del ejemplar **E-14 Delegados**. El envío del ejemplar de **Transmisión** debe encolarse en segundo plano.
    
      
    
- **RN-02 (Criterio de Validación Binario):**
    
      
    - **Pasa ($\ge 9/10$):** Ingesta aprobada automáticamente. Notificación de éxito al operador.
        
          
        
    - **No Pasa ($\le 8/10$):** Imagen rechazada por desenfoque, poca luz, código no detectado o mala alineación. La PWA exige la toma de una nueva fotografía.
        
          
        
- **RN-03 (Excepción por Reintentos Agotados):** Si el operador acumula 2 reintentos fallidos en la PWA ($\le 8/10$) sobre el mismo pliego, la aplicación habilita el **Envío de Emergencia con Advertencia**. Esta acción fuerza la subida del archivo e inserta un registro inmediato en la _Bandeja de Anomalías_ del Supervisor para su revisión.
    
      
    
- **RN-04 (Autenticación e Integridad Local):** Toda captura o metadato generado en la PWA debe firmarse mediante token JWT y mTLS por dispositivo. Cada archivo de imagen debe generar su **hash SHA-256 local** en el cliente antes de ser transmitido a la API Gateway.
    
      
    
- **RN-05 (Gobernanza de Carga Masiva - BATCH):** El módulo de carga por lotes (archivos ZIP o PDF) está restringido de forma exclusiva para el rol **Supervisor de digitalizacion**. Se utilizará únicamente cuando los digitalizadores envíen imágenes consolidadas por canales de contingencia (correo/escáneres de alta velocidad).
    
      
    
- **RN-06 (Monitoreo SLA y Notificación Directa):** El cálculo de mora se realiza dinámicamente comparando la hora actual del servidor frente a las 16:00 h local del consulado. Si una mesa no ha reportado su primer paquete tras 40 minutos, la interfaz del Supervisor resalta la mesa en estado de advertencia/mora y habilita enlaces de acción manual (`deep-links` directos a WhatsApp, correo corporativo o teléfono del responsable).
    
      
    

## 3. Requerimientos Funcionales (RF)

### Módulo 1: PWA Digitalizador Móvil

- **RF-1.1 (Encuadre y Captura Asistida):** La PWA debe desplegar un visor de cámara con marco de alineación (esquinas de guía). Debe incluir interruptor para **Flash/LED** y un filtro local en cliente (utilizando el _Canvas HTML5_) que detecte falta de contraste o desenfoque antes de bloquear o procesar la captura.
    
      
    
- **RF-1.2 (Decodificación de Código de Barras de 15D):** La aplicación debe extraer el código de barras de 15 dígitos de la cabecera del E-14 para clasificar automáticamente: _Tipo de Elección (dígitos 1-2)_, _Kit/Mesa (3-8)_, _Tipo de Ejemplar (9)_, _Versión (10-11)_, _Página Actual (12-13)_ y _Total Páginas (14-15)_.
    
      
    
- **RF-1.3 (Contingencia por Asignación Manual):** Si el código de barras no es legible por la cámara, la PWA debe desplegar la tarjeta de _Asignación Manual_, permitiendo la digitación de los 15 dígitos o la selección jerárquica mediante listas desplegables: `País > Consulado > Zona > Puesto > Mesa`.
    
      
    
- **RF-1.4 (Sincronización Offline - Background Sync):** Si no hay conexión de red, la PWA debe guardar la imagen comprimida ($1.8\text{ MB} - 3.0\text{ MB}$) y los metadatos dentro de `IndexedDB`. Tan pronto se detecte conectividad, los paquetes retenidos deben enviarse automáticamente en segundo plano.
    
      
    
- **RF-1.5 (Modo Manual / Transcripción Asistida):** Si el formulario físico está destruido o ilegible, el operador puede activar `MODO MANUAL: ON`, capturando la foto como soporte visual obligatorio e ingresando los datos numéricos de nivelación y votación casilla por casilla mediante teclado.
    
      
    

### Módulo 2: Panel de Control del Supervisor y Auditoría (_Command Center_)

- **RF-2.1 (Monitor Global de Avance):** Dashboard con visualización de avance geopolítico por país, área y consulado. Debe mostrar la sincronización de doble reloj (_Hora Colombia_ vs. _Hora Local del País_) y el progreso independiente por cada tipo de acta (_Delegados_ y _Transmisión_).
    
      
    
- **RF-2.2 (Bandeja de Anomalías):** Lista unificada de incidentes generados por la PWA o por el motor de análisis. Permite filtrar por: _Sin Firmas_, _Ilegibles / Rescaneo_, y _Código No Detectado_.
    
      
    
- **RF-2.3 (Modal de Auditoría Detallada / Reinspección):** Permite al supervisor inspeccionar el pliego en alta resolución, ver el marco de detección de error, ajustar controles de imagen (zoom, rotación) y tomar dos decisiones excluyentes:
    
      
    1. **Aprobar y Marcar como Válida:** Fuerza la aceptación del acta.
        
          
        
    2. **Confirmar Rescaneo:** Notifica a la PWA del digitalizador la obligación de repetir la toma.
        
        _Ambas acciones exigen una justificación escrita obligatoria que se guardará en el Audit Trail_.
        
          
        
- **RF-2.4 (Modulo de Carga Masiva - BATCH para Supervisor):** Interfaz exclusiva de supervisor que procesa lotes comprimidos (ZIP/PDF) de hasta 500 MB. El servidor desacopla el archivo, identifica el código de 15 dígitos de cada página y mapea las imágenes a sus respectivas mesas en la base de datos central.
    
      
    
- **RF-2.5 (Centro de Control SLA):** Clasificación en tiempo real de mesas inactivas por fases de mora: _Fase 1 (0-40 min)_, _Fase 2 (40-60 min)_ y _Fase 3 (> 2 horas)_. Cada registro fuera de tolerancia debe presentar botones operativos de contacto directo (WhatsApp, Correo) hacia el delegado asignado.
    
      
    

## 4. Requerimientos No Funcionales (RNF)

- **RNF-01 (Arquitectura y Rendimiento):**
    
      
    - **Latencia Edge:** Ingesta apoyada en _AWS CloudFront_ (CDN) para asegurar tiempos de respuesta HTTP en consulados inferiores a $300\text{ ms}$ en el envío de metadatos.
        
          
        
    - **Ancho de Banda y Rendimiento:** El backend debe soportar tasas de transferencia sostenidas de $850\text{ MB/s} - 1000\text{ MB/s}$ durante el procesamiento pico de imágenes mediante arquitectura desacoplada (_API Gateway + Apache Kafka / SQS + Object Storage S3_).
        
          
        
- **RNF-02 (Compatibilidad de Hardware Restringido):** La PWA debe ser plenamente funcional en smartphones de gama media/baja con procesadores de 4 a 8 GB de RAM, ejecutándose directamente desde navegadores móviles (Chrome, Safari) sin requerir instalación nativa.
    
      
    
- **RNF-03 (Seguridad e Inalterabilidad):**
    
      
    - **Cifrado:** Transmisión de datos obligatoria bajo TLS 1.3/mTLS.
        
          
        
    - **Trazabilidad (Audit Trail):** Toda acción de creación, aprobación manual, rechazo o subida masiva debe registrar de manera inalterable el ID de sesión, usuario, dirección IP, timestamp local/UTC y el hash SHA-256 del archivo.
        
          
        
- **RNF-04 (Diseño de Interfaz - Precision Monitor):**
    
      
    - **Estilo Visual:** Interfaz con filosofía _Dark Mode First_ (fondo `#0E1414`), garantizando alto contraste mediante colores funcionales: Verde primario (`#00C853`), Amarillo advertencia (`#FFD600`) y Rojo error (`#FF5252`).
        
          
        
    - **Tipografía Funcional:** _Hanken Grotesk_ para elementos estructurales y de navegación; _JetBrains Mono_ obligatoria para números, tablas, código de barras y marcas de tiempo.
        
          
        

## 5. Matriz de Trazabilidad de Estados de un Acta

```
  [ Pendiente ]
        │
        ▼
 (Captura PWA) ─── Score ≤ 8/10 (Reintentos < 2) ──> [ Rechazado / Repetir Foto ]
        │                                                     │
        │ (2 reintentos fallidos)                             │ (Satisfecho)
        ▼                                                     ▼
 [ Envío con Advertencia ]                          [ Validado / Completado ]
        │                                                     │
        ▼                                                     │
 [ Bandeja de Anomalías ]                                     │
        │                                                     │
        ├───────────> (Aprobado por Supervisor) ──────────────┤
        │                                                     │
        └───────────> (Confirmado Rescaneo) ──> [ Repetir en PWA ]
                                                              │
                                                              ▼
                                                   [ Integrado a Central ]
```

|**Estado**|**Definición**|**Condición de Disparo**|**Acción Permite / Siguiente Paso**|
|---|---|---|---|
|**Gris: Pendiente**|Mesa/página asignada pero sin reporte.|Puesto abierto tras las 16:00 h local.|Espera la primera captura en la PWA.|
|**Verde: Validado / OK**|Imagen nítida e ingesta correcta ($\ge 9/10$).|Evaluación de calidad y lectura de código 15D en cliente/servidor exitosa.|Acta pasa a estado final y queda disponible para consulta del CNE.|
|**Rojo: Rechazado**|Calidad insuficiente ($\le 8/10$) o archivo corrupto.|Falla en iluminacion, desenfoque o código no detectado.|La PWA bloquea el envío y exige repetir la foto.|
|**Naranja: Anomalía**|Envío forzado tras reintentos o ingesta BATCH con duda.|Superados 2 reintentos fallidos en la PWA o bandera de falta de firmas.|Se deriva a la _Bandeja de Anomalías_ del Supervisor para resolución manual.|
|**Amarillo: Offline**|Procesada localmente en el teléfono pero sin transmisión.|Pérdida de conectividad en la PWA consular.|Almacenada en `IndexedDB`; se transmite vía _Background Sync_ al recuperar red.|

## 6. Firma y Aprobación de la Especificación

Este documento consolida las reglas de negocio, requerimientos y arquitectura del **Sistema de Digitalización Electoral E-14 (Exterior)**. Queda congelado y aprobado para el inicio de las actividades de desarrollo de software (Sprint 1).