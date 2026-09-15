import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { createPortal } from "react-dom";
import {
  isPermissionGranted,
  requestPermission,
  sendNotification as tauriSendNotification,
} from "@tauri-apps/plugin-notification";
import { open as abrirDialogo } from "@tauri-apps/plugin-dialog";
import { invoke } from "@tauri-apps/api/core";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { supabase, signIn, signUp, signOut, authErrorMessage } from "./supabase.js";
import { syncAll, syncErrorMessage } from "./sync.js";
import {
  newId, touch, softDelete, alive, migrateIdsToString,
  pad, today, daysUntil, getDaysInMonth, getFirstDay, startOfWeek, endOfWeek,
  shiftMonth, academicCourseOf, courseRange, academicCoursesOf, academicCourseLabel, weekdayIndex, timeToMinutes,
  bySubjectOrder, subjectGroupKey,
  fmtTime, setGradeConfig, parseDate, fmtDate, GRADE_SCALES,
  gradeColor, gradeLabel, subjectMedal,
  calcFinalGrade as calcGradeOf, stdDev, linearRegression,
  pendingTasks, defaultTaskId, mostStudied, fmtGrade, fmtGradeFull,
  byDueDate, parseNum,
} from "./logic.js";

// ─── Constantes ────────────────────────────────────────────────────────────────

const COLORS = [
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

const DAYS = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];


// D es ahora una función que recibe el color del programa activo
// y devuelve el tema con accent y un text ligeramente teñido
// Paletas de fondo
const BG_THEMES = {
  dark:    { bg: "#0a0c12", card: "#13161f", card2: "#1c2030", border: "#252a3a", sidebar: "#0f1219" },
  darker:  { bg: "#050709", card: "#0d1018", card2: "#141924", border: "#1e2333", sidebar: "#080a10" },
  navy:    { bg: "#060d1a", card: "#0d1528", card2: "#152038", border: "#1e2e4a", sidebar: "#07101f" },
  gray:    { bg: "#111318", card: "#1a1d24", card2: "#22262f", border: "#2d323e", sidebar: "#0e1015" },
};

function makeTheme(accentColor, bgTheme) {
  const bg = BG_THEMES[bgTheme] || BG_THEMES.dark;
  return {
    ...bg,
    text:    "#e8eaf0",
    muted:   "#6b7194",
    accent:  accentColor || "#378ADD",
    green:   "#1D9E75",
    red:     "#E24B4A",
    amber:   "#BA7517",
  };
}
// D por defecto (para componentes fuera del contexto de App)
const D = makeTheme("#378ADD", "dark");

const TASK_TYPES = [
  { key: "tarea",    label: "Entrega",  hasGrade: true  },
  { key: "examen",   label: "Examen",   hasGrade: true  },
  { key: "trabajo",  label: "Trabajo",  hasGrade: true  },
  { key: "practica", label: "Práctica", hasGrade: true  },
  // Sin nota y sin asignatura: sirve para apuntar cosas sueltas en el calendario
  { key: "recordatorio", label: "Recordatorio", hasGrade: false },
];

const DEFAULT_SUBJECTS = [
  { id: "1", name: "Matemáticas", color: "#378ADD", archived: false, approved: false, course: "", year: null, semester: null, credits: null, programMode: "career" },
  { id: "2", name: "Física",      color: "#D85A30", archived: false, approved: false, course: "", year: null, semester: null, credits: null, programMode: "career" },
  { id: "3", name: "Historia",    color: "#1D9E75", archived: false, approved: false, course: "", year: null, semester: null, credits: null, programMode: "career" },
];

const DEFAULT_TASKS = [
  {
    id: "1", subjectId: "1", title: "Entrega Matemáticas",
    dueDate: fmtDate(new Date(Date.now() + 7  * 86400000)),
    hour: "", type: "tarea", status: "pendiente", priority: "media", grade: null, pct: null,
  },
  {
    id: "2", subjectId: "2", title: "Examen Física",
    dueDate: fmtDate(new Date(Date.now() + 14 * 86400000)),
    hour: "10:00-12:00", type: "examen", status: "pendiente", priority: "alta", grade: null, pct: null,
  },
];

const MONTHS = ["Enero","Febrero","Marzo","Abril","Mayo","Junio","Julio","Agosto","Septiembre","Octubre","Noviembre","Diciembre"];
const WDAYS  = ["L","M","X","J","V","S","D"];

const NAV = [
  { k: "timer",    icon: "⏳", label: "Focus"       },
  { k: "tasks",    icon: "📝", label: "Tareas"      },
  { k: "subjects", icon: "📚", label: "Asignaturas" },
  { k: "grades",   icon: "🎓", label: "Notas"       },
  { k: "calendar", icon: "📅", label: "Calendario"  },
  { k: "horario",  icon: "🕒", label: "Horario"     },
  { k: "stats",    icon: "📊", label: "Stats"       },
  { k: "settings", icon: "🔧", label: "Ajustes"     },
];

// ─── Utilidades ────────────────────────────────────────────────────────────────


function ls(k, def) {
  try { const v = localStorage.getItem(k); return v !== null ? JSON.parse(v) : def; }
  catch { return def; }
}
function lsSet(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch {}
}

// Fecha de hace N días. Con `toISOString()` esto devolvía la fecha UTC, que entre
// las 00:00 y las 02:00 en España va un día por detrás (mismo motivo por el que
// `today()` no puede ser toISOString: ver logic.js).
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return fmtDate(d); };

function autoTitle(type, subjectName) {
  return ((TASK_TYPES.find(t => t.key === type)?.label ?? "Tarea") + " " + (subjectName ?? "")).trim();
}

// "C1", "C1+2" o "" — `semester` puede ser número, array o null según la antigüedad
// del registro; sin esto un array se pintaba tal cual ("C1,2").
function semLabel(semester) {
  const s = Array.isArray(semester) ? semester : (semester ? [semester] : []);
  return s.length ? "C" + s.join("+") : "";
}


function playAlert() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [[880,0],[1100,0.18],[1320,0.36]].forEach(([f,w]) => {
      const o = ctx.createOscillator(), g = ctx.createGain();
      o.connect(g); g.connect(ctx.destination);
      o.frequency.value = f;
      g.gain.setValueAtTime(0.4, ctx.currentTime + w);
      g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + w + 0.25);
      o.start(ctx.currentTime + w); o.stop(ctx.currentTime + w + 0.25);
    });
  } catch {}
}

async function sendNotif(title, body) {
  try {
    let granted = await isPermissionGranted();
    if (!granted) { const p = await requestPermission(); granted = p === "granted"; }
    if (granted) await tauriSendNotification({ title, body });
  } catch {}
}



const PRIORITY_COLOR = { alta: D.red, media: D.amber, baja: D.green };
const STATUS_COLOR   = { pendiente: D.muted, "en progreso": D.accent, completada: D.green };
const MODE_LABELS    = { work: "Trabajo", short: "Descanso corto", long: "Descanso largo" };



// ─── Estilos base ──────────────────────────────────────────────────────────────

// Tipografía de toda la app. Las pantallas de carga y login viven fuera del
// contenedor principal, así que si no la declaran explícitamente el navegador
// usa su fuente por defecto (una serif tipo Times) y desentona con el resto.
const FONT = "'Segoe UI', system-ui, -apple-system, 'Inter', Roboto, sans-serif";

const FULLSCREEN = {
  background: D.bg, width: "100vw", height: "100vh",
  display: "flex", alignItems: "center", justifyContent: "center",
  fontFamily: FONT, color: D.text,
  WebkitFontSmoothing: "antialiased",
};

const LOADING_CSS = `
  @keyframes lixtRise {
    from { opacity: 0; transform: translateY(14px); }
    to   { opacity: 1; transform: translateY(0); }
  }
  @keyframes lixtGlow {
    0%, 100% { opacity: 1; }
    50%      { opacity: 0.55; }
  }
  @keyframes lixtSlide {
    0%   { transform: translateX(-100%); }
    100% { transform: translateX(350%); }
  }
`;

const inp = {
  padding: "8px 12px", borderRadius: 8,
  border: "1px solid " + D.border, background: D.card2,
  color: D.text, fontSize: 13, width: "100%", boxSizing: "border-box",
};

const btnBase = { padding: "9px 0", borderRadius: 8, fontSize: 14, cursor: "pointer", flex: 1 };

// ─── CustomSelect ──────────────────────────────────────────────────────────────

function CustomSelect({ value, onChange, options, disabled, disabledLabel, dotColor }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    function handle(e) { if (ref.current && !ref.current.contains(e.target)) setOpen(false); }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, []);

  if (disabled || options.length === 0) {
    return (
      <div style={{ ...inp, color: D.muted, opacity: 0.6, cursor: "default", display: "flex", justifyContent: "space-between" }}>
        <span>{disabledLabel ?? "Sin opciones"}</span>
      </div>
    );
  }

  const selected = options.find(o => o.value === value) ?? options[0];

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen(o => !o)}
        style={{ ...inp, display: "flex", alignItems: "center", cursor: "pointer", userSelect: "none", gap: 8 }}
      >
        {dotColor && <div style={{ width: 9, height: 9, borderRadius: "50%", background: dotColor, flexShrink: 0 }} />}
        <span style={{ flex: 1 }}>{selected?.label}</span>
        <span style={{ fontSize: 10, color: D.muted }}>▾</span>
      </div>
      {open && (
        <div style={{ position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: D.card2, border: "1px solid " + D.border, borderRadius: 8, zIndex: 200, overflowY: "auto", maxHeight: 220, boxShadow: "0 4px 16px rgba(0,0,0,0.4)" }}>
          {options.map(o => (
            <div
              key={o.value}
              onClick={() => { onChange(o.value); setOpen(false); }}
              style={{ padding: "9px 12px", fontSize: 13, cursor: "pointer", background: o.value === value ? dotColor ? dotColor + "33" : D.accent + "33" : "transparent", color: o.value === value ? dotColor ?? D.accent : D.text, borderBottom: "1px solid " + D.border + "44" }}
              onMouseEnter={e => { if (o.value !== value) e.currentTarget.style.background = D.border + "55"; }}
              onMouseLeave={e => { if (o.value !== value) e.currentTarget.style.background = "transparent"; }}
            >
              {o.label}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ─── TimeWheel ─────────────────────────────────────────────────────────────────
//
// Selector de hora con dos ruedas, como el de iOS. Sustituye al <input type="time">,
// que en la ventana de Tauri son dos flechitas diminutas.
//
// No usa scroll real: pinta una ventana de cinco elementos centrada en el elegido
// y mueve el índice. Sincronizar `scrollTop` con la selección es la parte que da
// problemas en estos componentes (rebotes, scroll suave peleándose con el estado),
// y aquí no aporta nada.

const HORAS   = Array.from({ length: 24 }, (_, i) => pad(i));
const MINUTOS = Array.from({ length: 12 }, (_, i) => pad(i * 5));   // de 5 en 5

function Rueda({ items, valor, onChange, ancho = 62 }) {
  const idx = Math.max(0, items.indexOf(valor));
  const mover = d => onChange(items[(idx + d + items.length) % items.length]);
  return (
    <div
      tabIndex={0}
      onWheel={e => { e.preventDefault(); mover(e.deltaY > 0 ? 1 : -1); }}
      onKeyDown={e => {
        if (e.key === "ArrowUp")   { e.preventDefault(); mover(-1); }
        if (e.key === "ArrowDown") { e.preventDefault(); mover(1); }
      }}
      style={{ width: ancho, textAlign: "center", cursor: "ns-resize", outline: "none", userSelect: "none" }}
    >
      {[-2, -1, 0, 1, 2].map(d => {
        const item = items[(idx + d + items.length) % items.length];
        const sel = d === 0;
        return (
          <div key={d} onClick={() => mover(d)}
            style={{
              padding: "3px 0", fontSize: sel ? 19 : 14,
              fontWeight: sel ? 700 : 400,
              color: sel ? D.text : D.muted,
              opacity: sel ? 1 : 0.45 - Math.abs(d) * 0.1,
              cursor: sel ? "default" : "pointer",
              lineHeight: 1.25,
            }}>
            {item}
          </div>
        );
      })}
    </div>
  );
}

// ─── Popover ───────────────────────────────────────────────────────────────────
//
// Panel flotante compartido por los selectores de hora y de fecha. Se pinta en un
// portal a document.body, NO dentro del campo, por dos motivos: los modales
// tienen `overflowY: auto` y recortan a cualquier hijo posicionado en absoluto
// aunque quepa en pantalla; y abriéndose siempre hacia abajo se salía cuando el
// campo estaba en la mitad inferior.
//
// Al vivir fuera del <div> raíz de la app tampoco hereda su tipografía, así que
// la declara: si no, el navegador mete su serif por defecto (el mismo motivo por
// el que FULLSCREEN la lleva explícita).
function Popover({ anclaRef, abierto, onClose, ancho, alto, children }) {
  const [pos, setPos] = useState(null);
  const panelRef = useRef(null);
  // En una ref para que un `onClose={() => ...}` en línea no reinicie el efecto
  // en cada render del padre.
  const cerrarRef = useRef(onClose);
  useEffect(() => { cerrarRef.current = onClose; });

  const colocar = useCallback(() => {
    const r = anclaRef.current?.getBoundingClientRect();
    if (!r) return;
    const cabeAbajo = window.innerHeight - r.bottom >= alto + 8;
    setPos({
      left: Math.max(8, Math.min(r.left, window.innerWidth - ancho - 8)),
      top: cabeAbajo ? r.bottom + 4 : Math.max(8, r.top - alto - 4),
    });
  }, [anclaRef, ancho, alto]);

  useEffect(() => {
    if (!abierto) return;
    colocar();
    const fuera = e => {
      if (anclaRef.current?.contains(e.target)) return;
      if (panelRef.current?.contains(e.target)) return;   // el panel ya no cuelga del campo
      cerrarRef.current();
    };
    // Escape cierra el panel, pero no el modal de detrás: sin el stop, el
    // listener de Modal (que está en window) también se dispararía.
    const esc = e => { if (e.key === "Escape") { e.stopPropagation(); cerrarRef.current(); } };
    document.addEventListener("mousedown", fuera);
    document.addEventListener("keydown", esc);
    // Con scroll por detrás, un panel `fixed` se queda descolgado del campo
    window.addEventListener("scroll", colocar, true);
    window.addEventListener("resize", colocar);
    return () => {
      document.removeEventListener("mousedown", fuera);
      document.removeEventListener("keydown", esc);
      window.removeEventListener("scroll", colocar, true);
      window.removeEventListener("resize", colocar);
    };
  }, [abierto, colocar, anclaRef]);

  if (!abierto || !pos) return null;
  return createPortal(
    <div ref={panelRef} style={{
      position: "fixed", top: pos.top, left: pos.left, width: ancho,
      zIndex: 400, boxSizing: "border-box",
      fontFamily: FONT, color: D.text,
      background: D.card2, border: "1px solid " + D.border, borderRadius: 10,
      padding: "10px 12px", boxShadow: "0 6px 20px rgba(0,0,0,0.5)",
    }}>
      {children}
    </div>,
    document.body
  );
}

// Campo cerrado que abre un Popover. Igual para hora y fecha.
function CampoDesplegable({ texto, icono, vacio, abierto, onToggle, campoRef }) {
  return (
    <div ref={campoRef} onClick={onToggle}
      style={{ ...inp, display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer", userSelect: "none",
               borderColor: abierto ? D.accent : D.border }}>
      <span style={{ color: vacio ? D.muted : D.text }}>{texto}</span>
      <span style={{ fontSize: 12, color: D.muted }}>{icono}</span>
    </div>
  );
}

function TimeWheel({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const campoRef = useRef(null);

  const [hh = "09", mm = "00"] = String(value || "09:00").split(":");
  // Un horario antiguo puede tener minutos que no son múltiplo de 5 (07:47). Se
  // añaden a la rueda en vez de saltar al valor más cercano sin avisar.
  const minutos = MINUTOS.includes(mm) ? MINUTOS : [...MINUTOS, mm].sort();
  const set = (h, m) => onChange(`${h}:${m}`);

  return (
    <>
      <CampoDesplegable campoRef={campoRef} texto={`${hh}:${mm}`} icono="🕑"
        abierto={open} onToggle={() => setOpen(o => !o)} />
      <Popover anclaRef={campoRef} abierto={open} onClose={() => setOpen(false)} ancho={150} alto={175}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 2, position: "relative" }}>
          {/* Marca del centro: deja claro cuál es el seleccionado */}
          <div style={{ position: "absolute", left: 0, right: 0, top: "50%", transform: "translateY(-50%)", height: 28, borderTop: "1px solid " + D.accent + "55", borderBottom: "1px solid " + D.accent + "55", background: D.accent + "11", borderRadius: 6, pointerEvents: "none" }} />
          <Rueda items={HORAS}   valor={hh} onChange={h => set(h, mm)} />
          <span style={{ fontSize: 17, fontWeight: 700, color: D.muted }}>:</span>
          <Rueda items={minutos} valor={mm} onChange={m => set(hh, m)} />
        </div>
        <div style={{ fontSize: 10, color: D.muted, textAlign: "center", marginTop: 6 }}>rueda del ratón o ↑↓</div>
      </Popover>
    </>
  );
}

// ─── DatePicker ────────────────────────────────────────────────────────────────
//
// Calendario propio en vez del <input type="date">, que el WebView2 pinta con su
// tema claro y su icono gris — desentonaba con el resto. Este usa el acento del
// programa activo, como todo lo demás.
//
// Las fechas se construyen con parseDate/fmtDate (locales). Con `new Date(cadena)`
// se interpretarían en UTC y el día seleccionado saldría desplazado.
function DatePicker({ value, onChange }) {
  const [open, setOpen] = useState(false);
  const [vista, setVista] = useState(null);      // mes que se está viendo
  const campoRef = useRef(null);

  const sel = parseDate(value);
  const haySel = !Number.isNaN(sel.getTime());

  function alternar() {
    if (open) return setOpen(false);
    const base = haySel ? sel : new Date();
    setVista({ m: base.getMonth(), y: base.getFullYear() });
    setOpen(true);
  }

  const hoyStr = today();
  const { m, y } = vista || { m: 0, y: 2000 };
  const offset = (getFirstDay(y, m) + 6) % 7;          // la semana empieza en lunes
  const total  = getDaysInMonth(y, m);
  const mover  = d => { const [nm, ny] = shiftMonth(m, y, d); setVista({ m: nm, y: ny }); };
  const elegir = ds => { onChange(ds); setOpen(false); };

  const etiqueta = haySel
    ? `${sel.getDate()} ${MONTHS[sel.getMonth()].slice(0, 3).toLowerCase()} ${sel.getFullYear()}`
    : "Elegir fecha";

  const flecha = { background: "none", border: "1px solid " + D.border, borderRadius: 7, color: D.text, cursor: "pointer", padding: "2px 9px", fontSize: 13 };

  return (
    <>
      <CampoDesplegable campoRef={campoRef} texto={etiqueta} icono="📅"
        vacio={!haySel} abierto={open} onToggle={alternar} />
      <Popover anclaRef={campoRef} abierto={open} onClose={() => setOpen(false)} ancho={244} alto={290}>
        <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
          <button onClick={() => mover(-1)} style={flecha}>‹</button>
          <div style={{ flex: 1, textAlign: "center", fontSize: 13, fontWeight: 600 }}>{MONTHS[m]} {y}</div>
          <button onClick={() => mover(1)} style={flecha}>›</button>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2, marginBottom: 3 }}>
          {WDAYS.map((d, i) => (
            <div key={i} style={{ textAlign: "center", fontSize: 10, color: D.muted, fontWeight: 600 }}>{d}</div>
          ))}
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 2 }}>
          {Array(offset).fill(null).map((_, i) => <div key={"v" + i} />)}
          {Array(total).fill(null).map((_, i) => {
            const ds = fmtDate(new Date(y, m, i + 1));
            const esSel = haySel && ds === value;
            const esHoy = ds === hoyStr;
            return (
              <div key={ds} onClick={() => elegir(ds)}
                style={{
                  textAlign: "center", padding: "5px 0", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  background: esSel ? D.accent : "transparent",
                  color: esSel ? "#fff" : esHoy ? D.accent : D.text,
                  fontWeight: esSel || esHoy ? 600 : 400,
                  border: "1px solid " + (esHoy && !esSel ? D.accent + "88" : "transparent"),
                }}
                onMouseEnter={e => { if (!esSel) e.currentTarget.style.background = D.border + "88"; }}
                onMouseLeave={e => { if (!esSel) e.currentTarget.style.background = "transparent"; }}>
                {i + 1}
              </div>
            );
          })}
        </div>

        <button onClick={() => elegir(hoyStr)}
          style={{ marginTop: 8, width: "100%", padding: "6px 0", borderRadius: 7, border: "1px solid " + D.border, background: D.card, color: D.accent, fontSize: 12, cursor: "pointer" }}>
          Hoy
        </button>
      </Popover>
    </>
  );
}

// ─── RangoHoras ────────────────────────────────────────────────────────────────
//
// El campo `hour` de una tarea es un texto libre tipo "15:30-18:00", y es
// opcional. Se editan los dos extremos con la misma rueda del horario; si no hay
// hora se muestra un botón para añadirla, y una ✕ para volver a quitarla.
function RangoHoras({ value, onChange }) {
  const partes = String(value || "").split("-");
  const valido = /^\d{1,2}:\d{2}$/.test(partes[0] || "") && /^\d{1,2}:\d{2}$/.test(partes[1] || "");

  if (!valido) {
    // Si había algo escrito a mano que no es un rango ("mañana", "por la tarde"),
    // se enseña tal cual: al pulsar se sustituye, y así no desaparece sin verlo.
    const suelto = String(value || "").trim();
    return (
      <button onClick={() => onChange("09:00-10:00")} title={suelto ? "Se sustituirá por un rango de horas" : undefined}
        style={{ ...inp, textAlign: "left", cursor: "pointer", color: suelto ? D.amber : D.muted }}>
        {suelto ? `${suelto}  →  usar rango` : "+ Añadir hora"}
      </button>
    );
  }
  const [ini, fin] = partes;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
      <div style={{ flex: 1 }}><TimeWheel value={ini} onChange={v => onChange(`${v}-${fin}`)} /></div>
      <span style={{ color: D.muted, fontSize: 12 }}>–</span>
      <div style={{ flex: 1 }}><TimeWheel value={fin} onChange={v => onChange(`${ini}-${v}`)} /></div>
      <button onClick={() => onChange("")} title="Quitar la hora"
        style={{ background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 14, padding: "0 2px" }}>✕</button>
    </div>
  );
}

// ─── Modal ─────────────────────────────────────────────────────────────────────

function Modal({ onClose, children }) {
  useEffect(() => {
    const onKey = e => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 300, padding: 16 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: D.card, borderRadius: 16, padding: 28, width: "100%", maxWidth: 480, border: "1px solid " + D.border, boxSizing: "border-box", maxHeight: "90vh", overflowY: "auto" }}>
        {children}
      </div>
    </div>
  );
}

function Card({ children, style }) {
  return (
    <div style={{ background: D.card, border: "1px solid " + D.border, borderRadius: 12, padding: "16px 18px", ...(style || {}) }}>
      {children}
    </div>
  );
}

function StatCard({ label, value, color }) {
  return (
    <div style={{ background: D.card2, borderRadius: 10, padding: "14px 16px", textAlign: "center", border: "1px solid " + D.border }}>
      <div style={{ fontSize: 28, fontWeight: 600, color: color || D.text }}>{value}</div>
      <div style={{ fontSize: 12, color: D.muted, marginTop: 3 }}>{label}</div>
    </div>
  );
}

function NumInput({ value, onChange, min = 1, max = 180, label }) {
  const [draft, setDraft] = useState(String(value));
  useEffect(() => setDraft(String(value)), [value]);
  const commit = (v) => {
    const n = Math.max(min, Math.min(max, parseInt(String(v)) || min));
    setDraft(String(n)); onChange(n);
  };
  return (
    <div style={{ flex: 1 }}>
      {label && <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>{label}</div>}
      <div style={{ display: "flex", alignItems: "center", border: "1px solid " + D.border, borderRadius: 8, overflow: "hidden", background: D.card2 }}>
        <button onClick={() => commit(value - 1)} style={{ padding: "8px 12px", background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>−</button>
        <input type="text" inputMode="numeric" value={draft}
          onChange={e => setDraft(e.target.value)}
          onBlur={() => commit(draft)}
          onKeyDown={e => { if (e.key === "Enter") commit(draft); }}
          style={{ flex: 1, textAlign: "center", fontSize: 15, fontWeight: 500, color: D.text, background: "none", border: "none", outline: "none", width: 0, minWidth: 0, padding: "8px 4px" }} />
        <button onClick={() => commit(value + 1)} style={{ padding: "8px 12px", background: "none", border: "none", color: D.muted, cursor: "pointer", fontSize: 18, lineHeight: 1, flexShrink: 0 }}>+</button>
      </div>
    </div>
  );
}

// ─── TaskModal ─────────────────────────────────────────────────────────────────

function TaskModal({ editTaskId, taskForm, setTaskForm, activeSubjects, onSave, onClose }) {
  const tt = TASK_TYPES.find(t => t.key === taskForm.type) || TASK_TYPES[0];
  const gradeMode = taskForm.gradeMode || "pct";
  const subjOptions = [{ value: "", label: "Sin asignatura" }, ...activeSubjects.map(s => ({ value: s.id, label: s.name + (s.course ? " (" + s.course + ")" : "") }))];
  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: D.text }}>{editTaskId ? "Editar" : "Nueva actividad"}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Tipo</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {TASK_TYPES.map(t => (
              <button key={t.key} onClick={() => {
                const subj = activeSubjects.find(s => s.id === taskForm.subjectId);
                setTaskForm(f => ({ ...f, type: t.key, title: autoTitle(t.key, subj?.name) }));
              }} style={{ flex: "1 1 30%", padding: "7px 0", borderRadius: 8, border: "1px solid " + D.border, background: taskForm.type === t.key ? D.accent : D.card2, color: taskForm.type === t.key ? "#fff" : D.muted, fontSize: 12, cursor: "pointer", fontWeight: taskForm.type === t.key ? 500 : 400 }}>{t.label}</button>
            ))}
          </div>
        </div>
        <div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Asignatura</div>
          <CustomSelect
            value={taskForm.subjectId ?? ""}
            onChange={v => {
              const subj = activeSubjects.find(s => s.id === v);
              setTaskForm(f => ({ ...f, subjectId: v, title: autoTitle(f.type, subj?.name) }));
            }}
            options={subjOptions}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Título</div>
          <input value={taskForm.title} onChange={e => setTaskForm(f => ({ ...f, title: e.target.value }))} style={inp} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Prioridad</div>
            <CustomSelect
              value={taskForm.priority}
              onChange={v => setTaskForm(f => ({ ...f, priority: v }))}
              options={[{ value: "alta", label: "Alta" }, { value: "media", label: "Media" }, { value: "baja", label: "Baja" }]}
            />
          </div>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Estado</div>
            <CustomSelect
              value={taskForm.status}
              onChange={v => setTaskForm(f => ({ ...f, status: v }))}
              options={[{ value: "pendiente", label: "Pendiente" }, { value: "en progreso", label: "En progreso" }, { value: "completada", label: "Completada" }]}
            />
          </div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Fecha</div>
            <DatePicker value={taskForm.dueDate} onChange={v => setTaskForm(f => ({ ...f, dueDate: v }))} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Hora</div>
            <RangoHoras value={taskForm.hour} onChange={v => setTaskForm(f => ({ ...f, hour: v }))} />
          </div>
        </div>
        {tt.hasGrade && (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Modo de calificación</div>
              <div style={{ display: "flex", gap: 6 }}>
                {[["pct", "Porcentaje"], ["points", "Puntos extra"]].map(([m, label]) => (
                  <button key={m} onClick={() => setTaskForm(f => ({ ...f, gradeMode: m }))} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + D.border, background: gradeMode === m ? D.accent : D.card2, color: gradeMode === m ? "#fff" : D.muted, fontSize: 12, cursor: "pointer", fontWeight: gradeMode === m ? 500 : 400 }}>{label}</button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Nota (0–10)</div>
                <input type="number" min="0" max="10" step="0.1" placeholder="—" value={taskForm.grade ?? ""} onChange={e => setTaskForm(f => ({ ...f, grade: e.target.value }))} style={inp} />
              </div>
              {gradeMode === "points" ? (
                <div>
                  <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Puntos máx.</div>
                  <input type="number" min="0" max="10" step="0.1" placeholder="—" value={taskForm.pts ?? ""} onChange={e => setTaskForm(f => ({ ...f, pts: e.target.value }))} style={inp} />
                </div>
              ) : (
                <div>
                  <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Peso (%)</div>
                  <input type="number" min="0" max="100" placeholder="—" value={taskForm.pct ?? ""} onChange={e => setTaskForm(f => ({ ...f, pct: e.target.value }))} style={inp} />
                </div>
              )}
            </div>
            {gradeMode === "points" && (
              <div style={{ fontSize: 11, color: D.muted, padding: "6px 10px", borderRadius: 7, background: D.card2 }}>
                {taskForm.grade !== "" && taskForm.grade != null && taskForm.pts !== "" && taskForm.pts != null && !isNaN(Number(taskForm.grade)) && !isNaN(Number(taskForm.pts))
                  ? <>Suma a la nota final: <strong style={{ color: D.green }}>+{((Number(taskForm.grade) / 10) * Number(taskForm.pts)).toFixed(2)}</strong> (puntos máx. × nota/10)</>
                  : "Define la nota y los puntos máx. para ver cuánto suma."}
              </div>
            )}
          </div>
        )}
        {tt.hasGrade && taskForm.grade !== "" && taskForm.grade !== null && (
          <div style={{ fontSize: 13, padding: "8px 12px", borderRadius: 8, background: D.card2, color: gradeColor(Number(taskForm.grade)), textAlign: "center", fontWeight: 500 }}>
            {gradeLabel(Number(taskForm.grade))}
          </div>
        )}
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={{ ...btnBase, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
        <button onClick={onSave}  style={{ ...btnBase, border: "none", background: D.accent, color: "#fff", fontWeight: 500 }}>Guardar</button>
      </div>
    </Modal>
  );
}

// ─── SessionModal ──────────────────────────────────────────────────────────────

function SessionModal({ editSession, setEditSession, subjects, tasks, onSave, onClose }) {
  const subjTasks = useMemo(
    () => editSession?.subjectId ? pendingTasks(tasks, editSession.subjectId) : [],
    [tasks, editSession?.subjectId]
  );

  function handleSubjectChange(subjId) {
    const subj = subjects.find(s => s.id === subjId);
    const newTasks = pendingTasks(tasks, subjId);
    setEditSession(es => es ? ({
      ...es,
      subjectId: subjId,
      subjectName: subj?.name || "Sin asignatura",
      subjectColor: subj?.color || "#888",
      taskTitle: newTasks[0]?.title || null,
    }) : es);
  }

  if (!editSession) return null;

  const subjOptions = [...subjects].sort(bySubjectOrder).map(s => ({ value: s.id, label: s.name + (s.course ? " (" + s.course + ")" : "") }));
  const taskOptions = subjTasks.map(t => ({
    value: t.title,
    label: t.title + " · " + (daysUntil(t.dueDate) === 0 ? "Hoy" : daysUntil(t.dueDate) < 0 ? "Vencida" : daysUntil(t.dueDate) + "d"),
  }));

  return (
    <Modal onClose={onClose}>
      <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: D.text }}>Editar sesión</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Asignatura</div>
          <CustomSelect
            value={editSession.subjectId}
            onChange={handleSubjectChange}
            options={subjOptions}
          />
        </div>
        <div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Tarea</div>
          <CustomSelect
            value={editSession.taskTitle ?? taskOptions[0]?.value}
            onChange={v => setEditSession(es => es ? ({ ...es, taskTitle: v }) : es)}
            options={taskOptions}
            disabled={taskOptions.length === 0}
            disabledLabel="Sin tareas pendientes"
          />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Minutos</div>
            <NumInput value={editSession.minutes} onChange={v => setEditSession(es => es ? ({ ...es, minutes: v }) : es)} min={1} max={600} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Fecha</div>
            <DatePicker value={editSession.date || today()} onChange={v => setEditSession(es => es ? ({ ...es, date: v }) : es)} />
          </div>
        </div>
        <div style={{ fontSize: 12, color: D.muted, padding: "6px 10px", borderRadius: 7, background: D.card2 }}>
          Duración: <strong style={{ color: D.text }}>{fmtTime(editSession.minutes)}</strong>
        </div>
      </div>
      <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
        <button onClick={onClose} style={{ ...btnBase, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
        <button onClick={onSave}  style={{ ...btnBase, border: "none", background: D.accent, color: "#fff", fontWeight: 500 }}>Guardar</button>
      </div>
    </Modal>
  );
}

// ─── SubjectCard ───────────────────────────────────────────────────────────────

function SubjectCard({ subj, tasks, sessions, collapsed, onToggleCollapse, onNewTask, onEditTask, onEditSubj, onArchive, onApprove, onDelete }) {
  const subjTasks   = tasks.filter(t => t.subjectId === subj.id).sort(byDueDate);
  const totalMins   = sessions.filter(s => s.subjectId === subj.id).reduce((a, s) => a + s.minutes, 0);
  // El cálculo vive en logic.js. Antes se repetía aquí a mano y esa copia no
  // miraba `manualGrade`, así que esta tarjeta y la pestaña Notas enseñaban
  // números distintos de la misma asignatura. Basta con pasar [subj]: dentro
  // solo se usa para leer la nota manual de esta.
  const { finalGrade, baseGrade, bonus, totalPct, gradedTasks, pointsTasks } = calcGradeOf(tasks, [subj], subj.id);
  const gradedNoPct = subjTasks.filter(t => t.gradeMode !== "points" && t.grade !== null && (!t.pct || t.pct === 0));
  const ptsContribution = (t) => ((t.grade || 0) / 10) * (t.pts || 0);

  return (
    <div style={{ background: D.card, border: "1px solid " + D.border, borderRadius: 14, overflow: "hidden", marginBottom: 12 }}>
      <div style={{ background: D.card2, padding: "12px 18px", display: "flex", alignItems: "center", gap: 10, borderBottom: collapsed ? "none" : "1px solid " + D.border }}>
        <button onClick={onToggleCollapse} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: "2px 4px", flexShrink: 0, lineHeight: 1 }} title={collapsed ? "Expandir" : "Minimizar"}>
          {collapsed ? "▶" : "▼"}
        </button>
        <div style={{ width: 12, height: 12, borderRadius: "50%", background: subj.color, flexShrink: 0 }} />
        <span style={{ fontSize: 15, fontWeight: 600, flex: 1, cursor: "pointer" }} onClick={onToggleCollapse}>
          {subj.name}
          {subj.year    ? <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 7 }}>{subj.year}º</span> : null}
          {(() => {
            const sems = Array.isArray(subj.semester) ? subj.semester : (subj.semester ? [subj.semester] : []);
            if (subj.annual) return <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 4 }}>Anual</span>;
            if (sems.length === 0) return null;
            if (sems.length === 1) return <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 4 }}>C{sems[0]}</span>;
            return <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 4 }}>C{sems.join('+')}</span>;
          })()}
          {subj.credits  ? <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 4 }}>{subj.credits} ECTS</span> : null}
          {subj.course  ? <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, marginLeft: 7 }}>{subj.course}</span>   : null}
        </span>
        {finalGrade !== null && (
          <span style={{ fontSize: 13, fontWeight: 700, color: gradeColor(finalGrade), background: D.card, padding: "3px 10px", borderRadius: 20, border: "1px solid " + D.border }}>
            {fmtGradeFull(finalGrade)}{subjectMedal(finalGrade, subj.approved) ? " " + subjectMedal(finalGrade, subj.approved) : ""}
          </span>
        )}
        {collapsed && totalMins > 0 && (
          <span style={{ fontSize: 12, color: D.muted, padding: "3px 8px", borderRadius: 20, border: "1px solid " + D.border, background: D.card }}>
            ⏱ {fmtTime(totalMins)}
          </span>
        )}
        {collapsed && subjTasks.length > 0 && (
          <span style={{ fontSize: 12, color: D.muted }}>
            {subjTasks.filter(t => t.status !== "completada").length} pendiente{subjTasks.filter(t => t.status !== "completada").length !== 1 ? "s" : ""}
          </span>
        )}
        <button onClick={() => onNewTask(subj)} style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.accent, fontSize: 12, padding: "3px 10px", flexShrink: 0 }}>+ Tarea</button>
        <button onClick={() => onEditSubj(subj)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 14, padding: "2px 5px" }} title="Editar">✎</button>
        <button onClick={() => onApprove(subj.id)} style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.green, fontSize: 12, padding: "3px 8px", flexShrink: 0 }} title="Marcar como aprobada">✓</button>
        <button onClick={() => onArchive(subj.id)} style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.muted, fontSize: 12, padding: "3px 8px", flexShrink: 0 }} title="Archivar (ocultar)">📁</button>
        <button onClick={() => onDelete(subj.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 14, padding: "2px 5px" }} title="Eliminar">✕</button>
      </div>
      {!collapsed && (
      <div style={{ padding: "14px 18px" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: D.muted, marginBottom: 8 }}>Actividades</div>
            {subjTasks.length === 0 && <div style={{ fontSize: 12, color: D.muted, padding: "8px 0" }}>Sin actividades</div>}
            {subjTasks.map(t => {
              const days = daysUntil(t.dueDate);
              const tt   = TASK_TYPES.find(x => x.key === t.type);
              const taskMins = sessions.filter(s => s.subjectId === subj.id && s.taskTitle === t.title).reduce((a, s) => a + s.minutes, 0);
              return (
                <div key={t.id} onClick={() => onEditTask(t)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, background: D.card2, marginBottom: 5, cursor: "pointer", borderLeft: "3px solid " + subj.color }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", textDecoration: t.status === "completada" ? "line-through" : "none", color: t.status === "completada" ? D.muted : D.text }}>{t.title}</div>
                    <div style={{ fontSize: 11, color: D.muted, display: "flex", gap: 8, marginTop: 2 }}>
                      <span style={{ color: STATUS_COLOR[t.status] }}>{t.status}</span>
                      <span>{days < 0 ? "Vencida" : days === 0 ? "Hoy" : days + "d"}</span>
                      {t.hour && <span>{t.hour}</span>}
                    </div>
                  </div>
                  <div style={{ flexShrink: 0, textAlign: "right" }}>
                    <div style={{ display: "flex", gap: 4, justifyContent: "flex-end", alignItems: "center" }}>
                      <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: D.card, color: PRIORITY_COLOR[t.priority] || D.muted }}>{t.priority}</span>
                      <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: D.card, color: D.muted }}>{tt?.label}</span>
                      {taskMins > 0 && <span style={{ fontSize: 11, padding: "2px 6px", borderRadius: 5, background: D.card, color: D.accent }}>⏱ {fmtTime(taskMins)}</span>}
                    </div>
                    {t.grade !== null && <div style={{ fontSize: 12, fontWeight: 600, color: gradeColor(t.grade), marginTop: 2 }}>{fmtGradeFull(t.grade)}{t.gradeMode === "points" ? (t.pts ? " (+" + t.pts + " pts)" : "") : (t.pct ? " (" + t.pct + "%)" : "")}</div>}
                  </div>
                </div>
              );
            })}
          </div>
          <div>
            <div style={{ fontSize: 12, fontWeight: 500, color: D.muted, marginBottom: 8 }}>Calificación</div>
            {gradedTasks.length === 0 && gradedNoPct.length === 0 && pointsTasks.length === 0 && <div style={{ fontSize: 12, color: D.muted, padding: "8px 0" }}>Sin notas registradas</div>}
            {gradedTasks.length > 0 && (
              <>
                {gradedTasks.map(t => (
                  <div key={t.id} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                      <div style={{ height: 5, borderRadius: 3, background: D.border, overflow: "hidden", marginTop: 3 }}>
                        <div style={{ height: "100%", borderRadius: 3, background: subj.color, width: t.pct + "%" }} />
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: "right", fontSize: 12 }}>
                      <span style={{ fontWeight: 600, color: gradeColor(t.grade) }}>{t.grade}</span>
                      <span style={{ color: D.muted }}> · {t.pct}%</span>
                    </div>
                  </div>
                ))}
              </>
            )}
            {pointsTasks.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: D.muted, marginTop: gradedTasks.length > 0 ? 10 : 0, marginBottom: 6 }}>Puntos extra (suman a la nota):</div>
                {pointsTasks.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 12, marginBottom: 4, padding: "4px 8px", borderRadius: 6, background: D.card2 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.title}</span>
                    <span style={{ flexShrink: 0, marginLeft: 8 }}>
                      <span style={{ color: gradeColor(t.grade), fontWeight: 600 }}>{fmtGradeFull(t.grade)}</span>
                      <span style={{ color: D.green, fontWeight: 600 }}> → +{ptsContribution(t).toFixed(2)}</span>
                    </span>
                  </div>
                ))}
              </>
            )}
            {(baseGrade !== null || bonus > 0) && (
              <div style={{ borderTop: "1px solid " + D.border, paddingTop: 8, marginTop: 8 }}>
                {gradedTasks.length > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
                    <span style={{ color: D.muted }}>Peso total asignado:</span>
                    <span style={{ fontWeight: 500, color: totalPct < 100 ? D.amber : totalPct === 100 ? D.green : D.red }}>{totalPct}%</span>
                  </div>
                )}
                {baseGrade !== null && bonus > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                    <span style={{ color: D.muted }}>Nota base:</span>
                    <span style={{ fontWeight: 500, color: gradeColor(baseGrade) }}>{fmtGradeFull(baseGrade)}</span>
                  </div>
                )}
                {bonus > 0 && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginTop: 4 }}>
                    <span style={{ color: D.muted }}>Puntos extra:</span>
                    <span style={{ fontWeight: 500, color: D.green }}>+{bonus.toFixed(2)}</span>
                  </div>
                )}
                {finalGrade !== null && (
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, marginTop: 4 }}>
                    <span style={{ fontWeight: 600 }}>Nota final:</span>
                    <span style={{ fontWeight: 700, color: gradeColor(finalGrade) }}>{fmtGradeFull(finalGrade)} — {gradeLabel(finalGrade)}{subjectMedal(finalGrade, subj.approved) ? " " + subjectMedal(finalGrade, subj.approved) : ""}</span>
                  </div>
                )}
                {gradedTasks.length > 0 && totalPct < 100 && totalPct > 0 && <div style={{ fontSize: 11, color: D.amber, marginTop: 4 }}>⚠ Falta {100 - totalPct}% por asignar</div>}
              </div>
            )}
            {gradedNoPct.length > 0 && (
              <>
                <div style={{ fontSize: 11, color: D.muted, marginTop: (gradedTasks.length > 0 || pointsTasks.length > 0) ? 10 : 0, marginBottom: 6 }}>Sin peso asignado:</div>
                {gradedNoPct.map(t => (
                  <div key={t.id} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4, padding: "4px 8px", borderRadius: 6, background: D.card2 }}>
                    <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>{t.title}</span>
                    <span style={{ fontWeight: 600, color: gradeColor(t.grade), flexShrink: 0, marginLeft: 8 }}>{fmtGradeFull(t.grade)}</span>
                  </div>
                ))}
              </>
            )}
            <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid " + D.border }}>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Tiempo de estudio</div>
              <div style={{ fontSize: 20, fontWeight: 600, color: subj.color }}>{fmtTime(totalMins)}</div>
            </div>
          </div>
        </div>
      </div>
      )}
    </div>
  );
}

// ─── MonthGrid (rejilla de un mes para el calendario) ───────────────────────────

function MonthGrid({ year, month, tasks, subjects, todayStr, onEditTask, onAddReminder }) {
  const firstOffset = (getFirstDay(year, month) + 6) % 7;
  const daysIn = getDaysInMonth(year, month);
  return (
    <div style={{ flex: 1, minWidth: 280 }}>
      <div style={{ textAlign: "center", fontWeight: 600, fontSize: 15, marginBottom: 10 }}>{MONTHS[month]} {year}</div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3, marginBottom: 5 }}>
        {WDAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 11, color: D.muted, fontWeight: 500, padding: "4px 0" }}>{d}</div>)}
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(7,1fr)", gap: 3 }}>
        {Array(firstOffset).fill(null).map((_, i) => <div key={"e" + i} />)}
        {Array(daysIn).fill(null).map((_, i) => {
          const day = i + 1;
          const ds = year + "-" + pad(month + 1) + "-" + pad(day);
          const dayTasks = tasks.filter(t => t.dueDate === ds);
          const isToday = ds === todayStr;
          return (
            <div key={day} style={{ minHeight: 64, padding: 4, borderRadius: 8, background: isToday ? D.accent + "22" : D.card2, border: isToday ? "2px solid " + D.accent : "1px solid " + D.border }}>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 3 }}>
                <span style={{ fontSize: 11, fontWeight: isToday ? 600 : 400, color: isToday ? D.accent : D.text }}>{day}</span>
                <button onClick={() => onAddReminder(ds)} title="Nuevo recordatorio"
                  style={{ marginLeft: "auto", background: "none", border: "none", padding: "0 2px", cursor: "pointer", color: D.muted, fontSize: 12, lineHeight: 1, opacity: 0.45 }}>＋</button>
              </div>
              {dayTasks.map(t => {
                const subj = subjects.find(s => s.id === t.subjectId);
                return <div key={t.id} onClick={() => onEditTask(t)} title={t.hour || ""} style={{ fontSize: 9, padding: "2px 4px", borderRadius: 4, background: subj?.color || "#888", color: "#fff", marginBottom: 2, overflow: "hidden", whiteSpace: "nowrap", textOverflow: "ellipsis", cursor: "pointer", opacity: t.status === "completada" ? 0.5 : 1 }}>{t.title}</div>;
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── SessionTimeline ────────────────────────────────────────────────────────────

function SessionTimeline({ sessions, subjects, fmtTime, showEmptyDays, onEditSession, onDeleteSession, onAddSession }) {
  const [expandedDay, setExpandedDay] = useState(null);
  const [tooltip, setTooltip]       = useState(null); // { mouseX, mouseY, day, list, total }
  const [hoveredDay, setHoveredDay] = useState(null);
  const scrollRef  = useRef(null);
  const wrapRef    = useRef(null);

  const liveColor = useCallback((subjectId, fallback) => {
    return subjects.find(s => s.id === subjectId)?.color || fallback;
  }, [subjects]);

  const byDate = useMemo(() => {
    const map = {};
    sessions.forEach(s => {
      if (!map[s.date]) map[s.date] = [];
      map[s.date].push(s);
    });
    return map;
  }, [sessions]);

  // Rellenar los huecos entre el primer y el último día con sesión.
  //
  // Con tope: el campo de fecha deja teclear el año 9999, y un solo registro con
  // esa fecha generaba casi tres millones de días y un <svg> de 96 millones de px
  // que colgaba la ventana. Pasado el límite se muestran solo los días con datos,
  // que es justo lo que se ve con la opción desactivada.
  const MAX_DIAS = 1500;   // ~4 años
  const allDays = useMemo(() => {
    const days = Object.keys(byDate).sort();
    if (!showEmptyDays || days.length < 2) return days;
    const fin = parseDate(days[days.length - 1]);
    const full = [];
    for (let d = parseDate(days[0]); d <= fin && full.length < MAX_DIAS; d.setDate(d.getDate() + 1)) {
      full.push(fmtDate(d));
    }
    return full.length >= MAX_DIAS ? days : full;
  }, [byDate, showEmptyDays]);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollLeft = scrollRef.current.scrollWidth;
  }, [sessions.length]);

  if (allDays.length === 0) {
    return (
      <div style={{ padding: "22px 0", textAlign: "center", color: D.muted, fontSize: 13 }}>
        Completa tu primera sesión de estudio para ver la línea de tiempo
      </div>
    );
  }

  const maxMins = Math.max(...allDays.map(d => (byDate[d] || []).reduce((a, s) => a + s.minutes, 0)));
  const BAR_W   = 28;
  const BAR_GAP = 5;
  const H       = 100;

  const monthLabels = [];
  allDays.forEach((d, i) => {
    const m = d.slice(0, 7);
    if (i === 0 || allDays[i - 1].slice(0, 7) !== m) {
      monthLabels.push({ index: i, label: ["Ene","Feb","Mar","Abr","May","Jun","Jul","Ago","Sep","Oct","Nov","Dic"][Number(d.slice(5, 7)) - 1] + " " + d.slice(2, 4) });
    }
  });

  return (
    <div ref={wrapRef} style={{ position: "relative" }}>
      {/* Tooltip fixed — flota sobre todo, no mueve nada */}
      {tooltip && (
        <div style={{
          position: "fixed",
          left: tooltip.mouseX + 166 > window.innerWidth ? tooltip.mouseX - 166 : tooltip.mouseX + 14,
          top:  tooltip.mouseY - 10,
          width: 152,
          zIndex: 9999,
          background: D.card,
          border: "1px solid " + D.border,
          borderRadius: 8,
          padding: "8px 10px",
          pointerEvents: "none",
          boxShadow: "0 4px 18px #0008",
        }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: D.muted, fontWeight: 500 }}>{tooltip.day}</span>
            <span style={{ fontSize: 11, color: D.accent, fontWeight: 600 }}>{fmtTime(tooltip.total)}</span>
          </div>
          {tooltip.list.map((s, i) => (
            <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: i < tooltip.list.length - 1 ? 4 : 0 }}>
              <div style={{ width: 8, height: 8, borderRadius: "50%", background: liveColor(s.subjectId, s.color), flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: D.text, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
              <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{fmtTime(s.minutes)}</span>
            </div>
          ))}
        </div>
      )}

      <div
        ref={scrollRef}
        onWheel={e => { e.preventDefault(); scrollRef.current.scrollLeft += e.deltaY; }}
        style={{ overflowX: "auto", paddingBottom: 6, cursor: "default" }}
      >
        <svg
          width={allDays.length * (BAR_W + BAR_GAP)}
          height={H + 38}
          style={{ display: "block", overflow: "visible" }}
        >
          <line x1={0} y1={H + 2} x2={allDays.length * (BAR_W + BAR_GAP)} y2={H + 2} stroke={D.border} strokeWidth={1} />

          {monthLabels.map(({ index, label }) => (
            <g key={label + index}>
              <line x1={index * (BAR_W + BAR_GAP)} y1={0} x2={index * (BAR_W + BAR_GAP)} y2={H + 2} stroke={D.border} strokeWidth={1} strokeDasharray="3,3" />
              <text x={index * (BAR_W + BAR_GAP) + 3} y={H + 16} fontSize={9} fill={D.muted} fontFamily="sans-serif">{label}</text>
            </g>
          ))}

          {allDays.map((d, i) => {
            const daySessions = byDate[d] || [];
            const totalMins   = daySessions.reduce((a, s) => a + s.minutes, 0);
            const barH        = Math.max(4, Math.round((totalMins / maxMins) * H));
            const x           = i * (BAR_W + BAR_GAP);
            const isToday     = d === today();
            const isHovered   = hoveredDay === d;

            const bySubj = {};
            daySessions.forEach(s => {
              if (!bySubj[s.subjectId]) bySubj[s.subjectId] = { subjectId: s.subjectId, color: liveColor(s.subjectId, s.subjectColor), name: s.subjectName, minutes: 0 };
              bySubj[s.subjectId].minutes += s.minutes;
            });
            const subjList = Object.values(bySubj);

            let yOffset = H + 2 - barH;
            const segments = subjList.map(subj => {
              const h = Math.max(2, Math.round((subj.minutes / totalMins) * barH));
              const seg = { ...subj, y: yOffset, h };
              yOffset += h;
              return seg;
            });

            return (
              <g
                key={d}
                onMouseEnter={e => { setHoveredDay(d); setTooltip({ mouseX: e.clientX, mouseY: e.clientY, day: d, list: subjList, total: totalMins }); }}
                onMouseMove={e  => setTooltip(t => t ? { ...t, mouseX: e.clientX, mouseY: e.clientY } : t)}
                onMouseLeave={() => { setHoveredDay(null); setTooltip(null); }}
                onClick={() => setExpandedDay(prev => prev === d ? null : d)}
                style={{ cursor: "pointer" }}
              >
                <rect x={x} y={0} width={BAR_W} height={H + 2} fill="transparent" />
                {segments.map((seg, si) => {
                  const isFirst = si === 0;
                  const isLast  = si === segments.length - 1;
                  const r = 4;
                  const x1 = x + 1, x2 = x + BAR_W - 1;
                  const y1 = seg.y, y2 = seg.y + seg.h;
                  // Construye path con esquinas redondeadas solo donde corresponde
                  const tl = isFirst ? r : 0, tr = isFirst ? r : 0; // top-left, top-right
                  const bl = isLast  ? r : 0, br = isLast  ? r : 0; // bottom-left, bottom-right
                  const d = [
                    `M ${x1 + tl} ${y1}`,
                    `H ${x2 - tr}`, tr ? `Q ${x2} ${y1} ${x2} ${y1 + tr}` : "",
                    `V ${y2 - br}`, br ? `Q ${x2} ${y2} ${x2 - br} ${y2}` : "",
                    `H ${x1 + bl}`, bl ? `Q ${x1} ${y2} ${x1} ${y2 - bl}` : "",
                    `V ${y1 + tl}`, tl ? `Q ${x1} ${y1} ${x1 + tl} ${y1}` : "",
                    "Z"
                  ].filter(Boolean).join(" ");
                  return (
                    <path key={si} d={d} fill={seg.color}
                      opacity={isHovered ? 1 : 0.82}
                      style={{ transition: "opacity 0.15s" }}
                    />
                  );
                })}
                {isToday && <rect x={x + 1} y={H + 4} width={BAR_W - 2} height={3} rx={1.5} fill={D.accent} />}
              </g>
            );
          })}
        </svg>
      </div>

      {expandedDay && (
        <>
          <div onClick={() => setExpandedDay(null)} style={{ position: "fixed", inset: 0, zIndex: 200, background: "#000a" }} />
          <div style={{ position: "fixed", zIndex: 201, left: "50%", top: "50%", transform: "translate(-50%,-50%)", width: 320, maxHeight: "70vh", overflowY: "auto", padding: "14px 16px", borderRadius: 12, background: D.card, border: "1px solid " + D.border, boxShadow: "0 12px 32px #000a" }}>
            <div style={{ display: "flex", alignItems: "center", marginBottom: 8 }}>
              <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{expandedDay}</span>
              <button onClick={() => onAddSession(expandedDay)} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, border: "1px solid " + D.border, background: D.card2, color: D.accent, cursor: "pointer" }}>＋ Añadir</button>
              <button onClick={() => setExpandedDay(null)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 15, padding: "2px 8px" }}>✕</button>
            </div>
            {(byDate[expandedDay] || []).length === 0 && <div style={{ fontSize: 12, color: D.muted, padding: "6px 0" }}>Sin sesiones este día</div>}
            {(byDate[expandedDay] || []).map(s => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 4px", borderBottom: "1px solid " + D.border }}>
                <div style={{ width: 8, height: 8, borderRadius: "50%", background: liveColor(s.subjectId, s.color), flexShrink: 0 }} />
                <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.subjectName}</span>
                <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{fmtTime(s.minutes)}</span>
                <button onClick={() => onEditSession(s)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: "2px 4px" }}>✎</button>
                <button onClick={() => window.confirm("¿Borrar esta sesión?") && onDeleteSession(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 12, padding: "2px 4px" }}>✕</button>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}


// ─── App principal ─────────────────────────────────────────────────────────────


// Carga el backup v2 o migra el v1 al vuelo
function loadAppState() {
  // Intenta leer formato v2
  const raw = localStorage.getItem("lixt_v2");
  if (raw) {
    try { return migrateIdsToString(JSON.parse(raw)); } catch {}
  }
  // Migra desde v1 si existe
  const subjectsV1 = ls("lixt_subjects", null);
  if (subjectsV1) {
    const CAREER_ID = "prog_career";
    const state = migrateIdsToString({
      activeProgram: CAREER_ID,
      programs: [
        { id: CAREER_ID, name: "Mi Carrera", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" }
      ],
      programData: {
        [CAREER_ID]: {
          subjects:  subjectsV1.map(s => ({ ...s, programId: CAREER_ID })),
          tasks:     (ls("lixt_tasks",    []) || []).map(t => ({ ...t, programId: CAREER_ID })),
          sessions:  (ls("lixt_sessions", []) || []).map(s => ({ ...s, programId: CAREER_ID })),
        }
      },
      durations:    ls("lixt_dur",        { work: 25, short: 5, long: 15 }),
      longEvery:    ls("lixt_longEvery",  4),
    });
    localStorage.setItem("lixt_v2", JSON.stringify(state));
    return state;
  }
  // Estado vacío por defecto → muestra onboarding
  return null;
}


// ─── ErrorBoundary ──────────────────────────────────────────────────────────────
// Si algo falla al renderizar, muestra un mensaje recuperable en vez de pantalla
// en negro. Los datos en localStorage quedan intactos.
class ErrorBoundary extends React.Component {
  constructor(props) { super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error) { return { error }; }
  render() {
    if (this.state.error) {
      return (
        <div style={{ height: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 14, background: "#0a0c12", color: "#e8eaf2", fontFamily: "system-ui, sans-serif", padding: 24, textAlign: "center" }}>
          <div style={{ fontSize: 40 }}>⚠️</div>
          <div style={{ fontSize: 17, fontWeight: 600 }}>Algo ha fallado al mostrar la app</div>
          <div style={{ fontSize: 13, color: "#6b7194", maxWidth: 420 }}>Tus datos están a salvo en el almacenamiento local. Reinicia la app; si el problema persiste, exporta un backup desde Ajustes en cuanto puedas.</div>
          <pre style={{ fontSize: 11, color: "#E24B4A", maxWidth: 480, whiteSpace: "pre-wrap", background: "#141824", padding: 12, borderRadius: 8 }}>{String(this.state.error?.message || this.state.error)}</pre>
          <button onClick={() => this.setState({ error: null })} style={{ padding: "9px 20px", borderRadius: 8, border: "none", background: "#378ADD", color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Reintentar</button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  return <ErrorBoundary><LixtApp /></ErrorBoundary>;
}


// ─── Onboarding ────────────────────────────────────────────────────────────────
//
// Componente propio, no un `return` temprano dentro de la app. Un return antes de
// los hooks hace que en ese render solo se ejecuten algunos: al terminar el
// onboarding React se encontraba de golpe con setenta hooks que antes no
// estaban ("rendered more hooks than during the previous render") y la app se
// caía en el primer arranque. Lo probable es que nunca lo vieras porque solo pasa
// sin datos guardados.
function Onboarding({ onFinish }) {
  const [onboardForm, setOnboardForm] = useState({ name: "", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" });

  function finishOnboarding() {
    if (!onboardForm.name.trim()) return;
    const id = "prog_" + newId();
    const newState = {
      activeProgram: id,
      programs: [{ id, name: onboardForm.name, type: onboardForm.type, years: onboardForm.years, semestersPerYear: onboardForm.semestersPerYear, color: onboardForm.color }],
      programData: { [id]: { subjects: [], tasks: [], sessions: [] } },
      durations: { work: 25, short: 5, long: 15 }, longEvery: 4,
    };
    localStorage.setItem("lixt_v2", JSON.stringify(newState));
    onFinish(newState);
  }

  return (
    <div style={FULLSCREEN}>
      <div style={{ background: D.card, border: "1px solid " + D.border, borderRadius: 18, padding: "40px 48px", width: 480, maxWidth: "90vw" }}>
        <div style={{ fontSize: 28, fontWeight: 700, letterSpacing: -1, marginBottom: 6 }}>
          Lix<span style={{ color: D.accent }}>T</span>
        </div>
        <div style={{ fontSize: 14, color: D.muted, marginBottom: 32 }}>Configura tu primer programa de estudio</div>

        <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Nombre del programa</div>
            <input autoFocus placeholder="Ej: Ingeniería Aeronáutica, Máster en IA…" value={onboardForm.name} onChange={e => setOnboardForm(f => ({ ...f, name: e.target.value }))} onKeyDown={e => e.key === "Enter" && finishOnboarding()} style={{ ...inp, fontSize: 14, padding: "10px 14px" }} />
          </div>

          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Tipo</div>
            <div style={{ display: "flex", gap: 8 }}>
              {[["career","🎓 Grado"],["master","📘 Máster"]].map(([v, label]) => (
                <button key={v} onClick={() => setOnboardForm(f => ({ ...f, type: v, years: v === "master" ? 2 : 4 }))}
                  style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid " + (onboardForm.type === v ? D.accent : D.border), background: onboardForm.type === v ? D.accent + "22" : D.card2, color: onboardForm.type === v ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: onboardForm.type === v ? 600 : 400 }}>{label}</button>
              ))}
            </div>
          </div>

          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Número de años</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1,2,3,4,5,6].map(y => (
                  <button key={y} onClick={() => setOnboardForm(f => ({ ...f, years: y }))}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "1px solid " + (onboardForm.years === y ? D.accent : D.border), background: onboardForm.years === y ? D.accent + "22" : D.card2, color: onboardForm.years === y ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: onboardForm.years === y ? 600 : 400 }}>{y}</button>
                ))}
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Cuatrimestres / año</div>
              <div style={{ display: "flex", gap: 4 }}>
                {[1,2,3,4].map(s => (
                  <button key={s} onClick={() => setOnboardForm(f => ({ ...f, semestersPerYear: s }))}
                    style={{ flex: 1, padding: "8px 0", borderRadius: 7, border: "1px solid " + (onboardForm.semestersPerYear === s ? D.accent : D.border), background: onboardForm.semestersPerYear === s ? D.accent + "22" : D.card2, color: onboardForm.semestersPerYear === s ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: onboardForm.semestersPerYear === s ? 600 : 400 }}>{s}</button>
                ))}
              </div>
            </div>
          </div>

          <div>
            <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Color del programa</div>
            <div style={{ display: "flex", gap: 7, flexWrap: "wrap" }}>
              {COLORS.map(c => <div key={c} onClick={() => setOnboardForm(f => ({ ...f, color: c }))} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: onboardForm.color === c ? "3px solid " + D.text : "3px solid transparent" }} />)}
            </div>
          </div>

          <button disabled={!onboardForm.name.trim()} onClick={finishOnboarding}
            style={{ marginTop: 8, padding: "13px 0", borderRadius: 10, border: "none", background: onboardForm.name.trim() ? D.accent : D.card2, color: onboardForm.name.trim() ? "#fff" : D.muted, fontSize: 15, fontWeight: 600, cursor: onboardForm.name.trim() ? "pointer" : "not-allowed" }}>
            Empezar →
          </button>
        </div>
      </div>
    </div>
  );
}


// Caparazón: sin datos guardados, onboarding; con ellos, la app. Todo lo demás
// vive en LixtMain para que sus hooks se ejecuten SIEMPRE todos. Aquí arriba solo
// hay uno y va antes de cualquier return, así que estos sí son seguros.
function LixtApp() {
  const [appState, setAppState] = useState(() => loadAppState() || null);
  if (!appState) return <Onboarding onFinish={setAppState} />;
  return <LixtMain appState={appState} setAppState={setAppState} />;
}

function LixtMain({ appState, setAppState }) {
  // ── Estado maestro ─────────────────────────────────────────────────────────

  // ── Extraemos los datos del programa activo ─────────────────────────────────
  const activeProgramId = appState?.activeProgram;
  // Los programas borrados se ocultan igual que el resto de registros. Sin el
  // `alive()` un programa marcado como borrado seguiría saliendo en la lista.
  const programs        = alive(appState?.programs);
  const activeProgram   = programs.find(p => p.id === activeProgramId);
  const programData     = appState?.programData || {};
  const activePData     = programData[activeProgramId] || { subjects: [], tasks: [], sessions: [] };

  // Helpers para mutar el estado del programa activo
  const setSubjects = useCallback(fn => setAppState(prev => {
    const cur = prev.programData[prev.activeProgram] || {};
    const next = typeof fn === "function" ? fn(cur.subjects || []) : fn;
    return { ...prev, programData: { ...prev.programData, [prev.activeProgram]: { ...cur, subjects: next } } };
  }), []);
  const setTasks    = useCallback(fn => setAppState(prev => {
    const cur = prev.programData[prev.activeProgram] || {};
    const next = typeof fn === "function" ? fn(cur.tasks || []) : fn;
    return { ...prev, programData: { ...prev.programData, [prev.activeProgram]: { ...cur, tasks: next } } };
  }), []);
  const setSessions = useCallback(fn => setAppState(prev => {
    const cur = prev.programData[prev.activeProgram] || {};
    const next = typeof fn === "function" ? fn(cur.sessions || []) : fn;
    return { ...prev, programData: { ...prev.programData, [prev.activeProgram]: { ...cur, sessions: next } } };
  }), []);
  const setSchedule = useCallback(fn => setAppState(prev => {
    const cur = prev.programData[prev.activeProgram] || {};
    const next = typeof fn === "function" ? fn(cur.schedule || []) : fn;
    return { ...prev, programData: { ...prev.programData, [prev.activeProgram]: { ...cur, schedule: next } } };
  }), []);

  // Las vistas nunca ven registros borrados: se filtran aquí, en un único punto.
  // Los setters siguen operando sobre el array completo (con los borrados dentro).
  const subjects = useMemo(() => alive(activePData.subjects), [activePData.subjects]);
  const tasks    = useMemo(() => alive(activePData.tasks),    [activePData.tasks]);
  const sessions = useMemo(() => alive(activePData.sessions), [activePData.sessions]);
  const schedule = useMemo(() => alive(activePData.schedule), [activePData.schedule]);
  const cycle    = sessions.length;

  const [durations,  setDurations]  = useState(() => appState?.durations  || { work: 25, short: 5, long: 15 });
  const [longEvery,  setLongEvery]  = useState(() => appState?.longEvery  || 4);
  const [workCount,  setWorkCount]  = useState(() => ls("lixt_workcount",    0));
  const [timeLeft,   setTimeLeft]   = useState(() => (appState?.durations?.work || 25) * 60);

  const [selSubject, setSelSubject] = useState(() => {
    const subs = activePData.subjects || DEFAULT_SUBJECTS;
    const lastId = ls("lixt_lastsubject", null);
    return (lastId && subs.find(s => s.id === lastId && !s.archived && !s.approved)) ? lastId : (subs.find(s => !s.archived && !s.approved)?.id ?? null);
  });

  const [selTask, setSelTask] = useState(() => {
    const subs = activePData.subjects || DEFAULT_SUBJECTS;
    const tks  = activePData.tasks    || DEFAULT_TASKS;
    const lastSubjId = ls("lixt_lastsubject", null);
    const subjId = (lastSubjId && subs.find(s => s.id === lastSubjId && !s.archived && !s.approved)) ? lastSubjId : subs.find(s => !s.archived && !s.approved)?.id;
    const savedTask  = ls("lixt_lasttask", null);
    const validSaved = tks.find(t => t.id === savedTask && t.subjectId === subjId && t.status !== "completada");
    return validSaved?.id ?? tks.find(t => t.subjectId === subjId && t.status !== "completada")?.id ?? null;
  });

  const [tab,     setTab]     = useState("timer");
  const [mode,    setMode]    = useState("work");
  const [running, setRunning] = useState(false);

  const [calMonth, setCalMonth] = useState(new Date().getMonth());
  const [calYear,  setCalYear]  = useState(new Date().getFullYear());

  const [filterSubj,    setFilterSubj]    = useState("all");
  const [filterStatus,  setFilterStatus]  = useState("all");
  const [filterTaskCourse, setFilterTaskCourse] = useState(() => ls("lixt_tasks_course", null)); // null = todos
  // Siempre se entra en el curso académico actual. El periodo elegido NO se
  // recuerda entre sesiones a propósito: lo normal es querer ver el curso en
  // marcha, no el "Global" que dejaste puesto una vez.
  const [statsPeriod,   setStatsPeriod]   = useState(() => "course_" + academicCourseOf(today()));
  const [historyDate,   setHistoryDate]   = useState(today());
  const [showArchived,  setShowArchived]  = useState(false);
  const [showApproved,  setShowApproved]  = useState(false);
  const [scheduleForm,  setScheduleForm]  = useState({ day: "Lu", start: "09:00", end: "10:00", subjectId: "" });
  const [editSlot,      setEditSlot]      = useState(null); // slot del horario en edición
  const [now,           setNow]           = useState(() => new Date()); // para resaltar la clase en curso
  // ── Cuenta (Supabase) ───────────────────────────────────────────────────────
  // La app funciona igual sin cuenta: el login solo es el paso previo a poder
  // sincronizar con el móvil. Nada obligatorio todavía.
  const [session,    setSession]    = useState(null);
  const [authForm,   setAuthForm]   = useState({ email: "", password: "" });
  const [authMode,   setAuthMode]   = useState("signin"); // signin | signup
  const [authError,  setAuthError]  = useState("");
  const [authInfo,   setAuthInfo]   = useState("");
  const [authBusy,   setAuthBusy]   = useState(false);
  // La sesión de Supabase se recupera de forma asíncrona: hasta que termina no se
  // sabe si hay que mostrar el login o la app, y sin esto asomaría el login un
  // instante aunque sí hubiera sesión guardada.
  const [authChecked, setAuthChecked] = useState(false);
  // La sesión suele recuperarse en milisegundos, así que sin un tiempo mínimo la
  // pantalla de carga aparecería y desaparecería sin llegar a verse.
  const [splashDone,  setSplashDone]  = useState(false);
  const [skipAuth,    setSkipAuth]    = useState(() => ls("lixt_skip_auth", false));
  const syncingRef = useRef(false);   // evita dos sincronizaciones a la vez
  const [syncBusy,   setSyncBusy]   = useState(false);
  const [syncMsg,    setSyncMsg]    = useState("");
  const [syncErr,    setSyncErr]    = useState("");
  const [lastSync,   setLastSync]   = useState(() => ls("lixt_last_sync", null));
  const [autoSync,   setAutoSync]   = useState(() => ls("lixt_auto_sync", true));
  // Por defecto, el curso actual solo si tiene clases; si no, el más reciente que
  // sí las tenga. Si no, el horario aparecería vacío al abrirlo (por ejemplo en
  // verano, cuando el curso académico "actual" aún no ha empezado).
  const [scheduleCourse, setScheduleCourse] = useState(() => ls("lixt_schedule_course", null));
  // Rango de la rejilla del horario. Solo se amplía si hay clases fuera de él.
  const [scheduleAuto,  setScheduleAuto]  = useState(() => ls("lixt_schedule_auto", true));
  const [scheduleStart, setScheduleStart] = useState(() => ls("lixt_schedule_start", "08:30"));
  const [scheduleEnd,   setScheduleEnd]   = useState(() => ls("lixt_schedule_end",   "14:30"));
  // Curso que se ve en la línea de tiempo de sesiones ("all" = todos)
  // Como en Stats: se recuerda "all", pero un curso guardado que ya no es el
  // actual se descarta para que al empezar curso nuevo salga el que estás haciendo.
  const [timelineCourse, setTimelineCourse] = useState(() => {
    const actual = academicCourseOf(today());
    const guardado = ls("lixt_timeline_course", null);
    return guardado === "all" || guardado === actual ? guardado : actual;
  });
  const [calendarView,  setCalendarView]  = useState(() => ls("lixt_calview", "dual"));
  const [collapsedSubjects, setCollapsedSubjects] = useState(() => new Set(ls("lixt_collapsed", [])));
  const [selGradeSubj,  setSelGradeSubj]  = useState(null);
  const [chartTip,      setChartTip]      = useState(null); // { x, y, name, grade } tooltip de la gráfica nota/créditos
  const gradesRef   = useRef(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [filterSubjYear,   setFilterSubjYear]   = useState(null);
  const [filterSubjStatus, setFilterSubjStatus] = useState("active");

  // ── Configuración de personalización ─────────────────────────────────────────
  const [bgTheme,      setBgTheme]      = useState(() => ls("lixt_bg_theme",   "dark"));
  const [timerSound,   setTimerSound]   = useState(() => ls("lixt_timer_sound", true));
  const [timerNotif,   setTimerNotif]   = useState(() => ls("lixt_timer_notif", true));
  const [passingGrade, setPassingGrade] = useState(() => ls("lixt_pass_grade",  5));
  const [gradeScale,   setGradeScale]   = useState(() => ls("lixt_grade_scale", "es")); // "es" 0–10 · "se" A–F sueca
  const [gradeIcons,   setGradeIcons]   = useState(() => ls("lixt_grade_icons", true)); // iconos 😈🥉🥇 junto a las notas
  const [examCount,    setExamCount]    = useState(() => ls("lixt_exam_count", 7)); // exámenes en sidebar
  const [showEmptyDays, setShowEmptyDays] = useState(() => ls("lixt_empty_days", false)); // días vacíos en timeline
  const [navOrder,     setNavOrder]     = useState(() => ls("lixt_nav_order", NAV.map(n => n.k)));
  // ── Copia de seguridad automática al cerrar ─────────────────────────────────
  // Sin carpeta elegida no hace nada. Los hooks van AQUÍ, por encima de los
  // `return` condicionales de más abajo (onboarding y `!appState`): un hook
  // después de un return solo se ejecuta en algunos renders, y React revienta
  // en cuanto el número de hooks cambia entre uno y otro.
  const [backupDir,    setBackupDir]    = useState(() => ls("lixt_backup_dir", null));
  const [backupMsg,    setBackupMsg]    = useState("");

  // El nombre lleva fecha y hora, así que ordenar por nombre es ordenar por
  // antigüedad — de eso se aprovecha la rotación del lado Rust.
  const BACKUPS_A_CONSERVAR = 10;

  const datosParaBackup = useCallback(() => JSON.stringify(
    { ...appState, durations, longEvery, version: 2 }, null, 2
  ), [appState, durations, longEvery]);

  const hacerBackup = useCallback(async (dir = backupDir) => {
    if (!dir) return null;
    const d = new Date();
    const nombre = `lixt-backup-${fmtDate(d)}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
    return invoke("guardar_backup", {
      carpeta: dir, nombre, contenido: datosParaBackup(), conservar: BACKUPS_A_CONSERVAR,
    });
  }, [backupDir, datosParaBackup]);

  // `hacerBackup` cambia con cada dato que tocas (depende de appState). Se guarda
  // en una ref para que el efecto de abajo dependa SOLO de la carpeta: si no, se
  // da de baja y de alta el listener del cierre en cada pulsación.
  const hacerBackupRef = useRef(hacerBackup);
  useEffect(() => { hacerBackupRef.current = hacerBackup; }, [hacerBackup]);

  // Al cerrar la ventana se intercepta el cierre, se escribe la copia y se cierra
  // a mano.
  //
  // Tres seguros, porque quedarse sin poder cerrar la app es peor que perder una
  // copia (la siguiente la recupera):
  //   1. Tope de 3 s, por si la carpeta está en un disco de red desconectado.
  //   2. `destroy()` puede fallar si falta el permiso `core:window:allow-destroy`
  //      en capabilities. Antes ese fallo iba en una promesa sin catch y la
  //      ventana se quedaba abierta sin decir nada.
  //   3. `cerrando` hace que la segunda petición de cierre no vuelva a bloquear,
  //      así que en el peor caso `close()` pasa de largo y la ventana se va.
  useEffect(() => {
    if (!backupDir) return;
    let vivo = true, quitar, cerrando = false;
    getCurrentWindow().onCloseRequested(async (e) => {
      if (cerrando) return;                  // segunda vuelta: déjala cerrar
      e.preventDefault();
      try {
        await Promise.race([
          hacerBackupRef.current(),
          new Promise((_, rej) => setTimeout(() => rej(new Error("tardó demasiado")), 3000)),
        ]);
      } catch (err) {
        console.error("Copia al cerrar:", err);
      }
      cerrando = true;
      try { await getCurrentWindow().destroy(); }
      catch (err) {
        console.error("destroy() falló, se cierra igual:", err);
        try { await getCurrentWindow().close(); } catch {}
      }
    }).then(fn => { vivo ? (quitar = fn) : fn(); });   // si ya se limpió, dar de baja al llegar
    return () => { vivo = false; quitar?.(); };
  }, [backupDir]);

  // Orden de la barra lateral, normalizado contra NAV en un ÚNICO sitio.
  //
  // `navOrder` sale de localStorage y puede haberse quedado atrás — por ejemplo si
  // se guardó antes de que existiera la pestaña Horario. Cada lista resolvía esa
  // ausencia a su manera: la barra mandaba la pestaña al final (indexOf -1 → 999)
  // y la de Ajustes al principio (-1 es menor que cualquier índice), así que
  // enseñaban órdenes distintos. Derivándolo una vez, las dos ven lo mismo.
  const navItems = useMemo(() => {
    const pos = k => { const i = navOrder.indexOf(k); return i === -1 ? 999 : i; };
    return NAV.filter(n => n.k !== "settings").sort((a, b) => pos(a.k) - pos(b.k));
  }, [navOrder]);

  // Reescribe navOrder entero y canónico, así se arregla solo aunque viniera
  // incompleto. Antes se hacía sobre el array guardado y, si la pestaña no estaba,
  // `indexOf` daba -1 y el intercambio escribía en a[-1]: quedaba un hueco y una
  // propiedad "-1" colgando del array.
  const moverNav = useCallback((k, delta) => {
    const claves = navItems.map(n => n.k);
    const i = claves.indexOf(k), j = i + delta;
    if (i < 0 || j < 0 || j >= claves.length) return;
    [claves[i], claves[j]] = [claves[j], claves[i]];
    setNavOrder([...claves, "settings"]);
  }, [navItems]);

  // Tema dinámico (debe ir después de los estados que usa)
  const D = useMemo(() => makeTheme(activeProgram?.color || "#378ADD", bgTheme), [activeProgram?.color, bgTheme]);
  const [addingProg, setAddingProg] = useState(false);
  const [newProg,    setNewProg]    = useState({ name: "", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" });
  const [editingProgId, setEditingProgId] = useState(null);
  const [editProgForm,  setEditProgForm]  = useState(null);

  const emptyManual = { subjectId: "", taskId: "", minutes: "", date: today(), note: "" };

  // Ambas delegan en logic.js; aquí solo se aporta el fallback cuando el día está vacío
  const getDefaultTaskId = subjId => defaultTaskId(tasks, subjId);

  function getMostStudied(date) {
    const found = mostStudied(sessions, tasks, date);
    if (found) return found;
    const fallback = selSubject ?? activeSubjects[0]?.id ?? "";
    return { subjectId: fallback, taskId: defaultTaskId(tasks, fallback) };
  }
  const [manualForm, setManualForm] = useState(emptyManual);
  const [showManualModal, setShowManualModal] = useState(false);

  const [showTaskModal,    setShowTaskModal]    = useState(false);
  const [editTaskId,       setEditTaskId]       = useState(null);
  const [showSubjModal,    setShowSubjModal]    = useState(false);
  const [editSubjId,       setEditSubjId]       = useState(null);
  const [showSessionModal, setShowSessionModal] = useState(false);
  const [showSettings,     setShowSettings]     = useState(false);
  const [showConfirmClear, setShowConfirmClear] = useState(false);
  const [showExportConfirm, setShowExportConfirm] = useState(false);

  const programSubjects  = subjects; // ya filtrados por programa activo (están en activePData)
  // Orden único de asignaturas (cuatrimestre y alfabético). Todo lo que liste
  // asignaturas sale de aquí, así que el orden es el mismo en toda la app.
  const activeSubjects   = useMemo(() => programSubjects.filter(s => !s.archived && !s.approved).sort(bySubjectOrder), [programSubjects]);

  // El umbral de aprobado (Ajustes) se refleja en gradeColor/gradeLabel de toda la app
  // Los ajustes de nota viven en logic.js; se sincronizan al cambiarlos
  useEffect(() => { setGradeConfig({ passingGrade }); }, [passingGrade]);
  useEffect(() => { setGradeConfig({ gradeIcons }); }, [gradeIcons]);
  useEffect(() => { setGradeConfig({ gradeScale }); }, [gradeScale]);

  // Sync selSubject / selTask when subjects or tasks change
  useEffect(() => {
    if (activeSubjects.length === 0) return;
    const validSubj = activeSubjects.find(s => s.id === selSubject) ?? activeSubjects[0];
    if (validSubj.id !== selSubject) { setSelSubject(validSubj.id); return; }
    const pending = tasks.filter(t => t.subjectId === validSubj.id && t.status !== "completada");
    if (pending.length === 0) { setSelTask(null); return; }
    if (!pending.find(t => t.id === selTask)) setSelTask(pending[0].id);
  }, [activeSubjects, tasks]);

  const emptyTask = useMemo(() => ({
    subjectId: activeSubjects[0]?.id || null,
    title: "", priority: "media", dueDate: today(),
    hour: "", status: "pendiente", type: "tarea", gradeMode: "pct", grade: "", pct: "", pts: "",
  }), [activeSubjects]);

  const [taskForm,      setTaskForm]      = useState(emptyTask);
  const [subjForm,      setSubjForm]      = useState({ name: "", color: COLORS[0], course: "", year: null, semester: null, credits: null });
  const [editSession,   setEditSession]   = useState(null);
  const [tempDur,       setTempDur]       = useState({ ...durations });
  const [tempLongEvery, setTempLongEvery] = useState(longEvery);
  const [importError,   setImportError]   = useState("");
  const [importSuccess, setImportSuccess] = useState(false);

  const startTsRef  = useRef(null);
  const timeLeftRef = useRef(timeLeft);
  const intervalRef = useRef(null);
  const modeRef     = useRef(mode);

  // ── Persistencia ─────────────────────────────────────────────────────────────
  useEffect(() => { if (appState) localStorage.setItem("lixt_v2", JSON.stringify({ ...appState, durations, longEvery })); }, [appState, durations, longEvery]);
  useEffect(() => lsSet("lixt_workcount",   workCount), [workCount]);
  useEffect(() => lsSet("lixt_lastsubject", selSubject),[selSubject]);
  useEffect(() => lsSet("lixt_lasttask",    selTask),   [selTask]);
  useEffect(() => lsSet("lixt_calview",     calendarView), [calendarView]);
  useEffect(() => lsSet("lixt_bg_theme",    bgTheme),   [bgTheme]);
  useEffect(() => lsSet("lixt_timer_sound", timerSound),[timerSound]);
  useEffect(() => lsSet("lixt_timer_notif", timerNotif),[timerNotif]);
  useEffect(() => lsSet("lixt_pass_grade",  passingGrade),[passingGrade]);
  useEffect(() => lsSet("lixt_grade_scale", gradeScale), [gradeScale]);
  useEffect(() => lsSet("lixt_grade_icons", gradeIcons),[gradeIcons]);
  useEffect(() => lsSet("lixt_exam_count",  examCount), [examCount]);
  useEffect(() => lsSet("lixt_empty_days",  showEmptyDays), [showEmptyDays]);
  useEffect(() => lsSet("lixt_auto_sync",   autoSync), [autoSync]);
  useEffect(() => lsSet("lixt_schedule_course", scheduleCourse), [scheduleCourse]);
  useEffect(() => lsSet("lixt_schedule_auto",  scheduleAuto),  [scheduleAuto]);
  useEffect(() => lsSet("lixt_timeline_course", timelineCourse), [timelineCourse]);
  useEffect(() => lsSet("lixt_schedule_start", scheduleStart), [scheduleStart]);
  useEffect(() => lsSet("lixt_schedule_end",   scheduleEnd),   [scheduleEnd]);
  useEffect(() => lsSet("lixt_tasks_course", filterTaskCourse), [filterTaskCourse]);
  useEffect(() => { const i = setInterval(() => setNow(new Date()), 60000); return () => clearInterval(i); }, []);

  // Recupera la sesión guardada al arrancar y escucha login/logout
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1200);
    supabase.auth.getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(() => setAuthChecked(true));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => { clearTimeout(t); sub?.subscription?.unsubscribe(); };
  }, []);

  async function handleAuth() {
    setAuthError(""); setAuthInfo(""); setAuthBusy(true);
    try {
      if (authMode === "signup") {
        const data = await signUp(authForm.email.trim(), authForm.password);
        // Si Supabase tiene activada la confirmación por email, aún no hay sesión
        if (!data.session) setAuthInfo("Cuenta creada. Revisa tu email para confirmarla.");
        else setAuthInfo("Cuenta creada.");
      } else {
        await signIn(authForm.email.trim(), authForm.password);
      }
      setAuthForm({ email: "", password: "" });
    } catch (e) {
      setAuthError(authErrorMessage(e));
    } finally {
      setAuthBusy(false);
    }
  }

  // ── Sincronización automática ───────────────────────────────────────────────
  // Al abrir: recoge lo que venga de otros dispositivos.
  const autoSyncedRef = useRef(false);
  useEffect(() => {
    if (!session || !autoSync || autoSyncedRef.current) return;
    autoSyncedRef.current = true;
    handleSync({ silent: true });
  }, [session, autoSync]);

  // Al cerrar o minimizar: sube lo que hayas hecho.
  //
  // Se usa `visibilitychange` y no `beforeunload` porque este último no garantiza
  // que dé tiempo a completar una petición de red mientras la ventana se cierra.
  // `visibilitychange` salta antes (al minimizar, cambiar de ventana o cerrar) y
  // sí permite terminar. Si aun así no llegara, no se pierde nada: los datos están
  // en localStorage y el sync de la próxima apertura los sube.
  useEffect(() => {
    if (!session || !autoSync) return;
    const onHide = () => { if (document.visibilityState === "hidden") handleSync({ silent: true }); };
    document.addEventListener("visibilitychange", onHide);
    return () => document.removeEventListener("visibilitychange", onHide);
  }, [session, autoSync, appState, durations, longEvery, passingGrade]);

  async function handleSync({ silent = false } = {}) {
    if (syncingRef.current) return;           // evita solaparse consigo mismo
    syncingRef.current = true;
    if (!silent) { setSyncBusy(true); setSyncErr(""); setSyncMsg(""); }
    try {
      const settings = { durations, longEvery, passingGrade, gradeScale, gradeIcons, bgTheme, examCount, showEmptyDays };
      const { state, pushed, pulled, remoteSettings } = await syncAll(appState, settings);
      setAppState(state);
      // Los ajustes remotos solo se aplican si esta máquina no tenía ninguno
      if (remoteSettings && !lastSync) {
        if (remoteSettings.durations)    setDurations(remoteSettings.durations);
        if (remoteSettings.longEvery)    setLongEvery(remoteSettings.longEvery);
        if (remoteSettings.passingGrade) setPassingGrade(remoteSettings.passingGrade);
        if (remoteSettings.gradeScale)   setGradeScale(remoteSettings.gradeScale);
        if (remoteSettings.examCount)    setExamCount(remoteSettings.examCount);
        if (remoteSettings.showEmptyDays !== undefined) setShowEmptyDays(remoteSettings.showEmptyDays);
      }
      const ts = new Date().toISOString();
      setLastSync(ts); lsSet("lixt_last_sync", ts);
      if (!silent) setSyncMsg(pushed || pulled
        ? `Listo · ${pushed} subidos · ${pulled} recibidos`
        : "Todo estaba al día");
    } catch (e) {
      // En automático no se molesta al usuario: si falla, el próximo intento lo arregla
      if (!silent) setSyncErr(syncErrorMessage(e));
    } finally {
      syncingRef.current = false;
      if (!silent) setSyncBusy(false);
    }
  }

  async function handleSignOut() {
    if (!window.confirm("¿Cerrar sesión? Tus datos locales no se borran.")) return;
    try {
      await signOut();
      // Al salir a propósito se vuelve a mostrar el login, no la app sin cuenta
      setSkipAuth(false); lsSet("lixt_skip_auth", false);
    } catch (e) { setAuthError(authErrorMessage(e)); }
  }
  useEffect(() => lsSet("lixt_nav_order",   navOrder),  [navOrder]);
  useEffect(() => localStorage.setItem("lixt_collapsed", JSON.stringify([...collapsedSubjects])), [collapsedSubjects]);

  // ── Easter egg: contraseña se escribe en el input del hint ─────────────────
  
  
  

  const toggleCollapse = useCallback((id) => {
    setCollapsedSubjects(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }, []);
  useEffect(() => { modeRef.current = mode; }, [mode]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try { const g = await isPermissionGranted(); if (!g && mounted) await requestPermission(); } catch {}
    })();
    return () => { mounted = false; };
  }, []);

  const durSec = useMemo(() => ({
    work:  durations.work  * 60,
    short: durations.short * 60,
    long:  durations.long  * 60,
  }), [durations]);

  const advanceMode = useCallback((finishedMode, newWorkCount) => {
    if (timerSound) playAlert();
    if (finishedMode === "work") {
      const nextMode = newWorkCount >= longEvery ? "long" : "short";
      if (timerNotif) void sendNotif("🍅 Pomodoro completado", nextMode === "long" ? "Descanso largo — ¡buen trabajo!" : "Descanso corto.");
      const nextTime = nextMode === "long" ? durations.long * 60 : durations.short * 60;
      setMode(nextMode); setTimeLeft(nextTime); timeLeftRef.current = nextTime;
      if (nextMode === "long") setWorkCount(0);
      setTimeout(() => setRunning(true), 400);
    } else {
      if (timerNotif) void sendNotif("⏰ Descanso terminado", "¡Hora de volver al trabajo!");
      setMode("work");
      const t = durations.work * 60; setTimeLeft(t); timeLeftRef.current = t;
      setTimeout(() => setRunning(true), 400);
    }
  }, [longEvery, durations, timerSound, timerNotif]);

  const makeSession = useCallback((mins) => {
    const subj = subjects.find(s => s.id === selSubject);
    const task = tasks.find(tk => tk.id === selTask);
    return touch({ id: newId(), date: today(), subjectId: selSubject, subjectName: subj?.name || "Sin asignatura", subjectColor: subj?.color || "#888", taskTitle: task?.title || null, minutes: mins });
  }, [subjects, tasks, selSubject, selTask]);

  // Si cierras la app con el timer de trabajo corriendo, guarda ese tiempo como sesión
  useEffect(() => {
    const saveOnClose = () => {
      try {
        if (!running || modeRef.current !== "work") return;
        const mins = Math.round((durSec.work - timeLeftRef.current) / 60);
        if (mins < 1) return;
        const cur = JSON.parse(localStorage.getItem("lixt_v2") || "null");
        const pd = cur?.programData?.[cur.activeProgram];
        if (pd) { pd.sessions = [...(pd.sessions || []), makeSession(mins)]; localStorage.setItem("lixt_v2", JSON.stringify(cur)); }
      } catch {}
    };
    window.addEventListener("beforeunload", saveOnClose);
    return () => window.removeEventListener("beforeunload", saveOnClose);
  }, [running, makeSession, durSec.work]);

  const finishSession = useCallback((finishedMode) => {
    let nwc = workCount;
    if (finishedMode === "work") {
      const mins = Math.max(1, Math.round((durSec.work - timeLeftRef.current) / 60) || durations.work);
      setSessions(prev => [...prev, makeSession(mins)]);
      nwc = workCount + 1; setWorkCount(nwc);
    }
    advanceMode(finishedMode, nwc);
  }, [durSec.work, durations.work, workCount, makeSession, advanceMode]);

  useEffect(() => {
    if (!running) { if (intervalRef.current) clearInterval(intervalRef.current); return; }
    startTsRef.current = Date.now();
    const saved = timeLeftRef.current;
    intervalRef.current = setInterval(() => {
      const newLeft = Math.max(0, saved - Math.floor((Date.now() - startTsRef.current) / 1000));
      setTimeLeft(newLeft); timeLeftRef.current = newLeft;
      if (newLeft <= 0) { clearInterval(intervalRef.current); setRunning(false); finishSession(modeRef.current); }
    }, 500);
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [running, finishSession]);

  function switchMode(m) {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false); setMode(m);
    const t = durSec[m]; setTimeLeft(t); timeLeftRef.current = t;
  }

  function saveTimerSettings() {
    setDurations({ ...tempDur }); setLongEvery(tempLongEvery);
    const t = tempDur[mode] * 60; setTimeLeft(t); timeLeftRef.current = t;
    setRunning(false); if (intervalRef.current) clearInterval(intervalRef.current);
    setShowSettings(false);
  }

  function finishNow() {
    if (intervalRef.current) clearInterval(intervalRef.current);
    setRunning(false);
    const elapsed = durSec[mode] - timeLeftRef.current;
    if (mode === "work" && elapsed > 10) {
      const mins = Math.max(1, Math.round(elapsed / 60));
      setSessions(prev => [...prev, makeSession(mins)]);
      const nwc = workCount + 1; setWorkCount(nwc); advanceMode("work", nwc);
    } else if (mode !== "work") {
      advanceMode(mode, workCount);
    } else {
      const t = durSec[mode]; setTimeLeft(t); timeLeftRef.current = t;
    }
  }

  function openNewTask(subjOverride) {
    setEditTaskId(null);
    const subj = subjOverride || activeSubjects[0];
    setTaskForm({ ...emptyTask, subjectId: subj?.id, title: autoTitle("tarea", subj?.name) });
    setShowTaskModal(true);
  }
  // Recordatorio suelto: sin asignatura, con la fecha del día pulsado
  function openNewReminder(ds) {
    setEditTaskId(null);
    setTaskForm({ ...emptyTask, subjectId: null, type: "recordatorio", title: "", dueDate: ds });
    setShowTaskModal(true);
  }
  function openEditTask(t) {
    setEditTaskId(t.id);
    setTaskForm({ subjectId: t.subjectId, title: t.title, priority: t.priority, dueDate: t.dueDate, hour: t.hour || "", status: t.status, type: t.type, gradeMode: t.gradeMode || "pct", grade: t.grade ?? "", pct: t.pct ?? "", pts: t.pts ?? "" });
    setShowTaskModal(true);
  }
  function saveTask() {
    if (!taskForm.title.trim()) return;
    const tt = TASK_TYPES.find(t => t.key === taskForm.type);
    const mode = taskForm.gradeMode === "points" ? "points" : "pct";
    const grade = tt?.hasGrade ? parseNum(taskForm.grade) : null;
    const p = {
      ...taskForm,
      subjectId: taskForm.subjectId ? String(taskForm.subjectId) : null,
      gradeMode: mode,
      grade,
      pct: mode === "pct"    ? parseNum(taskForm.pct, { min: 0, max: 100 }) : null,
      pts: mode === "points" ? parseNum(taskForm.pts) : null,
    };
    if (editTaskId) setTasks(prev => prev.map(t => t.id === editTaskId ? touch({ ...t, ...p }) : t));
    else setTasks(prev => [...prev, touch({ id: newId(), ...p })]);
    setShowTaskModal(false);
  }
  function deleteTask(id)   { if (!window.confirm("¿Eliminar esta tarea?")) return; setTasks(prev => prev.map(t => t.id === id ? softDelete(t) : t)); }
  function toggleStatus(id) { setTasks(prev => prev.map(t => t.id === id ? touch({ ...t, status: t.status === "completada" ? "pendiente" : "completada" }) : t)); }
  function openNewSubj()    { setEditSubjId(null); setSubjForm({ name: "", color: COLORS[0], course: "", year: null, semester: null, annual: false, credits: null, acronym: "" }); setShowSubjModal(true); }
  function openEditSubj(s)  {
    // Normalizar semester: puede ser número, array, o null
    let sem = s.semester ?? null;
    // `annual` es un campo antiguo que ya no se guarda. Se traduce a "todos los
    // cuatrimestres", que es como lo interpreta la pestaña Notas. Antes se ponía
    // a null: la asignatura salía de su curso y caía en "sin asignar".
    if (s.annual) sem = Array.from({ length: activeProgram?.semestersPerYear ?? 2 }, (_, i) => i + 1);
    else if (typeof sem === 'number') sem = [sem];
    else if (!Array.isArray(sem)) sem = sem ? [sem] : null;
    setEditSubjId(s.id);
    setSubjForm({ name: s.name, color: s.color, course: s.course || "", year: s.year ?? null, semester: sem, annual: false, credits: s.credits ?? null, acronym: s.acronym || "" });
    setShowSubjModal(true);
  }
  function saveSubject() {
    if (!subjForm.name.trim()) return;
    if (editSubjId) setSubjects(prev => prev.map(s => s.id === editSubjId ? touch({ ...s, ...subjForm }) : s));
    else setSubjects(prev => [...prev, touch({ id: newId(), ...subjForm, archived: false, approved: false, programId: activeProgramId })]);
    setShowSubjModal(false);
  }
  function toggleArchive(id) { setSubjects(prev => prev.map(s => s.id === id ? touch({ ...s, archived: !s.archived, approved: false }) : s)); }
  function toggleApprove(id) { setSubjects(prev => prev.map(s => s.id === id ? touch({ ...s, approved: !s.approved, archived: false }) : s)); }
  // Borrado en cascada: sin esto las tareas, sesiones y clases de la asignatura
  // se quedaban colgando de un id muerto — salían sin nombre en la lista, como
  // "?" en el horario, y seguían sumando tiempo en las estadísticas.
  function deleteSubject(id) {
    const nTasks = tasks.filter(t => t.subjectId === id).length;
    const nSes   = sessions.filter(x => x.subjectId === id).length;
    const nClas  = schedule.filter(x => x.subjectId === id).length;
    const arrastra = [nTasks && `${nTasks} actividad${nTasks !== 1 ? "es" : ""}`,
                      nSes   && `${nSes} sesion${nSes !== 1 ? "es" : ""}`,
                      nClas  && `${nClas} clase${nClas !== 1 ? "s" : ""} del horario`].filter(Boolean);
    const aviso = arrastra.length ? `

Se borrarán también ${arrastra.join(", ")}.` : "";
    if (!window.confirm("¿Eliminar esta asignatura?" + aviso)) return;
    const borrarDe = x => x.subjectId === id ? softDelete(x) : x;
    setSubjects(prev => prev.map(s => s.id === id ? softDelete(s) : s));
    setTasks(prev    => prev.map(borrarDe));
    setSessions(prev => prev.map(borrarDe));
    setSchedule(prev => prev.map(borrarDe));
  }

  function openEditSession(s) {
    const subjTasks = pendingTasks(tasks, s.subjectId);
    const taskStillExists = subjTasks.some(t => t.title === s.taskTitle);
    const resolvedTask = taskStillExists ? s.taskTitle : (subjTasks[0]?.title || null);
    setEditSession({ ...s, taskTitle: resolvedTask });
    setShowSessionModal(true);
  }
  function saveSession() {
    if (!editSession) return;
    setSessions(prev => prev.map(s => s.id === editSession.id ? touch({ ...s, ...editSession }) : s));
    setShowSessionModal(false); setEditSession(null);
  }
  function deleteSession(id) { setSessions(prev => prev.map(s => s.id === id ? softDelete(s) : s)); }

  async function exportGradesPdf() {
    if (!gradesRef.current || pdfLoading) return;
    setPdfLoading(true);
    try {
      // Las dos librerías vienen del bundle, no de un CDN.
      //
      // Antes se inyectaban dos <script> de cdnjs en caliente: sin `integrity`,
      // eso es ejecutar código de un tercero dentro de la ventana de Tauri, donde
      // está el token de sesión de Supabase. Con `import()` Vite las trocea en un
      // chunk aparte, así que siguen sin cargarse hasta que pulsas Exportar — y
      // ahora el PDF también funciona sin conexión.
      const [{ default: html2canvas }, { jsPDF }] = await Promise.all([
        import("html2canvas"),
        import("jspdf"),
      ]);

      const el = gradesRef.current;

      // Guardamos el ancho original y lo estiramos al ancho A4 en pantalla
      const originalWidth = el.style.width;
      // A4 a 96dpi ≈ 794px, menos dos márgenes de 20pt (1pt≈1.333px) → ~741px de contenido
      // Escalamos: A4 = 595pt, margen 20pt cada lado → 555pt contenido, a scale=2 → 555*2/ratio
      // Más simple: forzamos el el a 1110px (555pt × 2) para que canvas lo capture perfecto
      el.style.width = "1110px";
      el.style.maxWidth = "1110px";

      const canvas = await html2canvas(el, {
        backgroundColor: "#0a0c12",
        scale: 2,
        useCORS: true,
        logging: false,
        scrollX: 0,
        scrollY: 0,
        windowWidth: 1110,
        width: 1110,
        height: el.scrollHeight,
      });

      // Restauramos el ancho original
      el.style.width = originalWidth;
      el.style.maxWidth = "";

            const marginTop  = 20;
      const marginSide = 20;
      const pageW      = 595; // ancho A4 en pt
      const usableW    = pageW - marginSide * 2;
      const ratio      = usableW / canvas.width;
      const imgW       = usableW;
      const imgH       = canvas.height * ratio;
      const customH    = imgH + marginTop + marginSide; // alto = contenido + márgenes iguales

      const pdf = new jsPDF({ orientation: "portrait", unit: "pt", format: [pageW, customH] });
      pdf.setFillColor(10, 12, 18);
      pdf.rect(0, 0, pageW, customH, "F");
      pdf.addImage(canvas.toDataURL("image/png"), "PNG", marginSide, marginTop, imgW, imgH);

      const filename = "notas-" + (activeProgram?.name || "programa").replace(/\s+/g, "-").toLowerCase() + "-" + today() + ".pdf";
      if (window.showSaveFilePicker) {
        try {
          const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "PDF", accept: { "application/pdf": [".pdf"] } }] });
          const writable = await handle.createWritable();
          await writable.write(pdf.output("blob"));
          await writable.close();
          return;
        } catch (e) { if (e.name === "AbortError") return; }
      }
      pdf.save(filename);
    } catch (e) {
      console.error("PDF error:", e);
      alert("Error al generar el PDF: " + e.message);
    } finally {
      setPdfLoading(false);
    }
  }
  async function elegirCarpetaBackup() {
    try {
      const dir = await abrirDialogo({ directory: true, multiple: false, title: "Carpeta para las copias de LixT" });
      if (!dir) return;                       // ha cancelado
      setBackupDir(dir); lsSet("lixt_backup_dir", dir);
      // Se hace una copia ya, para que el fallo salga aquí y no la primera vez
      // que cierres la app, cuando ya no hay quien lea el error.
      await hacerBackup(dir);
      setBackupMsg("✓ Carpeta elegida y primera copia hecha.");
    } catch (e) {
      setBackupMsg("✕ " + (e?.message || e));
    }
  }

  async function exportData() {
    const data = { ...appState, durations, longEvery, version: 2 };
    const json = JSON.stringify(data, null, 2);
    const filename = "lixt-backup-" + today() + ".json";
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({ suggestedName: filename, types: [{ description: "JSON", accept: { "application/json": [".json"] } }] });
        const writable = await handle.createWritable();
        await writable.write(json); await writable.close(); return;
      } catch (e) { if (e.name === "AbortError") return; }
    }
    const blob = new Blob([json], { type: "application/json" });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement("a");
    a.href = url; a.download = filename; a.click(); URL.revokeObjectURL(url);
  }
  // Un backup corrupto no se queda en esta ventana: entra en el estado y de ahí
  // sube a Supabase en la siguiente sincronización. Se comprueba la forma antes
  // de tocar nada, y se descartan los registros sin `id` — sin id, `mergeById`
  // los agrupa todos bajo la clave "undefined" y se pisan entre ellos.
  function validarEstado(d) {
    if (!d || typeof d !== "object") throw new Error("El archivo no contiene un objeto.");
    if (!Array.isArray(d.programs) || d.programs.length === 0) throw new Error("No hay programas en el archivo.");
    if (!d.programData || typeof d.programData !== "object") throw new Error("Faltan los datos de los programas.");
    const conId = arr => (Array.isArray(arr) ? arr : []).filter(x => x && typeof x === "object" && x.id !== undefined && x.id !== null);
    const programData = {};
    for (const [pid, pd] of Object.entries(d.programData)) {
      if (!pd || typeof pd !== "object") continue;
      programData[pid] = {
        subjects: conId(pd.subjects), tasks: conId(pd.tasks),
        sessions: conId(pd.sessions), schedule: conId(pd.schedule),
      };
    }
    const programs = conId(d.programs);
    if (!programs.length) throw new Error("Ningún programa del archivo tiene id.");
    const activo = programs.some(p => p.id === d.activeProgram) ? d.activeProgram : programs[0].id;
    return migrateIdsToString({ activeProgram: activo, programs, programData });
  }

  function importData(e) {
    const file = e.target.files?.[0]; if (!file) return;
    setImportError(""); setImportSuccess(false);
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const data = JSON.parse(ev.target.result);
        // Soporte para v2 y migración desde v1
        if (data.version === 2 && data.programs && data.programData) {
          setAppState(validarEstado(data));
        } else if (data.subjects && data.tasks && data.sessions) {
          // Migrar v1 al vuelo
          const CAREER_ID = "prog_career";
          setAppState(validarEstado({
            activeProgram: CAREER_ID,
            programs: [{ id: CAREER_ID, name: "Mi Carrera", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" }],
            programData: {
              [CAREER_ID]: {
                subjects: data.subjects.map(s => ({ ...s, programId: CAREER_ID })),
                tasks:    data.tasks.map(t => ({ ...t, programId: CAREER_ID })),
                sessions: data.sessions.map(s => ({ ...s, programId: CAREER_ID })),
              }
            }
          }));
        } else {
          throw new Error("Archivo inválido o incompleto.");
        }
        if (data.durations)  setDurations(data.durations);
        if (data.longEvery)  setLongEvery(data.longEvery);
        setImportSuccess(true);
      } catch (err) { setImportError(err.message || "Error al leer el archivo."); }
    };
    reader.readAsText(file); e.target.value = "";
  }
  // Borrar = marcar `deleted_at`, nunca vaciar el array.
  //
  // Reemplazar la lista por otra (o por []) solo borra en este equipo: las filas
  // siguen en Supabase y la siguiente sincronización las baja enteras, así que
  // "Borrar todo" se deshacía solo. Los ejemplos se añaden DETRÁS de los borrados,
  // que se conservan ocultos hasta que el servidor los tenga marcados.
  // Ya no se restauran las asignaturas de ejemplo: si pulsas "borrar" quieres que
  // se borre, no que aparezcan Matemáticas/Física/Historia. Además obligaba a
  // reasignar los ids de DEFAULT_TASKS, que apuntaban a los de DEFAULT_SUBJECTS.
  function clearData(type) {
    const borrar = prev => prev.map(x => x.deleted_at ? x : softDelete(x));
    if (type === "subjects")   { setSubjects(borrar); setTasks(borrar); }
    else if (type === "tasks")   setTasks(borrar);
    else if (type === "all")   { setSubjects(borrar); setTasks(borrar); setSessions(borrar); setSchedule(borrar); setWorkCount(0); }
    setShowConfirmClear(false);
  }

  const todayStr = today();

  // Cursos académicos disponibles (1 sep → 31 ago del año siguiente)
  const academicCourses = useMemo(
    () => [...new Set([...academicCoursesOf(sessions), academicCourseOf(todayStr)])].sort((a, b) => b - a),
    [sessions, todayStr]);

  // La línea de tiempo se ve por curso académico ("all" = todos)
  const timelineSessions = useMemo(() => {
    if (timelineCourse === "all") return sessions;
    const [ini, fin] = courseRange(timelineCourse);
    return sessions.filter(s => s.date >= ini && s.date <= fin);
  }, [sessions, timelineCourse]);

  const statsFilter = useMemo(() => {
    const t = todayStr;
    if (statsPeriod === "week")   { const s = startOfWeek(t), e = endOfWeek(t); return d => d >= s && d <= e; }
    if (statsPeriod === "month")  { const p = t.slice(0, 7); return d => d.startsWith(p); }
    if (statsPeriod === "last7")  { const s = daysAgo(6);  return d => d >= s && d <= t; }
    if (statsPeriod === "last30") { const s = daysAgo(29); return d => d >= s && d <= t; }
    if (statsPeriod?.startsWith("course_")) {
      const [start, end] = courseRange(parseInt(statsPeriod.replace("course_", "")));
      return d => d >= start && d <= end;
    }
    return () => true;
  }, [statsPeriod, todayStr]);

  const filteredSessions = useMemo(() => sessions.filter(s => statsFilter(s.date)), [sessions, statsFilter]);
  const totalMinutes     = filteredSessions.reduce((a, s) => a + s.minutes, 0);
  const bySubject        = useMemo(() => subjects.map(s => ({ ...s, minutes: filteredSessions.filter(x => x.subjectId === s.id).reduce((a, b) => a + b.minutes, 0) })).filter(s => s.minutes > 0), [subjects, filteredSessions]);

  const sessionsByDate = useMemo(() => {
    const map = {};
    sessions.forEach(s => { if (!map[s.date]) map[s.date] = []; map[s.date].push(s); });
    return map;
  }, [sessions]);

  const allDates = useMemo(() => Object.keys(sessionsByDate).sort((a, b) => b.localeCompare(a)), [sessionsByDate]);

  const dayStats = useMemo(() => {
    const daySessions = sessionsByDate[historyDate] || [];
    const total = daySessions.reduce((a, s) => a + s.minutes, 0);
    const bySubj = {};
    daySessions.forEach(s => {
      if (!bySubj[s.subjectId]) bySubj[s.subjectId] = { name: s.subjectName, color: subjects.find(x => x.id === s.subjectId)?.color || s.subjectColor, minutes: 0 };
      bySubj[s.subjectId].minutes += s.minutes;
    });
    return { total, bySubj: Object.values(bySubj).sort((a, b) => b.minutes - a.minutes), sessions: daySessions };
  }, [sessionsByDate, historyDate, subjects]);

  const sortedTasks   = useMemo(() => [...tasks].sort(byDueDate), [tasks]);
  const filteredTasks = useMemo(() => {
    const base = sortedTasks.filter(t => {
      if (filterSubj   !== "all" && String(t.subjectId) !== String(filterSubj)) return false;
      if (filterStatus !== "all" && t.status    !== filterStatus)        return false;
      // Una tarea sin fecha no pertenece a ningún curso: se ve siempre, si no
      // desaparecería en cuanto filtras y no habría forma de encontrarla.
      if (filterTaskCourse !== null && t.dueDate && academicCourseOf(t.dueDate) !== filterTaskCourse) return false;
      return true;
    });
    if (filterStatus !== "all") return base;
    // Con "todos los estados": pendientes + en progreso primero, completadas al final
    const pending   = base.filter(t => t.status !== "completada");
    const completed = base.filter(t => t.status === "completada");
    return [...pending, ...completed];
  }, [sortedTasks, filterSubj, filterStatus, filterTaskCourse]);

  const taskCourses = useMemo(
    () => [...new Set(tasks.filter(t => t.dueDate).map(t => academicCourseOf(t.dueDate)))].sort((a, b) => b - a),
    [tasks]);

  const upcomingExams = useMemo(() => [...tasks].filter(t => t.type === "examen" && t.status !== "completada").sort(byDueDate).slice(0, examCount), [tasks, examCount]);

  const progress    = 1 - timeLeft / durSec[mode];
  const R = 100, circ = 2 * Math.PI * R;
  const subjColor   = activeSubjects.find(s => s.id === selSubject)?.color ?? D.accent;
  // todos los modos usan el color de la asignatura
  const strokeColor = subjColor;
  const cycleDots   = Array.from({ length: longEvery }, (_, i) => i < workCount);

  const moveCal     = (delta) => { const [m, y] = shiftMonth(calMonth, calYear, delta);         setCalMonth(m);     setCalYear(y);     };

  // Datos para el CustomSelect del timer
  const timerSubjOptions = useMemo(() => activeSubjects.map(s => ({ value: s.id, label: s.name })), [activeSubjects]);
  const timerTaskOptions = useMemo(
    () => pendingTasks(tasks, selSubject).map(t => ({ value: t.id, label: t.title })),
    [tasks, selSubject]
  );

  // ── Pantalla de carga: mientras se comprueba si hay sesión guardada ─────────
  // ── Pantalla de carga ───────────────────────────────────────────────────────
  // Se muestra mientras se comprueba si hay una sesión guardada. Sin esto
  // asomaría el login un instante aunque sí hubiera sesión.
  if (!authChecked || !splashDone) return (
    <div style={{ ...FULLSCREEN, flexDirection: "column", gap: 26 }}>
      <style>{LOADING_CSS}</style>

      {/* Logo con las letras entrando en cascada */}
      <div style={{ fontSize: 52, fontWeight: 800, letterSpacing: -2, display: "flex" }}>
        {["L", "i", "x", "T"].map((ch, i) => (
          <span key={i} style={{
            color: i === 3 ? D.accent : D.text,
            animation: `lixtRise 0.5s cubic-bezier(.2,.8,.3,1) ${i * 0.08}s both, lixtGlow 2.4s ease-in-out ${0.5 + i * 0.08}s infinite`,
          }}>{ch}</span>
        ))}
      </div>

      {/* Barra de progreso indeterminada */}
      <div style={{ width: 180, height: 3, borderRadius: 3, background: D.card2, overflow: "hidden", position: "relative" }}>
        <div style={{
          position: "absolute", inset: 0, width: "40%", borderRadius: 3,
          background: `linear-gradient(90deg, transparent, ${D.accent}, transparent)`,
          animation: "lixtSlide 1.3s ease-in-out infinite",
        }} />
      </div>
    </div>
  );

  // ── Login inicial ───────────────────────────────────────────────────────────
  // Se puede entrar sin cuenta: los datos son locales y bloquear el acceso por no
  // tener red dejaría al usuario sin poder abrir lo suyo.
  if (!session && !skipAuth) return (
    <div style={FULLSCREEN}>
      <style>{LOADING_CSS}</style>
      <div style={{
        background: D.card, border: "1px solid " + D.border, borderRadius: 18, padding: "38px 42px",
        width: 400, maxWidth: "90vw", animation: "lixtRise 0.45s cubic-bezier(.2,.8,.3,1) both",
      }}>
        <div style={{ fontSize: 32, fontWeight: 800, letterSpacing: -1.2, marginBottom: 6, color: D.text }}>
          Lix<span style={{ color: D.accent }}>T</span>
        </div>
        <div style={{ fontSize: 13, color: D.muted, marginBottom: 26 }}>
          Entra con tu cuenta para sincronizar con el móvil.
        </div>

        <div style={{ display: "flex", borderRadius: 8, overflow: "hidden", border: "1px solid " + D.border, width: "fit-content", marginBottom: 16 }}>
          {[["signin", "Entrar"], ["signup", "Crear cuenta"]].map(([k, label]) => (
            <button key={k} onClick={() => { setAuthMode(k); setAuthError(""); setAuthInfo(""); }}
              style={{ padding: "7px 16px", border: "none", background: authMode === k ? D.accent : D.card2, color: authMode === k ? "#fff" : D.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
              {label}
            </button>
          ))}
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <input type="email" placeholder="tu@email.com" value={authForm.email} autoComplete="username"
            onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleAuth()} style={{ ...inp, fontFamily: "inherit" }} />
          <input type="password" placeholder="Contraseña" value={authForm.password} autoComplete="current-password"
            onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
            onKeyDown={e => e.key === "Enter" && handleAuth()} style={{ ...inp, fontFamily: "inherit" }} />
          {authError && <div style={{ fontSize: 12, color: D.red, padding: "7px 10px", borderRadius: 7, background: D.red + "11" }}>{authError}</div>}
          {authInfo  && <div style={{ fontSize: 12, color: D.green, padding: "7px 10px", borderRadius: 7, background: D.green + "11" }}>{authInfo}</div>}
          <button onClick={handleAuth} disabled={authBusy || !authForm.email || !authForm.password}
            style={{ padding: "11px 0", borderRadius: 9, border: "none", background: (authBusy || !authForm.email || !authForm.password) ? D.card2 : D.accent, color: (authBusy || !authForm.email || !authForm.password) ? D.muted : "#fff", fontSize: 14, fontWeight: 500, cursor: (authBusy || !authForm.email || !authForm.password) ? "not-allowed" : "pointer", fontFamily: "inherit" }}>
            {authBusy ? "Un momento…" : authMode === "signup" ? "Crear cuenta" : "Entrar"}
          </button>
          <button onClick={() => { setSkipAuth(true); lsSet("lixt_skip_auth", true); }}
            style={{ padding: "9px 0", borderRadius: 9, border: "none", background: "none", color: D.muted, fontSize: 12, cursor: "pointer", fontFamily: "inherit" }}>
            Usar sin cuenta (solo en este equipo)
          </button>
        </div>
      </div>
    </div>
  );

  // ─── Render ───────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: "flex", height: "100vh", background: D.bg, fontFamily: FONT, color: D.text, overflow: "hidden" }}>
      <style>{[
        "::-webkit-scrollbar { width: 5px; background: " + D.bg + "; }",
        "::-webkit-scrollbar-thumb { background: " + D.border + "; border-radius: 3px; }",
      ].join("\n")}</style>

      {/* ── Sidebar ── */}
      <div style={{ width: 220, background: D.sidebar, borderRight: "1px solid " + D.border, display: "flex", flexDirection: "column", flexShrink: 0 }}>
        <div style={{ padding: "22px 20px 14px", borderBottom: "1px solid " + D.border }}>
          <div style={{ fontSize: 26, fontWeight: 800, color: D.accent, letterSpacing: "-1px" }}>
            LixT <span style={{ fontSize: 11, fontWeight: 400, color: D.muted, letterSpacing: 0 }}>v1.4.0</span>
          </div>
          <div style={{ fontSize: 11, color: D.muted, marginTop: 4, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
            {activeProgram?.name || "Mi programa"}
          </div>
        </div>
        <nav style={{ padding: 10, flex: 1, overflowY: "auto" }}>
          {[...navItems, NAV.find(n => n.k === "settings")].map(({ k, icon, label }) => (
              <button key={k} onClick={() => setTab(k)} style={{ display: "flex", alignItems: "center", gap: 10, width: "100%", padding: "9px 12px", borderRadius: 8, border: "none", background: tab === k ? D.accent + "22" : "transparent", color: tab === k ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: tab === k ? 500 : 400, marginBottom: 2, textAlign: "left" }}>
                <span style={{ fontSize: 15, width: 20, textAlign: "center" }}>{icon}</span>{label}
              </button>
          ))}
        </nav>
        <div style={{ padding: "12px 14px", borderTop: "1px solid " + D.border }}>
          <div style={{ fontSize: 10, color: D.muted, fontWeight: 500, marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.5px" }}>Próximos exámenes</div>
          {upcomingExams.length === 0 && <div style={{ fontSize: 12, color: D.muted }}>Sin exámenes</div>}
          {upcomingExams.map(t => {
            const days = daysUntil(t.dueDate), subj = subjects.find(s => s.id === t.subjectId);
            return (
              <div key={t.id} style={{ marginBottom: 6, paddingLeft: 8, borderLeft: "2px solid " + (subj?.color || "#888") }}>
                <div style={{ fontSize: 11, fontWeight: 500, color: D.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                <div style={{ fontSize: 10, color: days <= 3 ? D.red : days <= 14 ? D.amber : D.green }}>{days < 0 ? "Pasado" : days === 0 ? "Hoy" : days + "d"}</div>
              </div>
            );
          })}
        </div>
        <div style={{ padding: "10px 14px", borderTop: "1px solid " + D.border }}>
          <div style={{ fontSize: 10, color: D.muted, fontWeight: 500, marginBottom: 4, textTransform: "uppercase", letterSpacing: "0.5px" }}>Sesión activa</div>
          <div style={{ fontSize: 22, fontWeight: 600, color: strokeColor, letterSpacing: 1 }}>{pad(Math.floor(timeLeft / 60))}:{pad(timeLeft % 60)}</div>
          <div style={{ display: "flex", gap: 4, marginTop: 4 }}>
            {cycleDots.map((done, i) => <div key={i} style={{ width: 8, height: 8, borderRadius: "50%", background: done ? D.accent : D.border }} />)}
          </div>
          <div style={{ fontSize: 10, color: D.muted, marginTop: 3 }}>
            {MODE_LABELS[mode]} · {cycle} ciclos
          </div>
        </div>
      </div>

      {/* ── Contenido ── */}
      <div style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
        <div style={{ background: D.card, borderBottom: "1px solid " + D.border, padding: "11px 28px", display: "flex", alignItems: "center", flexShrink: 0 }}>
          <div style={{ fontSize: 16, fontWeight: 500 }}>{NAV.find(n => n.k === tab)?.label ?? ""}</div>
          <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 14 }}>
            {tab === "grades" && (
              <button onClick={exportGradesPdf} disabled={pdfLoading} style={{ display: "flex", alignItems: "center", gap: 6, padding: "6px 14px", borderRadius: 8, border: "1px solid " + D.border, background: pdfLoading ? D.card2 : D.card2, color: pdfLoading ? D.muted : D.accent, fontSize: 12, cursor: pdfLoading ? "not-allowed" : "pointer", fontWeight: 500 }}>
                {pdfLoading ? "⏳ Generando…" : "📄 Exportar PDF"}
              </button>
            )}
            <span style={{ fontSize: 13, color: D.muted }}>
              {new Date().toLocaleDateString("es-ES", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </span>
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "22px 28px" }}>

          {/* ══ Focus / Timer ══ */}
          {tab === "timer" && (
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 24, alignItems: "start" }}>

              {/* Izquierda — Cronómetro */}
              <Card>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: D.muted }}>Temporizador</div>
                <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
                  {[["work","Trabajo"],["short","Corto"],["long","Largo"]].map(([m, label]) => (
                    <button key={m} onClick={() => switchMode(m)} style={{ flex: 1, padding: "7px 0", borderRadius: 8, border: "1px solid " + D.border, background: mode === m ? strokeColor : D.card2, color: mode === m ? "#fff" : D.muted, fontSize: 12, cursor: "pointer", fontWeight: mode === m ? 500 : 400 }}>{label}</button>
                  ))}
                  <button onClick={() => { setTempDur({ ...durations }); setTempLongEvery(longEvery); setShowSettings(true); }} style={{ padding: "7px 12px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.muted, cursor: "pointer", fontSize: 14 }}>⚙</button>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 6, marginBottom: 12 }}>
                  {Array.from({ length: longEvery }, (_, i) => <div key={i} style={{ width: 10, height: 10, borderRadius: "50%", background: i < workCount ? D.accent : D.border, transition: "background 0.3s" }} />)}
                </div>
                <div style={{ display: "flex", justifyContent: "center", marginBottom: 16 }}>
                  <svg width="240" height="240" viewBox="0 0 240 240">
                    <circle cx="120" cy="120" r={R} fill="none" stroke={D.card2} strokeWidth="12" />
                    <circle cx="120" cy="120" r={R} fill="none" stroke={strokeColor} strokeWidth="12"
                      strokeDasharray={circ} strokeDashoffset={circ * (1 - progress)}
                      strokeLinecap="round" transform="rotate(-90 120 120)"
                      style={{ transition: "stroke-dashoffset 0.3s linear", filter: "drop-shadow(0 0 8px " + strokeColor + "55)" }} />
                    {Array.from({ length: 60 }, (_, i) => {
                      const a = (i / 60) * 2 * Math.PI - Math.PI / 2;
                      return <line key={i} x1={120 + 86 * Math.cos(a)} y1={120 + 86 * Math.sin(a)} x2={120 + 92 * Math.cos(a)} y2={120 + 92 * Math.sin(a)} stroke={D.border} strokeWidth={i % 5 === 0 ? 2 : 1} />;
                    })}
                    <circle cx="120" cy="120" r="80" fill={D.card} />
                    <text x="120" y="110" textAnchor="middle" fontSize="42" fontWeight="600" fill={D.text}>{pad(Math.floor(timeLeft / 60))}:{pad(timeLeft % 60)}</text>
                    <text x="120" y="130" textAnchor="middle" fontSize="12" fill={D.muted}>{MODE_LABELS[mode]}</text>
                    <text x="120" y="148" textAnchor="middle" fontSize="11" fill={strokeColor}>{Math.round(progress * 100)}%</text>
                  </svg>
                </div>
                <div style={{ display: "flex", justifyContent: "center", gap: 10, marginBottom: 10 }}>
                  <button onClick={() => {
                    setRunning(r => {
                      const starting = !r;
                      if (starting && selTask && mode === "work") {
                        setTasks(prev => prev.map(t => t.id === selTask && t.status === "pendiente" ? touch({ ...t, status: "en progreso" }) : t));
                      }
                      return !r;
                    });
                  }} style={{ padding: "11px 40px", borderRadius: 10, border: "none", background: running ? D.red : subjColor, color: "#fff", fontWeight: 600, fontSize: 16, cursor: "pointer" }}>{running ? "Pausar" : "Iniciar"}</button>
                  <button onClick={() => { setRunning(false); const t = durSec[mode]; setTimeLeft(t); timeLeftRef.current = t; setWorkCount(0); }} style={{ padding: "11px 16px", borderRadius: 10, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 18, cursor: "pointer" }}>↺</button>
                </div>
                {(running || (timeLeft < durSec[mode] && timeLeft > 0)) && (
                  <div style={{ display: "flex", justifyContent: "center" }}>
                    <button onClick={finishNow} style={{ padding: "7px 20px", borderRadius: 8, border: "1px solid " + D.border, background: "transparent", color: D.amber, fontSize: 12, cursor: "pointer" }}>
                      {mode === "work" ? "✓ Terminar trabajo" : "✓ Terminar descanso"}
                    </button>
                  </div>
                )}
                <div style={{ fontSize: 12, color: D.muted, textAlign: "center", marginTop: 8 }}>Ciclo #{cycle + 1} · {cycle} completados</div>
              </Card>

              {/* Derecha — Asignación + Sesiones + Stats */}
              <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
                <Card>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: D.muted }}>Asignar sesión</div>
                  {activeSubjects.length === 0
                    ? <div style={{ fontSize: 12, color: D.muted, textAlign: "center", padding: "8px 0" }}>Sin asignaturas activas</div>
                    : <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        <CustomSelect
                          value={selSubject ?? timerSubjOptions[0]?.value}
                          onChange={sid => {
                            setSelSubject(sid);
                            const first = tasks.find(t => t.subjectId === sid && t.status !== "completada");
                            setSelTask(first?.id ?? null);
                          }}
                          options={timerSubjOptions}
                          dotColor={subjColor}
                        />
                        <CustomSelect
                          value={selTask ?? timerTaskOptions[0]?.value}
                          onChange={id => setSelTask(id)}
                          options={timerTaskOptions}
                          disabled={timerTaskOptions.length === 0}
                          disabledLabel="Sin tareas pendientes"
                          dotColor={subjColor}
                        />
                      </div>
                  }
                </Card>
                <Card>
                  <div style={{ display: "flex", alignItems: "center", marginBottom: 10 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: D.muted }}>Sesiones recientes</div>
                    <button onClick={() => { const sid = selSubject ?? activeSubjects[0]?.id ?? ""; setManualForm({ ...emptyManual, subjectId: sid, taskId: selTask ? String(selTask) : getDefaultTaskId(sid) }); setShowManualModal(true); }} style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 5, padding: "5px 12px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.accent, fontSize: 12, cursor: "pointer", fontWeight: 500 }}>
                      ＋ Sesión manual
                    </button>
                  </div>
                  {sessions.length === 0 && <div style={{ fontSize: 13, color: D.muted, textAlign: "center", padding: "16px 0" }}>Sin sesiones aún</div>}
                  {/* Las sesiones se añaden al final, así que las 6 últimas del array
                      son las 6 más recientes. Antes se filtraban las manuales
                      comparando `s.id > ...`, que funcionaba cuando los ids eran
                      Date.now() pero con UUID es una comparación de texto: cada
                      sesión manual aparecía o no según su primera letra. */}
                  {sessions.slice(-6).reverse().map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 8, borderLeft: "3px solid " + (subjects.find(x => x.id === s.subjectId)?.color || s.subjectColor), marginBottom: 5, background: D.card2 }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.subjectName}</div>
                        {s.taskTitle && <div style={{ fontSize: 11, color: D.muted, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.taskTitle}</div>}
                      </div>
                      <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{fmtTime(s.minutes)}</span>
                      <button onClick={() => openEditSession(s)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 13, padding: "2px 4px" }}>✎</button>
                      <button onClick={() => window.confirm("¿Borrar esta sesión?") && deleteSession(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 13, padding: "2px 4px" }}>✕</button>
                    </div>
                  ))}
                </Card>
                <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                  <StatCard label="Hoy" value={fmtTime(sessions.filter(s => s.date === todayStr).reduce((a, s) => a + s.minutes, 0))} color={D.accent} />
                  <StatCard label="Ciclos totales" value={cycle} />
                </div>
              </div>
            </div>

            {/* ── Línea de tiempo de sesiones ── */}
            <Card>
              <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 500, color: D.muted }}>Línea de tiempo · {timelineSessions.length} sesión{timelineSessions.length !== 1 ? "es" : ""}</span>
                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {[...academicCourses, "all"].map(y => (
                    <button key={y} onClick={() => setTimelineCourse(y)}
                      style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + (timelineCourse === y ? D.accent : D.border), background: timelineCourse === y ? D.accent : "none", color: timelineCourse === y ? "#fff" : D.muted, fontSize: 12, cursor: "pointer" }}>
                      {y === "all" ? "Todo" : academicCourseLabel(y)}
                    </button>
                  ))}
                </div>
              </div>
              <SessionTimeline sessions={timelineSessions} subjects={subjects} fmtTime={fmtTime} showEmptyDays={showEmptyDays} onEditSession={openEditSession} onDeleteSession={deleteSession} onAddSession={d => { const { subjectId, taskId } = getMostStudied(d); setManualForm({ ...emptyManual, date: d, subjectId, taskId }); setShowManualModal(true); }} />
            </Card>

            </div>
          )}

          {/* ══ Asignaturas ══ */}
          {tab === "subjects" && (() => {
            // Mismo orden que en el resto de la app (bySubjectOrder): año,
            // cuatrimestre y alfabético. Las que no tienen curso o cuatrimestre
            // asignado van al final.
            const visibleSubjs = programSubjects.filter(s => {
              if (filterSubjYear !== null && s.year !== filterSubjYear) return false;
              if (filterSubjStatus === "active"   && (s.archived || s.approved)) return false;
              if (filterSubjStatus === "approved" && !s.approved)  return false;
              if (filterSubjStatus === "archived" && !s.archived)  return false;
              return true;
            }).sort(bySubjectOrder);
            const activeVisible   = visibleSubjs.filter(s => !s.archived && !s.approved);
            const approvedVisible = visibleSubjs.filter(s => s.approved);
            const archivedVisible = visibleSubjs.filter(s => s.archived);
            return (
            <div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 16, flexWrap: "wrap" }}>
                <div style={{ display: "flex", gap: 4 }}>
                  {[null, ...Array.from({length: activeProgram?.years ?? 4}, (_, i) => i + 1)].map(y => (
                    <button key={y ?? "all"} onClick={() => setFilterSubjYear(y)}
                      style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + (filterSubjYear === y ? D.accent : D.border), background: filterSubjYear === y ? D.accent + "22" : D.card2, color: filterSubjYear === y ? D.accent : D.muted, fontSize: 12, cursor: "pointer", fontWeight: filterSubjYear === y ? 600 : 400 }}>
                      {y === null ? "Todos" : y + "º"}
                    </button>
                  ))}
                </div>
                <div style={{ width: 1, height: 20, background: D.border }} />
                {[["all","Todas"],["active","En curso"],["approved","Aprobadas"],["archived","Archivadas"]].map(([v, label]) => (
                  <button key={v} onClick={() => setFilterSubjStatus(v)}
                    style={{ padding: "5px 10px", borderRadius: 7, border: "1px solid " + (filterSubjStatus === v ? D.accent : D.border), background: filterSubjStatus === v ? D.accent + "22" : D.card2, color: filterSubjStatus === v ? D.accent : D.muted, fontSize: 12, cursor: "pointer", fontWeight: filterSubjStatus === v ? 600 : 400 }}>
                    {label}
                  </button>
                ))}
                <div style={{ fontSize: 12, color: D.muted, marginLeft: 4 }}>{visibleSubjs.length} asignatura{visibleSubjs.length !== 1 ? "s" : ""}</div>
                <button onClick={openNewSubj} style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: 8, border: "none", background: D.accent, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Nueva asignatura</button>
              </div>

              {/* Activas */}
              {activeVisible.length === 0 && filterSubjStatus === "active" && <Card><div style={{ textAlign: "center", color: D.muted, padding: "32px 0" }}>Sin asignaturas en curso</div></Card>}
              {activeVisible.map((subj, i) => (
                <React.Fragment key={subj.id}>
                  {/* Separador al cambiar de cuatrimestre */}
                  {i > 0 && subjectGroupKey(activeVisible[i - 1]) !== subjectGroupKey(subj) &&
                    <div style={{ height: 4, borderRadius: 2, background: D.muted + "33", margin: "14px 0" }} />}
                  <SubjectCard subj={subj} tasks={tasks} sessions={sessions}
                    collapsed={collapsedSubjects.has(subj.id)}
                    onToggleCollapse={() => toggleCollapse(subj.id)}
                    onNewTask={openNewTask} onEditTask={openEditTask}
                    onEditSubj={openEditSubj} onArchive={toggleArchive} onApprove={toggleApprove} onDelete={deleteSubject} />
                </React.Fragment>
              ))}

              {/* Aprobadas */}
              {approvedVisible.length > 0 && (filterSubjStatus === "all" || filterSubjStatus === "approved") && (
                <div style={{ marginTop: 8 }}>
                  {filterSubjStatus !== "approved" && (
                    <button onClick={() => setShowApproved(a => !a)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: D.green, padding: 0, marginBottom: 10 }}>
                      {showApproved ? "▲" : "▶"} ✓ Aprobadas ({approvedVisible.length})
                    </button>
                  )}
                  {(showApproved || filterSubjStatus === "approved") && approvedVisible.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: D.card, marginBottom: 6, border: "1px solid " + D.green + "44" }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1, color: D.text }}>{s.name}</span>
                      {s.year && <span style={{ fontSize: 11, color: D.muted }}>{s.year}º {semLabel(s.semester)}</span>}
                      {s.credits && <span style={{ fontSize: 11, color: D.muted }}>{s.credits} ECTS</span>}
                      <span style={{ fontSize: 10, color: D.green, background: D.green + "22", padding: "2px 6px", borderRadius: 5 }}>✓ Aprobada</span>
                      <button onClick={() => openEditSubj(s)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 13, padding: "2px 5px" }}>✎</button>
                      <button onClick={() => toggleApprove(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: "2px 5px" }}>↩ Restaurar</button>
                      <button onClick={() => deleteSubject(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 13, padding: "2px 5px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}

              {/* Archivadas */}
              {archivedVisible.length > 0 && (filterSubjStatus === "all" || filterSubjStatus === "archived") && (
                <div style={{ marginTop: 8 }}>
                  {filterSubjStatus !== "archived" && (
                    <button onClick={() => setShowArchived(a => !a)} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 13, color: D.muted, padding: 0, marginBottom: 10, marginTop: 4, display: "block" }}>
                      {showArchived ? "▲" : "▶"} 📁 Archivadas ({archivedVisible.length})
                    </button>
                  )}
                  {(showArchived || filterSubjStatus === "archived") && archivedVisible.map(s => (
                    <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: D.card, opacity: 0.6, marginBottom: 6, border: "1px solid " + D.border }}>
                      <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 13, flex: 1, color: D.muted, textDecoration: "line-through" }}>{s.name}</span>
                      {s.year && <span style={{ fontSize: 11, color: D.muted }}>{s.year}º {semLabel(s.semester)}</span>}
                      <span style={{ fontSize: 10, color: D.muted, background: D.card2, padding: "2px 6px", borderRadius: 5 }}>📁 Archivada</span>
                      <button onClick={() => openEditSubj(s)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 13, padding: "2px 5px" }}>✎</button>
                      <button onClick={() => toggleArchive(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: "2px 5px" }}>↩ Restaurar</button>
                      <button onClick={() => deleteSubject(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 13, padding: "2px 5px" }}>✕</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
            );
          })()}

          {/* ══ Tareas ══ */}
          {tab === "tasks" && (
            <div style={{ display: "grid", gridTemplateColumns: "2fr 1fr", gap: 24, alignItems: "start" }}>
              <div>
                <div style={{ display: "flex", gap: 8, marginBottom: 14, alignItems: "center", flexWrap: "wrap" }}>
                  <div style={{ minWidth: 180 }}>
                    <CustomSelect
                      value={filterSubj}
                      onChange={v => setFilterSubj(v)}
                      options={[{ value: "all", label: "Todas las asignaturas" }, ...activeSubjects.map(s => ({ value: String(s.id), label: s.name }))]}
                    />
                  </div>
                  <div style={{ minWidth: 140 }}>
                    <CustomSelect
                      value={filterStatus}
                      onChange={v => setFilterStatus(v)}
                      options={[
                        { value: "all", label: "Todos los estados" },
                        { value: "pendiente", label: "Pendiente" },
                        { value: "en progreso", label: "En progreso" },
                        { value: "completada", label: "Completada" },
                      ]}
                    />
                  </div>
                  {taskCourses.length > 1 && (
                    <div style={{ display: "flex", gap: 4 }}>
                      {[null, ...taskCourses].map(y => (
                        <button key={y ?? "all"} onClick={() => setFilterTaskCourse(y)}
                          style={{ padding: "7px 11px", borderRadius: 7, border: "1px solid " + (filterTaskCourse === y ? D.accent : D.border), background: filterTaskCourse === y ? D.accent + "22" : D.card2, color: filterTaskCourse === y ? D.accent : D.muted, fontSize: 12, cursor: "pointer", fontWeight: filterTaskCourse === y ? 600 : 400 }}>
                          {y === null ? "Todos" : academicCourseLabel(y)}
                        </button>
                      ))}
                    </div>
                  )}
                  <button onClick={() => openNewTask()} style={{ marginLeft: "auto", padding: "8px 18px", borderRadius: 8, border: "none", background: D.accent, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>+ Nueva</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {filteredTasks.length === 0 && <Card><div style={{ textAlign: "center", color: D.muted, padding: "20px 0", fontSize: 13 }}>Sin actividades</div></Card>}
                  {filteredTasks.map((t, idx) => {
                    const subj = subjects.find(s => s.id === t.subjectId), days = daysUntil(t.dueDate);
                    const tt   = TASK_TYPES.find(x => x.key === t.type);
                    // Separador cuando empieza el bloque de completadas (solo en vista "todos")
                    const prevDone = idx > 0 && filteredTasks[idx - 1].status !== "completada";
                    const showDivider = filterStatus === "all" && t.status === "completada" && prevDone;
                    return (
                      <React.Fragment key={t.id}>
                        {showDivider && (
                          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "4px 0" }}>
                            <div style={{ flex: 1, height: 1, background: D.border }} />
                            <span style={{ fontSize: 11, color: D.muted, whiteSpace: "nowrap" }}>Completadas</span>
                            <div style={{ flex: 1, height: 1, background: D.border }} />
                          </div>
                        )}
                        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "11px 16px", background: D.card, borderRadius: 10, border: "1px solid " + D.border, borderLeft: "4px solid " + (subj?.color || "#888"), opacity: t.status === "completada" ? 0.55 : 1 }}>
                          <input type="checkbox" checked={t.status === "completada"} onChange={() => toggleStatus(t.id)} style={{ width: 16, height: 16, cursor: "pointer", accentColor: D.accent, flexShrink: 0 }} />
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 3 }}>
                              <span style={{ fontSize: 13, fontWeight: 500, textDecoration: t.status === "completada" ? "line-through" : "none" }}>{t.title}</span>
                              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: D.card2, color: D.muted }}>{tt?.label}</span>
                              <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: D.card2, color: PRIORITY_COLOR[t.priority] }}>{t.priority}</span>
                              {t.grade !== null && <span style={{ fontSize: 11, padding: "2px 7px", borderRadius: 6, background: D.card2, color: gradeColor(t.grade), fontWeight: 500 }}>{fmtGradeFull(t.grade)}{t.gradeMode === "points" ? (t.pts ? " · +" + t.pts + " pts" : "") : (t.pct ? " · " + t.pct + "%" : "")}</span>}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", fontSize: 11, color: D.muted, marginTop: 2 }}>
                              <span>{subj?.name || "Sin asignatura"}</span>
                              <span style={{ color: D.border }}>·</span>
                              <span style={{ display: "flex", alignItems: "center", gap: 3, fontWeight: 500,
                                color: days < 0 ? D.red : days <= 3 ? D.amber : D.text }}>
                                📅 {t.dueDate}{t.hour ? " · " + t.hour : ""}
                                <span style={{ fontSize: 10, padding: "1px 5px", borderRadius: 4,
                                  background: days < 0 ? D.red + "22" : days === 0 ? D.amber + "22" : days <= 3 ? D.amber + "11" : D.card2,
                                  color: days < 0 ? D.red : days === 0 ? D.amber : days <= 3 ? D.amber : D.muted }}>
                                  {days < 0 ? "Vencida" : days === 0 ? "Hoy" : days + "d"}
                                </span>
                              </span>
                              <span style={{ color: D.border }}>·</span>
                              <span style={{ color: STATUS_COLOR[t.status] }}>{t.status}</span>
                            </div>
                          </div>
                          <button onClick={() => openEditTask(t)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 14, padding: 4 }}>✎</button>
                          <button onClick={() => deleteTask(t.id)}  style={{ background: "none", border: "none", cursor: "pointer", color: D.red,  fontSize: 14, padding: 4 }}>✕</button>
                        </div>
                      </React.Fragment>
                    );
                  })}
                </div>
              </div>
              <Card>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: D.muted }}>Asignaturas</span>
                  <button onClick={openNewSubj} style={{ marginLeft: "auto", padding: "5px 10px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 12, cursor: "pointer" }}>+ Añadir</button>
                </div>
                {activeSubjects.map((s, i) => (
                  <React.Fragment key={s.id}>
                  {i > 0 && subjectGroupKey(activeSubjects[i - 1]) !== subjectGroupKey(s) &&
                    <div style={{ height: 3, borderRadius: 2, background: D.muted + "33", margin: "9px 0" }} />}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 8, background: D.card2, marginBottom: 5 }}>
                    <div style={{ width: 9, height: 9, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontSize: 12, flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.name}</span>
                    <button onClick={() => openEditSubj(s)}     style={{ background: "none", border: "none", cursor: "pointer", color: D.muted,  fontSize: 12, padding: "1px 4px" }}>✎</button>
                    <button onClick={() => toggleArchive(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.green, fontSize: 12, padding: "1px 4px" }}>✓</button>
                    <button onClick={() => deleteSubject(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red,   fontSize: 12, padding: "1px 4px" }}>✕</button>
                  </div>
                  </React.Fragment>
                ))}
              </Card>
            </div>
          )}

          {/* ══ Calendario ══ */}
          {/* ══ Notas ══ */}
          {tab === "grades" && (() => {
            const years     = Array.from({ length: activeProgram?.years ?? 4 }, (_, i) => i + 1);
            const semesters = Array.from({ length: activeProgram?.semestersPerYear ?? 2 }, (_, i) => i + 1);

            // ── Helpers de nota ────────────────────────────────────────────
            // El cálculo vive en logic.js (compartido con la futura app móvil)
            const calcFinalGrade = (subjId) => calcGradeOf(tasks, subjects, subjId);

            // ── Progreso y nota media ponderada ────────────────────────────
            const totalCredits    = programSubjects.reduce((a, s) => a + (s.credits || 0), 0);
            const approvedSubjs   = programSubjects.filter(s => s.approved);
            const approvedCredits = approvedSubjs.reduce((a, s) => a + (s.credits || 0), 0);            const careerPct       = totalCredits > 0 ? Math.round((approvedCredits / totalCredits) * 100) : 0;

            // Nota media ponderada: solo asignaturas aprobadas con créditos y nota calculada
            const weightedSum = approvedSubjs.reduce((a, s) => {
              const { finalGrade } = calcFinalGrade(s.id);
              return finalGrade !== null && s.credits ? a + finalGrade * s.credits : a;
            }, 0);
            const weightedCredits = approvedSubjs.reduce((a, s) => {
              const { finalGrade } = calcFinalGrade(s.id);
              return finalGrade !== null && s.credits ? a + s.credits : a;
            }, 0);
            const weightedAvg = weightedCredits > 0 ? weightedSum / weightedCredits : null;

            // ── Grid ───────────────────────────────────────────────────────
            const grid = {};
            years.forEach(y => { grid[y] = {}; semesters.forEach(s => { grid[y][s] = []; }); });
            const unassigned = [];
            programSubjects.forEach(s => {
              if (!s.year) { unassigned.push(s); return; }
              // Normalizar semester a array (compatibilidad con datos legacy)
              let sems = s.semester;
              if (s.annual) sems = semesters; // legacy annual
              else if (!sems) { unassigned.push(s); return; }
              else if (!Array.isArray(sems)) sems = [sems];
              if (sems.length === 1) {
                grid[s.year]?.[sems[0]]?.push(s);
              } else {
                // Múltiples cuatrimestres: créditos divididos
                const splitCredits = s.credits ? s.credits / sems.length : null;
                sems.forEach(sem => grid[s.year]?.[sem]?.push({ ...s, credits: splitCredits, _splitSem: sem, _splitOf: sems.length }));
              }
            });

            // (gradeColor2 eliminada — se usa la función global gradeColor con degradado)

            // ── Fila de asignatura ─────────────────────────────────────────
            const SubjGradeRow = ({ s }) => {
              const { finalGrade, totalPct } = calcFinalGrade(s.id);
              const rowKey = s._splitSem ? s.id + "_" + s._splitSem : s.id;
              const isSelected = selGradeSubj === rowKey;
              const showGrade = totalPct >= 100 || (s.manualGrade !== null && s.manualGrade !== undefined);
              return (
                <div
                  onClick={() => setSelGradeSubj(isSelected ? null : rowKey)}
                  style={{ display: "flex", alignItems: "center", gap: 10, padding: "9px 12px", borderRadius: 9, background: isSelected ? s.color + "22" : D.card2, marginBottom: 5, borderLeft: "3px solid " + s.color, cursor: "pointer", transition: "background 0.15s" }}
                >
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{s.name}{s._splitSem ? <span style={{ fontSize: 10, color: D.muted, marginLeft: 5 }}>C{s._splitSem}</span> : null}</span>
                  {s.credits && <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{s.credits} ECTS</span>}
                  <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{totalPct > 0 ? totalPct + "%" : "—"}</span>
                  <span style={{ fontSize: 14, fontWeight: 700, color: showGrade ? gradeColor(finalGrade) : D.muted, minWidth: 44, textAlign: "right" }}>
                    {showGrade && finalGrade !== null ? fmtGrade(finalGrade) + (subjectMedal(finalGrade, s.approved) ? " " + subjectMedal(finalGrade, s.approved) : "") : "—"}
                  </span>
                  {s.approved && !subjectMedal(finalGrade, s.approved) && (
                    <span style={{ fontSize: 10, color: D.green, background: D.green + "22", padding: "2px 6px", borderRadius: 5, flexShrink: 0 }}>✓</span>
                  )}
                  <span style={{ fontSize: 11, color: D.muted }}>{isSelected ? "▲" : "▼"}</span>
                </div>
              );
            };

            // ── Panel de desglose ──────────────────────────────────────────
            const GradeDetail = ({ subjId }) => {
              const s = subjects.find(x => x.id === subjId);
              if (!s) return null;
              const { finalGrade, baseGrade, bonus, totalPct, gradedTasks, pointsTasks } = calcFinalGrade(subjId);
              const gradedNoPct = tasks.filter(t => t.subjectId === subjId && t.gradeMode !== "points" && t.grade !== null && (!t.pct || t.pct === 0));
              const hasCalcGrade = finalGrade !== null;
              const displayGrade = s.manualGrade !== null && s.manualGrade !== undefined ? s.manualGrade : finalGrade;
              const isManual = s.manualGrade !== null && s.manualGrade !== undefined;

              return (
                <div style={{ margin: "0 0 10px 0", padding: "14px 16px", borderRadius: 10, background: D.card, border: "1px solid " + s.color + "66" }}>
                  {/* Header */}
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
                    <div style={{ width: 10, height: 10, borderRadius: "50%", background: s.color, flexShrink: 0 }} />
                    <span style={{ fontWeight: 600, fontSize: 14, flex: 1 }}>{s.name}</span>
                    <button onClick={() => openEditSubj(s)} style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.muted, fontSize: 12, padding: "3px 10px" }}>✎ Editar</button>
                    <button onClick={() => openNewTask(s)} style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.accent, fontSize: 12, padding: "3px 10px" }}>+ Tarea</button>
                    <button
                      onClick={() => { toggleApprove(s.id); setSelGradeSubj(null); }}
                      style={{ background: s.approved ? D.card2 : D.green + "33", border: "1px solid " + (s.approved ? D.border : D.green), borderRadius: 7, cursor: "pointer", color: s.approved ? D.muted : D.green, fontSize: 12, padding: "4px 12px", fontWeight: 600, flexShrink: 0 }}>
                      {s.approved ? "↩ Restaurar" : "✓ Marcar aprobada"}
                    </button>
                    <button onClick={() => setSelGradeSubj(null)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 16, padding: "2px 6px" }}>✕</button>
                  </div>

                  {/* Nota manual */}
                  <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderRadius: 8, background: D.card2, marginBottom: 12 }}>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontSize: 11, color: D.muted, marginBottom: 3 }}>Nota final</div>
                      <div style={{ fontSize: 20, fontWeight: 700, color: gradeColor(displayGrade) }}>
                        {fmtGradeFull(displayGrade)}{subjectMedal(displayGrade, s.approved) ? " " + subjectMedal(displayGrade, s.approved) : ""}
                        {isManual && <span style={{ fontSize: 10, color: D.amber, marginLeft: 6, fontWeight: 400 }}>manual</span>}
                        {!isManual && hasCalcGrade && <span style={{ fontSize: 10, color: D.muted, marginLeft: 6, fontWeight: 400 }}>calculada</span>}
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                      <input
                        type="number" min="0" max="10" step="0.01" placeholder="Nota manual"
                        defaultValue={s.manualGrade ?? ""}
                        key={s.id + "_manual"}
                        onBlur={e => {
                          const v = e.target.value.trim();
                          setSubjects(prev => prev.map(x => x.id === s.id ? touch({ ...x, manualGrade: parseNum(v) }) : x));
                        }}
                        style={{ width: 90, padding: "6px 8px", borderRadius: 7, border: "1px solid " + D.border, background: D.card, color: D.text, fontSize: 13 }}
                      />
                      {isManual && (
                        <button
                          onClick={() => setSubjects(prev => prev.map(x => x.id === s.id ? touch({ ...x, manualGrade: null }) : x))}
                          style={{ background: "none", border: "1px solid " + D.border, borderRadius: 7, cursor: "pointer", color: D.muted, fontSize: 11, padding: "5px 8px" }}
                          title="Volver a la nota calculada">✕ Quitar</button>
                      )}
                    </div>
                  </div>

                  {/* Tareas con peso % */}
                  {gradedTasks.length > 0 && gradedTasks.map(t => (
                    <div key={t.id} onClick={() => openEditTask(t)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: D.card2, marginBottom: 5, cursor: "pointer" }}>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                        <div style={{ height: 4, borderRadius: 2, background: D.border, overflow: "hidden", marginTop: 4 }}>
                          <div style={{ height: "100%", borderRadius: 2, background: s.color, width: t.pct + "%" }} />
                        </div>
                      </div>
                      <span style={{ fontSize: 12, color: D.muted, flexShrink: 0 }}>{t.pct}%</span>
                      <span style={{ fontSize: 13, fontWeight: 700, color: gradeColor(t.grade), minWidth: 32, textAlign: "right" }}>{t.grade}</span>
                    </div>
                  ))}

                  {/* Puntos extra */}
                  {pointsTasks.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: D.muted, margin: "8px 0 5px" }}>Puntos extra:</div>
                      {pointsTasks.map(t => (
                        <div key={t.id} onClick={() => openEditTask(t)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: D.card2, marginBottom: 5, cursor: "pointer" }}>
                          <span style={{ flex: 1, fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                          <span style={{ fontSize: 12, color: D.muted }}>{t.pts} pts máx</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: D.green }}>+{((t.grade / 10) * t.pts).toFixed(2)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {/* Sin peso */}
                  {gradedNoPct.length > 0 && (
                    <>
                      <div style={{ fontSize: 11, color: D.muted, margin: "8px 0 5px" }}>Sin peso asignado:</div>
                      {gradedNoPct.map(t => (
                        <div key={t.id} onClick={() => openEditTask(t)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 10px", borderRadius: 7, background: D.card2, marginBottom: 5, cursor: "pointer" }}>
                          <span style={{ flex: 1, fontSize: 12, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</span>
                          <span style={{ fontSize: 13, fontWeight: 700, color: gradeColor(t.grade) }}>{fmtGradeFull(t.grade)}</span>
                        </div>
                      ))}
                    </>
                  )}

                  {gradedTasks.length === 0 && pointsTasks.length === 0 && gradedNoPct.length === 0 && (
                    <div style={{ fontSize: 12, color: D.muted, textAlign: "center", padding: "8px 0" }}>Sin tareas con nota — usa la nota manual de arriba</div>
                  )}

                  {/* Resumen calculado */}
                  {!isManual && (baseGrade !== null || bonus > 0) && (
                    <div style={{ borderTop: "1px solid " + D.border, marginTop: 10, paddingTop: 10, display: "flex", gap: 16, justifyContent: "flex-end", flexWrap: "wrap" }}>
                      {gradedTasks.length > 0 && <span style={{ fontSize: 12, color: totalPct < 100 ? D.amber : D.muted }}>Peso: {totalPct}%{totalPct < 100 ? " ⚠" : ""}</span>}
                      {baseGrade !== null && bonus > 0 && <span style={{ fontSize: 12, color: D.muted }}>Base: {fmtGrade(baseGrade)}</span>}
                      {bonus > 0 && <span style={{ fontSize: 12, color: D.green }}>Bonus: +{bonus.toFixed(2)}</span>}
                    </div>
                  )}
                </div>
              );
            };

            return (
              <div ref={gradesRef} style={{ display: "flex", flexDirection: "column", gap: 20 }}>

                {/* Progreso de carrera */}
                <Card>
                  <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 14 }}>
                    <div style={{ flexShrink: 0 }}>
                      <div style={{ fontSize: 13, color: D.muted, marginBottom: 2 }}>Progreso de carrera</div>
                      <div style={{ fontSize: 28, fontWeight: 700, color: D.accent }}>{careerPct}%</div>
                    </div>
                    <div style={{ flex: 1 }}>
                      <div style={{ height: 10, borderRadius: 5, background: D.card2, overflow: "hidden", marginBottom: 6 }}>
                        <div style={{ height: "100%", borderRadius: 5, background: D.accent, width: careerPct + "%", transition: "width 0.6s" }} />
                      </div>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: D.muted }}>
                        <span>{approvedCredits} créditos aprobados</span>
                        <span>{totalCredits} créditos totales</span>
                      </div>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 8, flexShrink: 0 }}>
                      <div style={{ textAlign: "center", padding: "8px 14px", background: D.card2, borderRadius: 9 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: D.green }}>{approvedSubjs.length}</div>
                        <div style={{ fontSize: 11, color: D.muted }}>Aprobadas</div>
                      </div>
                      <div style={{ textAlign: "center", padding: "8px 14px", background: D.card2, borderRadius: 9 }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: D.accent }}>{programSubjects.length - approvedSubjs.length}</div>
                        <div style={{ fontSize: 11, color: D.muted }}>En curso</div>
                      </div>
                      <div style={{ textAlign: "center", padding: "8px 14px", background: D.card2, borderRadius: 9, border: "1px solid " + (weightedAvg ? gradeColor(weightedAvg) + "55" : D.border) }}>
                        <div style={{ fontSize: 20, fontWeight: 700, color: weightedAvg ? gradeColor(weightedAvg) : D.muted }}>
                          {fmtGrade(weightedAvg)}
                        </div>
                        <div style={{ fontSize: 11, color: D.muted }}>Nota media</div>
                      </div>
                    </div>
                  </div>
                  {/* Barra por cursos */}
                  <div style={{ display: "flex", gap: 6 }}>
                    {years.map(y => {
                      const yearSubjs    = programSubjects.filter(s => s.year === y);
                      const yearCredits  = yearSubjs.reduce((a, s) => a + (s.credits || 0), 0);
                      const yearApproved = yearSubjs.filter(s => s.approved).reduce((a, s) => a + (s.credits || 0), 0);
                      const pct = yearCredits > 0 ? Math.round(yearApproved / yearCredits * 100) : 0;
                      // Nota media del año
                      const yrWeightedSum = yearSubjs.filter(s => s.approved).reduce((a, s) => {
                        const { finalGrade } = calcFinalGrade(s.id);
                        return finalGrade !== null && s.credits ? a + finalGrade * s.credits : a;
                      }, 0);
                      const yrWeightedCr  = yearSubjs.filter(s => s.approved).reduce((a, s) => {
                        const { finalGrade } = calcFinalGrade(s.id);
                        return finalGrade !== null && s.credits ? a + s.credits : a;
                      }, 0);
                      const yrAvg = yrWeightedCr > 0 ? yrWeightedSum / yrWeightedCr : null;
                      return (
                        <div key={y} style={{ flex: 1, padding: "8px 10px", background: D.card2, borderRadius: 8, textAlign: "center" }}>
                          <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>{y}º Año</div>
                          <div style={{ height: 5, borderRadius: 3, background: D.border, overflow: "hidden", marginBottom: 4 }}>
                            <div style={{ height: "100%", borderRadius: 3, background: D.accent, width: pct + "%", transition: "width 0.5s" }} />
                          </div>
                          <div style={{ fontSize: 12, fontWeight: 600, color: pct === 100 ? D.green : D.text }}>{pct}%</div>
                          <div style={{ fontSize: 10, color: D.muted }}>{yearApproved}/{yearCredits} ECTS</div>
                          {yrAvg !== null && <div style={{ fontSize: 11, fontWeight: 600, color: gradeColor(yrAvg), marginTop: 2 }}>{fmtGrade(yrAvg)}</div>}
                        </div>
                      );
                    })}
                  </div>
                </Card>

                {/* Grid por año y cuatrimestre */}
                {years.map(y => {
                  const hasAny = semesters.some(s => grid[y]?.[s]?.length > 0);
                  if (!hasAny) return null;
                  return (
                    <div key={y}>
                      <div style={{ fontSize: 14, fontWeight: 600, color: D.text, marginBottom: 10, paddingLeft: 2 }}>{y}º Año</div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
                        {semesters.map(sem => {
                          const list = grid[y]?.[sem] || [];
                          if (list.length === 0) return null;
                          const semCredits  = list.reduce((a, x) => a + (x.credits || 0), 0);
                          const semApproved = list.filter(x => x.approved).reduce((a, x) => a + (x.credits || 0), 0);
                          return (
                            <Card key={sem}>
                              <div style={{ display: "flex", alignItems: "center", marginBottom: 12 }}>
                                <span style={{ fontSize: 13, fontWeight: 500, color: D.muted }}>Cuatrimestre {sem}</span>
                                {semCredits > 0 && <span style={{ marginLeft: "auto", fontSize: 11, color: D.muted }}>{semApproved}/{semCredits} ECTS</span>}
                              </div>
                              {list.map(subj => (
                                <React.Fragment key={subj.id + (subj._splitSem ? "_" + subj._splitSem : "")}>
                                  <SubjGradeRow s={subj} />
                                  {selGradeSubj === subj.id && !subj._splitSem && <GradeDetail subjId={subj.id} />}
                                  {selGradeSubj === subj.id + "_" + subj._splitSem && subj._splitSem && <GradeDetail subjId={subj.id} />}
                                </React.Fragment>
                              ))}
                            </Card>
                          );
                        })}
                      </div>
                    </div>
                  );
                })}

                {/* Sin asignar */}
                {unassigned.length > 0 && (
                  <Card>
                    <div style={{ fontSize: 13, fontWeight: 500, color: D.muted, marginBottom: 12 }}>Sin curso/cuatrimestre asignado</div>
                    {unassigned.map(s => (
                      <React.Fragment key={s.id}>
                        <SubjGradeRow s={s} />
                        {selGradeSubj === s.id && <GradeDetail subjId={s.id} />}
                      </React.Fragment>
                    ))}
                  </Card>
                )}
                {/* Desviación típica + gráfica nota/créditos */}
                {(() => {
                  const withGrades = programSubjects.map(s => ({ ...s, g: calcFinalGrade(s.id).finalGrade })).filter(s => s.g !== null);
                  if (!withGrades.length) return null;
                  const n = withGrades.length;
                  const mean = withGrades.reduce((a, s) => a + s.g, 0) / n;
                  const sd = stdDev(withGrades.map(s => s.g));
                  const maxCred = Math.max(...withGrades.map(s => s.credits || 0), 1);
                  const W = 560, H = 220, PAD = 34;
                  const sx = c => PAD + (c / maxCred) * (W - PAD - 10);
                  const sy = g => H - PAD - (g / 10) * (H - PAD - 10);
                  // Línea de tendencia por mínimos cuadrados (x=créditos, y=nota)
                  const { slope, intercept } = linearRegression(withGrades.map(s => ({ x: s.credits || 0, y: s.g })));
                  const clamp = g => Math.max(0, Math.min(10, g));
                  return (
                    <Card>
                      <div style={{ display: "flex", gap: 28, marginBottom: 16 }}>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: D.muted, marginBottom: 4 }}>Nota media</div>
                          <div style={{ fontSize: 22, fontWeight: 700, color: gradeColor(mean) }}>{fmtGrade(mean)}</div>
                        </div>
                        <div>
                          <div style={{ fontSize: 13, fontWeight: 500, color: D.muted, marginBottom: 4 }}>Desviación típica</div>
                          <div style={{ fontSize: 22, fontWeight: 700 }}>{sd.toFixed(2)}</div>
                        </div>
                      </div>
                      <div style={{ fontSize: 13, fontWeight: 500, color: D.muted, marginBottom: 8 }}>Créditos vs. nota por asignatura</div>
                      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: "100%", height: 220 }}>
                        <line x1={PAD} y1={H - PAD} x2={W - 10} y2={H - PAD} stroke={D.border} />
                        <line x1={PAD} y1={10} x2={PAD} y2={H - PAD} stroke={D.border} />
                        {[0, 0.25, 0.5, 0.75, 1].map(f => <text key={f} x={sx(f * maxCred)} y={H - PAD + 14} fontSize="9" fill={D.muted} textAnchor="middle">{(f * maxCred).toFixed(1)}</text>)}
                        {[0, 2, 4, 6, 8, 10].map(g => <text key={g} x={PAD - 6} y={sy(g) + 3} fontSize="9" fill={D.muted} textAnchor="end">{g}</text>)}
                        <line x1={sx(0)} y1={sy(clamp(intercept))} x2={sx(maxCred)} y2={sy(clamp(slope * maxCred + intercept))} stroke={D.accent} strokeWidth="1.5" strokeDasharray="4 3" opacity="0.6" />
                        {withGrades.map(s => (
                          <circle key={s.id} cx={sx(s.credits || 0)} cy={sy(s.g)} r="6" fill={s.color}
                            onMouseEnter={e => setChartTip({ x: e.clientX, y: e.clientY, name: s.name, grade: s.g })}
                            onMouseMove={e => setChartTip(t => t ? { ...t, x: e.clientX, y: e.clientY } : t)}
                            onMouseLeave={() => setChartTip(null)}
                            style={{ cursor: "pointer" }} />
                        ))}
                      </svg>
                    </Card>
                  );
                })()}
                {chartTip && (
                  <div style={{ position: "fixed", zIndex: 500, left: chartTip.x + 12, top: chartTip.y + 12, padding: "6px 10px", borderRadius: 7, background: D.card, border: "1px solid " + D.border, boxShadow: "0 4px 12px #0008", fontSize: 12, pointerEvents: "none" }}>
                    <div style={{ fontWeight: 600 }}>{chartTip.name}</div>
                    <div style={{ color: D.muted }}>Nota: {fmtGrade(chartTip.grade)}</div>
                  </div>
                )}
              </div>
            );
          })()}

          {/* ══ Calendario ══ */}
          {tab === "calendar" && (() => {
            const [nextMonth, nextYear] = shiftMonth(calMonth, calYear, 1);
            return (
              <Card>
                <div style={{ display: "flex", alignItems: "center", marginBottom: 18 }}>
                  <button onClick={() => moveCal(-1)} style={{ background: D.card2, border: "1px solid " + D.border, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: D.text, fontSize: 16 }}>‹ Mes anterior</button>
                  <div style={{ flex: 1 }} />
                  <button onClick={() => moveCal(1)} style={{ background: D.card2, border: "1px solid " + D.border, borderRadius: 8, padding: "7px 14px", cursor: "pointer", color: D.text, fontSize: 16 }}>Mes siguiente ›</button>
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 32 }}>
                  <MonthGrid year={calYear}  month={calMonth}  tasks={tasks} subjects={subjects} todayStr={todayStr} onEditTask={openEditTask} onAddReminder={openNewReminder} />
                  {calendarView === "dual" && (
                    <MonthGrid year={nextYear} month={nextMonth} tasks={tasks} subjects={subjects} todayStr={todayStr} onEditTask={openEditTask} onAddReminder={openNewReminder} />
                  )}
                </div>
              </Card>
            );
          })()}

          {/* ══ Horario ══ */}
          {tab === "horario" && (() => {
            const toMin = timeToMinutes;
            // Las clases del horario no tienen fecha, así que llevan el curso guardado.
            // Las creadas antes de existir ese campo son del curso 2026/27.
            const courseOf = s => s.course ?? 2026;
            const conClases = [...new Set(schedule.map(courseOf))].sort((a, b) => b - a);
            const scheduleCourses = [...new Set([...conClases, academicCourseOf(today())])].sort((a, b) => b - a);
            // Si no hay ninguno elegido a mano, se usa el curso actual si tiene
            // clases y, si no, el más reciente que sí las tenga.
            const cursoActual = academicCourseOf(today());
            const cursoVisible = scheduleCourse ?? (conClases.includes(cursoActual) ? cursoActual : (conClases[0] ?? cursoActual));
            const daySlots = d => schedule.filter(s => s.day === d && courseOf(s) === cursoVisible);

            // En automático la rejilla va de la primera a la última clase del curso.
            // A mano, del rango de Ajustes, estirado si alguna clase cae fuera para
            // que nunca quede oculta. Sin clases, Math.min/max de vacío da ±Infinity.
            const visibles = schedule.filter(s => courseOf(s) === cursoVisible);
            const minClase = Math.min(...visibles.map(s => toMin(s.start)));
            const maxClase = Math.max(...visibles.map(s => toMin(s.end)));
            const DAY_START = scheduleAuto && visibles.length ? minClase : Math.min(toMin(scheduleStart), minClase);
            const DAY_END   = scheduleAuto && visibles.length ? maxClase : Math.max(toMin(scheduleEnd),   maxClase);
            const DAY_SPAN  = Math.max(60, DAY_END - DAY_START);
            const PX_HORA   = 62;
            const ALTURA    = (DAY_SPAN / 60) * PX_HORA;
            const HORAS     = Array.from({ length: Math.floor(DAY_SPAN / 60) + 1 }, (_, i) => DAY_START + i * 60);
            // Clase en curso: getDay() da 0=domingo, DAYS empieza en lunes
            const todayDay = DAYS[weekdayIndex(now)];
            const nowMin   = now.getHours() * 60 + now.getMinutes();
            const isNow    = slot => slot.day === todayDay && nowMin >= toMin(slot.start) && nowMin < toMin(slot.end);
            // Marca de la hora actual, cruzando el horario entero. `now` se refresca
            // cada minuto (ver el setInterval de arriba).
            const enRejilla = nowMin >= DAY_START && nowMin <= DAY_END;
            const nowTop    = (nowMin - DAY_START) / 60 * PX_HORA;

            return (
              <div>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
                  <span style={{ fontSize: 13, fontWeight: 500, color: D.muted }}>Horario de clases</span>
                  <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                    {scheduleCourses.map(y => (
                      <button key={y} onClick={() => setScheduleCourse(y)}
                        style={{ padding: "5px 12px", borderRadius: 7, border: "1px solid " + (cursoVisible === y ? D.accent : D.border), background: cursoVisible === y ? D.accent : "none", color: cursoVisible === y ? "#fff" : D.muted, fontSize: 12, cursor: "pointer" }}>
                        {academicCourseLabel(y)}
                      </button>
                    ))}
                  </div>
                </div>
                <Card style={{ marginBottom: 20 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "40px repeat(7,1fr)", gap: 4 }}>
                    <div />
                    {DAYS.map(d => <div key={d} style={{ textAlign: "center", fontSize: 12, fontWeight: 600, color: D.muted, padding: "4px 0" }}>{d}</div>)}
                    <div style={{ position: "relative", height: ALTURA }}>
                      {HORAS.map((m, i) => (
                        <div key={m} style={{ position: "absolute", top: i * PX_HORA - 6, right: 6, fontSize: 10, color: D.muted }}>
                          {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
                        </div>
                      ))}
                      {enRejilla && (
                        <div style={{ position: "absolute", top: nowTop - 7, right: 4, fontSize: 10, fontWeight: 700, color: "#fff", background: D.red, borderRadius: 4, padding: "0 3px", zIndex: 4 }}>
                          {String(Math.floor(nowMin / 60)).padStart(2, "0")}:{String(nowMin % 60).padStart(2, "0")}
                        </div>
                      )}
                    </div>
                    {DAYS.map(d => (
                      <div key={d} style={{ position: "relative", height: ALTURA }}>
                        {/* Líneas de hora */}
                        {HORAS.map((m, i) => (
                          <div key={m} style={{ position: "absolute", top: i * PX_HORA, left: 0, right: 0, height: 1, background: D.border }} />
                        ))}
                        {/* Hora actual. Un trozo por columna, estirado sobre el gap de
                            4px de la rejilla para que se vea como una línea continua. */}
                        {enRejilla && (
                          <div style={{ position: "absolute", top: nowTop, left: -4, right: -4, height: 2, background: D.red, zIndex: 4, pointerEvents: "none" }} />
                        )}
                        {daySlots(d).map(slot => {
                          const subj = subjects.find(s => s.id === slot.subjectId);
                          const top = (toMin(slot.start) - DAY_START) / 60 * PX_HORA;
                          const h   = Math.max(26, (toMin(slot.end) - toMin(slot.start)) / 60 * PX_HORA);
                          const active = isNow(slot);
                          const color = subj?.color || D.accent;
                          return (
                            <div key={slot.id}
                              onClick={() => setEditSlot({ ...slot, subjectId: String(slot.subjectId) })}
                              title={`${subj?.name || "?"} · ${slot.start}-${slot.end}${active ? " · en curso" : ""}`}
                              style={{
                                position: "absolute", top, height: h - 3, left: 3, right: 1,
                                background: color + "33", borderLeft: "3px solid " + color, borderRadius: 6,
                                padding: "4px 6px", overflow: "hidden", cursor: "pointer",
                                boxShadow: active ? "0 0 0 2px " + D.accent + ", 0 0 12px " + D.accent + "88" : "none",
                                zIndex: active ? 2 : 1,
                              }}>
                              <div style={{ fontSize: 11, fontWeight: 700, color: D.text, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                                {subj?.acronym || subj?.name?.slice(0, 4) || "?"}
                              </div>
                              {h > 40 && (
                                <div style={{ fontSize: 10, color: D.muted, whiteSpace: "nowrap" }}>{slot.start}–{slot.end}</div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    ))}
                  </div>
                </Card>

                <Card>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: D.muted }}>Añadir clase</div>
                  <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 2fr auto", gap: 8, alignItems: "end" }}>
                    <div>
                      <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Día</div>
                      <select value={scheduleForm.day} onChange={e => setScheduleForm(f => ({ ...f, day: e.target.value }))} style={inp}>
                        {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Inicio</div>
                      <TimeWheel value={scheduleForm.start} onChange={v => setScheduleForm(f => ({ ...f, start: v }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Fin</div>
                      <TimeWheel value={scheduleForm.end} onChange={v => setScheduleForm(f => ({ ...f, end: v }))} />
                    </div>
                    <div>
                      <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Asignatura</div>
                      <select value={scheduleForm.subjectId} onChange={e => setScheduleForm(f => ({ ...f, subjectId: e.target.value }))} style={inp}>
                        <option value="">Selecciona…</option>
                        {activeSubjects.map(s => <option key={s.id} value={s.id}>{s.acronym ? s.acronym + " — " : ""}{s.name}</option>)}
                      </select>
                    </div>
                    <button onClick={() => { if (!scheduleForm.subjectId) return; setSchedule(prev => [...prev, touch({ id: newId(), day: scheduleForm.day, start: scheduleForm.start, end: scheduleForm.end, subjectId: String(scheduleForm.subjectId), course: cursoVisible })]); }}
                      style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: D.accent, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>＋ Añadir</button>
                  </div>
                </Card>
              </div>
            );
          })()}

          {/* ══ Stats ══ */}
          {tab === "stats" && (
            <div>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 22 }}>
                <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid " + D.border }}>
                  {[["global","Global"],["last7","7 días"],["last30","30 días"],["week","Esta semana"],["month","Este mes"]].map(([k, label], i, arr) => (
                    <button key={k} onClick={() => setStatsPeriod(k)} style={{ padding: "9px 16px", border: "none", background: statsPeriod === k ? D.accent : D.card2, color: statsPeriod === k ? "#fff" : D.muted, fontSize: 13, cursor: "pointer", fontWeight: statsPeriod === k ? 500 : 400, borderRight: i < arr.length - 1 ? "1px solid " + D.border : "none" }}>{label}</button>
                  ))}
                </div>
                {academicCourses.length > 0 && (
                  <div style={{ display: "flex", gap: 0, borderRadius: 10, overflow: "hidden", border: "1px solid " + D.border }}>
                    {academicCourses.map((y, i, arr) => (
                      <button key={y} onClick={() => setStatsPeriod("course_" + y)}
                        style={{ padding: "9px 14px", border: "none",
                          background: statsPeriod === "course_" + y ? D.accent : D.card2,
                          color: statsPeriod === "course_" + y ? "#fff" : D.muted,
                          fontSize: 13, cursor: "pointer", fontWeight: statsPeriod === "course_" + y ? 500 : 400,
                          borderRight: i < arr.length - 1 ? "1px solid " + D.border : "none" }}>
                        {y}/{String(y+1).slice(2)}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 12, marginBottom: 22 }}>
                <StatCard label="Tiempo" value={fmtTime(totalMinutes)} color={D.accent} />
                <StatCard label="Sesiones" value={filteredSessions.length} />
                <StatCard label="Total acumulado" value={fmtTime(sessions.reduce((a, s) => a + s.minutes, 0))} color={D.green} />
                <StatCard label="Exámenes pendientes" value={tasks.filter(t => t.type === "examen" && t.status !== "completada").length} />
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 22, marginBottom: 22 }}>
                <Card>
                  <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 14, color: D.muted }}>Tiempo por asignatura</div>
                  {bySubject.length === 0 && <div style={{ color: D.muted, fontSize: 13, textAlign: "center", padding: "16px 0" }}>Sin sesiones</div>}
                  {bySubject.map(s => (
                    <div key={s.id} style={{ marginBottom: 11 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 4 }}>
                        <span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "70%" }}>{s.name}</span>
                        <span style={{ color: D.muted, flexShrink: 0 }}>{fmtTime(s.minutes)}</span>
                      </div>
                      <div style={{ height: 6, borderRadius: 4, background: D.card2, overflow: "hidden" }}>
                        <div style={{ height: "100%", borderRadius: 4, background: s.color, width: (totalMinutes > 0 ? Math.round((s.minutes / totalMinutes) * 100) : 0) + "%", transition: "width 0.5s" }} />
                      </div>
                    </div>
                  ))}
                </Card>

                {/* ── Historial de sesiones ── */}
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  <Card style={{ padding: 0, overflow: "hidden", flex: "0 0 auto" }}>
                    <div style={{ padding: "12px 14px", borderBottom: "1px solid " + D.border, fontSize: 13, fontWeight: 500, color: D.muted }}>🕐 Historial · días con actividad</div>
                    <div style={{ maxHeight: 260, overflowY: "auto" }}>
                      {allDates.length === 0 && <div style={{ padding: "20px 14px", fontSize: 13, color: D.muted, textAlign: "center" }}>Sin sesiones</div>}
                      {allDates.map(d => {
                        const mins = sessionsByDate[d].reduce((a, s) => a + s.minutes, 0);
                        const isSel = d === historyDate, isT = d === todayStr;
                        return (
                          <div key={d} onClick={() => setHistoryDate(d)} style={{ padding: "8px 14px", cursor: "pointer", background: isSel ? D.accent + "22" : "transparent", borderLeft: isSel ? "3px solid " + D.accent : "3px solid transparent", borderBottom: "1px solid " + D.border + "15" }}>
                            <div style={{ fontSize: 12, fontWeight: isSel ? 500 : 400, color: isT ? D.accent : D.text }}>{d}{isT ? " (hoy)" : ""}</div>
                            <div style={{ fontSize: 11, color: D.muted }}>{fmtTime(mins)} · {sessionsByDate[d].length} sesión{sessionsByDate[d].length !== 1 ? "es" : ""}</div>
                          </div>
                        );
                      })}
                    </div>
                  </Card>
                  <Card>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 4 }}>
                      <div style={{ fontSize: 14, fontWeight: 600, flex: 1 }}>{historyDate}{historyDate === todayStr ? " — Hoy" : ""}</div>
                      <button onClick={() => { const sid = selSubject ?? activeSubjects[0]?.id ?? ""; setManualForm({ ...emptyManual, date: historyDate, subjectId: sid, taskId: getDefaultTaskId(sid) }); setShowManualModal(true); }} style={{ fontSize: 11, padding: "4px 10px", borderRadius: 7, border: "1px solid " + D.border, background: D.card2, color: D.accent, cursor: "pointer", flexShrink: 0 }}>＋ Añadir sesión</button>
                    </div>
                    {dayStats.total === 0
                      ? <div style={{ color: D.muted, fontSize: 13, padding: "12px 0", textAlign: "center" }}>Sin sesiones este día</div>
                      : <>
                        <div style={{ fontSize: 24, fontWeight: 600, color: D.accent, marginBottom: 2 }}>{fmtTime(dayStats.total)}</div>
                        <div style={{ fontSize: 12, color: D.muted, marginBottom: 12 }}>{dayStats.sessions.length} sesión{dayStats.sessions.length !== 1 ? "es" : ""}</div>
                        {dayStats.bySubj.map(s => (
                          <div key={s.name} style={{ marginBottom: 8 }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                              <div style={{ display: "flex", alignItems: "center", gap: 6 }}><div style={{ width: 8, height: 8, borderRadius: "50%", background: s.color }} /><span style={{ fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 140 }}>{s.name}</span></div>
                              <div style={{ display: "flex", gap: 8, color: D.muted, fontSize: 11, flexShrink: 0 }}>
                                <span>{fmtTime(s.minutes)}</span>
                                <span style={{ color: D.accent, fontWeight: 500 }}>{Math.round((s.minutes / dayStats.total) * 100)}%</span>
                              </div>
                            </div>
                            <div style={{ height: 5, borderRadius: 3, background: D.card2, overflow: "hidden" }}>
                              <div style={{ height: "100%", borderRadius: 3, background: s.color, width: Math.round((s.minutes / dayStats.total) * 100) + "%", transition: "width 0.5s" }} />
                            </div>
                          </div>
                        ))}
                      </>
                    }
                  </Card>
                  {dayStats.sessions.length > 0 && (
                    <Card>
                      <div style={{ fontSize: 12, fontWeight: 500, marginBottom: 8, color: D.muted }}>Sesiones del día</div>
                      {dayStats.sessions.map(s => (
                        <div key={s.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 10px", borderRadius: 7, borderLeft: "3px solid " + (subjects.find(x => x.id === s.subjectId)?.color || s.subjectColor), marginBottom: 5, background: D.card2 }}>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 12, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{s.subjectName}</div>
                            {s.taskTitle && <div style={{ fontSize: 10, color: D.muted }}>{s.taskTitle}</div>}
                          </div>
                          <span style={{ fontSize: 11, color: D.muted, flexShrink: 0 }}>{fmtTime(s.minutes)}</span>
                          <button onClick={() => openEditSession(s)} style={{ background: "none", border: "none", cursor: "pointer", color: D.muted, fontSize: 12, padding: "2px 3px" }}>✎</button>
                          <button onClick={() => window.confirm("¿Borrar esta sesión?") && deleteSession(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: D.red, fontSize: 12, padding: "2px 3px" }}>✕</button>
                        </div>
                      ))}
                    </Card>
                  )}
                </div>
              </div>
              <Card style={{ marginTop: 22 }}>
                <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 12, color: D.muted }}>Línea de tiempo</div>
                <SessionTimeline sessions={filteredSessions} subjects={subjects} fmtTime={fmtTime} showEmptyDays={showEmptyDays} onEditSession={openEditSession} onDeleteSession={deleteSession} onAddSession={d => { const { subjectId, taskId } = getMostStudied(d); setManualForm({ ...emptyManual, date: d, subjectId, taskId }); setShowManualModal(true); }} />
              </Card>
            </div>
          )}


          {/* ══ Ajustes ══ */}
          {tab === "settings" && (
            <div style={{ maxWidth: 640, margin: "0 auto", display: "flex", flexDirection: "column", gap: 20 }}>

              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>👤 Cuenta</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 14 }}>
                  {session
                    ? "Tus datos se guardan en la nube y podrás abrirlos desde otro dispositivo."
                    : "Opcional. La app funciona igual sin cuenta — entra solo si quieres sincronizar entre dispositivos."}
                </div>

                {session ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", borderRadius: 9, background: D.card2 }}>
                      <div style={{ width: 34, height: 34, borderRadius: "50%", background: D.accent + "33", color: D.accent, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 15, fontWeight: 700, flexShrink: 0 }}>
                        {(session.user?.email || "?")[0].toUpperCase()}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{session.user?.email}</div>
                        <div style={{ fontSize: 11, color: D.green }}>● Conectado</div>
                      </div>
                      <button onClick={handleSignOut} style={{ padding: "7px 14px", borderRadius: 8, border: "1px solid " + D.border, background: "none", color: D.muted, fontSize: 12, cursor: "pointer", flexShrink: 0 }}>
                        Cerrar sesión
                      </button>
                    </div>

                    <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                      <button onClick={handleSync} disabled={syncBusy}
                        style={{ padding: "9px 18px", borderRadius: 8, border: "none", background: syncBusy ? D.card2 : D.accent, color: syncBusy ? D.muted : "#fff", fontSize: 13, fontWeight: 500, cursor: syncBusy ? "wait" : "pointer" }}>
                        {syncBusy ? "Sincronizando…" : "⇅ Sincronizar ahora"}
                      </button>
                      <span style={{ fontSize: 11, color: D.muted }}>
                        {lastSync ? "Última vez: " + new Date(lastSync).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" }) : "Nunca sincronizado"}
                      </span>
                    </div>
                    {syncMsg && <div style={{ fontSize: 12, color: D.green, padding: "7px 10px", borderRadius: 7, background: D.green + "11" }}>{syncMsg}</div>}
                    {syncErr && <div style={{ fontSize: 12, color: D.red,   padding: "7px 10px", borderRadius: 7, background: D.red + "11" }}>{syncErr}</div>}

                    <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", padding: "8px 12px", borderRadius: 8, background: D.card2 }}>
                      <input type="checkbox" checked={autoSync} onChange={e => setAutoSync(e.target.checked)} style={{ accentColor: D.accent, width: 15, height: 15, cursor: "pointer" }} />
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 12, fontWeight: 500 }}>Sincronizar automáticamente</div>
                        <div style={{ fontSize: 11, color: D.muted }}>Al abrir la app y al cerrarla o minimizarla</div>
                      </div>
                    </label>

                    <div style={{ fontSize: 11, color: D.muted, lineHeight: 1.5 }}>
                      Sube lo que hayas cambiado aquí y baja lo que venga de otros dispositivos.
                      Si el mismo dato cambió en dos sitios, gana el más reciente.
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", gap: 0, borderRadius: 8, overflow: "hidden", border: "1px solid " + D.border, width: "fit-content" }}>
                      {[["signin", "Entrar"], ["signup", "Crear cuenta"]].map(([k, label]) => (
                        <button key={k} onClick={() => { setAuthMode(k); setAuthError(""); setAuthInfo(""); }}
                          style={{ padding: "7px 16px", border: "none", background: authMode === k ? D.accent : D.card2, color: authMode === k ? "#fff" : D.muted, fontSize: 12, cursor: "pointer", fontWeight: authMode === k ? 500 : 400 }}>
                          {label}
                        </button>
                      ))}
                    </div>
                    <input type="email" placeholder="tu@email.com" value={authForm.email} autoComplete="username"
                      onChange={e => setAuthForm(f => ({ ...f, email: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAuth()} style={inp} />
                    <input type="password" placeholder="Contraseña" value={authForm.password} autoComplete="current-password"
                      onChange={e => setAuthForm(f => ({ ...f, password: e.target.value }))}
                      onKeyDown={e => e.key === "Enter" && handleAuth()} style={inp} />
                    {authError && <div style={{ fontSize: 12, color: D.red, padding: "7px 10px", borderRadius: 7, background: D.red + "11" }}>{authError}</div>}
                    {authInfo  && <div style={{ fontSize: 12, color: D.green, padding: "7px 10px", borderRadius: 7, background: D.green + "11" }}>{authInfo}</div>}
                    <button onClick={handleAuth} disabled={authBusy || !authForm.email || !authForm.password}
                      style={{ padding: "9px 0", borderRadius: 8, border: "none", background: (authBusy || !authForm.email || !authForm.password) ? D.card2 : D.accent, color: (authBusy || !authForm.email || !authForm.password) ? D.muted : "#fff", fontSize: 13, fontWeight: 500, cursor: (authBusy || !authForm.email || !authForm.password) ? "not-allowed" : "pointer" }}>
                      {authBusy ? "Un momento…" : authMode === "signup" ? "Crear cuenta" : "Entrar"}
                    </button>
                  </div>
                )}
              </Card>

              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🎓 Programas de estudio</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 14 }}>Cada programa tiene sus propias asignaturas, tareas y sesiones.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 14 }}>
                  {programs.map(p => {
                    const isActive = p.id === activeProgramId;
                    return (
                      <div key={p.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 9, background: D.card2, border: "2px solid " + (isActive ? p.color : D.border) }}>
                        <div style={{ width: 10, height: 10, borderRadius: "50%", background: p.color, flexShrink: 0 }} />
                        <div style={{ flex: 1 }}>
                          <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                          <div style={{ fontSize: 11, color: D.muted }}>{p.type === "career" ? "Grado" : "Máster"} · {p.years} año{p.years !== 1 ? "s" : ""} · {p.semestersPerYear} cuatrimestre{p.semestersPerYear !== 1 ? "s" : ""}/año</div>
                        </div>
                        {isActive && <span style={{ fontSize: 11, color: p.color, background: p.color + "22", padding: "2px 8px", borderRadius: 5 }}>Activo</span>}
                        {!isActive && <button onClick={() => setAppState(prev => ({ ...prev, activeProgram: p.id }))} style={{ fontSize: 12, padding: "4px 10px", borderRadius: 7, border: "1px solid " + D.border, background: D.card, color: D.text, cursor: "pointer" }}>Cambiar</button>}
                        <button onClick={() => { setEditingProgId(p.id); setEditProgForm({ name: p.name, type: p.type, years: p.years, semestersPerYear: p.semestersPerYear, color: p.color }); }} style={{ fontSize: 13, padding: "4px 8px", borderRadius: 7, border: "none", background: "none", color: D.muted, cursor: "pointer" }} title="Editar">✎</button>
                        {/* Borrado lógico, como todo lo demás: quitarlo del array
                            y borrar su programData no deja rastro para el servidor,
                            así que la siguiente sincronización lo volvía a bajar. */}
                        {programs.length > 1 && <button onClick={() => { if (!isActive && window.confirm(`¿Eliminar el programa "${p.name}" y todos sus datos?`)) setAppState(prev => ({ ...prev, programs: prev.programs.map(x => x.id === p.id ? softDelete(x) : x) })); }} style={{ fontSize: 13, padding: "4px 8px", borderRadius: 7, border: "none", background: "none", color: D.red, cursor: !isActive ? "pointer" : "not-allowed", opacity: isActive ? 0.3 : 1 }} title={isActive ? "No puedes borrar el programa activo" : "Borrar programa"}>✕</button>}
                      </div>
                    );
                  })}
                </div>
                {/* Añadir programa */}
                {!addingProg
                  ? <button onClick={() => setAddingProg(true)} style={{ padding: "8px 16px", borderRadius: 8, border: "1px dashed " + D.border, background: "none", color: D.muted, fontSize: 13, cursor: "pointer", width: "100%" }}>+ Añadir programa</button>
                  : <div style={{ padding: 14, borderRadius: 9, background: D.card2, border: "1px solid " + D.border, display: "flex", flexDirection: "column", gap: 10 }}>
                      <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 2 }}>Nuevo programa</div>
                      <input placeholder="Nombre (ej: Máster en Ingeniería)" value={newProg.name} onChange={e => setNewProg(f => ({ ...f, name: e.target.value }))} style={inp} />
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                        <div>
                          <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Tipo</div>
                          <div style={{ display: "flex", gap: 4 }}>
                            {[["career","Grado"],["master","Máster"]].map(([v,l]) => (
                              <button key={v} onClick={() => setNewProg(f => ({ ...f, type: v, years: v === "master" ? 2 : 4 }))} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid " + (newProg.type === v ? D.accent : D.border), background: newProg.type === v ? D.accent + "22" : D.card, color: newProg.type === v ? D.accent : D.muted, fontSize: 12, cursor: "pointer" }}>{l}</button>
                            ))}
                          </div>
                        </div>
                        <div>
                          <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Años</div>
                          <div style={{ display: "flex", gap: 3 }}>
                            {[1,2,3,4,5,6].map(y => (
                              <button key={y} onClick={() => setNewProg(f => ({ ...f, years: y }))} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid " + (newProg.years === y ? D.accent : D.border), background: newProg.years === y ? D.accent + "22" : D.card, color: newProg.years === y ? D.accent : D.muted, fontSize: 12, cursor: "pointer" }}>{y}</button>
                            ))}
                          </div>
                        </div>
                      </div>
                      <div>
                        <div style={{ fontSize: 11, color: D.muted, marginBottom: 4 }}>Cuatrimestres por año</div>
                        <div style={{ display: "flex", gap: 4 }}>
                          {[1,2,3,4].map(s => (
                            <button key={s} onClick={() => setNewProg(f => ({ ...f, semestersPerYear: s }))} style={{ flex: 1, padding: "6px 0", borderRadius: 7, border: "1px solid " + (newProg.semestersPerYear === s ? D.accent : D.border), background: newProg.semestersPerYear === s ? D.accent + "22" : D.card, color: newProg.semestersPerYear === s ? D.accent : D.muted, fontSize: 12, cursor: "pointer" }}>{s}</button>
                          ))}
                        </div>
                      </div>
                      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                        {COLORS.map(c => <div key={c} onClick={() => setNewProg(f => ({ ...f, color: c }))} style={{ width: 22, height: 22, borderRadius: "50%", background: c, cursor: "pointer", border: newProg.color === c ? "3px solid " + D.text : "3px solid transparent" }} />)}
                      </div>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button onClick={() => { setAddingProg(false); setNewProg({ name: "", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" }); }} style={{ ...btnBase, flex: 1, border: "1px solid " + D.border, background: D.card, color: D.text }}>Cancelar</button>
                        <button disabled={!newProg.name.trim()} onClick={() => {
                          const id = "prog_" + newId();
                          setAppState(prev => ({ ...prev, programs: [...prev.programs, { id, ...newProg }], programData: { ...prev.programData, [id]: { subjects: [], tasks: [], sessions: [] } } }));
                          setAddingProg(false); setNewProg({ name: "", type: "career", years: 4, semestersPerYear: 2, color: "#378ADD" });
                        }} style={{ ...btnBase, flex: 1, border: "none", background: newProg.name.trim() ? D.accent : D.card2, color: newProg.name.trim() ? "#fff" : D.muted, fontWeight: 500 }}>Crear programa</button>
                      </div>
                    </div>
                }
              </Card>

              {/* ── Visual ── */}
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🎨 Apariencia</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Fondo</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[["dark","Oscuro"],["darker","Más oscuro"],["navy","Azul noche"],["gray","Gris"]].map(([v,l]) => (
                        <button key={v} onClick={() => setBgTheme(v)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1px solid "+(bgTheme===v?D.accent:D.border), background:bgTheme===v?D.accent+"22":D.card2, color:bgTheme===v?D.accent:D.muted, fontSize:12, cursor:"pointer", fontWeight:bgTheme===v?600:400 }}>{l}</button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Exámenes en la barra lateral</div>
                    <div style={{ display: "flex", gap: 8 }}>
                      {[3, 5, 7, 10].map(v => (
                        <button key={v} onClick={() => setExamCount(v)} style={{ flex:1, padding:"8px 0", borderRadius:8, border:"1px solid "+(examCount===v?D.accent:D.border), background:examCount===v?D.accent+"22":D.card2, color:examCount===v?D.accent:D.muted, fontSize:12, cursor:"pointer", fontWeight:examCount===v?600:400 }}>{v}</button>
                      ))}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:D.card2 }}>
                    <span style={{ fontSize:13 }}>Mostrar días vacíos en la línea de tiempo</span>
                    <button onClick={() => setShowEmptyDays(v => !v)} style={{ width:44, height:24, borderRadius:12, border:"none", background:showEmptyDays?D.accent:D.border, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                      <div style={{ position:"absolute", top:3, left:showEmptyDays?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                    </button>
                  </div>
                  <div>
                    <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:D.card2 }}>
                      <span style={{ fontSize:13 }}>Horario: ajustar a la primera y última clase</span>
                      <button onClick={() => setScheduleAuto(v => !v)} style={{ width:44, height:24, borderRadius:12, border:"none", background:scheduleAuto?D.accent:D.border, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                        <div style={{ position:"absolute", top:3, left:scheduleAuto?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                      </button>
                    </div>
                    {!scheduleAuto && (
                      <div style={{ display:"flex", alignItems:"center", gap:8, marginTop:8, paddingLeft:14 }}>
                        <span style={{ fontSize:12, color:D.muted }}>De</span>
                        <input type="time" value={scheduleStart} onChange={e => setScheduleStart(e.target.value)}
                          style={{ background:D.card2, border:"1px solid "+D.border, borderRadius:7, color:D.text, fontSize:12, padding:"6px 8px" }} />
                        <span style={{ fontSize:12, color:D.muted }}>a</span>
                        <input type="time" value={scheduleEnd} onChange={e => setScheduleEnd(e.target.value)}
                          style={{ background:D.card2, border:"1px solid "+D.border, borderRadius:7, color:D.text, fontSize:12, padding:"6px 8px" }} />
                      </div>
                    )}
                  </div>
                </div>
              </Card>

              {/* ── Timer ── */}
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>⏱ Temporizador</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[["Sonido al terminar sesión", timerSound, setTimerSound],["Notificación del sistema", timerNotif, setTimerNotif]].map(([label, val, setter]) => (
                    <div key={label} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:D.card2 }}>
                      <span style={{ fontSize:13 }}>{label}</span>
                      <button onClick={() => setter(v => !v)} style={{ width:44, height:24, borderRadius:12, border:"none", background:val?D.accent:D.border, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                        <div style={{ position:"absolute", top:3, left:val?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                      </button>
                    </div>
                  ))}
                </div>
              </Card>

              {/* ── Notas ── */}
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 14 }}>🎓 Notas y calificaciones</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
                  <div>
                    <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Umbral de aprobado</div>
                    <div style={{ display: "flex", gap: 6 }}>
                      {[4, 4.5, 5, 5.5, 6, 10].map(v => (
                        <button key={v} onClick={() => setPassingGrade(v)} style={{ flex:1, padding:"7px 0", borderRadius:8, border:"1px solid "+(passingGrade===v?D.accent:D.border), background:passingGrade===v?D.accent+"22":D.card2, color:passingGrade===v?D.accent:D.muted, fontSize:12, cursor:"pointer", fontWeight:passingGrade===v?600:400 }}>
                          {v === 10 ? "Sin límite" : v}
                        </button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: D.muted, marginTop: 6 }}>
                      Nota mínima para considerar una asignatura como aprobada. Afecta a colores y etiquetas.
                    </div>
                  </div>
                  <div>
                    <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Escala de notas</div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                      {Object.entries(GRADE_SCALES).map(([v, { label }]) => (
                        <button key={v} onClick={() => setGradeScale(v)} style={{ padding:"8px 0", borderRadius:8, border:"1px solid "+(gradeScale===v?D.accent:D.border), background:gradeScale===v?D.accent+"22":D.card2, color:gradeScale===v?D.accent:D.muted, fontSize:12, cursor:"pointer", fontWeight:gradeScale===v?600:400 }}>{label}</button>
                      ))}
                    </div>
                    <div style={{ fontSize: 11, color: D.muted, marginTop: 6, lineHeight: 1.5 }}>
                      <strong style={{ color: D.text }}>{(GRADE_SCALES[gradeScale] || GRADE_SCALES.es).ayuda}</strong>
                      {gradeScale !== "es" && " Solo cambia cómo se muestran: por dentro se guardan en 0–10, así que la media ponderada y los créditos no varían."}
                    </div>
                  </div>
                  <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"10px 14px", borderRadius:9, background:D.card2 }}>
                    <span style={{ fontSize:13 }}>Iconos de nota (😈🥉🥇👑…)</span>
                    <button onClick={() => setGradeIcons(v => !v)} style={{ width:44, height:24, borderRadius:12, border:"none", background:gradeIcons?D.accent:D.border, cursor:"pointer", position:"relative", transition:"background 0.2s" }}>
                      <div style={{ position:"absolute", top:3, left:gradeIcons?22:3, width:18, height:18, borderRadius:"50%", background:"#fff", transition:"left 0.2s" }} />
                    </button>
                  </div>
                </div>
              </Card>

              {/* ── Orden de la barra lateral ── */}
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>↕ Orden de la barra lateral</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 14 }}>Usa ▲▼ para reordenar. Ajustes siempre queda al final.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  {navItems.map((item, idx, arr) => (
                    <div key={item.k} style={{ display:"flex", alignItems:"center", gap:10, padding:"9px 14px", borderRadius:9, background:D.card2, border:"1px solid "+D.border }}>
                      <span style={{ fontSize:14, width:22, flexShrink:0 }}>{item.icon}</span>
                      <span style={{ fontSize:13, flex:1 }}>{item.label}</span>
                      <div style={{ display:"flex", gap:4 }}>
                        <button disabled={idx === 0} onClick={() => moverNav(item.k, -1)} style={{ background:"none", border:"none", cursor:idx===0?"not-allowed":"pointer", color:idx===0?D.border:D.muted, fontSize:14, padding:"2px 6px", opacity:idx===0?0.3:1 }}>▲</button>
                        <button disabled={idx === arr.length-1} onClick={() => moverNav(item.k, 1)} style={{ background:"none", border:"none", cursor:idx===arr.length-1?"not-allowed":"pointer", color:idx===arr.length-1?D.border:D.muted, fontSize:14, padding:"2px 6px", opacity:idx===arr.length-1?0.3:1 }}>▼</button>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setNavOrder(NAV.map(n => n.k))} style={{ marginTop:10, width:"100%", padding:"7px 0", borderRadius:8, border:"1px dashed "+D.border, background:"none", color:D.muted, fontSize:12, cursor:"pointer" }}>↺ Restablecer orden por defecto</button>
              </Card>

              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📅 Vista del calendario</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 14 }}>Elige cuántos meses se muestran en la pestaña Calendario.</div>
                <div style={{ display: "flex", gap: 8 }}>
                  {[["single", "1 mes"], ["dual", "2 meses"]].map(([v, label]) => (
                    <button key={v} onClick={() => setCalendarView(v)} style={{ flex: 1, padding: "10px 0", borderRadius: 9, border: "1px solid " + (calendarView === v ? D.accent : D.border), background: calendarView === v ? D.accent + "22" : D.card2, color: calendarView === v ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: calendarView === v ? 600 : 400 }}>{label}</button>
                  ))}
                </div>
              </Card>
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📤 Exportar datos</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 16 }}>Descarga una copia de seguridad de todos tus datos en formato JSON.</div>
                <button onClick={() => setShowExportConfirm(true)} style={{ padding: "10px 24px", borderRadius: 9, border: "none", background: D.accent, color: "#fff", fontSize: 14, fontWeight: 500, cursor: "pointer" }}>Descargar backup</button>
              </Card>
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>🔁 Copia automática al cerrar</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 14 }}>
                  Cada vez que cierres LixT se guarda un backup en la carpeta que elijas.
                  Se conservan las <strong style={{ color: D.text }}>{BACKUPS_A_CONSERVAR} últimas</strong> y se va borrando la más antigua.
                </div>

                {backupDir ? (
                  <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 14px", borderRadius: 9, background: D.card2 }}>
                      <span style={{ fontSize: 15 }}>📁</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, color: D.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }} title={backupDir}>{backupDir}</div>
                        <div style={{ fontSize: 11, color: D.green }}>● Activa</div>
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button onClick={elegirCarpetaBackup} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 12, cursor: "pointer" }}>Cambiar carpeta</button>
                      <button onClick={async () => {
                        try { const r = await hacerBackup(); setBackupMsg("✓ Copia guardada en " + r); }
                        catch (e) { setBackupMsg("✕ " + (e?.message || e)); }
                      }} style={{ padding: "8px 14px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.accent, fontSize: 12, cursor: "pointer" }}>Copiar ahora</button>
                      <button onClick={() => { setBackupDir(null); lsSet("lixt_backup_dir", null); setBackupMsg(""); }}
                        style={{ marginLeft: "auto", padding: "8px 14px", borderRadius: 8, border: "none", background: "none", color: D.muted, fontSize: 12, cursor: "pointer" }}>Desactivar</button>
                    </div>
                  </div>
                ) : (
                  <button onClick={elegirCarpetaBackup} style={{ padding: "10px 24px", borderRadius: 9, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 14, fontWeight: 500, cursor: "pointer" }}>
                    Elegir carpeta…
                  </button>
                )}

                {backupMsg && (
                  <div style={{ marginTop: 12, padding: "9px 12px", borderRadius: 8, fontSize: 12, wordBreak: "break-all",
                                background: backupMsg.startsWith("✓") ? D.green + "11" : D.red + "11",
                                color: backupMsg.startsWith("✓") ? D.green : D.red }}>
                    {backupMsg}
                  </div>
                )}
              </Card>
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4 }}>📥 Importar datos</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 16 }}>Restaura tus datos desde un archivo de backup. <strong style={{ color: D.red }}>Esto sobreescribirá todos los datos actuales.</strong></div>
                <label style={{ display: "inline-block", padding: "10px 24px", borderRadius: 9, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 14, cursor: "pointer", fontWeight: 500 }}>
                  Seleccionar archivo
                  <input type="file" accept=".json" onChange={importData} style={{ display: "none" }} />
                </label>
                {importSuccess && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: "#0a2e1e", border: "1px solid " + D.green + "44", color: D.green, fontSize: 13 }}>✓ Datos importados correctamente.</div>}
                {importError  && <div style={{ marginTop: 12, padding: "10px 14px", borderRadius: 8, background: D.red + "11", border: "1px solid " + D.red + "44", color: D.red, fontSize: 13 }}>✕ {importError}</div>}
              </Card>
              <Card>
                <div style={{ fontSize: 15, fontWeight: 600, marginBottom: 4, color: D.red }}>🗑 Borrar datos</div>
                <div style={{ fontSize: 13, color: D.muted, marginBottom: 16 }}>Elimina datos de forma selectiva o borra todo. Esta acción no se puede deshacer.</div>
                <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                  {[
                    ["subjects","📚 Borrar asignaturas","Borra asignaturas y sus tareas. Las sesiones se conservan."],
                    ["tasks",   "✅ Borrar tareas",      "Borra todas las tareas. El resto se conserva."],
                    ["all",     "⚠ Borrar todo",         "Elimina TODOS los datos. Irreversible."],
                  ].map(([type, title, desc]) => (
                    <button key={type} onClick={() => setShowConfirmClear(type)} style={{ padding: 11, borderRadius: 10, border: "1px solid " + (type === "all" ? D.red + "44" : D.border), background: type === "all" ? D.red + "11" : D.card2, color: type === "all" ? D.red : D.text, cursor: "pointer", fontSize: 13, textAlign: "left" }}>
                      <div style={{ fontWeight: 500 }}>{title}</div>
                      <div style={{ fontSize: 11, color: type === "all" ? D.red + "99" : D.muted, marginTop: 2 }}>{desc}</div>
                    </button>
                  ))}
                </div>
              </Card>
            </div>
          )}

        </div>
      </div>

      {/* ─── Modales ──────────────────────────────────────────────────────────────── */}

      {showTaskModal && (
        <TaskModal editTaskId={editTaskId} taskForm={taskForm} setTaskForm={setTaskForm}
          activeSubjects={activeSubjects} onSave={saveTask} onClose={() => setShowTaskModal(false)} />
      )}

      {showSettings && (
        <Modal onClose={() => setShowSettings(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20, color: D.text }}>Configuración del temporizador</div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 10 }}>Duración (minutos)</div>
          <div style={{ display: "flex", gap: 12, marginBottom: 20 }}>
            <NumInput label="Trabajo"        value={tempDur.work}  onChange={v => setTempDur(d => ({ ...d, work:  v }))} min={1} max={180} />
            <NumInput label="Descanso corto" value={tempDur.short} onChange={v => setTempDur(d => ({ ...d, short: v }))} min={1} max={60}  />
            <NumInput label="Descanso largo" value={tempDur.long}  onChange={v => setTempDur(d => ({ ...d, long:  v }))} min={1} max={120} />
          </div>
          <div style={{ fontSize: 12, color: D.muted, marginBottom: 8 }}>Ciclos antes del descanso largo</div>
          <div style={{ display: "flex", gap: 12, alignItems: "center", marginBottom: 10 }}>
            <NumInput value={tempLongEvery} onChange={setTempLongEvery} min={1} max={10} />
            <div style={{ fontSize: 12, color: D.muted, flex: 1 }}>Cada {tempLongEvery} pomodoro{tempLongEvery > 1 ? "s" : ""} → descanso largo</div>
          </div>
          <div style={{ background: D.card2, borderRadius: 8, padding: "8px 14px", marginBottom: 20, fontSize: 12, color: D.muted }}>
            Patrón: {Array.from({ length: tempLongEvery }, (_, i) => "Trabajo → " + (i === tempLongEvery - 1 ? "Largo" : "Corto")).join(" → ")}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowSettings(false)} style={{ ...btnBase, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
            <button onClick={saveTimerSettings}            style={{ ...btnBase, border: "none", background: D.accent, color: "#fff", fontWeight: 500 }}>Guardar</button>
          </div>
        </Modal>
      )}

      {editSlot && (
        <Modal onClose={() => setEditSlot(null)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: D.text }}>Editar clase</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 18 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Asignatura</div>
              <select value={editSlot.subjectId} onChange={e => setEditSlot(f => ({ ...f, subjectId: e.target.value }))} style={inp}>
                {subjects.map(s => <option key={s.id} value={s.id}>{s.acronym ? s.acronym + " — " : ""}{s.name}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Día</div>
              <select value={editSlot.day} onChange={e => setEditSlot(f => ({ ...f, day: e.target.value }))} style={inp}>
                {DAYS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Inicio</div>
                <TimeWheel value={editSlot.start} onChange={v => setEditSlot(f => ({ ...f, start: v }))} />
              </div>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Fin</div>
                <TimeWheel value={editSlot.end} onChange={v => setEditSlot(f => ({ ...f, end: v }))} />
              </div>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => { if (window.confirm("¿Eliminar esta clase del horario?")) { setSchedule(prev => prev.map(x => x.id === editSlot.id ? softDelete(x) : x)); setEditSlot(null); } }}
              style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid " + D.red + "44", background: D.red + "11", color: D.red, fontSize: 13, cursor: "pointer" }}>Eliminar</button>
            <button onClick={() => setEditSlot(null)} style={{ padding: "9px 16px", borderRadius: 8, border: "1px solid " + D.border, background: "none", color: D.muted, fontSize: 13, cursor: "pointer", marginLeft: "auto" }}>Cancelar</button>
            <button onClick={() => { setSchedule(prev => prev.map(x => x.id === editSlot.id ? touch({ ...editSlot, subjectId: String(editSlot.subjectId) }) : x)); setEditSlot(null); }}
              style={{ padding: "9px 16px", borderRadius: 8, border: "none", background: D.accent, color: "#fff", fontSize: 13, cursor: "pointer", fontWeight: 500 }}>Guardar</button>
          </div>
        </Modal>
      )}

      {showSubjModal && (
        <Modal onClose={() => setShowSubjModal(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: D.text }}>{editSubjId ? "Editar asignatura" : "Nueva asignatura"}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Nombre</div>
              <input placeholder="Ej: Cálculo I" value={subjForm.name} onChange={e => setSubjForm(f => ({ ...f, name: e.target.value }))} style={inp} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Siglas <span style={{ fontSize: 10 }}>(para el horario, ej: MCM)</span></div>
              <input placeholder="Ej: MCM" maxLength={6} value={subjForm.acronym || ""} onChange={e => setSubjForm(f => ({ ...f, acronym: e.target.value.toUpperCase() }))} style={inp} />
            </div>

            {/* Curso y cuatrimestre como toggles */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Curso</div>
                <div style={{ display: "flex", gap: 4 }}>
                  {Array.from({ length: activeProgram?.years ?? 4 }, (_, i) => i + 1).map(y => (
                    <button key={y} onClick={() => setSubjForm(f => ({ ...f, year: f.year === y ? null : y }))}
                      style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid " + (subjForm.year === y ? D.accent : D.border), background: subjForm.year === y ? D.accent + "22" : D.card2, color: subjForm.year === y ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: subjForm.year === y ? 600 : 400 }}>
                      {y}º
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Cuatrimestre <span style={{ fontSize: 10, color: D.muted }}>(selecciona uno o varios)</span></div>
                <div style={{ display: "flex", gap: 4 }}>
                  {Array.from({ length: activeProgram?.semestersPerYear ?? 2 }, (_, i) => i + 1).map(s => {
                    const sems = Array.isArray(subjForm.semester) ? subjForm.semester : (subjForm.semester ? [subjForm.semester] : []);
                    const active = sems.includes(s);
                    return (
                      <button key={s} onClick={() => setSubjForm(f => {
                        const cur = Array.isArray(f.semester) ? f.semester : (f.semester ? [f.semester] : []);
                        const next = cur.includes(s) ? cur.filter(x => x !== s) : [...cur, s].sort();
                        return { ...f, semester: next.length === 0 ? null : next, annual: false };
                      })}
                        style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid " + (active ? D.accent : D.border), background: active ? D.accent + "22" : D.card2, color: active ? D.accent : D.muted, fontSize: 13, cursor: "pointer", fontWeight: active ? 600 : 400 }}>
                        {s}º C.
                      </button>
                    );
                  })}
                </div>
                {(() => {
                  const sems = Array.isArray(subjForm.semester) ? subjForm.semester : (subjForm.semester ? [subjForm.semester] : []);
                  if (sems.length > 1 && subjForm.credits) {
                    return <div style={{ fontSize: 11, color: D.muted, marginTop: 5 }}>
                      {subjForm.credits} ECTS ÷ {sems.length} cuatrimestres = {(subjForm.credits / sems.length).toFixed(1)} ECTS cada uno
                    </div>;
                  }
                })()}
              </div>
            </div>

            {/* Créditos */}
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Créditos ECTS <span style={{ color: D.border }}>(opcional)</span></div>
              <input type="number" min="1" max="30" placeholder="Ej: 6" value={subjForm.credits ?? ""} onChange={e => setSubjForm(f => ({ ...f, credits: parseNum(e.target.value, { min: 0, max: 100 }) }))} style={{ ...inp, width: "100%" }} />
            </div>
          </div>

          <div style={{ fontSize: 12, color: D.muted, marginBottom: 8 }}>Color</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 20 }}>
            {COLORS.map(c => <div key={c} onClick={() => setSubjForm(f => ({ ...f, color: c }))} style={{ width: 30, height: 30, borderRadius: "50%", background: c, cursor: "pointer", border: subjForm.color === c ? "3px solid " + D.text : "3px solid transparent" }} />)}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowSubjModal(false)} style={{ ...btnBase, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
            <button onClick={saveSubject}                   style={{ ...btnBase, border: "none", background: D.accent, color: "#fff", fontWeight: 500 }}>Guardar</button>
          </div>
        </Modal>
      )}

      {showSessionModal && editSession && (
        <SessionModal
          editSession={editSession}
          setEditSession={setEditSession}
          subjects={subjects}
          tasks={tasks}
          onSave={saveSession}
          onClose={() => { setShowSessionModal(false); setEditSession(null); }}
        />
      )}

      {showManualModal && (
        <Modal onClose={() => setShowManualModal(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 20 }}>Añadir sesión manual</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Asignatura</div>
              <select
                value={manualForm.subjectId}
                onChange={e => setManualForm(f => ({ ...f, subjectId: e.target.value, taskId: getDefaultTaskId(e.target.value) }))}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: manualForm.subjectId ? D.text : D.muted, fontSize: 13, cursor: "pointer" }}
              >
                <option value="" disabled>Selecciona una asignatura…</option>
                {activeSubjects.map(s => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
                {programSubjects.filter(s => (s.approved || s.archived) && String(s.id) === String(manualForm.subjectId)).map(s => (
                  <option key={s.id} value={s.id}>{s.name} {s.approved ? "(aprobada)" : "(archivada)"}</option>
                ))}
              </select>
            </div>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Tarea (opcional)</div>
              <select
                value={manualForm.taskId ?? ""}
                onChange={e => setManualForm(f => ({ ...f, taskId: e.target.value }))}
                disabled={!manualForm.subjectId}
                style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 13, cursor: manualForm.subjectId ? "pointer" : "not-allowed", opacity: manualForm.subjectId ? 1 : 0.5 }}
              >
                <option value="">— Sin tarea —</option>
                {pendingTasks(tasks, String(manualForm.subjectId)).map(t => (
                  <option key={t.id} value={t.id}>{t.title}</option>
                ))}
                {tasks.filter(t => t.status === "completada" && String(t.id) === String(manualForm.taskId)).map(t => (
                  <option key={t.id} value={t.id}>{t.title} (completada)</option>
                ))}
              </select>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Duración (min)</div>
                <input
                  type="number" min="1" max="480" placeholder="ej. 45"
                  value={manualForm.minutes}
                  onChange={e => setManualForm(f => ({ ...f, minutes: e.target.value }))}
                  style={{ width: "100%", padding: "9px 12px", borderRadius: 8, border: "1px solid " + D.border, background: D.card2, color: D.text, fontSize: 13 }}
                />
              </div>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 6 }}>Fecha</div>
                <DatePicker value={manualForm.date} onChange={v => setManualForm(f => ({ ...f, date: v }))} />
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 4 }}>
              <button onClick={() => setShowManualModal(false)} style={{ ...btnBase, flex: 1, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
              <button
                disabled={!manualForm.subjectId || !manualForm.minutes || Number(manualForm.minutes) < 1}
                onClick={() => {
                  const subj = subjects.find(s => s.id === String(manualForm.subjectId));
                  if (!subj) return;
                  const task = manualForm.taskId ? tasks.find(t => t.id === String(manualForm.taskId)) : null;
                  const mins = parseNum(manualForm.minutes, { min: 1, max: 480 });
                  if (mins === null) return;
                  setSessions(prev => [...prev, touch({
                    id: newId(),
                    date: manualForm.date || today(),
                    subjectId: subj.id,
                    subjectName: subj.name,
                    subjectColor: subj.color,
                    taskTitle: task?.title || null,
                    minutes: mins,
                    manual: true,
                    programId: activeProgramId,
                  })]);
                  // Pone la tarea en progreso si existe y está pendiente
                  if (task && task.status === "pendiente") {
                    setTasks(prev => prev.map(t => t.id === task.id ? touch({ ...t, status: "en progreso" }) : t));
                  }
                  setShowManualModal(false);
                  setManualForm(emptyManual);
                }}
                style={{ ...btnBase, flex: 1, border: "none", background: (!manualForm.subjectId || !manualForm.minutes || Number(manualForm.minutes) < 1) ? D.card2 : D.accent, color: (!manualForm.subjectId || !manualForm.minutes || Number(manualForm.minutes) < 1) ? D.muted : "#fff", fontWeight: 500, cursor: (!manualForm.subjectId || !manualForm.minutes || Number(manualForm.minutes) < 1) ? "not-allowed" : "pointer" }}
              >Guardar sesión</button>
            </div>
          </div>
        </Modal>
      )}

      {editingProgId && editProgForm && (
        <Modal onClose={() => { setEditingProgId(null); setEditProgForm(null); }}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18 }}>Editar programa</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Nombre</div>
              <input value={editProgForm.name} onChange={e => setEditProgForm(f => ({ ...f, name: e.target.value }))} style={inp} />
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Años</div>
                <div style={{ display: "flex", gap: 3 }}>
                  {[1,2,3,4,5,6].map(y => (
                    <button key={y} onClick={() => setEditProgForm(f => ({ ...f, years: y }))} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid " + (editProgForm.years === y ? D.accent : D.border), background: editProgForm.years === y ? D.accent + "22" : D.card2, color: editProgForm.years === y ? D.accent : D.muted, fontSize: 12, cursor: "pointer" }}>{y}</button>
                  ))}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 12, color: D.muted, marginBottom: 5 }}>Cuatrimestres/año</div>
                <div style={{ display: "flex", gap: 3 }}>
                  {[1,2,3,4].map(s => (
                    <button key={s} onClick={() => setEditProgForm(f => ({ ...f, semestersPerYear: s }))} style={{ flex: 1, padding: "7px 0", borderRadius: 7, border: "1px solid " + (editProgForm.semestersPerYear === s ? D.accent : D.border), background: editProgForm.semestersPerYear === s ? D.accent + "22" : D.card2, color: editProgForm.semestersPerYear === s ? D.accent : D.muted, fontSize: 12, cursor: "pointer" }}>{s}</button>
                  ))}
                </div>
              </div>
            </div>
            <div>
              <div style={{ fontSize: 12, color: D.muted, marginBottom: 8 }}>Color del programa</div>
              <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                {COLORS.map(c => <div key={c} onClick={() => setEditProgForm(f => ({ ...f, color: c }))} style={{ width: 26, height: 26, borderRadius: "50%", background: c, cursor: "pointer", border: editProgForm.color === c ? "3px solid " + D.text : "3px solid transparent" }} />)}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, marginTop: 6 }}>
              <button onClick={() => { setEditingProgId(null); setEditProgForm(null); }} style={{ ...btnBase, flex: 1, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
              <button disabled={!editProgForm.name.trim()} onClick={() => {
                setAppState(prev => ({ ...prev, programs: prev.programs.map(p => p.id === editingProgId ? { ...p, ...editProgForm } : p) }));
                setEditingProgId(null); setEditProgForm(null);
              }} style={{ ...btnBase, flex: 1, border: "none", background: editProgForm.name.trim() ? D.accent : D.card2, color: editProgForm.name.trim() ? "#fff" : D.muted, fontWeight: 500 }}>Guardar</button>
            </div>
          </div>
        </Modal>
      )}

      {pdfLoading && (
        <div style={{ position: "fixed", inset: 0, zIndex: 99999, background: D.bg + "ee", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 16 }}>
          <div style={{ width: 48, height: 48, borderRadius: "50%", border: "3px solid " + D.border, borderTop: "3px solid " + D.accent, animation: "spin 0.8s linear infinite" }} />
          <div style={{ fontSize: 15, fontWeight: 500, color: D.text }}>Generando PDF…</div>
          <div style={{ fontSize: 12, color: D.muted }}>Esto puede tardar unos segundos</div>
          <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
        </div>
      )}

      {showExportConfirm && (
        <Modal onClose={() => setShowExportConfirm(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>💾 Descargar backup</div>
          <div style={{ fontSize: 13, color: D.muted, marginBottom: 20 }}>
            Se guardará un archivo <strong style={{ color: D.text }}>lixt-backup-{today()}.json</strong> con todos tus datos: asignaturas, tareas y sesiones.
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <button onClick={() => setShowExportConfirm(false)} style={{ ...btnBase, flex: 1, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
            <button onClick={() => { setShowExportConfirm(false); exportData(); }} style={{ ...btnBase, flex: 1, border: "none", background: D.accent, color: "#fff", fontWeight: 500 }}>Descargar</button>
          </div>
        </Modal>
      )}

      {showConfirmClear && (
        <Modal onClose={() => setShowConfirmClear(false)}>
          <div style={{ fontSize: 16, fontWeight: 600, marginBottom: 18, color: D.text }}>Borrar datos</div>
          <div style={{ padding: 14, borderRadius: 10, background: D.red + "11", border: "1px solid " + D.red + "44", marginBottom: 18, fontSize: 13, color: D.red }}>
            {showConfirmClear === "all"
              ? "Se eliminarán TODOS los datos: sesiones, tareas y asignaturas. Esta acción no se puede deshacer."
              : showConfirmClear === "subjects"
              ? "Se eliminarán todas las asignaturas y sus tareas."
              : "Se eliminarán todas las tareas."}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 18 }}>
            <button onClick={() => setShowConfirmClear(false)} style={{ ...btnBase, border: "1px solid " + D.border, background: D.card2, color: D.text }}>Cancelar</button>
            <button onClick={() => clearData(showConfirmClear)} style={{ ...btnBase, border: "none", background: D.red, color: "#fff", fontWeight: 500 }}>Confirmar</button>
          </div>
        </Modal>
      )}
    </div>
  );
}