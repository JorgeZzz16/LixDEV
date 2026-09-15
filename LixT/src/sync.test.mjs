// Comprobación de la sincronización. Ejecutar con:  node --test src/
//
// Aquí no se toca la red: lo que se prueba son las funciones puras que deciden
// QUÉ se guarda y QUIÉN gana. Es el sitio donde un fallo no da error, solo pierde
// datos sin que nadie se entere — de ahí que sea lo primero que conviene cubrir.

import { test } from "node:test";
import assert from "node:assert/strict";
import { toDb, fromDb, mergeById, pickNewer, mergeStates, syncErrorMessage } from "./sync.js";

const U = "user-1", P = "prog_career";

// ─── Ida y vuelta: nada se pierde por el camino ────────────────────────────────

test("una tarea sobrevive al viaje a la base de datos y vuelta", () => {
  const t = { id: "101", subjectId: "6", title: "Examen MAA", dueDate: "2026-03-23",
              hour: "18:00-20:30", type: "examen", status: "completada", priority: "alta",
              grade: 6.9, gradeMode: "pct", pct: 20, pts: null,
              updated_at: "2026-07-16T21:39:56.163+00:00", deleted_at: null };
  const vuelta = fromDb("tasks", toDb("tasks", t, U, P));
  for (const k of Object.keys(t)) assert.deepEqual(vuelta[k], t[k], "se perdió el campo " + k);
});

test("el camelCase se traduce a snake_case y vuelve", () => {
  const row = toDb("schedule", { id: "14", subjectId: "44", day: "Ju", start: "11:45", end: "12:45", course: 2026 }, U, P);
  assert.equal(row.start_time, "11:45");
  assert.equal(row.end_time, "12:45");
  assert.equal(row.subject_id, "44");
  assert.equal(row.program_id, P);
  assert.equal(row.course, 2026);
  const v = fromDb("schedule", row);
  assert.equal(v.start, "11:45");
  assert.equal(v.end, "12:45");
});

test("un campo que no está en COLUMNS se descarta en vez de reventar el INSERT", () => {
  // Es el bug real del campo `course` del horario: si la columna no existe, el
  // upsert del lote entero falla. Mejor perder el campo que perder la subida.
  const row = toDb("tasks", { id: "1", inventado: "x", title: "T" }, U, P);
  assert.equal("inventado" in row, false);
  assert.equal(row.title, "T");
});

test("la fila lleva SIEMPRE todas las columnas, aunque el objeto no las traiga", () => {
  // PostgREST unifica las columnas de un lote: a las filas que no traen un campo
  // les mete NULL. Si unas llevaran `acronym` y otras no, las segundas borrarían
  // el valor que sí había en el servidor.
  const row = toDb("subjects", { id: "1", name: "Cálculo" }, U, P);
  for (const c of ["acronym", "color", "course", "year", "semester", "credits", "manual_grade"])
    assert.ok(c in row, "falta la columna " + c);
  assert.equal(row.acronym, null);
});

test("los NOT NULL con default viajan como booleano, nunca como null", () => {
  const row = toDb("subjects", { id: "1", name: "X" }, U, P);
  assert.equal(row.approved, false);
  assert.equal(row.archived, false);
  assert.equal(row.annual, false);
  assert.equal(toDb("sessions", { id: "1" }, U, P).manual, false);
});

test("sin updated_at se pone uno: sin marca no hay forma de resolver conflictos", () => {
  assert.ok(toDb("tasks", { id: "1" }, U, P).updated_at);
});

// ─── Quién gana ────────────────────────────────────────────────────────────────

const conFecha = (id, ts, extra = {}) => ({ id, updated_at: ts, ...extra });

test("gana la versión más reciente, venga de donde venga", () => {
  const local  = [conFecha("1", "2026-05-02T10:00:00Z", { title: "nuevo" })];
  const remoto = [conFecha("1", "2026-05-01T10:00:00Z", { title: "viejo" })];
  assert.equal(mergeById(local, remoto)[0].title, "nuevo");
  assert.equal(mergeById(remoto, local)[0].title, "nuevo");
});

test("los ids son texto: se emparejan por igualdad, no por orden", () => {
  // Con ids UUID, comparar con < o > es una comparación de cadenas y no dice cuál
  // es más nuevo. La fusión tiene que emparejar por igualdad de string.
  const local  = [conFecha("0f2a-b", "2026-05-02T10:00:00Z", { v: "nuevo" })];
  const remoto = [conFecha("0f2a-b", "2026-05-01T10:00:00Z", { v: "viejo" })];
  const m = mergeById(local, remoto);
  assert.equal(m.length, 1);
  assert.equal(m[0].v, "nuevo");
});

test("un id numérico y el mismo como texto son el mismo registro", () => {
  assert.equal(mergeById([conFecha(1, "2026-05-02T10:00:00Z")], [conFecha("1", "2026-05-01T10:00:00Z")]).length, 1);
});

test("lo que solo existe en un lado se conserva", () => {
  const m = mergeById([conFecha("1", "2026-05-01T10:00:00Z")], [conFecha("2", "2026-05-01T10:00:00Z")]);
  assert.deepEqual(m.map(x => String(x.id)).sort(), ["1", "2"]);
});

test("un borrado no revive al sincronizar", () => {
  // El borrado es lógico justo por esto: un DELETE real volvería a subirse desde
  // el otro dispositivo, que no puede saber que faltaba a propósito.
  const borrado = conFecha("1", "2026-05-02T10:00:00Z", { deleted_at: "2026-05-02T10:00:00Z" });
  const vivo    = conFecha("1", "2026-05-01T10:00:00Z");
  assert.ok(mergeById([borrado], [vivo])[0].deleted_at);
  assert.ok(mergeById([vivo], [borrado])[0].deleted_at);
});

test("sin updated_at pierde contra cualquiera que lo tenga", () => {
  const m = mergeById([{ id: "1", v: "sin fecha" }], [conFecha("1", "2026-05-01T10:00:00Z", { v: "con fecha" })]);
  assert.equal(m[0].v, "con fecha");
});

// ─── Qué se sube ───────────────────────────────────────────────────────────────

test("solo se sube lo que el servidor no tiene o tiene más viejo", () => {
  const local = [
    conFecha("1", "2026-05-02T10:00:00Z"),  // más nuevo -> sube
    conFecha("2", "2026-05-01T10:00:00Z"),  // igual     -> no
    conFecha("3", "2026-05-01T10:00:00Z"),  // no está   -> sube
  ];
  const remoto = [conFecha("1", "2026-05-01T10:00:00Z"), conFecha("2", "2026-05-01T10:00:00Z")];
  assert.deepEqual(pickNewer(local, remoto).map(x => x.id), ["1", "3"]);
});

test("con todo igual no se sube nada", () => {
  const iguales = [conFecha("1", "2026-05-01T10:00:00Z")];
  assert.equal(pickNewer(iguales, iguales).length, 0);
});

// ─── Estado completo ───────────────────────────────────────────────────────────

const estado = (pid, subjects, tasks = []) => ({
  activeProgram: pid,
  programs: [conFecha(pid, "2026-05-01T10:00:00Z", { name: "Carrera" })],
  programData: { [pid]: { subjects, tasks, sessions: [], schedule: [] } },
});

test("se fusiona cada programa por separado", () => {
  const l = estado(P, [conFecha("s1", "2026-05-02T10:00:00Z", { name: "local" })]);
  const r = estado(P, [conFecha("s1", "2026-05-01T10:00:00Z", { name: "remoto" }),
                       conFecha("s2", "2026-05-01T10:00:00Z", { name: "solo remoto" })]);
  const m = mergeStates(l, r);
  const subs = m.programData[P].subjects;
  assert.equal(subs.length, 2);
  assert.equal(subs.find(x => x.id === "s1").name, "local");
});

test("un programa que solo está en el servidor llega entero", () => {
  const m = mergeStates(estado(P, []), estado("prog_master", [conFecha("s9", "2026-05-01T10:00:00Z")]));
  assert.ok(m.programData["prog_master"]);
  assert.equal(m.programData["prog_master"].subjects.length, 1);
});

test("si el programa activo desaparece se elige otro en vez de quedarse en blanco", () => {
  const l = { activeProgram: "borrado", programs: [], programData: {} };
  const r = estado(P, []);
  assert.equal(mergeStates(l, r).activeProgram, P);
});

test("las cuatro colecciones existen tras fusionar, aunque falten en un lado", () => {
  const m = mergeStates({ activeProgram: P, programs: [], programData: { [P]: {} } }, { programs: [], programData: {} });
  for (const k of ["subjects", "tasks", "sessions", "schedule"])
    assert.ok(Array.isArray(m.programData[P][k]), "falta " + k);
});

// ─── Errores ───────────────────────────────────────────────────────────────────

test("los errores del servidor se traducen a algo que se entiende", () => {
  assert.match(syncErrorMessage(new Error("JWT expired")), /sesi/i);
  assert.match(syncErrorMessage(new Error("Failed to fetch")), /conexi/i);
  assert.match(syncErrorMessage(new Error('relation "tasks" does not exist')), /tablas/i);
  assert.equal(syncErrorMessage(null), "Error desconocido al sincronizar.");
});
