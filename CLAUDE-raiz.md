# LixT — Proyecto compartido (PC + Móvil)

App de gestión académica de Jorge (4º Ing. Aeroespacial UPM, especialidad PA).
Dos repos hermanos en esta carpeta: `lixt/` (PC, React+Tauri) y `lixt-movil/`
(React Native/Expo). Sincronizan entre sí a través de Supabase.

## Base de conocimiento

Para contexto que no esté aquí (decisiones de arquitectura pasadas, bugs ya
resueltos, el porqué de algo):

```
C:\Users\mackl\LixDEV\claude-obsidian\wiki\domains\lixt\
```

Lee `hot.md` primero, luego `index.md` si no basta. No la consultes para
preguntas de programación genéricas sin relación con LixT.

## Invariantes críticos — NUNCA romper esto sin avisar

- **`logic.js` y `sync.js` deben ser IDÉNTICOS byte a byte** entre `lixt/` y
  `lixt-movil/src/`. Si tocas uno, toca el otro igual y verifica con `diff`
  antes de dar algo por terminado.
- **Los ids son texto/UUID.** Nunca compares con `Number()` — ya hubo un bug
  real de esto en el filtro de tareas por asignatura del PC.
- **Cualquier campo nuevo que se sincronice** hay que añadirlo en DOS sitios:
  1. `COLUMNS` en `sync.js` (en ambas plataformas)
  2. Una migración SQL en Supabase
  Si falta el primero, el campo se descarta silenciosamente al sincronizar
  (bug real: el campo `course` del horario se perdía por esto).
- **Fechas como texto** `"AAAA-MM-DD"`, horas como `"HH:MM"`. Nunca conviertas
  con `new Date(cadena)` directo — se desplaza un día según la zona horaria.
  Construye `Date` con año/mes/día por separado.
- **`fmtGrade`/`ceilGrade`** redondean notas hacia ARRIBA a 1 decimal
  (7.11 → 7.2) para mostrarlas. La medalla de aprobado/suspenso sigue
  calculándose sobre la nota SIN redondear — "5.0 💀" puede salir y es
  intencional, no un bug.
- **El curso académico del horario** (`course` en cada clase) se guarda
  explícito, no se deduce de ninguna fecha — una clase solo tiene día de la
  semana + hora, no fecha propia. Sin `course`, se trata como 2026 (26/27).

## Cómo trabajo (Jorge)

- **YAGNI estricto.** Soluciones directas y de una línea antes que
  sobre-ingeniería. Si algo se puede resolver simple, resuélvelo simple.
- Correcciones directas, sin explicación larga salvo que la pida.
- Antes de un cambio que toque varios archivos a la vez (no un fix puntual),
  dime primero qué vas a tocar y por qué.

## Estructura general

```
LixDEV/
├── lixt/            (PC — ver lixt/CLAUDE.md para detalles propios)
├── lixt-movil/      (móvil — ver lixt-movil/CLAUDE.md para detalles propios)
└── claude-obsidian/ (vault de conocimiento compartido)
```
