# 🪟 LEEME — Digielect en Windows (guía para empezar en 1 minuto)

> **Esta guía es para el dueño del proyecto y cualquier operador que use
> Windows.** No necesitas saber programar: sigue los pasos y listo.

---

## ¿Qué es Digielect?

**Digielect** es la plataforma del proyecto para la **digitalización,
transmisión y auditoría de las actas electorales E-14** de los consulados de
Colombia en el exterior, construida sobre los datos reales del visor de la
Registraduría. Tiene dos lados que trabajan juntos: un **digitalizador**
(estilo app de celular) donde el operador fotografía el acta, el sistema la
recorta, la identifica y la envía solo si pasa el control de calidad; y el
**monitor del supervisor**, que recibe todo en vivo con bandeja de anomalías,
control de tiempos (SLA), carga masiva e informes. Esta guía corre esa
versión **completa** en tu propio computador, con base de datos local.

*(También existe una demo web sin instalación:
https://jg-stevan.github.io/digielect/)*

---

## Qué necesitas

- **Windows 10 u 11.**
- **Internet solo la primera vez** (se descargan las herramientas y las
  dependencias, ~100–300 MB). Después, el sistema corre completo en tu
  computador sin descargar nada más.
- **Espacio libre:** al menos 2 GB.
- **Nada más.** No necesitas instalar Node, ni Bun por tu cuenta, ni
  credenciales de git — el iniciador lo hace todo.

---

## Cómo iniciar (cada vez que quieras usar Digielect)

1. Abre la carpeta del proyecto y haz **doble clic** en
   **`INICIAR-WINDOWS.bat`** (el archivo con el icono de engranaje, en la
   raíz del proyecto).
2. Aparecen **ventanas negras con texto**: es normal, déjalas trabajar.
   - Si Windows pregunta "¿Deseas permitir que esta aplicación haga
     cambios?", responde **Sí**.
3. En uno o dos minutos, **tu navegador se abre solo** en
   `http://localhost:3000` — ahí está Digielect.

**Datos para entrar (demo):**

| Módulo | Usuario | Clave |
|---|---|---|
| Supervisor | `supervisor` | `digielect` |
| Digitalizador | *(no pide usuario)* | — |

---

## La primera vez: qué esperar

- El iniciador instala **Bun** (el motor que ejecuta el sistema), descarga
  las **dependencias del proyecto** (~100–300 MB), crea la **base de datos**
  y carga los datos reales de la Registraduría.
- Todo esto **puede tardar varios minutos** (5–15 según tu internet). Verás
  mensajes de progreso en la ventana. **No cierres ninguna ventana** durante
  la instalación.
- Las **siguientes veces** el mismo archivo arranca en menos de un minuto,
  porque ya no tiene que descargar nada.

---

## Cómo detener Digielect

- Cierra la **ventana negra titulada "Digielect Servidor"** — es la que
  mantiene el sistema corriendo. También puedes detenerla con **Ctrl+C**
  dentro de esa ventana.
- La otra ventana (la del iniciador) puedes cerrarla cuando el navegador ya
  se haya abierto.

> ⚠️ **Mientras uses Digielect, NO cierres la ventana negra del servidor.**
> Si la cierras, la aplicación se apaga (no pasa nada grave: solo vuelve a
> ejecutar el `.bat`).

---

## Cómo volver a iniciar después

Exactamente igual: **doble clic en `INICIAR-WINDOWS.bat`**. Como ya está
instalado todo, será rápido (menos de un minuto normalmente).

---

## Alternativa para usuarios avanzados: script de PowerShell

En `scripts/instalar-windows.ps1` está la misma lógica en PowerShell, con
opciones extra. Por ejemplo, para usar otro puerto:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\instalar-windows.ps1 -Puerto 3001
```

Para el día a día, **usa el `.bat`**: es más simple y evita la política de
ejecución de scripts de Windows.

---

## Problemas frecuentes y soluciones

| Síntoma | Solución |
|---|---|
| **El antivirus (o Windows Defender) bloquea o borra el archivo** | Elige **Permitir / Restaurar / Ejecutar de todas formas**. El `.bat` solo instala herramientas oficiales (Bun) y arranca el proyecto de esta carpeta. Si el antivirus lo puso en cuarentena, restaúralo y agrega la carpeta a excepciones. |
| **"Windows protegió tu equipo" (pantalla azul de SmartScreen)** | Clic en **"Más información"** → **"Ejecutar de todas formas"**. |
| **"El puerto 3000 ya está ocupado"** | Cierra el programa que lo está usando (lo más común: otra ventana negra de un Digielect anterior). Si otro programa lo usa, cambia el puerto: abre `INICIAR-WINDOWS.bat` con el **Bloc de notas**, edita la línea `set "PUERTO=3000"` (ej.: `3001`), guarda y vuelve a ejecutar. Con el script de PowerShell basta con `-Puerto 3001`. |
| **"no se pueden ejecutar scripts" (error de PowerShell)** | Solo pasa si ejecutas el `.ps1` directamente. El `.bat` **ya lo evita** (usa `-ExecutionPolicy Bypass`). Si prefieres el `.ps1`: abre PowerShell y ejecuta primero `Set-ExecutionPolicy -Scope Process Bypass`, y luego vuelve a intentar. |
| **"No se pudo instalar Bun"** | Verifica tu internet e inténtalo otra vez. Si sigue fallando, descarga **"Bun for Windows"** desde https://bun.sh, instálalo y vuelve a hacer doble clic en el `.bat`. |
| **El navegador no se abre solo** | Ábrelo tú y entra a `http://localhost:3000`. Si nada carga, revisa que la ventana "Digielect Servidor" siga abierta. |
| **Algo falla y no entiendo el error** | Mira la **ventana negra "Digielect Servidor"**: ahí aparece el motivo. Tómale una **captura de pantalla**, ciérrala y vuelve a ejecutar el `.bat`. Si persiste, envía la captura a quien te apoya en el proyecto. |
| **Quiero empezar de cero con los datos** | Con Digielect detenido, borra la carpeta **`db`** del proyecto. El próximo inicio la vuelve a crear con los datos reales. |

---

## 🔒 Aviso de privacidad

**Todo se procesa localmente en tu computador.** La base de datos es un
archivo local y las imágenes de las actas se procesan en tu equipo:
**nada se envía a terceros** por el solo hecho de usar Digielect.

## 🔑 ¿Necesito credenciales de git / GitHub?

- **No.** Para **usar** la aplicación no se necesita ninguna credencial de
  git ni de GitHub: el código ya está en esta carpeta y el iniciador no
  descarga nada de tu repositorio.
- Las credenciales de git **solo hacen falta si vas a subir cambios** al
  repositorio (`git push`), que es una tarea de desarrollo — no de uso.
