// Comprueba que los archivos compartidos son IDÉNTICOS entre el PC y el móvil.
//
// `logic.js` y `sync.js` están duplicados a propósito (dos proyectos, dos
// bundlers, sin monorepo), y hasta ahora lo único que lo garantizaba era un
// comentario y acordarse de hacer `diff` a mano. Esto lo vuelve mecánico: si se
// desincronizan, falla y dice en qué línea.
//
// Uso:  node scripts/check-shared.mjs

import { readFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join, resolve } from "node:path";

const aqui = dirname(fileURLToPath(import.meta.url));
const PC    = resolve(aqui, "..", "src");
const MOVIL = resolve(aqui, "..", "..", "lixt-movil", "src");
const COMPARTIDOS = ["logic.js", "sync.js"];

if (!existsSync(MOVIL)) {
  console.error(`No encuentro el proyecto del móvil en ${MOVIL}.`);
  console.error("Los dos repos tienen que estar uno al lado del otro dentro de LixDEV.");
  process.exit(1);
}

let fallos = 0;
for (const archivo of COMPARTIDOS) {
  const a = join(PC, archivo), b = join(MOVIL, archivo);
  if (!existsSync(a) || !existsSync(b)) {
    console.error(`✖ ${archivo}: falta en ${!existsSync(a) ? "el PC" : "el móvil"}`);
    fallos++;
    continue;
  }
  const la = readFileSync(a, "utf8").split("\n");
  const lb = readFileSync(b, "utf8").split("\n");
  const n = Math.max(la.length, lb.length);
  const distintas = [];
  for (let i = 0; i < n; i++) if (la[i] !== lb[i]) distintas.push(i + 1);

  if (!distintas.length) {
    console.log(`✔ ${archivo}`);
  } else {
    fallos++;
    console.error(`✖ ${archivo}: ${distintas.length} línea(s) distintas`);
    for (const l of distintas.slice(0, 5)) {
      console.error(`    línea ${l}`);
      console.error(`      PC:    ${(la[l - 1] ?? "(no existe)").trim().slice(0, 90)}`);
      console.error(`      móvil: ${(lb[l - 1] ?? "(no existe)").trim().slice(0, 90)}`);
    }
    if (distintas.length > 5) console.error(`    …y ${distintas.length - 5} más`);
  }
}

if (fallos) {
  console.error("\nCopia el bueno sobre el otro antes de seguir. Si divergen, un campo");
  console.error("nuevo puede desaparecer al sincronizar sin que nada avise.");
  process.exit(1);
}
console.log("Los archivos compartidos están sincronizados.");
