### 1. El Flujo de Validación y Aprobación Operativa

El control de calidad recae en la línea de mando directa entre el **Digitalizador PWA** y el **Supervisor del Puesto/Consulado**:

  

```
[ Formulario E-14 Físico ]
           │
           ▼
[ Digitalizador Consular (PWA) ] ──> Evaluado por Algoritmo Local / Visión Artificial
           │
           ├─── Score ≥ 9/10: Aprobación automática y transmisión limpia.
           ├─── Score 6/10 - 8/10: "Envío con Advertencia" (Esquinas cortadas, arrugas).
           └─── Score ≤ 5/10: Rechazado (Ilegible/Falta de luz). Forzado a re-escaneo.
           │
           ▼
[ Bandeja de Anomalías / Modal de Auditoría ] ──> (Intervención del SUPERVISOR)
                                                      │
                                                      ├─── Aprobar y Validar Acta
                                                      └─── Confirmar Solicitud de Rescaneo
```

1. **Digitalizador (PWA Móvil):** Captura el acta E-14 ($2$ páginas de Delegados y $2$ páginas de Transmisión en Presidenciales).
    
      
    
2. **Control de Calidad en Ingesta:** El algoritmo local evalúa nitidez, iluminación y código de barras de $15$ dígitos:
    
      
    - **Score $\ge 9/10$:** Se aprueba y envía automáticamente sin intervención del supervisor.
        
          
        
    - **Score $6/10 - 8/10$:** El digitalizador puede forzar el envío ("Envío con Advertencia"), enviando el caso con una marca (_flag_) a la bandeja del supervisor.
        
          
        
    - **Score $\le 5/10$:** Transmisión bloqueada por ilegibilidad.
        
          
        
3. **Supervisor de Digitalización (Bandeja de Anomalías y Modal de Auditoría):**
    
      
    - El supervisor visualiza las alertas en tiempo real en su panel (ej. falta de firma de jurado o imagen borrosa).
        
          
        
    - En el **Modal de Auditoría Detallada**, el supervisor decide si **Aprobar y Marcar como Válida** (si la información es legible pese a la advertencia) o **Confirmar Rescaneo** para que el digitalizador tome la foto de nuevo. Todas sus acciones quedan en un registro inalterable (_Audit Trail_)


### 2. Detalle Componente a Componente de la Arquitectura

```
                       [ CAPA EDGE / CLIENTE ]
    [ PWA Digitalizador Móvil ]       [ Panel Web Supervisor ]
    • Offline via IndexedDB           • Bandeja de Anomalías
    • Service Workers                 • Control de Mora SLA
                 │                                │
                 └────────────────┬───────────────┘
                                  ▼
                   [ AWS CloudFront / Edge Locations ]
                                  │
                                  ▼
                [ CAPA DE ENTRADA / API GATEWAY ]
                • Autenticación (JWT / mTLS)
                • Rate Limiting & Firewall (WAF)
                                  │
                                  ▼
                 [ CAPA DE ASINCRONÍA Y COLAS ]
              [ Apache Kafka / AWS SQS (Partitioned) ]
                                  │
                 ┌────────────────┴────────────────┐
                 ▼                                 ▼
   [ CAPA DE PROCESAMIENTO HEAVY ]      [ CAPA DE ALMACENAMIENTO ]
   • Worker Cluster (OCR/OMR/Visión)    • Object Storage S3 (Imágenes)
   • Engine SLA y Notificaciones WA/SMS • DB Principal PostgreSQL
```

#### A. Capa Edge y Dispositivo Cliente (Consulados en el Exterior)

- **PWA Ligera:** Ejecutada en el navegador del smartphone del digitalizador.
    
      
    
- **Optimización en Cliente:** Comprime la foto mediante HTML5 `canvas` a un promedio de $1.8\text{ MB} - 3\text{ MB}$ por página antes de subirla, protegiendo el consumo de red en consulados lejanos.
    
      
    
- **Persistencia Offline (IndexedDB):** Si la red del consulado cae, la PWA guarda los metadatos y las fotos en la memoria del navegador (_IndexedDB_). A través de _Background Sync_, los paquetes se envían automáticamente al servidor en segundo plano apenas se recupera la conexión.
    
      
    

#### B. Capa de Ingesta CDN y API Gateway

- **AWS CloudFront (CDN):** Al estar distribuidos los consulados globalmente (Europa, Asia, América), la PWA no conecta directamente al servidor en Bogotá, sino al punto de presencia (_Edge Location_) de CloudFront más cercano, reduciendo drásticamente la latencia HTTP.
    
      
    
- **API Gateway & Firewall (WAF):** Valida la identidad del usuario/dispositivo mediante tokens JWT y mTLS para evitar inyecciones de imágenes maliciosas o ataques DDoS.
    
      
    

#### C. Capa de Asincronía y Mensajería (Colas)

- **Apache Kafka / Amazon SQS:** Desacopla la recepción del procesamiento. Cuando el digitalizador sube la foto, el API Gateway la guarda en almacenamiento de objetos (S3), publica un evento en la cola en menos de $100\text{ ms}$ y le confirma al usuario que el paquete fue recibido.
    
      
    
- Esto evita que la aplicación móvil se "congele" esperando el procesamiento de imágenes por parte del servidor central.
    
      
    

#### D. Capa de Procesamiento Inteligente (Worker Cluster OCR/Visión)

- **Nodos GPU/CPU Auto-escalables:** Consumen los mensajes de la cola de Kafka.
    
      
    
- **Evaluación de Calidad y Fiduciales:** Detectan los puntos fiduciales (esquinas negras), corrigen la inclinación (_deskew_), leen el código de barras de $15$ dígitos y evalúan el nivel de nitidez/oscuridad.
    
      
    
- **Disparador de Estados:**
    
      
    - Si el análisis arroja falla crítica, marca el acta como **Rechazada ($5/10$)** o con **Advertencia ($6/10-8/10$)** y notifica al supervisor del puesto.
        
          
        

#### E. Capa de Supervisión y Control de Mora (SLA Engine)

- **Panel de Control del Supervisor:** Interfaz en vivo orientada a alta densidad de datos ("Precision Monitor").
    
      
    
- **Bandeja de Anomalías:** Agrupa actas con fallas (ausencia de firmas, códigos no detectados o solicitudes de rescaneo). El supervisor analiza la imagen en el visor y toma la decisión de **Aprobar** o **Rechazar/Solicitar Rescaneo**.
    
      
    
- **Motor de SLA (Notificaciones):** Calcula dinámicamente el tiempo transcurrido desde el cierre local a las 16:00 h en cada país. Si una mesa no reporta actas tras $40$ minutos, dispara alertas progresivas (Nivel 1: WhatsApp automático al digitalizador; Nivel 2: SMS/Correo al Cónsul).
    
      
    

### 3. Matriz de Contingencias Operativas

| **Escenario de Fallo**                               | **Impacto**                                   | **Mecanismo de Contingencia Integrado en Arquitectura**                                                                                                                                                 |
| ---------------------------------------------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Corte de Internet en Consulado**                   | El operador no puede transmitir actas.        | **PWA Offline + IndexedDB:** Guarda las imágenes cifradas localmente y la cola se libera vía _Background Sync_ al retornar la red.                                                                      |
| **Código de Barras Roto/Manchado**                   | El OCR no reconoce la mesa automáticamente.   | **Asignación Manual PWA:** El digitalizador digita la serie de 15 dígitos o selecciona el puesto vía desplegable (_País > Consulado > Mesa_).                                                           |
| **Poca Luz / Deterioro de Imagen**                   | Score $\le 5/10$ bloquea el envío automático. | **Modo Manual ON / Rescaneo:** Si la cámara no logra nitidez, la PWA habilitan la transcripción asistida manteniendo la foto como evidencia.                                                            |
| **Fallo en Transmisión PWA por Dispositivo**         | El teléfono del digitalizador sufre un fallo. | **Módulo BATCH (Carga Masiva):** El supervisor del consulado escanea todas las actas en un escáner de escritorio y sube un paquete comprimido (ZIP/PDF de hasta 500 MB) que el backend procesa en lote. |
| **Inconsistencia de Firmas o Actas con Advertencia** | Score $6/10-8/10$ o falta de firmas.          | **Bandeja de Anomalías:** El acta se marca en amarillo/naranja y se deriva al supervisor, quien fuerza la validación mediante justificación escrita en la trazabilidad de auditoría.                    |
