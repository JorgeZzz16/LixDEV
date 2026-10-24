<div align="center">

<img src="LixT/LOGO_2.png" alt="LixT" width="120" />

# LixT

**Gestión académica para la carrera: asignaturas, entregas, exámenes, notas y tiempo de estudio.**
Escritorio y móvil, sincronizados entre sí.

[![CI](https://github.com/JorgeZzz16/LixDEV/actions/workflows/ci.yml/badge.svg)](https://github.com/JorgeZzz16/LixDEV/actions/workflows/ci.yml)
![Versión](https://img.shields.io/badge/versión-1.4.5-378ADD)
![Windows](https://img.shields.io/badge/Windows-Tauri_2-24C8DB?logo=tauri&logoColor=white)
![Android](https://img.shields.io/badge/Android-Expo-000020?logo=expo&logoColor=white)
![Supabase](https://img.shields.io/badge/sync-Supabase-3ECF8E?logo=supabase&logoColor=white)

</div>

---

## Qué hace

| | |
|---|---|
| 📚 **Asignaturas** | Por curso y cuatrimestre, con créditos, color y siglas. Se archivan al aprobarlas. |
| 📝 **Tareas** | Exámenes, entregas (con hora límite) y prácticas. Una entrega puede ir enlazada a su práctica. |
| 🔔 **Recordatorios** | Avisos configurables por tarea: horas o días antes, a una fecha concreta, o insistiendo cada día hasta completarla. |
| 🎓 **Notas** | Por porcentaje, puntos extra o sin nota, con NP. La nota de cada asignatura y la media ponderada por créditos se calculan solas. |
| ⏳ **Focus** | Pomodoro ligado a asignatura y tarea. Cada sesión cuenta como tiempo de estudio y mantiene la racha. |
| 📅 **Calendario y horario** | Entregas y exámenes por día, notas rápidas, clases semanales e importación/exportación `.ics`. |
| 📊 **Estadísticas** | Horas por asignatura, evolución de las notas y línea de tiempo de sesiones. |
| ☁️ **Sincronización** | Opcional, con cuenta. Sin ella todo se guarda en el dispositivo. |

## Estructura

```
LixDEV/
├── LixT/          App de escritorio — React + Vite + Tauri 2
│   ├── src/       App.jsx, logic.js, sync.js y tests
│   └── src-tauri/ Envoltorio nativo (Rust)
├── lixt-movil/    App móvil — React Native + Expo
│   └── src/       Pantallas, store, notificaciones, logic.js, sync.js
└── .github/       CI: archivos compartidos, lint y tests en cada push
```

`logic.js` (cálculo de notas, fechas, recordatorios…) y `sync.js` (sincronización con Supabase) están **duplicados a propósito** en las dos apps y tienen que ser idénticos byte a byte. `npm run check` y la CI lo comprueban.

## Desarrollo

Requisitos: Node 22, Rust (para Tauri) y [EAS CLI](https://docs.expo.dev/build/setup/) para compilar el móvil.

**Escritorio**

```bash
cd LixT
npm install
npm run tauri dev      # app con recarga en caliente
npm run check          # archivos compartidos + ESLint + tests
npm run tauri build    # instalador en src-tauri/target/release/bundle/
```

**Móvil**

```bash
cd lixt-movil
npm install
npx expo start                              # con la app de desarrollo instalada
eas build -p android --profile development  # app de desarrollo (variante LixDEV)
eas build -p android --profile preview      # APK normal
```

Las notificaciones no funcionan en Expo Go: hace falta la app de desarrollo o un APK.

## Sincronización

Supabase, una fila por registro y por usuario (`user_id`). Las tablas son `programs`, `subjects`, `tasks`, `sessions`, `schedule` y `settings`. Las columnas que se suben de cada una están en `COLUMNS`, en `sync.js`: un campo nuevo que se quiera sincronizar necesita su columna en Supabase y su entrada ahí, o se pierde en silencio.

Los conflictos se resuelven por `updated_at` (gana el más reciente) y los borrados son lógicos (`deleted_at`), para que no revivan al sincronizar.

---

<div align="center"><sub>Hecho por Jorge, 4º de Ingeniería Aeroespacial (UPM).</sub></div>
