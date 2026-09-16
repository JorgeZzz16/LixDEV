# LixT — Móvil (lixt-movil)

Versión React Native/Expo de LixT. Sincroniza con la versión de PC (`lixt`) a
través de Supabase. Mismo desarrollador: Jorge, 4º Ing. Aeroespacial UPM.

## Base de conocimiento

Antes de nada, si necesitas contexto que no esté aquí, consulta:

```
C:\Users\mackl\LixDEV\claude-obsidian\wiki\domains\lixt\
```

Lee `hot.md` primero, luego `index.md` si no basta.

## Invariantes críticos — NUNCA romper esto sin avisar

- **`src/logic.js` y `src/sync.js` deben ser IDÉNTICOS byte a byte** con los del
  PC (`lixt/logic.js`, `lixt/sync.js`). Si tienes que tocar uno, toca el otro
  igual y verifica con `diff`.
- **Los ids son texto/UUID.** Nunca compares con `Number()`, ni con `<`/`>` para
  saber cuál es más nuevo — eso funcionaba con `Date.now()` y ahora es una
  comparación de texto. Para "más reciente" usa `updated_at`.
- **El orden de los arrays NO significa nada después de sincronizar.**
  `mergeById` (sync.js) reconstruye cada lista desde un `Map` sembrado con las
  filas remotas, y esas llegan de un `select *` sin `ORDER BY`. Para "lo más
  reciente" ORDENA A MANO por el campo que toque (`date`, `dueDate`,
  `updated_at`); nunca `slice(-n)`, `.at(-1)` ni `[length - 1]`. Bug real: las
  "Sesiones recientes" del PC enseñaban seis sesiones cualesquiera de hace meses.
- **`COLORS` en `src/constants.js` debe coincidir con la del PC** (`App.jsx`). Un
  color que solo exista en un lado no se puede reelegir desde el otro.
- **El móvil no edita el modo de calificación** (`gradeMode` / `pts`): al guardar
  una tarea hay que conservarlos. Si envía `pct`/`null`, gana por `updated_at` y
  el PC pierde los puntos extra sin avisar.
- **`settings` es UN SOLO blob JSON compartido con el PC.** Cada app entiende solo
  una parte, así que hay DOS mezclas y las dos hacen falta:
  1. Al guardar en el móvil, `updateSettings` mezcla sobre lo que ya había. Si
     subiera solo sus claves borraría las duraciones del timer, `examCount` y
     `showEmptyDays` del ordenador.
  2. Al subir, `syncAll` mezcla sobre el blob remoto antes del `upsert`. El PC
     manda un objeto literal con sus 8 claves, así que sin esto borraba las que
     solo entiende el móvil (`notifyReminders`, `notifyHour`) en cuanto
     sincronizaba.
- **El móvil solo sube ajustes si los has tocado en el móvil** (`settingsDirty`).
  Si no, manda el PC: sin ese flag cada sincronización pisaría los del ordenador.
- **Las notas se guardan SIEMPRE en 0–10**, en las dos apps y en Supabase. La
  escala sueca A–F (`gradeScale: "se"`) es solo presentación: se convierte al
  pintar, en `fmtGrade`/`fmtGradeFull`. Guardar letras rompería la media
  ponderada — A–F es ordinal y no se puede promediar.
- **Para mostrar una nota con su escala usa `fmtGradeFull`**, nunca
  `fmtGrade(x) + "/10"` a mano: en sueco quedaría "C/10".
- **Cualquier campo nuevo que se sincronice** hay que añadirlo en:
  1. `COLUMNS` en `src/sync.js` (en ambas plataformas)
  2. Una migración SQL en Supabase
  Si falta, se pierde silenciosamente al sincronizar (ya pasó una vez con el
  campo `course` del horario).
- **Fechas como texto** `"AAAA-MM-DD"`, horas como `"HH:MM"`. Usa
  `parseDate()` y `fmtDate()` de `logic.js` — nunca `new Date(cadena)` ni
  `toISOString()`, que trabajan en UTC y desplazan el día según la zona. Por eso
  `today()` NO puede volver a ser `toISOString().split("T")[0]`: en España, entre
  las 00:00 y las 02:00, eso devolvía el día anterior.
- **Números de los campos: `soloNumero()` al escribir y `parseNum()` al guardar.**
  El filtro `[^0-9.]` a secas deja pasar "7..5", y ese NaN acaba saliendo como un
  0 con pinta de nota real (`baseGrade || 0`). `parseNum` devuelve null, no NaN.
- **Ordena las tareas con `byDueDate`**, nunca con `a.dueDate.localeCompare(...)`:
  una sola tarea sin fecha tiraba la app entera.
- **`fmtGrade`** redondea notas hacia ARRIBA a 1 decimal (7.11 → 7.2). La
  medalla de aprobado/suspenso usa la nota SIN redondear — "5.0 💀" es
  intencional, no un bug.
- **El curso académico del horario** (`course` en cada clase) no se deduce de
  ninguna fecha — hay que guardarlo explícito porque una clase no tiene fecha
  propia, solo día de la semana + hora. Las clases sin `course` se tratan como
  2026 (curso 26/27, el que se estaba cursando cuando se añadió el campo).
- **`D` (theme.js) es un objeto MUTABLE.** `applyTheme()` reasigna su contenido
  para cambiar el fondo sin pasar un contexto por los catorce archivos. Por eso
  **ningún estilo puede calcularse fuera del render**: un `const x = { color:
  D.text }` a nivel de módulo se congela con los colores del arranque. Los
  estilos compartidos de las pantallas son funciones (`input()`, `campo()`).
  Quien mute `D` tiene que forzar un repintado (`repintarTema` en store.js).
- **Modales**: fondo `Pressable` con `onPress={onClose}`, contenido interior
  también `Pressable` con `onPress={() => {}}` para que tocar dentro no cierre
  por error. Todos con `statusBarTranslucent` (si no, el sombreado no llega
  hasta arriba en Android).

## Cómo trabajo (Jorge)

- **YAGNI estricto.** Soluciones directas, sin sobre-ingeniería.
- Antes de un cambio que toque varios archivos, dime qué vas a tocar y por qué.

## Validación estándar de este repo

```
npx esbuild src/screens/ARCHIVO.js --loader:.js=jsx --bundle \
  --external:react --external:react-native --external:react-native-svg \
  --external:expo-* --external:@react-native-community/* --external:@supabase/* \
  --external:@react-native-async-storage/* --external:react-native-url-polyfill \
  --format=esm --outfile=/dev/null
```

`--external:expo-*` hace falta para `App.js` y para cualquier archivo que acabe
llegando a `notifications.js`: esbuild sigue el `import()` de `expo-notifications`
y casca con "Could not resolve expo-modules-core". Metro sí lo resuelve — es ruido
de esbuild, no un error de verdad.

Esto solo dice que el archivo compila. Para comprobarlo de verdad, el bundle
entero tal y como lo hará el móvil:

```
npx expo export --platform android --output-dir <carpeta temporal>
```

## Compilación del APK

```
$env:EAS_NO_VCS=1        # si Git sigue sin funcionar del todo
cd C:\Users\mackl\LixDEV\lixt-movil   # SIEMPRE desde aquí, nunca desde una carpeta por encima
eas build -p android --profile preview
```

Package: `com.lixt.app`. Cualquier cambio de package instala una app nueva al
lado de la anterior, no la reemplaza — evitarlo salvo que sea intencional.

## Estructura

- `App.js` — navegación por pestañas (Tareas, Calendario, Horario, Asignaturas,
  Notas, Stats)
- `src/logic.js`, `src/sync.js` — deben ser idénticos al PC
- `src/store.js` — estado global, persistencia, sincronización
- `src/screens/` — cada pantalla + sus modales
