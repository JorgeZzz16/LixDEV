// ═══════════════════════════════════════════════════════════════════════════════
// sync.js — Sincronización entre dispositivos.
//
// ESTRATEGIA: descarga completa + fusión en memoria + subida de lo que cambió.
//
// ¿Por qué no un sync incremental con "cambios pendientes"? Porque a esta escala
// (~500 registros, ~80 KB) no aporta nada y sí añade un estado frágil: si la cola
// de pendientes se corrompe o se pierde, los cambios desaparecen sin avisar.
// Bajando todo cada vez, cualquier fallo se arregla solo en el siguiente intento.
//
// CONFLICTOS: last-write-wins por `updated_at`. Si editas la misma tarea en el
// PC y en el móvil, gana la más reciente. Para un único usuario en dos aparatos
// es lo razonable; algo más fino (fusión campo a campo) sería complejidad sin uso.
//
// BORRADOS: nunca se hace DELETE. Un dispositivo no puede detectar una ausencia,
// así que un borrado real reaparecería al sincronizar. Se marca `deleted_at` y la
// interfaz lo oculta.
// ═══════════════════════════════════════════════════════════════════════════════

import { supabase } from "./supabase.js";

// ─── Mapeo entre el JavaScript (camelCase) y la base de datos (snake_case) ─────
// Solo se listan los campos que difieren; el resto pasa con el mismo nombre.

const FIELD_MAP = {
  programs: { semestersPerYear: "semesters_per_year" },
  subjects: { programId: "program_id", manualGrade: "manual_grade" },
  tasks:    { programId: "program_id", subjectId: "subject_id", dueDate: "due_date", gradeMode: "grade_mode", parentId: "parent_id" },
  sessions: { programId: "program_id", subjectId: "subject_id", subjectName: "subject_name", subjectColor: "subject_color", taskTitle: "task_title" },
  schedule: { programId: "program_id", subjectId: "subject_id", start: "start_time", end: "end_time" },
};

// Campos que existen en la tabla. Cualquier otro se descarta al subir: si la app
// añade un campo nuevo y la columna no existe, el INSERT entero fallaría.
const COLUMNS = {
  programs: ["id", "name", "type", "years", "semesters_per_year", "color", "updated_at", "deleted_at"],
  subjects: ["id", "program_id", "name", "acronym", "color", "course", "year", "semester", "credits", "approved", "archived", "annual", "manual_grade", "updated_at", "deleted_at"],
  tasks:    ["id", "program_id", "subject_id", "title", "due_date", "hour", "type", "status", "priority", "grade", "grade_mode", "pct", "pts", "np", "reminders", "parent_id", "updated_at", "deleted_at"],
  sessions: ["id", "program_id", "subject_id", "subject_name", "subject_color", "task_title", "date", "minutes", "manual", "updated_at", "deleted_at"],
  schedule: ["id", "program_id", "subject_id", "day", "start_time", "end_time", "course", "updated_at", "deleted_at"],
};

// Columnas NOT NULL con DEFAULT en la base de datos.
//
// Deben enviarse SIEMPRE y con un booleano válido. No basta con omitirlas cuando
// faltan: al hacer upsert de un lote, PostgREST unifica las columnas de todas las
// filas, y a las que no traen el campo les asigna NULL explícito — que es
// justo lo que rechaza una columna NOT NULL, aunque tenga default.
const NOT_NULL_WITH_DEFAULT = {
  programs: [],
  subjects: ["approved", "archived", "annual"],
  tasks:    [],
  sessions: ["manual"],
  schedule: [],
};

const invert = m => Object.fromEntries(Object.entries(m).map(([k, v]) => [v, k]));

// Convierte un objeto de la app en una fila de la base de datos.
//
// La fila SIEMPRE lleva todas las columnas de la tabla, en el mismo orden. Es
// deliberado: al hacer upsert de un lote, PostgREST unifica las columnas de todas
// las filas, y a las que les falta alguna les mete NULL. Si unas filas trajeran
// `acronym` y otras no, las segundas podrían borrar un valor que sí existía en el
// servidor. Enviando la fila completa, lo que hay en local es exactamente lo que
// queda guardado, sin sorpresas.
export function toDb(kind, obj, userId, programId) {
  const map = FIELD_MAP[kind];
  const src = {};
  for (const [k, v] of Object.entries(obj)) {
    const col = map[k] || k;
    if (COLUMNS[kind].includes(col)) src[col] = v;
  }
  if (programId && COLUMNS[kind].includes("program_id")) src.program_id = programId;

  const row = { user_id: userId };
  for (const col of COLUMNS[kind]) {
    if (NOT_NULL_WITH_DEFAULT[kind].includes(col)) row[col] = !!src[col];
    else row[col] = src[col] === undefined ? null : src[col];
  }
  row.id = String(row.id);
  // Sin marca de tiempo no hay forma de resolver conflictos: se pone una.
  if (!row.updated_at) row.updated_at = new Date().toISOString();
  return row;
}

export function fromDb(kind, row) {
  const back = invert(FIELD_MAP[kind]);
  const obj = {};
  for (const [k, v] of Object.entries(row)) {
    if (k === "user_id") continue;
    obj[back[k] || k] = v;
  }
  if (obj.id !== undefined && obj.id !== null) obj.id = String(obj.id);
  return obj;
}

// ─── Descarga ──────────────────────────────────────────────────────────────────

// Trae todas las filas de una tabla paginando. Supabase limita a 1000 por
// petición: sin paginar, al pasar de 1000 sesiones se perderían silenciosamente.
async function fetchAll(table) {
  const PAGE = 1000;
  let from = 0, out = [];
  for (;;) {
    const { data, error } = await supabase.from(table).select("*").range(from, from + PAGE - 1);
    if (error) throw error;
    out = out.concat(data || []);
    if (!data || data.length < PAGE) break;
    from += PAGE;
  }
  return out;
}

// Descarga todo y lo devuelve con la misma forma que el estado local.
export async function downloadState() {
  const [programs, subjects, tasks, sessions, schedule, settings] = await Promise.all([
    fetchAll("programs"), fetchAll("subjects"), fetchAll("tasks"),
    fetchAll("sessions"), fetchAll("schedule"),
    supabase.from("settings").select("*").maybeSingle().then(r => r.data),
  ]);

  const programData = {};
  const bucket = (pid, key, row, kind) => {
    if (!programData[pid]) programData[pid] = { subjects: [], tasks: [], sessions: [], schedule: [] };
    programData[pid][key].push(fromDb(kind, row));
  };
  subjects.forEach(r => bucket(r.program_id, "subjects", r, "subjects"));
  tasks.forEach(r    => bucket(r.program_id, "tasks",    r, "tasks"));
  sessions.forEach(r => bucket(r.program_id, "sessions", r, "sessions"));
  schedule.forEach(r => bucket(r.program_id, "schedule", r, "schedule"));

  return {
    programs: programs.map(r => fromDb("programs", r)),
    programData,
    settings: settings?.data || null,
    empty: programs.length === 0,
  };
}

// ─── Fusión ────────────────────────────────────────────────────────────────────

// Instante de la última modificación, en milisegundos.
//
// Importante que sea numérico y no comparación de texto: JavaScript genera
// "2026-07-16T21:43:34.890Z" y Postgres devuelve "2026-07-16T21:43:34.89+00:00".
// Es el mismo momento, pero como cadenas la primera es "mayor" ('0' > '+'), así
// que el registro local parecería eternamente más nuevo que el del servidor y se
// subiría en cada sincronización sin llegar nunca a converger.
const stamp = o => {
  const t = Date.parse(o?.updated_at || "");
  return Number.isNaN(t) ? 0 : t;
};

// Une dos listas por id quedándose con la versión de `updated_at` más reciente.
// Un registro que solo existe en un lado se conserva tal cual.
export function mergeById(local, remote) {
  const byId = new Map();
  for (const item of remote || []) byId.set(String(item.id), item);
  for (const item of local || []) {
    const id = String(item.id);
    const other = byId.get(id);
    if (!other || stamp(item) >= stamp(other)) byId.set(id, item);
  }
  return [...byId.values()];
}

// Fusiona el estado local con el remoto.
export function mergeStates(local, remote) {
  const pids = new Set([
    ...Object.keys(local?.programData || {}),
    ...Object.keys(remote?.programData || {}),
  ]);
  const programData = {};
  for (const pid of pids) {
    const l = local?.programData?.[pid]  || {};
    const r = remote?.programData?.[pid] || {};
    programData[pid] = {
      subjects: mergeById(l.subjects, r.subjects),
      tasks:    mergeById(l.tasks,    r.tasks),
      sessions: mergeById(l.sessions, r.sessions),
      schedule: mergeById(l.schedule, r.schedule),
    };
  }
  const programs = mergeById(local?.programs, remote?.programs);
  return {
    ...local,
    programs,
    programData,
    // Si el programa activo local ya no existe tras la fusión, se coge cualquiera
    activeProgram: programs.some(p => p.id === local?.activeProgram)
      ? local.activeProgram
      : (programs[0]?.id ?? local?.activeProgram),
  };
}

// ─── Subida ────────────────────────────────────────────────────────────────────

// Sube en lotes: un upsert con 500 filas de golpe puede exceder el límite de
// tamaño de petición.
async function upsertRows(table, rows) {
  const BATCH = 200;
  for (let i = 0; i < rows.length; i += BATCH) {
    const { error } = await supabase.from(table).upsert(rows.slice(i, i + BATCH), { onConflict: "user_id,id" });
    if (error) throw error;
  }
}

// Devuelve los registros locales que el servidor no tiene o tiene desactualizados.
export function pickNewer(local, remote) {
  const byId = new Map((remote || []).map(r => [String(r.id), r]));
  return (local || []).filter(item => {
    const other = byId.get(String(item.id));
    return !other || stamp(item) > stamp(other);
  });
}

// ─── Sincronización completa ───────────────────────────────────────────────────

// Devuelve { state, pushed, pulled } — el estado ya fusionado y qué se movió.
export async function syncAll(localState, extraSettings = null) {
  const { data: userData, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userData?.user) throw new Error("No hay sesión iniciada.");
  const userId = userData.user.id;

  // 1. Bajar lo que hay en el servidor
  const remote = await downloadState();

  // 2. Fusionar (last-write-wins por updated_at)
  const merged = mergeStates(localState, remote);

  // 3. Subir solo lo que localmente es más nuevo
  let pushed = 0;
  const progRows = pickNewer(merged.programs, remote.programs).map(p => toDb("programs", p, userId));
  if (progRows.length) { await upsertRows("programs", progRows); pushed += progRows.length; }

  for (const pid of Object.keys(merged.programData)) {
    const l = merged.programData[pid];
    const r = remote.programData?.[pid] || {};
    for (const [key, table] of [["subjects","subjects"], ["tasks","tasks"], ["sessions","sessions"], ["schedule","schedule"]]) {
      const rows = pickNewer(l[key], r[key]).map(o => toDb(table, o, userId, pid));
      if (rows.length) { await upsertRows(table, rows); pushed += rows.length; }
    }
  }

  // 4. Ajustes (duraciones del timer, umbral de aprobado…)
  //
  // Se MEZCLA sobre lo que ya había en el servidor en vez de reemplazarlo. El PC
  // manda un objeto literal con las claves que conoce, así que sin esta mezcla
  // borraba las que solo entiende el móvil (los ajustes de avisos) en cuanto
  // sincronizaba, y al revés. Ninguna de las dos apps borra claves de ajustes, así
  // que quedarse con las desconocidas no resucita nada que alguien quisiera fuera.
  if (extraSettings) {
    const fundidos = { ...(remote.settings || {}), ...extraSettings };
    const { error } = await supabase.from("settings").upsert(
      { user_id: userId, data: fundidos, updated_at: new Date().toISOString() },
      { onConflict: "user_id" }
    );
    if (error) throw error;
  }

  // Cuántos registros ha aportado el servidor que no teníamos igual
  const countAll = st => Object.values(st.programData || {}).reduce(
    (a, p) => a + p.subjects.length + p.tasks.length + p.sessions.length + p.schedule.length, 0
  );
  const pulled = Math.max(0, countAll(merged) - countAll(localState));

  return { state: merged, pushed, pulled, remoteSettings: remote.settings };
}

// Traduce los errores de Postgres/PostgREST a algo entendible.
export function syncErrorMessage(err) {
  const m = String(err?.message || err || "");
  if (/JWT|not authenticated|No hay sesión/i.test(m))        return "Tu sesión ha caducado. Vuelve a entrar.";
  if (/row-level security|violates row-level/i.test(m))      return "Permisos rechazados por el servidor (RLS). ¿Ejecutaste el schema.sql?";
  if (/relation .* does not exist|schema cache/i.test(m))    return "Faltan tablas en la base de datos. Ejecuta schema.sql en Supabase.";
  if (/column .* does not exist/i.test(m))                   return "El esquema de la base de datos no coincide. Vuelve a ejecutar schema.sql.";
  if (/fetch|network|Failed to fetch/i.test(m))              return "Sin conexión. Se reintentará más tarde.";
  return m || "Error desconocido al sincronizar.";
}
