// Comprueba el .ics de logic.js: ida y vuelta sin perder nada.
//
// Ejecutar con:  node src/ics.test.mjs

import assert from "node:assert/strict";
import { tasksToIcs, parseIcs, icsToTasks, pad, fmtDate } from "./logic.js";

const subjects = [{ id: "9", name: "MEF-DFC" }];
const tareas = [
  { id: "a1", subjectId: "9", title: "Examen MEF", dueDate: "2026-06-12", hour: "15:30-20:00", type: "examen" },
  { id: "a2", subjectId: "9", title: "Entrega, con coma; y punto y coma", dueDate: "2026-05-17", hour: "", type: "tarea" },
  { id: "a3", subjectId: "9", title: "Titulo larguisimo ".repeat(12), dueDate: "2026-07-01", hour: "9:40", type: "examen" },
  { id: "a4", subjectId: "9", title: "Borrada", dueDate: "2026-07-01", hour: "", deleted_at: "2026-07-01T00:00:00Z" },
  { id: "a5", subjectId: "9", title: "Sin fecha", dueDate: "", hour: "" },
];

const ics = tasksToIcs(tareas, subjects);

// Ninguna línea pasa de 75 y todas acaban en CRLF.
for (const l of ics.split("\r\n")) assert.ok(l.length <= 75, `línea larga: ${l.length}`);
assert.ok(ics.endsWith("\r\n"));

// Las borradas y las que no tienen fecha no salen.
assert.equal(ics.match(/BEGIN:VEVENT/g).length, 3);

const eventos = parseIcs(ics);
assert.equal(eventos.length, 3);

const [e1, e2, e3] = eventos;
assert.equal(e1.title, "Examen MEF");
assert.equal(e1.date, "2026-06-12");
assert.equal(e1.hour, "15:30");
assert.equal(e2.title, "Entrega, con coma; y punto y coma");   // escapado y desescapado
assert.equal(e2.hour, "");                                      // día completo
assert.equal(e3.title.trim(), "Titulo larguisimo".repeat(1) + " Titulo larguisimo".repeat(11)); // desplegada
assert.equal(e3.hour, "09:40");

// Los UID propios devuelven el id original: reimportar actualiza, no duplica.
const vuelta = icsToTasks(eventos, { programId: "p", tasks: tareas });
assert.deepEqual(vuelta.map(t => t.id), ["a1", "a2", "a3"]);
assert.equal(vuelta[0].type, "examen");        // conserva lo que ya tenía la tarea
assert.equal(vuelta[0].subjectId, "9");
assert.equal(vuelta[0].hour, "15:30");

// Un evento de fuera entra como recordatorio sin asignatura, y con id estable.
const ajeno = [
  "BEGIN:VCALENDAR", "BEGIN:VEVENT",
  "UID:abc123@google.com",
  "SUMMARY:Reunion TFG",
  "DTSTART:20261002T170000",
  "BEGIN:VALARM", "SUMMARY:No me hagas caso", "TRIGGER:-PT10M", "END:VALARM",
  "END:VEVENT", "END:VCALENDAR",
].join("\r\n");

const fuera = parseIcs(ajeno);
assert.equal(fuera.length, 1);
assert.equal(fuera[0].title, "Reunion TFG");   // el VALARM no ha pisado el título
const t1 = icsToTasks(fuera, { programId: "p" })[0];
assert.equal(t1.type, "recordatorio");
assert.equal(t1.subjectId, null);
assert.equal(t1.dueDate, "2026-10-02");
assert.equal(t1.hour, "17:00");
// Dos importaciones del mismo archivo → el mismo id, así que se fusionan.
assert.equal(icsToTasks(parseIcs(ajeno), { programId: "p" })[0].id, t1.id);

// UTC sí se convierte a hora local; lo demás se toma tal cual.
const utc = parseIcs(["BEGIN:VEVENT", "UID:z", "SUMMARY:Z", "DTSTART:20260615T100000Z", "END:VEVENT"].join("\r\n"))[0];
const esperado = new Date(Date.UTC(2026, 5, 15, 10, 0));
assert.equal(utc.date, fmtDate(esperado));
assert.equal(utc.hour, `${pad(esperado.getHours())}:${pad(esperado.getMinutes())}`);

// Basura: no revienta, no inventa.
assert.deepEqual(parseIcs(""), []);
assert.deepEqual(parseIcs("no soy un calendario"), []);
assert.deepEqual(parseIcs("BEGIN:VEVENT\r\nSUMMARY:Sin fecha\r\nEND:VEVENT"), []);

console.log("✔ .ics: exportar, importar y reimportar sin duplicar");
