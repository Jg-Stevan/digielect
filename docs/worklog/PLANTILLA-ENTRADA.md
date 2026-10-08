# 📝 Plantilla de entrada al worklog

> Toda sesión de trabajo (humana o IA) **termina** añadiendo una entrada.
> Reglas: cada entrada va en **su propio archivo** `docs/worklog/YYYY-MM-DD-<tema>.md`
> (una sesión larga puede usar varios archivos por tema). Nunca sobrescribir
> archivos de worklog existentes: son la memoria del proyecto.

```markdown
---
Task ID: <identificador corto y único, p. ej. 2026-10-08-organizacion-repo
          o C-18 / A-5 / OLA8-1 para series>
Agente: <nombre/agente/rol — quién hizo el trabajo>
Tarea: <qué se pidió, en una línea>

Work Log:
- <paso concreto 1>
- <paso concreto 2>
- <paso concreto N>

Stage Summary:
- <resultados clave / decisiones tomadas / artefactos producidos>
- <problemas abiertos y riesgos para la siguiente sesión>

Verificación: tsc 0 · lint 0 · build:static OK · E2E <qué flujos> — <resultado>
```

### Convenciones

- **Verificación siempre**: si no corriste `bunx tsc --noEmit` y `bun run lint`,
  la entrada debe decirlo explícitamente (y por qué).
- **Prefijos de coordinación**: propuestas que afectan a otros módulos o al
  convenio se marcan `[COORD]` en el Work Log.
- **Secretos**: nunca en el worklog (ni tokens, ni credenciales, ni IPs).
- Índice de entradas: mantenlo en [`worklog.md`](../../worklog.md) (raíz).
