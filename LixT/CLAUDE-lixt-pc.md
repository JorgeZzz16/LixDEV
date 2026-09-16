# LixT — Escritorio (PC)

App de gestión académica de Jorge (4º Ing. Aeroespacial UPM, especialidad PA).
React + Tauri. Sincroniza con la versión móvil (`lixt-movil`) a través de Supabase.

## Base de conocimiento

Antes de nada, si necesitas contexto que no esté aquí (decisiones de arquitectura
pasadas, bugs ya resueltos, el porqué de alguna decisión rara), consulta:

```
C:\Users\mackl\LixDEV\claude-obsidian\wiki\domains\lixt\
```

Lee `hot.md` primero (contexto reciente), luego `index.md` si no basta.
No la consultes para preguntas de programación genéricas sin relación con LixT.

## Invariantes críticos — NUNCA romper esto sin avisar

- **`logic.js` y `sync.js` deben ser IDÉNTICOS byte a byte** entre este repo
  (`lixt`) y el móvil (`lixt-movil`). Si tienes que tocar uno, toca el otro igual.
  Verifica con `diff` antes de dar algo por terminado.
- **Los ids son texto/UUID.** Nunca compares con `Number()` — ya hubo un bug real
  de esto en el filtro de tareas por asignatura.
- **El orden de los arrays NO significa nada después de sincronizar.**
  `mergeById` (sync.js) reconstruye cada lista desde un `Map` sembrado con las
  filas remotas, y esas llegan de un `select *` sin `ORDER BY`. Para "lo más
  reciente" ORDENA A MANO por el campo que toque (`date`, `dueDate`,
  `updated_at`); nunca `slice(-n)`, `.at(-1)` ni `[length - 1]`. Bug real: las
  "Sesiones recientes" del PC enseñaban seis sesiones cualesquiera de hace meses.
- **Cualquier campo nuevo que se sincronice** hay que añadirlo en DOS sitios:
  1. `COLUMNS` en `sync.js` (en ambas plataformas)
  2. Una migración SQL en Supabase
  Si falta el primero, el campo se descarta silenciosamente al sincronizar
  (bug real: el campo `course` del horario se perdía por esto).
- **Fechas como texto** `"AAAA-MM-DD"`, horas como `"HH:MM"`. Nunca conviertas con
  `new Date(cadena)` directo — se desplaza un día según la zona horaria. Construye
  con año/mes/día por separado.
- **`fmtGrade`/`ceilGrade`** redondean las notas hacia ARRIBA a 1 decimal
  (7.11 → 7.2) para mostrarlas. La medalla de aprobado/suspenso sigue calculándose
  sobre la nota SIN redondear — puede verse "5.0 💀" y es intencional.

## Cómo trabajo (Jorge)

- **YAGNI estricto.** Prefiero soluciones directas y de una línea a
  sobre-ingeniería. Si algo se puede resolver simple, resuélvelo simple.
- Correcciones directas, sin explicación larga salvo que la pida.
- Antes de un cambio que toque varios archivos a la vez (no un fix puntual),
  dime primero qué archivos vas a tocar y por qué.

## Validación estándar de este repo

```
cd src-tauri  # o donde esté package.json de este proyecto
npx esbuild App.jsx --loader:.jsx=jsx --bundle --external:react \
  --external:react-dom --external:@tauri-apps/* --external:@supabase/* \
  --format=esm --outfile=/dev/null
```

Compila = sintaxis correcta. No sustituye probar la lógica a mano si el cambio
es delicado (sync, fechas, ids).

## Estructura

- `App.jsx` — toda la UI del escritorio (~3400 líneas)
- `logic.js` — lógica pura, sin React/DOM/localStorage
- `sync.js` — sincronización last-write-wins con Supabase
- `supabase.js` — cliente + auth
- `schema.sql` / `schema-migracion-*.sql` — esquema de Supabase

## Cuenta de Supabase

URL y claves públicas en `supabase.js` (la publishable key va embebida a
propósito, es pública por diseño). La clave `sb_secret_` NUNCA se comparte
ni se sube a ningún sitio.
