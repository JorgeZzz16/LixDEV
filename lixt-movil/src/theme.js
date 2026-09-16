// Los mismos colores que la app de escritorio, para que se vea como LixT.
//
// `D` es un objeto MUTABLE a propósito. Las pantallas hacen `import { D }` y leen
// sus propiedades al pintar, así que reasignar el contenido cambia el tema entero
// sin enhebrar un contexto por los catorce archivos. A cambio, dos reglas:
//
//   1. Quien llame a `applyTheme` tiene que forzar un re-render (App lo hace con
//      un contador de estado); mutar un objeto no se lo notifica a React.
//   2. Ningún estilo puede calcularse FUERA del render — un `const x = { color:
//      D.text }` a nivel de módulo se evalúa una sola vez al importar y se
//      quedaría con los colores del arranque. Por eso los estilos compartidos de
//      las pantallas son funciones (`input()`, `campo()`), no constantes.

export const BG_THEMES = {
  dark:   { bg: "#0a0c12", card: "#13161f", card2: "#1c2030", border: "#252a3a", sidebar: "#0f1219" },
  darker: { bg: "#050709", card: "#0d1018", card2: "#141924", border: "#1e2333", sidebar: "#080a10" },
  navy:   { bg: "#060d1a", card: "#0d1528", card2: "#152038", border: "#1e2e4a", sidebar: "#07101f" },
  gray:   { bg: "#111318", card: "#1a1d24", card2: "#22262f", border: "#2d323e", sidebar: "#0e1015" },
};

export const BG_LABELS = [
  ["dark", "Oscuro"], ["darker", "Más oscuro"], ["navy", "Azul noche"], ["gray", "Gris"],
];

// Los que no dependen del fondo. `accent` sí cambia: sigue al color del programa
// activo, igual que en el PC.
const FIJOS = {
  text:   "#e8eaf0",
  muted:  "#6b7194",
  accent: "#378ADD",
  green:  "#1D9E75",
  red:    "#E24B4A",
  amber:  "#BA7517",
};

export const D = { ...BG_THEMES.dark, ...FIJOS };

export function applyTheme({ bgTheme, accent } = {}) {
  Object.assign(D, BG_THEMES[bgTheme] || BG_THEMES.dark, FIJOS);
  if (accent) D.accent = accent;
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────
//
// Todos son FUNCIONES, no constantes, por la regla de arriba: `D` se muta al
// cambiar de fondo, así que un objeto calculado al importar se quedaría con los
// colores del arranque.
//
// Antes cada pantalla se definía su propio `input()`. Había tres copias con tres
// tamaños distintos, y en TaskModal el campo de fecha y el de texto ni siquiera
// medían lo mismo estando pegados.

// Sombreado de los modales. El mismo valor que el PC (rgba(0,0,0,0.85)), que
// usaba #000a (0,67) y se notaba más claro.
export const VELO = "#000d";

// Alto y tipografía de TODO lo que sea un campo, escriba o no el usuario: cajas
// de texto, selectores de fecha y de hora.
const campoBase = () => ({
  backgroundColor: D.card2, borderWidth: 1, borderColor: D.border, borderRadius: 10,
  paddingVertical: 12, paddingHorizontal: 14,
});

// Campo de texto. `grande` para el onboarding, que es una pantalla entera con
// cuatro campos y se lee mejor con algo más de cuerpo.
export const input = ({ grande = false } = {}) => ({
  ...campoBase(),
  color: D.text,
  fontSize: grande ? 15 : 14,
  marginBottom: grande ? 18 : 16,
});

// Campo pulsable (fecha, hora): mismo alto que `input`, con sitio para el icono.
export const campo = () => ({
  ...campoBase(),
  flexDirection: "row", alignItems: "center", justifyContent: "space-between",
});

// Botones de la fila de acciones de un modal. Estaban copiados en TaskModal,
// SubjectModal y ScheduleModal, iguales los tres.
export const botonPrimario = () => ({
  flex: 1, paddingVertical: 13, borderRadius: 10, backgroundColor: D.accent, alignItems: "center",
});
export const botonSecundario = () => ({
  flex: 1, paddingVertical: 13, borderRadius: 10, borderWidth: 1, borderColor: D.border, alignItems: "center",
});
export const botonPeligro = () => ({
  paddingVertical: 13, paddingHorizontal: 16, borderRadius: 10,
  borderWidth: 1, borderColor: D.red + "44", backgroundColor: D.red + "11",
});
