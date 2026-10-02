
## **Pantalla principal de captura/escaneo**

Esta interfaz corresponde a la **pantalla principal de captura/escaneo** de la aplicación PWA para el digitalizador del formulario E-14. Está diseñada para servir como el punto de entrada operativo donde el usuario realiza el encuadre y procesamiento inicial del documento físico.

[[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_captura_autom_tica_e_14/screen.png]]
### Componentes de la Interfaz y su Función

#### 1. Encabezado de Control Superior (Top Bar)

- **Título "DIGITALIZADOR E-14":** Identifica el módulo activo dentro del sistema.
    
- **Interruptor "MODO MANUAL: OFF":** Botón de conmutación rápida. Permite al usuario pasar del flujo de captura y procesamiento automático por cámara a la digitación/transcripción manual cuando el formulario físico presenta daños severos, manchas o lecturas erróneas.
    
- **Icono de Flash/Iluminación ($\mathbf{\lightning}$):** Control directo para activar la luz LED/linterna del dispositivo móvil en entornos con poca iluminación dentro del puesto de votación.
    

#### 2. Área Central de Encuadre (Viewport / Visor)

- **Marco de Alineación (Esquinas de Guía Verde):** Guías visuales que indican los límites óptimos dentro de los cuales debe ubicarse el pliego físico.
    
- **Plantilla ESTRUCTURADA E-14 (Plantilla Guía):** Representa la maquetación estandarizada del formulario con sus tres secciones clave:
    
    1. **Encabezado y Metadatos:** Espacio asignado para la lectura del código de barras, código QR y los datos de la mesa (Departamento, Municipio, Zona, Puesto, Mesa).
        
    2. **Nivelación de Mesa:** Área específica donde se encuentran los datos de la cantidad de votantes en la lista y sobres en la urna.
        
    3. **Cuerpo del Acta:** Zona delimitada para la captura de las casillas de votación por agrupación política, votos en blanco, nulos y no marcados.
        

#### 3. Barra de Navegación Inferior (Bottom Nav)

- **Opción "ESCANEAR" (Activa - Verde):** Mantiene al usuario en la vista actual de captura de imágenes.
    
- **Opción "ACTAS":** Acceso directo al módulo de control y lista de actas procesadas, en revisión o con alertas.
    
- **Opción "RESUMEN":** Acceso al tablero con el consolidado del trabajo realizado, métricas de precisión y conteo del turno.


## Modo Manual Activado (Estado Inicial)

Esta pantalla corresponde al **Modo Manual Activado (Estado Inicial)** de la vista de captura del Digitalizador E-14. Es la variante directa de la pantalla anterior, pero configurada para la preparación de transcripción asistida o contingencia.

[[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_modo_manual_on_estado_inicial/screen.png]]
### Componentes de la Interfaz y su Función

#### 1. Encabezado de Control Superior (Top Bar)

- **Título "DIGITALIZADOR E-14":** Mantiene la identidad del módulo.
    
- **Interruptor "MODO MANUAL: ON" (Activo):** Indica claramente al operador que la lectura y procesamiento automático vía cámara u OCR está desactivado. En este modo, el sistema prioriza la toma de la foto del acta únicamente como respaldo documental visual mientras habilita el flujo de digitación manual de los datos por casillas.
    
- **Icono de Flash/Iluminación ($\mathbf{\lightning}$):** Permite encender el LED para asegurar una buena iluminación de la fotografía de soporte.
    

#### 2. Área Central de Encuadre y Foto de Soporte

- **Marco de Alineación (Esquinas Verdes):** Conserva los límites de encuadre para asegurar que la fotografía del acta quede bien centrada.
    
- **Plantilla ESTRUCTURADA E-14:** Mantiene el esquema visual de referencia (Encabezado/Metadatos, Nivelación de Mesa y Cuerpo de Votación). Sirve de guía para que el operador verifique que la foto que tomará cubra el 100% del formulario físico antes de pasar a la digitación de números.
    

#### 3. Zona Inferior de Disparo y Acciones

- **Botón Disparador Principal (Verde neón inferior):** Se habilita el botón central de captura manual para tomar la foto del acta.
    
- **Botón Auxiliar de Galería/Archivo (Icono de carpeta a la izquierda):** Permite al operador cargar una imagen pre-existente del acta en caso de que esté usando un dispositivo externo o escáner guardado en el almacenamiento local.
    

#### 4. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR (Activa - Verde):** Mantiene al operador en el flujo inicial de captura.
    
- **ACTAS & RESUMEN:** Permiten acceder al control general de mesas o al tablero de rendimiento.

## **Contingencia: Asignación Manual**
Esta pantalla corresponde al módulo de **Contingencia: Asignación Manual** (`digitalizador_contingencia_asignaci_n_manual`). Es la interfaz que se activa cuando el sistema de lectura automática (escáner/cámara) no logra identificar los metadatos esenciales del acta E-14 (como el código de barras o la ubicación de la mesa).

[[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_contingencia_asignaci_n_manual/screen.png]]
### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior (Top Bar)

- **DIGITALIZADOR E-14:** Identificación de la aplicación.
    
- **MODO MANUAL: ON (Activo):** Confirma que el procesamiento de lectura de código por cámara se ha pausado para permitir la entrada asistida por parte del usuario.
    
- **Icono de Flash ($\mathbf{\lightning}$):** Mantiene la opción de encender/apagar la luz del dispositivo.
    

#### 2. Visor Superior de la Captura (Preview con Error)

- **Marco con Borde Amarillo:** Advierte que la imagen actual tiene una observación o fallo de lectura.
    
- **Etiqueta "CÓDIGO NO DETECTADO":** Notifica explícitamente que la lectura óptica del código de barras superior o código QR no fue exitosa.
    
- **Botón "REPETIR":** Permite al operador descartar la toma actual y volver a intentar la captura si considera que la foto estuvo mal enfocada o con poca luz.
    

#### 3. Tarjeta de Formulario de Contingencia (Panel Central)

- **Encabezado de Alerta "CONTINGENCIA: ASIGNACIÓN MANUAL":** Explica las instrucciones para resolver la excepción mediante el ingreso manual de los datos de identificación del acta.
    
- **Campo "DIGITAR CÓDIGO DE BARRAS (15 DÍGITOS)":**
    
    - Entrada de texto requerida donde el usuario digita el número único impreso bajo el código de barras del formulario físico (en la imagen se observa un ejemplo ingresado: `710003993010202`).
        
    - Incluye una pequeña leyenda guía: _"Verifique el número impreso bajo el código de barras en el encabezado"_.
        
- **Separador "O BIEN":** Ofrece una vía de solución alternativa si el código de barras impreso es completamente ilegible o está roto.
    
- **Selector desplegable "Seleccionar por ubicación (Depto > Munc >...)":** Permite al usuario buscar y vincular el acta manualmente seleccionando la jerarquía geográfica (Pais, Zona, Puesto y Mesa de votación).
    
- **Botón Principal "CONFIRMAR Y PROCESAR ACTA":** Botón de acción destacado en verde que valida los dígitos ingresados, vincula la foto tomada con la mesa correspondiente y permite continuar con el flujo de transcripción o envío.
    

#### 4. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR (Activa - Verde):** Se mantiene dentro del flujo operativo de captura y corrección de actas.

    
- **ACTAS & RESUMEN:** Acceso rápido al inventario de mesas y estadísticas del operador.

## **Revisión de Acta (Envío Automático)**

Esta pantalla corresponde al módulo de **Revisión de Acta (Envío Automático)** (`digitalizador_revisi_n_de_acta_env_o_autom_tico`). Es la pantalla de confirmación positiva que se muestra cuando un formulario E-14 ha superado exitosamente los criterios de calidad de imagen y consistencia de lectura.

[[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_revisi_n_de_acta_env_o_autom_tico/screen.png]]

  
### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior (Top Bar)

- **Botonera de Regreso ($\leftarrow$):** Permite volver a la pantalla anterior.
    
      
    
- **Título "REVISIÓN DE ACTA":** Indica que el sistema está mostrando la vista previa del documento procesado.
#### 2. Tarjeta de Estado y Metadatos (Panel Verde Superior)

- **Puntaje de Calidad (`CALIDAD DE IMAGEN: 9/10`):** Muestra el resultado de la evaluación del algoritmo de nitidez, iluminación y encuadre (al estar en 9/10, supera con frecuencia el umbral mínimo).
    
      
    
- **Identificación Geográfica y de Mesa:** Muestra la trazabilidad del formulario digitalizado (resaltando el nombre del puesto escaneado)(ejemplo visible: `ROMA - CONSULADO | ITALIA > ZONA 10 > PUESTO 02 > MESA 001 > TRANSMISIÓN > PAG 1 DE 2`).
    
      
    
- **Banner de Confirmación (`✓ VALIDADO Y ENVIADO AUTOMÁTICAMENTE`):** Notifica al operador que los datos del acta ya fueron procesados y transmitidos exitosamente hacia la base de datos o cola del servidor.
    
      
    

#### 3. Visor de Previsualización de Imagen

- **Área Central de Muestra:** Presenta la imagen final digitalizada y recortada automaticamente
    

#### 4. Zona de Acción Principal

- **Botón Destacado "SEGUIR ESCANEANDO":** Botón de acción rápida en verde neón diseñado para agilizar la operación del usuario, permitiéndole pasar inmediatamente a la captura de la siguiente página o mesa.
    
      
    

#### 5. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR (Activa - Verde):** Se mantiene como el flujo principal de trabajo operativo.
    
      
    
- **ACTAS & RESUMEN:** Acceso directo para consultar el listado general de mesas o las métricas consolidadas del turno.

## **Revisión de Acta con Advertencia 8/10**

Esta pantalla corresponde a la vista de **Revisión de Acta con Advertencia 8/10** (`digitalizador_revisi_n_de_acta_8_10_advertencia`). Es un estado intermedio de validación donde el sistema detecta que la imagen es legible, pero presenta alguna pequeña anomalía visual o de encuadre que impide el envío automático directo.

  [[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_revisi_n_de_acta_8_10_advertencia/screen.png]]

### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior (Top Bar)

- **Flecha de Regreso ($\leftarrow$):** Permite volver a la toma o flujo previo.
    
      
    
- **Título "REVISIÓN DE ACTA":** Mantiene la identidad de la fase de verificación antes de procesar el documento.
    
      
    

#### 2. Tarjeta de Advertencia (Panel Amarillo/Naranja Superior)

- **Indicador de Estado y Calidad:** Muestra el puntaje de evaluación (`CALIDAD DE IMAGEN: 8/10 — ADVERTENCIA: ESQUINAS RECORTADAS`). Alerta sobre un problema técnico específico en la captura (en este caso, bordes o esquinas ligeramente fuera de cuadro).
    
      
    
- **Botón "REVISAR":** Permite al operador desplegar el detalle o análisis de la advertencia detectada por el algoritmo.
    
      
    
- **Ubicación Geográfica y Metadatos:** Identifica claramente el formulario procesado (resaltando el nombre del puesto) (`ROMA - CONSULADO | ITALIA > ZONA 10 > PUESTO 02 > MESA 001 > TRANSMISIÓN > PAG 1 DE 2`).
    
      
    
- **Mensaje de Recomendación:** Notifica al operador el estado real de la captura: _"Información legible. Se sugiere repetir la foto para aprobación automática"_. Le indica que, aunque los datos se leen, tomarla de nuevo agilizará el proceso.
    
      
    

#### 3. Previsualización y Herramientas de Edición

- **Visor de Imagen:** Muestra el encuadre actual del formulario E-14 para que el usuario juzgue visualmente si las esquinas están realmente cortadas.
    
      
    
- **Botones de Ajuste Rápido:**
    
      
    - **REPETIR ($\mathbf{\circlearrowleft}$):** Descarta la toma para reintentar la fotografía.
        
          
        
    - **ROTAR ($\mathbf{\circlearrowright}$):** Orienta la imagen $90^\circ$ si quedó de lado.
        
          
        
    - **RECORTAR ($\mathbf{\rightleftarrows}$):** Permite ajustar manualmente los vértices del área de encuadre.
        
          
        

#### 4. Zona de Acción Principal

- **Botón Destacado "REPETIR FOTO (RECOMENDADO)":** Guiado con borde verde brillante, sugiere al operador la mejor práctica (volver a tomar la foto) para asegurar una calidad óptima y evitar revisiones manuales posteriores por parte de un supervisor.
    
      
- **Botón "ENVIAR CON ADVERTENCIA" (Naranja Neón):** **Función clave de esta vista.** Permite al operador omitir la sugerencia de re-escaneo cuando el formulario físico está dañado en las esquinas o no se puede mejorar la foto. Al presionarlo, el acta se transmite inmediatamente, pero queda marcada (_flagged_) en la base de datos para revisión prioritaria en el panel de supervisión/control.

#### 5. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR (Activa - Verde):** Mantiene el foco en el flujo operativo de captura de documentos.
    
      
    
- **ACTAS & RESUMEN:** Acceso directo a la lista general de mesas y al panel de rendimiento del operador.
## **Revisión de Acta Rechazada - Calidad 5/10

Esta pantalla corresponde a la vista de **Revisión de Acta Rechazada - Calidad 5/10 (`digitalizador_revisi_n_de_acta_5_10_rechazada`)**. Es la interfaz de bloqueo que se activa cuando la imagen tomada no cumple con los estándares mínimos de calidad visual o legibilidad, impidiendo que una captura defectuosa sea enviada al sistema central.

  [[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_revisi_n_de_acta_5_10_rechazada/screen.png]]

### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior (Top Bar)

- **Botonera de Regreso ($\leftarrow$):** Permite regresar a la vista de escaneo previa.
    
      
    
- **Título "REVISIÓN DE ACTA":** Mantiene la continuidad dentro del flujo de verificación de imágenes.
    
      
    

#### 2. Tarjeta de Error Crítico (Panel Rojo Superior)

- **Indicador de Evaluación (`CALIDAD DE IMAGEN: 5/10 — 🚫 ERROR CRÍTICO: ILEGIBLE / IMAGEN CON POCA LUZ`):** Muestra la puntuación reprobatoria ($5/10$) asignada por el algoritmo de control de calidad y especifica la falla detectada (oscuridad o falta de contraste que impide la lectura OCR/OMR).
    
      
    
- **Ubicación y Metadatos del Acta:** Indica la mesa correspondiente (`ROMA - CONSULADO | ITALIA > ZONA 10 > PUESTO 02 > MESA 001 > TRANSMISIÓN > PAG 1 DE 2`).
    
      
    
- **Mensaje de Restricción:** Alerta de forma explícita: _"🚫 No se detectan datos legibles ni código E-14. El envío de esta foto está deshabilitado"_.
    
      
    

#### 3. Visor con Superposición de Rechazo (Preview Central)

- **Filtro Oscuro/Rojo:** Aplica una capa visual sobre la previsualización del acta para señalar que la toma ha sido descartada por el sistema.
    
      
    
- **Banner Flotante de Estado:** Muestra las etiquetas prominentes `IMAGEN RECHAZADA` y `POCA LUZ / NO APTO PARA TRANSMISIÓN`.
    
      
    

#### 4. Zona de Acción y Bloqueo de Transmisión

- **Botón Principal "🚫 OBLIGATORIO REPETIR FOTO" (Rojo Neón):** Es la única acción permitida en esta vista. Obliga al operador a descartar la toma actual y realizar una nueva captura con mejor iluminación o enfoque.
    
      
    
- **Leyenda de Control (`TRANSMISIÓN BLOQUEADA POR CONTROL DE CALIDAD`):** Confirma que el botón de envío ha sido deshabilitado de manera preventiva para asegurar la integridad de los datos en el servidor.
    
      
    

#### 5. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR (Activa - Verde):** Se mantiene enfocada para que el usuario proceda a repetir la captura.
    
      
    
- **ACTAS & RESUMEN:** Permiten navegar hacia la lista general de control o revisar las métricas consolidadas del operador.

## Control de Actas E-14
Esta pantalla corresponde al módulo de **Control de Actas E-14** (`digitalizador_control_actas_e_14`). Es el tablero de seguimiento y gestión en tiempo real que permite al operador o supervisor monitorear el estado de digitalización y transmisión de cada una de las mesas asignadas a su puesto de votación.

  [[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_control_actas_e_14/screen.png]]

### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior y Ubicación

- **Título "CONTROL ACTAS E-14":** Identifica el módulo activo de seguimiento y auditoría por mesas.
    
      
    
- **Sección "PUESTO ACTUAL":** Muestra la ubicación operativa donde está trabajando el usuario (ejemplo: `ROMA - CONSULADO`).
    
      
    
- **Metadatos e Identificador:** Detalla el ID único de la sesión/estación (`ID: #A92-F`) y la jerarquía geográfica (`ITALIA > ZONA 10 > PUESTO 02`).
    
      
    
- **Indicador de Conectividad ("((•)) EN LÍNEA"):** Confirmación visual en verde de que la aplicación está sincronizada con el servidor central en tiempo real.
    
      
    

#### 2. Acordeón de Listado de Mesas y Estados

- **MESA 01 (Desplegada - `COMPLETADA 100%`):**
    
      
    - **Tarjeta "DELEGADOS":** Muestra el estado de Digitalización de las actas E-14 DELEGADOS (`P1 ✓` y `P2 ✓` en verde, confirmando que ambas páginas están subidas y verificadas).
        
          
        
    - **Tarjeta "TRANSMISIÓN":** Muestra el estado de Digitalización de las actas E-14 TRANSMISION:
        
          
        - `P1 ✓` (Verde): Página 1 enviada e introducida exitosamente a la base de datos.
            
              
            
        - `P2 ⚠️ Rescaneo` (Alerta Amarilla/Marrón): Notifica que la página 2 presentó una advertencia o rechazo de calidad, por lo que requiere un nuevo escaneo o corrección antes de validar la mesa completa.
            
              
            
- **MESA 02 (Colapsada - `EN PROCESO`):**
    
      
    - Etiqueta en color naranja/amarillo que indica que el operador ha iniciado la captura de esta mesa, pero aún no ha completado el envío de todas sus páginas o validaciones.
        
          
        
- **MESA 03 (Colapsada - `PENDIENTE`):**
    
      
    - Etiqueta en color gris que señala las mesas que están asignadas al puesto pero cuyo material físico aún no ha ingresado al flujo de digitalización.
        
          
        

#### 3. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR:** Acceso rápido para regresar a la cámara o flujo de captura de documentos.
    
      
    
- **ACTAS (Activa - Verde):** Mantiene resaltada la vista actual de control y gestión de mesas.
    
      
    
- **RESUMEN:** Botón de acceso directo al tablero con las métricas consolidadas de rendimiento del turno.

## **Tablero de Resumen de Trabajo / Métricas del Operador**

Esta pantalla corresponde al **Tablero de Resumen de Trabajo / Métricas del Operador** (`digitalizador_resumen_de_trabajo`). Es el panel consolidado de rendimiento que permite al usuario verificar su avance global, gestionar la sincronización de archivos pendientes y atender solicitudes de re-escaneo en tiempo real.

  [[PWA (DIGITALIZADOR)/DISEÑO (HTML E IMAGENES)/Diseño Digitalizador/digitalizador_resumen_de_trabajo/screen.png]]

### Componentes de la Interfaz y su Función

#### 1. Encabezado Superior e Identificación

- **Título "CONTROL ACTAS E-14":** Mantiene la identidad del módulo.
    
      
    
- **PUESTO ACTUAL ("ROMA - CONSULADO"):** Indica el puesto. del acta digitalizada
    
      
    
- **Indicadores de Estado (`EN LÍNEA` / `ID: #A92-F`):** Muestra en verde que hay conexión activa con la API/Servidor 
    
      
    

#### 2. Indicador de Progreso General (Barra Verde)

- **Banner "PROGRESO DEL PUESTO: 75%":** Presenta el porcentaje global de avance en la digitalización.
    
      
    
- **Leyenda Informativa ("Has completado 9 de 12 páginas asignadas hoy"):** Detalla el conteo exacto de pliegos/páginas procesadas frente a la meta o carga asignada para la jornada.
    
      
    

#### 3. Tarjetas de Métricas Rápidas (KPIs Operativos)

- **Tarjeta Naranja ("03 PENDIENTES EN COLA (OFFLINE)"):** Muestra la cantidad de actas guardadas en la memoria local (`IndexedDB`) que están a la espera de ser transmitidas al servidor cuando se confirme una conexión estable.
    
      
    
- **Tarjeta Roja/Rosada ("01 SOLICITUD DE RESCANEO"):** Alerta sobre actas que fueron rechazadas o marcadas con advertencia crítica por el sistema o por supervisión central, requiriendo intervención del operador.
    
      
    

#### 4. Historial de Últimos Envíos (`ÚLTIMOS ENVÍOS (HISTORIAL) - ULT. ACT: 14:32`)

- Muestra un registro de actividad reciente con marca de tiempo de la última actualización:
    
      
    - **MESA 01 — TRANSMISIÓN P2 (`⚠️ RESCANEO REQUERIDO`):** Resalta en rojo/marrón que la página 2 de la Mesa 01 debe volver a fotografiarse por problemas de calidad o lectura.
        
          
        
    - **MESA 02 — DELEGADOS P2 (`ENVIADO ✓`):** Registro en verde que confirma la correcta recepción de la página 2 de delegados de la Mesa 02.
        
          
        
    - **MESA 01 — DELEGADOS P1 (`ENVIADO ✓`):** Registro exitoso de la página 1 de la Mesa 01.
        
          
        

#### 5. Botón de Sincronización Manual

- **Botón Verde "SINCRONIZAR COLA PENDIENTE (03)":** Permite al operador forzar la subida en segundo plano de las 3 actas almacenadas localmente en cuanto recupera señal o ancho de banda adecuado.
    
      
    

#### 6. Barra de Navegación Inferior (Bottom Nav)

- **ESCANEAR & ACTAS:** Accesos directos para regresar al visor de la cámara o al listado detallado por mesas.
    
      
    
- **RESUMEN (Activa - Verde):** Destaca la vista actual enfocada en las estadísticas del operador.