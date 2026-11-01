// Empaqueta la versión portable de LixT en un .zip: el .exe de la compilación
// de release más una carpeta `LixT-datos` vacía. Esa carpeta es la que activa el
// modo portable (ver `carpeta_portable` en src-tauri/src/lib.rs): con ella, los
// datos se guardan ahí en vez de en %LOCALAPPDATA%.
//
// Uso:  npm run portable   (compila y empaqueta)

import { execFileSync } from "node:child_process";
import { mkdirSync, rmSync, copyFileSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const raiz = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const conf = JSON.parse(readFileSync(join(raiz, "src-tauri", "tauri.conf.json"), "utf8"));
const exe = join(raiz, "src-tauri", "target", "release", conf.productName + ".exe");
if (!existsSync(exe)) {
  console.error(`No encuentro ${exe}. Compila antes con: npm run tauri build`);
  process.exit(1);
}

const salida = join(raiz, "src-tauri", "target", "release", "bundle", "portable");
const carpeta = join(salida, "LixT");
rmSync(salida, { recursive: true, force: true });
mkdirSync(join(carpeta, "LixT-datos"), { recursive: true });
copyFileSync(exe, join(carpeta, "LixT.exe"));
writeFileSync(join(carpeta, "LixT-datos", "LEEME.txt"),
  "Aquí guarda LixT tus datos en la versión portable. No borres esta carpeta:\n" +
  "sin ella, LixT vuelve a guardar los datos en el ordenador (%LOCALAPPDATA%).\n");

const zip = join(salida, `LixT-${conf.version}-portable.zip`);
execFileSync("powershell", ["-NoProfile", "-Command",
  `Compress-Archive -Path '${carpeta}' -DestinationPath '${zip}' -Force`], { stdio: "inherit" });
console.log("Listo: " + zip);
