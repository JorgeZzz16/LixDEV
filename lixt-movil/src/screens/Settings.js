// ═══════════════════════════════════════════════════════════════════════════════
// Ajustes — versión móvil.
//
// Sigue la forma de los ajustes de Android en vez de la del PC: pantalla completa
// con barra arriba, categorías, y filas de "título + resumen" donde el resumen
// dice el valor actual. Las opciones se eligen en un diálogo de radio, que es lo
// que hace el sistema. Antes eran filas de chips y había que leerse las cuatro
// para saber cuál estaba puesta.
//
// Se quedan fuera a propósito, igual que antes:
//
//   · Temporizador (sonido, notificación, duraciones) — no hay Focus en el móvil.
//   · Exámenes en la barra lateral — no hay barra lateral.
//   · Días vacíos en la línea de tiempo — no hay línea de tiempo.
//   · Vista del calendario (1 o 2 meses) — en vertical siempre cabe uno.
//   · Crear/editar/borrar programas y exportar/importar backup — se quedan en el
//     PC (el backup necesitaría selector de archivos nativo, o sea dependencias
//     nuevas y recompilar el APK).
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState } from "react";
import { Modal, View, Text, TouchableOpacity, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { signOut } from "../supabase";
import { GRADE_SCALES } from "../logic";
import { D, BG_LABELS, VELO } from "../theme";
import { TimeField } from "./DateTimeField";

const PASSING = [4, 4.5, 5, 5.5, 6];

const VISTAS = [
  ["semana", "Semana", "Los siete días a la vez, como en el ordenador."],
  ["dia",    "Día",    "Un día por pantalla, con las columnas más anchas para que se lea el acrónimo."],
];

const DIAS = [
  ["Lu", "Lunes"], ["Ma", "Martes"], ["Mi", "Miércoles"], ["Ju", "Jueves"],
  ["Vi", "Viernes"], ["Sá", "Sábado"], ["Do", "Domingo"],
];
const TODOS = DIAS.map(([d]) => d);

export default function Settings({
  visible, session, onClose,
  settings, updateSettings,
  grid, setGrid,
  programs = [], activeProgram, onSelectProgram,
  sync, syncing, lastSync,
}) {
  // Qué diálogo de opciones está abierto (null = ninguno)
  const [dialogo, setDialogo] = useState(null);

  function confirmSignOut() {
    Alert.alert("Cerrar sesión", "Tus datos locales no se borran.", [
      { text: "Cancelar", style: "cancel" },
      { text: "Cerrar sesión", style: "destructive", onPress: () => signOut() },
    ]);
  }

  const escala  = settings.gradeScale ?? "es";
  const umbral  = settings.passingGrade ?? 5;
  const iconos  = settings.gradeIcons ?? true;
  const fondo   = settings.bgTheme ?? "dark";
  // Los avisos vienen puestos salvo que los apagues. Mismo valor por defecto que
  // lee notifications.js, para que Ajustes y el comportamiento real no se separen.
  const avisos    = settings.notifyReminders !== false;
  const horaAviso = settings.notifyHour || "09:00";
  const vista     = grid.vista ?? "semana";
  // Sin nada elegido se ven los siete, que es como estaba antes de existir esto.
  const diasVis   = Array.isArray(grid.dias) && grid.dias.length ? grid.dias : TODOS;

  const etiqueta = (lista, v, porDefecto) => (lista.find(o => o[0] === v) || [])[1] || porDefecto;

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: D.bg }}>
        {/* Barra superior, como la de cualquier pantalla de ajustes de Android */}
        <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 8, paddingTop: 34, paddingBottom: 12, backgroundColor: D.sidebar, borderBottomWidth: 1, borderBottomColor: D.border }}>
          <TouchableOpacity onPress={onClose} style={{ padding: 10 }}>
            <Text style={{ color: D.text, fontSize: 20 }}>←</Text>
          </TouchableOpacity>
          <Text style={{ color: D.text, fontSize: 19, fontWeight: "600", marginLeft: 4 }}>Ajustes</Text>
        </View>

        <ScrollView contentContainerStyle={{ paddingBottom: 40 }}>

          {/* ── Cuenta ── */}
          <Categoria titulo="Cuenta" primera />
          <View style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 12 }}>
            <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: D.accent + "33", alignItems: "center", justifyContent: "center" }}>
              <Text style={{ color: D.accent, fontSize: 17, fontWeight: "700" }}>{(session?.user?.email || "?")[0].toUpperCase()}</Text>
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ color: D.text, fontSize: 14, fontWeight: "500" }} numberOfLines={1}>{session?.user?.email}</Text>
              <Text style={{ color: D.green, fontSize: 12, marginTop: 1 }}>● Conectado</Text>
            </View>
          </View>

          <Fila
            titulo={syncing ? "Sincronizando…" : "Sincronizar ahora"}
            resumen={lastSync
              ? "Última vez: " + new Date(lastSync).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
              : "Nunca sincronizado. También puedes tirar hacia abajo en cualquier pestaña."}
            onPress={() => !syncing && sync()}
            right={syncing ? <ActivityIndicator color={D.muted} size="small" /> : <Text style={{ color: D.accent, fontSize: 17 }}>⇅</Text>}
          />

          {/* ── Notificaciones ── */}
          <Categoria titulo="Notificaciones" />
          <Fila
            titulo="Recordatorios"
            resumen="Avisa en el móvil a la hora del recordatorio. Las entregas y los exámenes no avisan: se ven en el calendario."
            right={<Interruptor activo={avisos} onPress={() => updateSettings({ notifyReminders: !avisos })} />}
            onPress={() => updateSettings({ notifyReminders: !avisos })}
          />
          <Fila
            titulo="Hora del aviso"
            resumen="Para los recordatorios que no llevan hora propia. Los que sí la llevan avisan a la suya."
            apagada={!avisos}
            right={<View style={{ width: 112 }}><TimeField value={horaAviso} onChange={v => updateSettings({ notifyHour: v })} /></View>}
          />

          {/* ── Horario ── */}
          <Categoria titulo="Horario" />
          <Fila
            titulo="Vista"
            resumen={etiqueta(VISTAS, vista, "Semana")}
            onPress={() => setDialogo("vista")}
          />
          <Fila
            titulo="Días visibles"
            resumen={diasVis.length === 7 ? "Toda la semana" : TODOS.filter(d => diasVis.includes(d)).join(", ")}
            onPress={() => setDialogo("dias")}
          />
          <Fila
            titulo="Ajustar a la primera y última clase"
            resumen="La rejilla empieza en tu primera clase y acaba en la última."
            right={<Interruptor activo={grid.auto} onPress={() => setGrid({ auto: !grid.auto })} />}
            onPress={() => setGrid({ auto: !grid.auto })}
          />
          {!grid.auto && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 20, paddingBottom: 12 }}>
              <Text style={{ color: D.muted, fontSize: 13 }}>De</Text>
              <View style={{ flex: 1 }}><TimeField value={grid.start} onChange={v => setGrid({ start: v })} /></View>
              <Text style={{ color: D.muted, fontSize: 13 }}>a</Text>
              <View style={{ flex: 1 }}><TimeField value={grid.end} onChange={v => setGrid({ end: v })} /></View>
            </View>
          )}
          <Pie>Una clase fuera de la franja la estira, nunca se oculta.</Pie>

          {/* ── Notas ── */}
          <Categoria titulo="Notas y calificaciones" />
          <Fila
            titulo="Escala"
            resumen={(GRADE_SCALES[escala] || GRADE_SCALES.es).label}
            onPress={() => setDialogo("escala")}
          />
          <Fila
            titulo="Umbral de aprobado"
            resumen={`${umbral} — nota mínima para dar una asignatura por aprobada.`}
            onPress={() => setDialogo("umbral")}
          />
          <Fila
            titulo="Iconos de nota"
            resumen="😈 🥉 🥇 👑 junto a cada calificación."
            right={<Interruptor activo={iconos} onPress={() => updateSettings({ gradeIcons: !iconos })} />}
            onPress={() => updateSettings({ gradeIcons: !iconos })}
          />
          {escala !== "es" && (
            <Pie>Solo cambia cómo se muestran: por dentro se guardan en 0–10, así que la media no varía.</Pie>
          )}

          {/* ── Apariencia ── */}
          <Categoria titulo="Apariencia" />
          <Fila
            titulo="Fondo"
            resumen={etiqueta(BG_LABELS, fondo, "Oscuro")}
            onPress={() => setDialogo("fondo")}
          />
          <Pie>El color de acento lo pone el programa activo, igual que en el PC.</Pie>

          {/* ── Programa ── */}
          {programs.length > 0 && (
            <>
              <Categoria titulo="Programa de estudio" />
              {programs.map(p => (
                <Fila key={p.id}
                  titulo={p.name}
                  resumen={`${p.type === "career" ? "Grado" : "Máster"} · ${p.years} año${p.years !== 1 ? "s" : ""}`}
                  onPress={() => onSelectProgram(p.id)}
                  left={<View style={{ width: 11, height: 11, borderRadius: 6, backgroundColor: p.color }} />}
                  right={p.id === activeProgram
                    ? <Text style={{ fontSize: 12, color: p.color, backgroundColor: p.color + "22", paddingHorizontal: 9, paddingVertical: 3, borderRadius: 6 }}>Activo</Text>
                    : null}
                />
              ))}
              <Pie>Crear, editar y borrar programas se hace desde el ordenador.</Pie>
            </>
          )}

          {/* ── Salir ── */}
          <Categoria titulo="" />
          <Fila titulo="Cerrar sesión" resumen="Tus datos locales no se borran." onPress={confirmSignOut} peligro />

          <Text style={{ color: D.muted, fontSize: 11, textAlign: "center", marginTop: 20 }}>LixT v1.4.0</Text>
        </ScrollView>

        {/* Diálogos de opciones */}
        <DialogoRadio
          visible={dialogo === "vista"} titulo="Vista del horario" valor={vista}
          opciones={VISTAS}
          onElegir={v => setGrid({ vista: v })} onClose={() => setDialogo(null)} />

        <DialogoRadio
          visible={dialogo === "dias"} titulo="Días visibles" valor={diasVis} multiple
          opciones={DIAS}
          onElegir={d => {
            // Nunca se queda sin ninguno: un horario de cero columnas no se puede
            // ni mirar ni deshacer desde el propio horario.
            const siguiente = diasVis.includes(d) ? diasVis.filter(x => x !== d) : [...diasVis, d];
            if (siguiente.length) setGrid({ dias: TODOS.filter(x => siguiente.includes(x)) });
          }}
          onClose={() => setDialogo(null)} />

        <DialogoRadio
          visible={dialogo === "fondo"} titulo="Fondo" valor={fondo}
          opciones={BG_LABELS}
          onElegir={v => updateSettings({ bgTheme: v })} onClose={() => setDialogo(null)} />

        <DialogoRadio
          visible={dialogo === "escala"} titulo="Escala de notas" valor={escala}
          opciones={Object.entries(GRADE_SCALES).map(([v, { label, ayuda }]) => [v, label, ayuda])}
          onElegir={v => updateSettings({ gradeScale: v })} onClose={() => setDialogo(null)} />

        <DialogoRadio
          visible={dialogo === "umbral"} titulo="Umbral de aprobado" valor={umbral}
          opciones={PASSING.map(v => [v, String(v)])}
          onElegir={v => updateSettings({ passingGrade: v })} onClose={() => setDialogo(null)} />
      </View>
    </Modal>
  );
}

// ─── Piezas ───────────────────────────────────────────────────────────────────

// Cabecera de categoría. En Android va en el color de acento y pegada al grupo
// que encabeza, sin emoji ni centrar. El separador va arriba, salvo en la primera.
function Categoria({ titulo, primera }) {
  return (
    <>
      {!primera && <View style={{ height: 1, backgroundColor: D.border, marginTop: 14 }} />}
      {!!titulo && (
        <Text style={{ color: D.accent, fontSize: 13, fontWeight: "700", paddingHorizontal: 20, paddingTop: 16, paddingBottom: 4 }}>{titulo}</Text>
      )}
    </>
  );
}

// Fila de ajuste: título arriba, resumen debajo en gris. El resumen dice el valor
// actual, así que se lee de un vistazo sin abrir nada. Toda la fila es pulsable,
// no solo el control de la derecha.
function Fila({ titulo, resumen, onPress, right, left, peligro, apagada }) {
  const Cont = onPress && !apagada ? TouchableOpacity : View;
  return (
    <Cont onPress={onPress} activeOpacity={0.6}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14, opacity: apagada ? 0.4 : 1 }}>
      {left}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ color: peligro ? D.red : D.text, fontSize: 15 }}>{titulo}</Text>
        {!!resumen && <Text style={{ color: D.muted, fontSize: 12.5, lineHeight: 17, marginTop: 2 }}>{resumen}</Text>}
      </View>
      {right}
    </Cont>
  );
}

// Aclaración al pie de un grupo, para lo que no cabe en el resumen de una fila.
function Pie({ children }) {
  return <Text style={{ color: D.muted, fontSize: 11.5, lineHeight: 16, paddingHorizontal: 20, paddingTop: 2, paddingBottom: 6 }}>{children}</Text>;
}

// Diálogo de opciones: lo que sale en Android al tocar un ajuste de varios valores.
// `opciones` son [valor, etiqueta, descripción?]. Con `multiple`, `valor` es un
// array, marca cuadrados en vez de círculos y no se cierra al tocar: se van
// marcando varios y se sale con "Hecho".
function DialogoRadio({ visible, titulo, opciones, valor, onElegir, onClose, multiple }) {
  return (
    <Modal visible={visible} transparent animationType="fade" statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "center", padding: 28 }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderRadius: 18, paddingVertical: 20, maxHeight: "80%" }}>
          <Text style={{ color: D.text, fontSize: 17, fontWeight: "600", paddingHorizontal: 24, marginBottom: 10 }}>{titulo}</Text>
          <ScrollView>
            {opciones.map(([v, label, desc]) => {
              const activa = multiple ? valor.includes(v) : v === valor;
              return (
                <TouchableOpacity key={String(v)} activeOpacity={0.6}
                  onPress={() => { onElegir(v); if (!multiple) onClose(); }}
                  style={{ flexDirection: "row", alignItems: "flex-start", gap: 14, paddingHorizontal: 24, paddingVertical: 12 }}>
                  <View style={{ width: 20, height: 20, borderRadius: multiple ? 5 : 10, borderWidth: 2, borderColor: activa ? D.accent : D.muted, alignItems: "center", justifyContent: "center", marginTop: 1, backgroundColor: multiple && activa ? D.accent : "transparent" }}>
                    {activa && (multiple
                      ? <Text style={{ color: "#fff", fontSize: 12, fontWeight: "900", lineHeight: 14 }}>✓</Text>
                      : <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: D.accent }} />)}
                  </View>
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text style={{ color: D.text, fontSize: 15 }}>{label}</Text>
                    {!!desc && <Text style={{ color: D.muted, fontSize: 12, lineHeight: 16, marginTop: 2 }}>{desc}</Text>}
                  </View>
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          <TouchableOpacity onPress={onClose} style={{ alignSelf: "flex-end", paddingHorizontal: 24, paddingTop: 12 }}>
            <Text style={{ color: D.accent, fontSize: 14, fontWeight: "600" }}>{multiple ? "Hecho" : "Cancelar"}</Text>
          </TouchableOpacity>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// Interruptor a mano: el Switch de React Native no deja teñirlo del acento.
function Interruptor({ activo, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ width: 46, height: 26, borderRadius: 13, backgroundColor: activo ? D.accent : D.border, justifyContent: "center" }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: "#fff", marginLeft: activo ? 23 : 3 }} />
    </TouchableOpacity>
  );
}
