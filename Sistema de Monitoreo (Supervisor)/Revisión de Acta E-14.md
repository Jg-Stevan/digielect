Esta interfaz corresponde al **Modal de Auditoría Detallada**, el cual se activa cuando un supervisor o auditor hace clic en **`REINSPECCIONAR`** o selecciona un incidente para cotejo individual. Permite verificar de forma directa la imagen del formulario E-14 digitalizado frente a los hallazgos del sistema de visión artificial y tomar decisiones operativas inmediatas.

A continuación se detalla la explicación técnica y funcional de la pantalla:
### 1. Cabecera y Contexto de la Mesa

Ubicada en la parte superior para mantener al auditor ubicado geopolíticamente:

- **Migas de Pan (Breadcrumb):** Indica la ubicación exacta: `ITALIA (495) > ZONA 10 > CONSULADO ROMA`.
     
      
    
- **Navegador de Mesas:** Muestra la mesa actual (`MESA 1/8`) y permite alternar rápidamente entre mesas 
    
      
    
- **Metadatos de Sesión:** Muestra el ID único del envío (`#A92-F`) y la hora local del registro (`14:20 LOCAL`).
    
      
    
- **Selector de Acta:** Permite alternar entre los ejemplares del acta E-14 (**DELEGADOS** vs. **TRANSMISIÓN**).
    
      
    
- **Control de Páginas:** Muestra el estado de cada folio del formulario:
    
      
    - **Página 1 ($\checkmark$):** Verificada e íntegra.
        
          
        
    - **Página 2 ($\Delta$):** Presenta una alerta u observación detectada.
        
          
        
- **Motivo de Alerta Primario:** Destaca el origen de la apertura del modal (ej. `MOTIVO: SOLICITUD DE RESCANEO`).
    
      
    

### 2. Visor de Imagen Digitalizada y Herramientas de Inspección

Zona central dedicada a la revisión gráfica del acta E-14:

  

- **Barra de Herramientas de Imagen:** Controles superiores para acercar ($+$), alejar ($-$), rotar o extender a pantalla completa.
    
      
    

    
      
    
- **Cuadro de Detección Automática (Visión Artificial / OCR):** Enmarca en color rosa/rojo la zona donde ocurrió el fallo
    
      
    
- **Navegación entre Folios:** Botones laterales ($<$ y $>$) para desplazarse de la Página 1 a la Página 2 del mismo formulario.
    
      
    

### 3. Panel Lateral de Acciones del Supervisor

Espacio interactivo ubicado a la derecha para la toma de decisiones con validez legal/operativa:

  

- **Botones de Decisión:**
    
      
    - **`APROBAR Y MARCAR COMO VÁLIDA` (Verde):** Permite al supervisor desestimar la alerta automática si constata que el documento cumple con los requisitos mínimos legibles, forzando la validación del acta.
        
          
        
    - **`CONFIRMAR RESCANEO` (Rojo/Rosa):** Ratifica el error detectado y devuelve la mesa al flujo operativo para que los delegados de campo realicen una nueva captura de imagen.
        
          
        
- **Área de Observaciones:** Campo de texto obligatorio (`Ingrese el motivo de la decisión...`) para justificar la aprobación manual o la solicitud de un nuevo escaneo.
    
      
    

### 4. Historial y Trazabilidad (Audit Trail)

Muestra la cronología detallada de eventos de la mesa en tiempo real:


- **14:20 LOCAL - SOLICITUD DE RESCANEO:** Alerta automática generada por ilegibilidad.
    
      
    
- **14:18 LOCAL - RECIBIDO EN COLA:** Confirmación de ingesta del archivo desde la sesión `#A92-F`.
    
      
    
- **14:00 LOCAL - PENDIENTE:** Cierre formal del puesto de votación e inicio de transmisión.
    
      
    
- **Nota de Garantía:** _`ESTA ACCIÓN QUEDARÁ REGISTRADA EN LA AUDITORÍA`_, garantizando la inalterabilidad de los registros de control.
    
      
    

