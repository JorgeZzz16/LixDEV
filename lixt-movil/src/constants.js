import { D } from "./theme";

// Mismas paletas y tipos que en el PC (LixT/src/App.jsx). Si tocas una, toca la
// otra: un color que solo exista en un lado no se puede volver a elegir desde el
// otro, y al editar la asignatura aparece como si no tuviera ninguno marcado.

export const COLORS = [
  // Rojos
  "#ED0A3F","#FD0E35","#FF5349","#FE4C40","#C32148","#E12C2C",
  // Naranjas
  "#FF7F49","#FF8833","#E77200","#FF681F","#FE6F5E","#D85A30",
  // Amarillos
  "#FFAE42","#FED85D","#FBE870","#FCD667","#F2BA49","#ECB176",
  // Verdes amarillos
  "#AFE313","#C5E17A","#D9E650","#ACBF60","#9FBF2E","#C5E17A",
  // Verdes
  "#3AA655","#29AB87","#00CC99","#5FA777","#33CC99","#1AB385",
  // Azules verdes
  "#00CCCC","#6CDAE7","#30BFBF","#8DD9CC","#95E0E8","#76D7EA",
  // Azules
  "#009DC4","#02A4D3","#0066CC","#1560BD","#4997D0","#339ACC",
  // Azules violeta
  "#4F69C6","#6456B7","#3F26BF","#8B72BE","#4570E6","#7A89B8",
  // Violetas
  "#652DC1","#6B3FA0","#8359A3","#733380",
  // Magentas
  "#BB3385","#C154C1","#E30B5C","#DA3287","#803790",
  // Rosas
  "#FF3399","#F7468A","#E667CE","#FC74FD","#FFA6C9","#FFB7D5",
  // Marrones y grises
  "#AF593E","#9C6B3F","#8B8680","#736A62",
];

export const TASK_TYPES = [
  { key: "tarea",    label: "Entrega",  hasGrade: true },
  { key: "examen",   label: "Examen",   hasGrade: true },
  { key: "trabajo",  label: "Trabajo",  hasGrade: true },
  { key: "practica", label: "Práctica", hasGrade: true },
  // Sin nota y sin asignatura: para apuntar cosas sueltas en el calendario
  { key: "recordatorio", label: "Recordatorio", hasGrade: false },
];

// Salen del tema, no copiados a mano: "en progreso" usa el acento, que cambia con
// el programa activo (en el PC ya era así). Son GETTERS a propósito — `D` es un
// objeto mutable que `applyTheme` reasigna, así que leerlo al importar congelaría
// los colores del arranque (ver la nota de theme.js).
export const PRIORITY_COLOR = {
  get alta()  { return D.red;   },
  get media() { return D.amber; },
  get baja()  { return D.green; },
};
export const STATUS_COLOR = {
  get pendiente()      { return D.muted;  },
  get "en progreso"()  { return D.accent; },
  get completada()     { return D.green;  },
};
