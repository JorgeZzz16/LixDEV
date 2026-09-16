// Comprobación mínima de la nota final. Ejecutar con:  node src/logic.test.mjs
//
// Cubre lo que se rompió de verdad alguna vez: que la nota manual mande, que los
// puntos extra sumen, y que una edición desde el móvil no se los cargue.

import assert from "node:assert/strict";
import {
  calcFinalGrade, touch, GRADE_SCALES, fmtGrade, fmtGradeFull, setGradeConfig, weightedAverage,
  soloNumero, parseNum, byDueDate, pendingTasks, today, pad, parseDate, fmtDate,
  academicCourseOf, startOfWeek, endOfWeek, studyStreak,
} from "./logic.js";

const subj = { id: "s1", name: "Cálculo", manualGrade: null };
const tasks = [
  { id: "t1", subjectId: "s1", grade: 6, pct: 50, gradeMode: "pct" },
  { id: "t2", subjectId: "s1", grade: 8, pct: 50, gradeMode: "pct" },
  { id: "t3", subjectId: "s1", grade: 10, pts: 1, gradeMode: "points" },
];

// Media ponderada 7 + bonus (10/10)*1 = 8
assert.equal(calcFinalGrade(tasks, [subj], "s1").finalGrade, 8);
assert.equal(calcFinalGrade(tasks, [subj], "s1").baseGrade, 7);
assert.equal(calcFinalGrade(tasks, [subj], "s1").bonus, 1);

// Pasar solo [subj] equivale a pasar el array entero: SubjectCard lo hace así.
const todas = [subj, { id: "s2", name: "Otra", manualGrade: 3 }];
assert.deepEqual(
  calcFinalGrade(tasks, todas, "s1").finalGrade,
  calcFinalGrade(tasks, [subj], "s1").finalGrade,
);

// La nota manual sobreescribe el cálculo (la tarjeta de Asignaturas la ignoraba)
const conManual = { ...subj, manualGrade: 4.5 };
assert.equal(calcFinalGrade(tasks, [conManual], "s1").finalGrade, 4.5);

// Nunca pasa de 10
const topes = [{ id: "t4", subjectId: "s1", grade: 10, pct: 100, gradeMode: "pct" },
               { id: "t5", subjectId: "s1", grade: 10, pts: 3,   gradeMode: "points" }];
assert.equal(calcFinalGrade(topes, [subj], "s1").finalGrade, 10);

// Sin nada calificado no hay nota (no un 0, que se leería como suspenso)
assert.equal(calcFinalGrade([], [subj], "s1").finalGrade, null);

// Una edición desde el móvil (que no toca el modo de calificación) conserva los
// puntos extra. Antes mandaba gradeMode "pct" y pts null, y el bonus desaparecía.
const t3 = tasks[2];
const editadaEnMovil = touch({
  ...t3,
  grade: 9,
  gradeMode: t3.gradeMode === "points" ? "points" : "pct",
  pts: t3.gradeMode === "points" ? t3.pts : null,
});
assert.equal(editadaEnMovil.gradeMode, "points");
assert.equal(editadaEnMovil.pts, 1);
assert.equal(calcFinalGrade([tasks[0], tasks[1], editadaEnMovil], [subj], "s1").bonus, 0.9);

// ─── Escalas de notas ──────────────────────────────────────────────────────────

const enEscala = (clave, g) => { setGradeConfig({ gradeScale: clave }); return fmtGrade(g); };

// España: 0–10 con un decimal, redondeando hacia arriba
assert.equal(enEscala("es", 7.4), "7.4");
assert.equal(enEscala("es", 8.95), "9.0");

// Francia: ×2 sobre 20
assert.equal(enEscala("fr", 7.5), "15.0");
assert.equal(enEscala("fr", 10), "20.0");
assert.equal(enEscala("fr", 0), "0.0");

// Suecia (KTH/ECTS): A ≥9 · B ≥8 · C ≥7 · D ≥6 · E ≥5 · F <5
for (const [nota, l] of [[10,"A"],[9,"A"],[8.9,"B"],[8,"B"],[7.4,"C"],[7,"C"],
                         [6.5,"D"],[6,"D"],[5,"E"],[4.99,"F"],[0,"F"]]) {
  assert.equal(enEscala("se", nota), l, `sueca: ${nota} debería ser ${l}`);
}

// EEUU: A ≥9 · B ≥7 · C ≥5 · D ≥3 · F <3, y NO existe la E
for (const [nota, l] of [[10,"A"],[9,"A"],[8.9,"B"],[7,"B"],[6.9,"C"],[5,"C"],
                         [4.9,"D"],[3,"D"],[2.9,"F"],[0,"F"]]) {
  assert.equal(enEscala("us", nota), l, `EEUU: ${nota} debería ser ${l}`);
}
assert.ok(!["A","B","C","D","F"].includes("E"));
for (let g = 0; g <= 10; g += 0.1) assert.notEqual(enEscala("us", g), "E");

// Las letras miran la nota SIN redondear, igual que las medallas: 8.95 es una B
// aunque en español se muestre "9.0". Redondear antes daría un 4.96 aprobado.
assert.equal(enEscala("se", 8.95), "B");
assert.equal(enEscala("es", 8.95), "9.0");
assert.equal(enEscala("se", 4.96), "F");
assert.equal(enEscala("us", 4.96), "D");

// El sufijo solo aparece donde tiene sentido: "C/10" sería absurdo
setGradeConfig({ gradeScale: "es" }); assert.equal(fmtGradeFull(7.4), "7.4/10");
setGradeConfig({ gradeScale: "fr" }); assert.equal(fmtGradeFull(7.5), "15.0/20");
setGradeConfig({ gradeScale: "se" }); assert.equal(fmtGradeFull(7.4), "C");
setGradeConfig({ gradeScale: "us" }); assert.equal(fmtGradeFull(7.4), "B");
assert.equal(fmtGradeFull(null), "—");

// Una clave desconocida (ajuste corrupto) cae en español, no rompe
setGradeConfig({ gradeScale: "marciano" });
assert.equal(fmtGrade(7.4), "7.4");

// Las cuatro escalas declaran lo que la interfaz les pide
for (const [clave, e] of Object.entries(GRADE_SCALES)) {
  assert.ok(e.label && e.ayuda && typeof e.corto === "function", `${clave} incompleta`);
}
setGradeConfig({ gradeScale: "se" });

// Cambiar de escala NO toca los datos: la media ponderada sale igual, solo se
// pinta distinto. Es la razón de guardar siempre en 0–10.
const asigs = [{ id: "s1", approved: true, credits: 6, manualGrade: null },
               { id: "s2", approved: true, credits: 3, manualGrade: null }];
const notas = [{ id: "a", subjectId: "s1", grade: 8, pct: 100, gradeMode: "pct" },
               { id: "b", subjectId: "s2", grade: 5, pct: 100, gradeMode: "pct" }];
const mediaSe = weightedAverage(notas, asigs);
setGradeConfig({ gradeScale: "es" });
assert.equal(weightedAverage(notas, asigs), mediaSe);
assert.equal(mediaSe, 7);                     // (8·6 + 5·3) / 9
assert.equal(fmtGradeFull(mediaSe), "7.0/10");
setGradeConfig({ gradeScale: "se" });
assert.equal(fmtGradeFull(mediaSe), "C");
setGradeConfig({ gradeScale: "es" });         // se deja como estaba

// ─── Entradas hostiles ─────────────────────────────────────────────────────────

// Varios puntos: "7..5" es un resbalón normal en el teclado del móvil
assert.equal(soloNumero("7..5"), "7.5");
assert.equal(soloNumero("1.2.3"), "1.23");
assert.equal(soloNumero("7a.5b"), "7.5");
assert.equal(soloNumero(".."), ".");

// parseNum devuelve null, nunca NaN: un NaN acababa saliendo como un 0 con
// pinta de nota real, porque `baseGrade || 0` lo convierte en 0.
assert.equal(parseNum(""), null);
assert.equal(parseNum("abc"), null);
assert.equal(parseNum(".."), null);
assert.equal(parseNum("1e400"), null);        // Infinity
assert.equal(parseNum("999"), 10);            // acotado arriba
assert.equal(parseNum("-5"), 0);              // acotado abajo
assert.equal(parseNum("120", { min: 0, max: 100 }), 100);
assert.equal(parseNum("7.5"), 7.5);

// Aunque se cuele un NaN en los datos, no debe convertirse en un 0
const conNaN = [{ id: "t", subjectId: "s1", grade: NaN, pct: 100, gradeMode: "pct" }];
const asigNaN = [{ id: "s1", approved: true, credits: 6, manualGrade: null }];
assert.equal(calcFinalGrade(conNaN, asigNaN, "s1").finalGrade, null);   // antes: 0
assert.equal(weightedAverage(conNaN, asigNaN), null);                   // antes: 0

// Créditos corruptos no envenenan la media
assert.equal(weightedAverage(
  [{ id: "t", subjectId: "s1", grade: 8, pct: 100, gradeMode: "pct" }],
  [{ id: "s1", approved: true, credits: NaN, manualGrade: null }],
), null);

// Una tarea sin fecha ordena al final en vez de tirar la app
const sinFecha = [{ id: "b", subjectId: "s1", status: "pendiente" },
                  { id: "a", subjectId: "s1", status: "pendiente", dueDate: "2026-01-01" }];
assert.deepEqual(sinFecha.slice().sort(byDueDate).map(t => t.id), ["a", "b"]);
assert.equal(pendingTasks(sinFecha, "s1").length, 2);   // antes: TypeError

// ─── Fechas locales, no UTC ────────────────────────────────────────────────────

// today() sigue al reloj del dispositivo. Con toISOString(), en España entre las
// 00:00 y las 02:00 devolvía el día anterior.
const ahora = new Date();
assert.equal(today(), `${ahora.getFullYear()}-${pad(ahora.getMonth() + 1)}-${pad(ahora.getDate())}`);

// parseDate no se desplaza: el día que entra es el día que sale
for (const ds of ["2026-01-01", "2026-07-08", "2026-12-31"]) {
  assert.equal(fmtDate(parseDate(ds)), ds, `parseDate desplazó ${ds}`);
}

// El curso académico se corta el 1 de septiembre, sin resbalar por la zona horaria
assert.equal(academicCourseOf("2026-09-01"), 2026);
assert.equal(academicCourseOf("2026-08-31"), 2025);
assert.equal(academicCourseOf("2027-02-10"), 2026);

// Semana de lunes a domingo
assert.equal(startOfWeek("2026-07-08"), "2026-07-06");   // miércoles → lunes
assert.equal(endOfWeek("2026-07-08"),   "2026-07-12");   // → domingo
assert.equal(startOfWeek("2026-07-12"), "2026-07-06");   // domingo cuenta con su lunes

// ── Racha de estudio ────────────────────────────────────────────────────────
const ses = (...fechas) => fechas.map(d => ({ date: d, minutes: 25 }));

// Días seguidos acabando en hoy
assert.deepEqual(studyStreak(ses("2026-09-14", "2026-09-15", "2026-09-16"), "2026-09-16"),
                 { dias: 3, hoy: true });

// Hoy sin estudiar todavía: la racha aguanta y se marca que hoy no cuenta
assert.deepEqual(studyStreak(ses("2026-09-14", "2026-09-15"), "2026-09-16"),
                 { dias: 2, hoy: false });

// Ni hoy ni ayer: rota
assert.deepEqual(studyStreak(ses("2026-09-10"), "2026-09-16"), { dias: 0, hoy: false });

// Un hueco corta la cuenta por detrás, no la anula
assert.deepEqual(studyStreak(ses("2026-09-12", "2026-09-15", "2026-09-16"), "2026-09-16"),
                 { dias: 2, hoy: true });

// Varias sesiones el mismo día cuentan como un día, no como tres
assert.deepEqual(studyStreak(ses("2026-09-16", "2026-09-16", "2026-09-16"), "2026-09-16"),
                 { dias: 1, hoy: true });

// Cruza el cambio de mes (y de año) sin saltarse nada
assert.equal(studyStreak(ses("2025-12-30", "2025-12-31", "2026-01-01"), "2026-01-01").dias, 3);

// Una sesión de 0 minutos no sostiene la racha
assert.deepEqual(studyStreak([{ date: "2026-09-16", minutes: 0 }], "2026-09-16"),
                 { dias: 0, hoy: false });

// Sin sesiones no revienta
assert.deepEqual(studyStreak([], "2026-09-16"), { dias: 0, hoy: false });
assert.deepEqual(studyStreak(null, "2026-09-16"), { dias: 0, hoy: false });

console.log("logic.js OK");
