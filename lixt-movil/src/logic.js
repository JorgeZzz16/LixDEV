// ═══════════════════════════════════════════════════════════════════════════════
// logic.js — Lógica de negocio de LixT.
//
// Este módulo NO importa React ni toca el DOM ni localStorage. Son funciones
// puras: mismas entradas → mismas salidas. Por eso se puede importar tal cual
// desde la app de escritorio (Tauri) y desde la futura app de React Native,
// sin duplicar ni reimplementar nada.
//
// Regla: si una función necesita `window`, `document`, `localStorage` o un hook
// de React, NO va aquí.
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Identidad y sincronización ────────────────────────────────────────────────

// Id único global. Con varios dispositivos, `Date.now()` puede colisionar:
// dos aparatos offline creando un registro en el mismo milisegundo generarían
// el mismo id y uno pisaría al otro al sincronizar.
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return "id-" + Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 10);
}

// Marca un registro como modificado ahora. `updated_at` es lo que decide qué
// versión gana cuando dos dispositivos discrepan (last-write-wins).
export const touch = o => ({ ...o, updated_at: new Date().toISOString() });

// Borrado lógico. Un dispositivo no puede "detectar" una ausencia: si borras de
// verdad en el móvil, el PC volvería a subir el registro al sincronizar. Se marca
// y se conserva; la interfaz lo oculta con `alive()`.
export const softDelete = o => {
  const ts = new Date().toISOString();
  return { ...o, deleted_at: ts, updated_at: ts };
};

// Los registros que la interfaz debe mostrar (los no borrados).
export const alive = arr => (arr || []).filter(x => !x.deleted_at);

// Los ids antiguos eran números (Date.now()); los nuevos son UUID (string).
// Normaliza todo a string conservando los valores, así las referencias
// (subjectId, etc.) siguen apuntando exactamente a lo mismo.
export function migrateIdsToString(state) {
  if (!state?.programData) return state;
  const S = v => (v === null || v === undefined ? v : String(v));
  for (const pid of Object.keys(state.programData)) {
    const pd = state.programData[pid];
    if (!pd) continue;
    (pd.subjects || []).forEach(s => { s.id = S(s.id); });
    (pd.tasks    || []).forEach(t => { t.id = S(t.id); t.subjectId = S(t.subjectId); });
    (pd.sessions || []).forEach(s => { s.id = S(s.id); s.subjectId = S(s.subjectId); });
    (pd.schedule || []).forEach(s => { s.id = S(s.id); s.subjectId = S(s.subjectId); });
  }
  return state;
}

// ─── Fechas ────────────────────────────────────────────────────────────────────

export const pad = n => String(n).padStart(2, "0");

// Date → "AAAA-MM-DD" con los valores LOCALES.
export const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

// "AAAA-MM-DD" → Date a medianoche LOCAL.
//
// `new Date("2026-07-08")` no vale: la norma dice que una fecha sin hora se
// interpreta en UTC, y luego leerla con getters locales (getDate, getMonth) la
// desplaza un día en cuanto tu zona no es UTC. Es el mismo motivo por el que
// DateTimeField.js construye las fechas con año/mes/día por separado.
export function parseDate(ds) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(ds ?? ""));
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : new Date(NaN);
}

// El día de HOY según el reloj del dispositivo.
//
// Antes era `toISOString().split("T")[0]`, que es la fecha UTC: en España, entre
// medianoche y las 02:00 (verano), UTC va todavía por el día anterior y la app
// fechaba las sesiones y las tareas nuevas en el día de ayer.
export const today = () => fmtDate(new Date());

export function daysUntil(d) {
  const a = parseDate(d), b = new Date();
  b.setHours(0, 0, 0, 0);
  return Math.round((a - b) / 86400000);
}

export const getDaysInMonth = (y, m) => new Date(y, m + 1, 0).getDate();
export const getFirstDay    = (y, m) => new Date(y, m, 1).getDay();

export function startOfWeek(ds) {
  const d = parseDate(ds);
  d.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
  return fmtDate(d);
}

export function endOfWeek(ds) {
  const d = parseDate(startOfWeek(ds));
  d.setDate(d.getDate() + 6);
  return fmtDate(d);
}

// Desplaza un mes manejando el cambio de año. Devuelve [mes, año].
export const shiftMonth = (month, year, delta) => {
  const d = new Date(year, month + delta, 1);
  return [d.getMonth(), d.getFullYear()];
};

// El curso académico va del 1 de septiembre al 31 de agosto siguiente.
// Devuelve el año de inicio: 2026-10-05 → 2026 · 2027-02-10 → 2026
export function academicCourseOf(dateStr) {
  const d = parseDate(dateStr);
  return d.getMonth() >= 8 ? d.getFullYear() : d.getFullYear() - 1;
}

// Rango [inicio, fin] de un curso académico dado su año de inicio.
export const courseRange = y => [`${y}-09-01`, `${y + 1}-08-31`];

// Etiqueta corta de un curso: 2025 → "25/26"
export const academicCourseLabel = y => String(y).slice(2) + "/" + String(y + 1).slice(2);

// Cursos académicos presentes en un conjunto de sesiones, del más reciente al más antiguo.
export function academicCoursesOf(sessions) {
  return [...new Set((sessions || []).map(s => academicCourseOf(s.date)))].sort((a, b) => b - a);
}

// Índice del día de la semana empezando en lunes (Date.getDay() empieza en domingo).
export const weekdayIndex = date => (date.getDay() + 6) % 7;

// "09:45" → 585 (minutos desde medianoche)
export const timeToMinutes = t => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Ordena por fecha de entrega. Las tareas sin fecha van al final en vez de tirar
// la app: `a.dueDate.localeCompare(...)` peta con un `undefined`, y basta una
// tarea sin fecha (de un backup viejo o editada a mano) para dejarla inservible.
const SIN_FECHA = "9999-12-31";
export const byDueDate = (a, b) =>
  (a?.dueDate || SIN_FECHA).localeCompare(b?.dueDate || SIN_FECHA);

// Cuatrimestre por el que ordenar. `semester` puede ser número, array (asignatura
// anual) o null según la antigüedad del registro; las que no lo tienen van al final.
export const semesterOf = s => {
  const x = Array.isArray(s?.semester) ? s.semester[0] : s?.semester;
  return x ?? 99;
};

// Orden estándar de asignaturas en TODA la app menos en Notas (que se agrupa por
// su propia rejilla curso/cuatrimestre): cuatrimestre y, dentro, alfabético. El
// curso NO entra: si entrara, las de 1º y 4º del mismo cuatrimestre quedarían
// separadas y el grupo "C1" saldría partido en varios trozos. Tenerlo aquí es lo
// que hace que la lista salga igual en el PC y en el móvil.
export const bySubjectOrder = (a, b) =>
  (semesterOf(a) - semesterOf(b)) ||
  String(a?.name ?? "").localeCompare(String(b?.name ?? ""));

// Clave de grupo para separar visualmente los cuatrimestres en una lista ordenada
// con `bySubjectOrder`.
export const subjectGroupKey = s => String(semesterOf(s));

// ─── Entrada de números ────────────────────────────────────────────────────────

// Deja solo dígitos y UN punto decimal. El filtro `[^0-9.]` a secas deja pasar
// "7..5", que es un resbalón normal en el teclado del móvil.
export const soloNumero = txt =>
  String(txt ?? "").replace(/[^0-9.]/g, "").replace(/(\..*)\./g, "$1");

// Texto de un campo → número acotado, o null si no hay número válido.
//
// Importante que devuelva null y no NaN: un NaN sobrevive hasta `calcFinalGrade`,
// donde `baseGrade || 0` lo convierte en un 0 con pinta de nota real (asignatura
// suspensa, media a cero) sin que nada avise.
export function parseNum(txt, { min = 0, max = 10 } = {}) {
  if (txt === "" || txt === null || txt === undefined) return null;
  const n = Number(txt);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : null;
}

// ─── Configuración de notas ────────────────────────────────────────────────────
// Ajustes del usuario que afectan al cálculo/presentación de notas. Se guardan
// aquí (en vez de pasarse como parámetro en cada llamada) para no tener que
// enhebrarlos por todos los componentes.
//
// `gradeScale`: clave de GRADE_SCALES ("es", "fr", "se", "us").

let config = { passingGrade: 5, gradeIcons: true, gradeScale: "es" };

export const setGradeConfig = partial => { config = { ...config, ...partial }; };
export const getGradeConfig = () => ({ ...config });

// ─── Formato ───────────────────────────────────────────────────────────────────

// Redondea una nota hacia arriba a 1 decimal: 7.11 → 7.2, 6.00 → 6.0.
// Se usa al mostrar notas.
export function ceilGrade(g) {
  if (g === null || g === undefined) return g;
  return Math.ceil(g * 10) / 10;
}

// ─── Escalas de notas ──────────────────────────────────────────────────────────
//
// Las notas se GUARDAN siempre en 0–10. Esto es solo presentación: la media
// ponderada, los colores y la sincronización siguen trabajando con el número.
// Tiene que ser así porque las escalas de letras son ordinales — la media de una
// A y una C no es una B, depende de los créditos y de los decimales de debajo.
//
// Las letras se comparan contra la nota SIN redondear, igual que las medallas: un
// 8.95 es una B, no una A. Redondear primero convertiría un 4.96 en aprobado.

const letra = (tramos, g) => tramos.find(([min]) => g >= min)?.[1] ?? "F";

const TRAMOS_SE = [[9, "A"], [8, "B"], [7, "C"], [6, "D"], [5, "E"]];  // KTH / ECTS
const TRAMOS_US = [[9, "A"], [7, "B"], [5, "C"], [3, "D"]];            // sin E

// `corto` es la nota a secas; `sufijo` lo que se le añade cuando se muestra sola.
// `ayuda` es el texto de Ajustes, compartido por el PC y el móvil.
export const GRADE_SCALES = {
  es: {
    label: "0–10 (España)", sufijo: "/10",
    corto: g => ceilGrade(g).toFixed(1),
    ayuda: "Escala española estándar 0–10.",
  },
  fr: {
    label: "0–20 (Francia)", sufijo: "/20",
    corto: g => (ceilGrade(g) * 2).toFixed(1),
    ayuda: "Las notas se muestran multiplicadas por 2 (ej. 7.5 → 15.0/20).",
  },
  se: {
    label: "A–F (Suecia)", sufijo: "",
    corto: g => letra(TRAMOS_SE, g),
    ayuda: "Escala sueca (KTH/ECTS): A ≥9 · B ≥8 · C ≥7 · D ≥6 · E ≥5 · F <5.",
  },
  us: {
    label: "A–F (EEUU)", sufijo: "",
    corto: g => letra(TRAMOS_US, g),
    ayuda: "A ≥9 · B ≥7 · C ≥5 · D ≥3 · F <3. No hay E.",
  },
};

const escalaActiva = () => GRADE_SCALES[config.gradeScale] || GRADE_SCALES.es;

export const fmtGrade = g =>
  Number.isFinite(g) ? escalaActiva().corto(g) : "—";

// La nota con su escala: "7.4/10", "15.0/20" o "C". Existe para no tener el "/10"
// escrito a mano por toda la interfaz, que con las letras daría "C/10".
export const fmtGradeFull = g =>
  Number.isFinite(g) ? escalaActiva().corto(g) + escalaActiva().sufijo : "—";

export function fmtTime(mins) {
  if (!mins || mins <= 0) return "0m";
  if (mins < 60) return mins + "m";
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? h + "h " + m + "m" : h + "h";
}

// ─── Notas: color ──────────────────────────────────────────────────────────────

// Colores fijos de la escala (no cambian con el tema de la interfaz).
export const GRADE_PALETTE = {
  muted:      "#6b7194",
  red:        "#E24B4A",
  amber:      "#BA7517",
  greenLight: "#8BC98F",
  greenDark:  "#1D9E75",
  gold:       "#D4AF37",
};

// Interpola linealmente entre dos colores hex ("#rrggbb").
export function lerpColor(hexA, hexB, t) {
  const a = [1, 3, 5].map(i => parseInt(hexA.slice(i, i + 2), 16));
  const b = [1, 3, 5].map(i => parseInt(hexB.slice(i, i + 2), 16));
  const c = a.map((v, i) => Math.round(v + (b[i] - v) * Math.max(0, Math.min(1, t))));
  return "#" + c.map(v => v.toString(16).padStart(2, "0")).join("");
}

// Degradado continuo: rojo(0) → naranja(5) → verde claro(5) → verde oscuro(9) → dorado(9-10)
export function gradeColor(g) {
  const P = GRADE_PALETTE;
  if (g === null || g === undefined) return P.muted;
  if (g >= 9) return P.gold;
  if (g >= 5) return lerpColor(P.greenLight, P.greenDark, (g - 5) / 4);
  return lerpColor(P.red, P.amber, g / 5);
}

// ─── Notas: iconos y etiquetas ─────────────────────────────────────────────────

// Icono según la nota:
//   Suspenso:  0–3 😈 · 3–4.5 😬 · 4.5–5 💀
//   Aprobado:  5–6 👍 · 6–7 🥉 · 7–9 🥈 · 9–10 🥇 · 10 👑
export function gradeMedal(g) {
  if (!config.gradeIcons || g === null || g === undefined) return "";
  if (g >= 10)  return "👑";
  if (g >= 9)   return "🥇";
  if (g >= 7)   return "🥈";
  if (g >= 6)   return "🥉";
  if (g >= 5)   return "👍";
  if (g >= 4.5) return "💀";
  if (g >= 3)   return "😬";
  return "😈";
}

export function gradeLabel(g, pass = config.passingGrade) {
  return g >= 9 ? "Sobresaliente" : g >= 7 ? "Notable" : g >= pass ? "Aprobado" : "Suspenso";
}

// Icono de asignatura: los de suspenso salen siempre que hay nota; los de aprobado
// solo si la asignatura está marcada como aprobada, para que no aparezca la medalla
// antes de confirmarlo.
export function subjectMedal(g, approved) {
  if (g === null || g === undefined) return "";
  if (g < 5) return gradeMedal(g);
  return approved ? gradeMedal(g) : "";
}

// ─── Notas: cálculo ────────────────────────────────────────────────────────────

// Nota final de una asignatura.
//   - Tareas con `pct`: media ponderada por porcentaje.
//   - Tareas con `gradeMode: "points"`: suman puntos extra sobre la base.
//   - `manualGrade` en la asignatura sobreescribe el cálculo.
// Devuelve el desglose completo para poder mostrarlo en la interfaz.
export function calcFinalGrade(tasks, subjects, subjId) {
  const subj        = (subjects || []).find(x => x.id === subjId);
  const subjTasks   = (tasks || []).filter(t => t.subjectId === subjId);
  // `Number.isFinite` en vez de `!== null`: además de los null descarta NaN e
  // Infinity. Un NaN llegaba hasta `baseGrade || 0` (NaN es falsy) y salía
  // convertido en un 0 indistinguible de una nota real.
  const gradedTasks = subjTasks.filter(t => t.gradeMode !== "points" && Number.isFinite(t.grade) && t.pct > 0);
  const pointsTasks = subjTasks.filter(t => t.gradeMode === "points" && Number.isFinite(t.grade) && t.pts > 0);
  const totalPct    = gradedTasks.reduce((a, t) => a + (t.pct || 0), 0);
  const baseGrade   = totalPct > 0 ? gradedTasks.reduce((a, t) => a + (t.grade * t.pct), 0) / totalPct : null;
  const bonus       = pointsTasks.reduce((a, t) => a + ((t.grade / 10) * t.pts), 0);
  const calcGrade   = (baseGrade !== null || bonus > 0) ? Math.min(10, (baseGrade || 0) + bonus) : null;
  const finalGrade  = (subj?.manualGrade !== null && subj?.manualGrade !== undefined) ? subj.manualGrade : calcGrade;
  return { finalGrade, baseGrade, bonus, totalPct, gradedTasks, pointsTasks, calcGrade };
}

// Nota media ponderada por créditos. Solo cuenta asignaturas aprobadas que
// tengan créditos y nota.
export function weightedAverage(tasks, subjects) {
  const approved = (subjects || []).filter(s => s.approved);
  let sum = 0, credits = 0;
  for (const s of approved) {
    const { finalGrade } = calcFinalGrade(tasks, subjects, s.id);
    if (Number.isFinite(finalGrade) && Number.isFinite(s.credits) && s.credits > 0) { sum += finalGrade * s.credits; credits += s.credits; }
  }
  return credits > 0 ? sum / credits : null;
}

// Desviación típica poblacional.
export function stdDev(values) {
  if (!values?.length) return 0;
  const mean = values.reduce((a, v) => a + v, 0) / values.length;
  return Math.sqrt(values.reduce((a, v) => a + (v - mean) ** 2, 0) / values.length);
}

// Recta de regresión por mínimos cuadrados. Devuelve { slope, intercept }.
export function linearRegression(points) {
  const n = points?.length || 0;
  if (!n) return { slope: 0, intercept: 0 };
  const sumX  = points.reduce((a, p) => a + p.x, 0);
  const sumY  = points.reduce((a, p) => a + p.y, 0);
  const sumXY = points.reduce((a, p) => a + p.x * p.y, 0);
  const sumXX = points.reduce((a, p) => a + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  const slope = denom ? (n * sumXY - sumX * sumY) / denom : 0;
  return { slope, intercept: (sumY - slope * sumX) / n };
}

// ─── Tareas ────────────────────────────────────────────────────────────────────

// Tareas pendientes de una asignatura, ordenadas por fecha de entrega.
export const pendingTasks = (tasks, subjId) =>
  (tasks || [])
    .filter(t => t.subjectId === subjId && t.status !== "completada")
    .sort(byDueDate);

// Id de la tarea pendiente más próxima de una asignatura ("" si no hay).
export function defaultTaskId(tasks, subjId) {
  if (!subjId) return "";
  const pending = (tasks || []).filter(
    t => t.subjectId === String(subjId) && t.status !== "completada" && t.dueDate
  );
  if (!pending.length) return "";
  return String([...pending].sort(byDueDate)[0].id);
}

// ─── Sesiones ──────────────────────────────────────────────────────────────────

// Asignatura y tarea con más minutos estudiados en un día concreto. Ignora si la
// asignatura está aprobada o archivada: sirve para preseleccionar al añadir una
// sesión a un día pasado.
export function mostStudied(sessions, tasks, date) {
  const daySessions = (sessions || []).filter(s => s.date === date);
  if (!daySessions.length) return null;

  const bySubject = {};
  for (const s of daySessions) bySubject[s.subjectId] = (bySubject[s.subjectId] || 0) + s.minutes;
  const subjectId = Object.keys(bySubject).sort((a, b) => bySubject[b] - bySubject[a])[0];

  const byTask = {};
  for (const s of daySessions) {
    if (String(s.subjectId) === subjectId && s.taskTitle)
      byTask[s.taskTitle] = (byTask[s.taskTitle] || 0) + s.minutes;
  }
  const topTitle = Object.keys(byTask).sort((a, b) => byTask[b] - byTask[a])[0];
  const matched  = topTitle ? (tasks || []).find(t => t.subjectId === subjectId && t.title === topTitle) : null;

  return { subjectId, taskId: matched ? String(matched.id) : defaultTaskId(tasks, subjectId) };
}

// Minutos totales por día: { "2026-07-08": 120, ... }
export function minutesByDate(sessions) {
  const acc = {};
  for (const s of sessions || []) acc[s.date] = (acc[s.date] || 0) + s.minutes;
  return acc;
}

// Racha de estudio: días seguidos con al menos una sesión, contando hacia atrás.
//
// Si hoy todavía no has estudiado la racha NO se rompe: se cuenta desde ayer.
// Sin esa cortesía el contador aparecería a 0 cada mañana y volvería a su valor
// por la tarde, que es justo lo que hace inútil un contador de racha.
//
// Devuelve { dias, hoy }: `hoy` dice si el día de hoy ya cuenta, para poder
// pintar la racha "en riesgo" hasta que estudies.
export function studyStreak(sessions, todayStr = today()) {
  const dias = new Set((sessions || []).filter(s => s.minutes > 0).map(s => s.date));
  const hoy = dias.has(todayStr);

  // Punto de partida: hoy si cuenta, si no ayer. Si ayer tampoco, no hay racha.
  const d = parseDate(todayStr);
  if (!hoy) d.setDate(d.getDate() - 1);
  if (!dias.has(fmtDate(d))) return { dias: 0, hoy };

  // Se retrocede día a día con setDate, que ya arregla solo el cambio de mes y
  // de año (y los días de 23 o 25 horas del cambio de hora, al ser fechas locales).
  let n = 0;
  while (dias.has(fmtDate(d))) {
    n++;
    d.setDate(d.getDate() - 1);
  }
  return { dias: n, hoy };
}

// ─── Calendario (.ics) ─────────────────────────────────────────────────────────
//
// Importar y exportar tareas en iCalendar (RFC 5545), que es lo que entienden
// Google Calendar, Apple Calendar y el calendario de Android.
//
// Las horas van SIN zona horaria ("hora flotante"). El resto de la app guarda
// fechas y horas como texto local a propósito (ver `parseDate`), y meter UTC
// aquí devolvería justo el desfase de día que ya costó un bug. Un evento
// flotante se muestra a su hora en el reloj de quien lo abre, que es lo que
// quieres para un examen a las 16:00.

// RFC 5545 §3.3.11: dentro de un texto hay que escapar \ ; , y los saltos.
const icsEscape = txt => String(txt ?? "")
  .replace(/\\/g, "\\\\")
  .replace(/;/g, "\\;")
  .replace(/,/g, "\\,")
  .replace(/\r?\n/g, "\\n");

const icsUnescape = txt => String(txt ?? "")
  .replace(/\\([\\;,nN])/g, (_, c) => (c === "n" || c === "N" ? "\n" : c));

// §3.1: ninguna línea pasa de 75 octetos; las de continuación empiezan por
// espacio. Aquí se cuentan caracteres, no octetos, así que una línea llena de
// acentos se queda algo corta — a ningún lector le importa.
function icsFold(linea) {
  if (linea.length <= 75) return linea;
  const trozos = [linea.slice(0, 75)];
  for (let i = 75; i < linea.length; i += 74) trozos.push(" " + linea.slice(i, i + 74));
  return trozos.join("\r\n");
}

// "18:00" → ["180000"]; "18:00-20:30" → ["180000", "203000"]; "" → null.
function icsHoras(hour) {
  const m = String(hour ?? "").trim().match(/^(\d{1,2}):(\d{2})(?:\s*-\s*(\d{1,2}):(\d{2}))?$/);
  if (!m) return null;
  const hhmmss = (h, mm) => pad(+h) + mm + "00";
  return m[3] ? [hhmmss(m[1], m[2]), hhmmss(m[3], m[4])] : [hhmmss(m[1], m[2])];
}

const icsDia = ds => String(ds).replace(/-/g, "");

function icsDiaSiguiente(ds) {
  const d = parseDate(ds);
  d.setDate(d.getDate() + 1);
  return fmtDate(d);
}

// Tareas → texto .ics. `subjects` solo se usa para poner el nombre de la
// asignatura en la descripción del evento.
export function tasksToIcs(tasks, subjects = []) {
  const nombreAsig = id => (subjects || []).find(s => String(s.id) === String(id))?.name || "";
  const sello = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const l = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//LixT//ES", "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH", "X-WR-CALNAME:LixT",
  ];

  for (const t of tasks || []) {
    if (!t || t.deleted_at || !t.dueDate) continue;
    const horas = icsHoras(t.hour);
    l.push("BEGIN:VEVENT");
    l.push(`UID:lixt-${t.id}@lixt.app`);
    l.push(`DTSTAMP:${sello}`);
    l.push(`SUMMARY:${icsEscape(t.title || "Tarea")}`);
    if (!horas) {
      // Evento de día completo. DTEND es exclusivo: el día siguiente.
      l.push(`DTSTART;VALUE=DATE:${icsDia(t.dueDate)}`);
      l.push(`DTEND;VALUE=DATE:${icsDia(icsDiaSiguiente(t.dueDate))}`);
    } else {
      l.push(`DTSTART:${icsDia(t.dueDate)}T${horas[0]}`);
      // Sin hora de fin (o una que no avanza) se le da una hora de duración,
      // que evita tener que sumar fechas a mano al cruzar la medianoche.
      if (horas[1] && horas[1] > horas[0]) l.push(`DTEND:${icsDia(t.dueDate)}T${horas[1]}`);
      else l.push("DURATION:PT1H");
    }
    const asig = nombreAsig(t.subjectId);
    const desc = [asig, t.type].filter(Boolean).join(" · ");
    if (desc) l.push(`DESCRIPTION:${icsEscape(desc)}`);
    if (t.type) l.push(`CATEGORIES:${icsEscape(t.type)}`);
    l.push("END:VEVENT");
  }

  l.push("END:VCALENDAR");
  return l.map(icsFold).join("\r\n") + "\r\n";
}

// "20260908T180000" / "...Z" / "20260908" → { date, hour }.
function icsMomento(valor) {
  const m = String(valor).trim()
    .match(/^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(?:\d{2})?(Z)?)?$/);
  if (!m) return null;
  // Solo se convierte lo que viene marcado en UTC. Un TZID de otra zona se toma
  // como hora local: hacerlo bien pedía una base de datos de zonas horaria
  // entera, y en la práctica los calendarios que vas a importar son de aquí.
  if (m[6]) {
    const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]));
    return { date: fmtDate(d), hour: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
  }
  return { date: `${m[1]}-${m[2]}-${m[3]}`, hour: m[4] ? `${m[4]}:${m[5]}` : "" };
}

// Texto .ics → [{ uid, title, date, hour }]. Lo que no entiende se ignora.
export function parseIcs(texto) {
  // Desplegar primero: una línea larga viene partida y continúa con un espacio.
  const plano = String(texto || "").replace(/\r\n/g, "\n").replace(/\n[ \t]/g, "");
  const eventos = [];
  let ev = null, dentroDe = null;

  for (const bruta of plano.split("\n")) {
    const linea = bruta.trim();
    if (!linea) continue;

    // Un VEVENT puede llevar un VALARM dentro, y un VALARM tiene su propio
    // SUMMARY. Sin saltárselo, la alarma pisaría el título del evento.
    if (dentroDe) { if (linea === `END:${dentroDe}`) dentroDe = null; continue; }
    if (linea === "BEGIN:VEVENT") { ev = {}; continue; }
    if (linea === "END:VEVENT")   { if (ev?.date) eventos.push(ev); ev = null; continue; }
    if (ev && linea.startsWith("BEGIN:")) { dentroDe = linea.slice(6); continue; }
    if (!ev) continue;

    const i = linea.indexOf(":");
    if (i < 0) continue;
    const campo = linea.slice(0, i).split(";")[0].toUpperCase();
    const valor = linea.slice(i + 1);

    if (campo === "UID")          ev.uid = valor.trim();
    else if (campo === "SUMMARY") ev.title = icsUnescape(valor).trim();
    else if (campo === "DTSTART") Object.assign(ev, icsMomento(valor) || {});
  }
  return eventos;
}

// Id estable para un evento importado.
//
// Los que salieron de LixT recuperan su id original, así que reimportar el mismo
// archivo actualiza la tarea en vez de duplicarla. Los de fuera sacan un id
// derivado del UID, con el mismo efecto y sin tener que guardar una tabla de
// correspondencias en ningún sitio.
function idDeEvento(ev) {
  const propio = String(ev.uid || "").match(/^lixt-(.+)@lixt\.app$/);
  if (propio) return propio[1];
  // ponytail: hash djb2 del UID. Dos UID distintos con el mismo hash fundirían
  // sus eventos; con unos cientos es despreciable. Si algún día importas miles,
  // guarda el UID en una columna y busca por ella.
  const clave = ev.uid || `${ev.title}|${ev.date}`;
  let h = 5381;
  for (let i = 0; i < clave.length; i++) h = ((h * 33) ^ clave.charCodeAt(i)) >>> 0;
  return "ics-" + h.toString(36);
}

// Eventos → tareas listas para fusionar con las que ya hay.
//
// Lo que viene de fuera entra como recordatorio sin asignatura: un evento de
// Google no trae ni asignatura ni peso ni nota, y adivinarlos se equivocaría.
// Si la tarea ya existe se le cambian solo título, fecha y hora.
export function icsToTasks(eventos, { programId = null, tasks = [] } = {}) {
  const porId = new Map((tasks || []).map(t => [String(t.id), t]));
  return (eventos || []).filter(ev => ev?.date).map(ev => {
    const id = idDeEvento(ev);
    const previa = porId.get(id);
    return touch({
      ...(previa || {
        programId, subjectId: null, type: "recordatorio",
        status: "pendiente", priority: "media",
        gradeMode: null, grade: null, pct: null, pts: null,
      }),
      id,
      title: ev.title || "Evento",
      dueDate: ev.date,
      hour: ev.hour || "",
      deleted_at: null,
    });
  });
}
