Dentro de la aplicación PWA de digitalización electoral, un acta E-14 transita por **5 estados principales**. Estos estados determinan las acciones permitidas en la interfaz del capturador, las alertas en el panel de control del supervisor y el cálculo en el tablero de métricas de avance.

  

## 1. Matriz de Estados y Reglas de Negocio

| **Estado**                              | **Indicador Visual** | **Condición y Reglas de Negocio**                                                                                                                                                             | **Acción Requerida / Impacto en Sistema**                                                                                                         |
| --------------------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **1. Pendiente**                        | **Gris**             | El formulario E-14 (página o mesa) está asignado al puesto, pero aún no ha sido fotografiado ni ingresado al flujo.                                                                           | Esperar la captura de la fotografía por parte del usuario.                                                                                        |
| **2. Validado / Completado**            | 🟢 **Verde**         | La imagen superó el umbral de alta calidad ($Score \ge 9/10$), decodificó el código de barras y fue transmitida exitosamente al servidor central.                                             | Completa la mesa al 100%. Mueve el acta a estado finalizado.                                                                                      |
| **3. Con Advertencia (Flagged)**        | **Naranja**          | La imagen es legible y procesable, pero presenta anomalías leves (ej. esquinas levemente recortadas, falta de firma, arrugas, manchas o roturas parciales). Puntuación entre $6/10$ y $8/10$. | Permite el envío directo o la transmisión manual, registrando una **marca de revisión** para auditoría posterior.                                 |
| **4. Rechazado / Error Crítico**        | **Rojo**             | La imagen no cumple el estándar mínimo de calidad ($Score \le 5/10$ por desenfoque, oscuridad severa o tipo de documento incorrecto).                                                         | Bloquea la transmisión automática. Exige repetir la foto. Tras 2 intentos fallidos, habilita el envío manual de emergencia con marca de revisión. |
| **5. Cola de Sincronización (Offline)** | **Amarillo**         | El acta fue procesada y validada en el dispositivo móvil, pero permanece almacenada localmente por falta de red.                                                                              | Sincronización automática de fondo una vez restablecida la conexión a internet.                                                                   |


## 3. Impacto de los Estados en la Interfaz de Usuario (UI)

- **Vista del Capturador (PWA):**
    
      
    - **Verde:** Oculta la vista de captura y avanza automáticamente a la siguiente página/mesa.
        
          
        
    - **Naranja:** Muestra un modal de confirmación con los aspectos detectados para que el capturador apruebe manualmente.
        
          
        
    - **Rojo:** Despliega una alerta emergente en pantalla con la sugerencia específica de corrección (_"Mejore la iluminación"_, _"Enfoque el documento"_).
        
          
        