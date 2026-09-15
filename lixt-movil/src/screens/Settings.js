// ═══════════════════════════════════════════════════════════════════════════════
// Ajustes — versión móvil.
//
// Trae lo del PC que tiene sentido en un teléfono. Se quedan fuera a propósito:
//
//   · Temporizador (sonido, notificación, duraciones) — no hay Focus en el móvil.
//   · Exámenes en la barra lateral — no hay barra lateral.
//   · Días vacíos en la línea de tiempo — no hay línea de tiempo.
//   · Vista del calendario (1 o 2 meses) — en vertical siempre cabe uno.
//   · Crear/editar/borrar programas y exportar/importar backup — se quedan en el
//     PC (el backup necesitaría selector de archivos nativo, o sea dependencias
//     nuevas y recompilar el APK).
//
// A diferencia del PC, esto es una hoja que sube desde abajo y hace scroll: en
// vertical no caben las tarjetas en rejilla.
// ═══════════════════════════════════════════════════════════════════════════════

import React from "react";
import { Modal, View, Text, TouchableOpacity, Pressable, ScrollView, Alert, ActivityIndicator } from "react-native";
import { signOut } from "../supabase";
import { GRADE_SCALES } from "../logic";
import { D, BG_LABELS } from "../theme";
import { TimeField } from "./DateTimeField";

const PASSING = [4, 4.5, 5, 5.5, 6];

export default function Settings({
  visible, session, onClose,
  settings, updateSettings,
  grid, setGrid,
  programs = [], activeProgram, onSelectProgram,
  sync, syncing, lastSync,
}) {
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

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: "#000a", justifyContent: "flex-end" }} onPress={onClose}>
        <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderTopLeftRadius: 20, borderTopRightRadius: 20, maxHeight: "92%" }}>
          <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 34 }}>
            <Text style={{ color: D.text, fontSize: 19, fontWeight: "700", marginBottom: 18 }}>Ajustes</Text>

            {/* ── Cuenta ── */}
            <Seccion titulo="👤 Cuenta" />
            <View style={{ flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: D.card2, borderRadius: 10, padding: 12, marginBottom: 10 }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: D.accent + "33", alignItems: "center", justifyContent: "center" }}>
                <Text style={{ color: D.accent, fontSize: 15, fontWeight: "700" }}>{(session?.user?.email || "?")[0].toUpperCase()}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={{ color: D.text, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>{session?.user?.email}</Text>
                <Text style={{ color: D.green, fontSize: 11 }}>● Conectado</Text>
              </View>
            </View>

            <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
              <TouchableOpacity onPress={() => sync()} disabled={syncing}
                style={{ paddingVertical: 10, paddingHorizontal: 16, borderRadius: 9, backgroundColor: syncing ? D.card2 : D.accent, flexDirection: "row", alignItems: "center", gap: 8 }}>
                {syncing && <ActivityIndicator color={D.muted} size="small" />}
                <Text style={{ color: syncing ? D.muted : "#fff", fontSize: 13, fontWeight: "600" }}>
                  {syncing ? "Sincronizando…" : "⇅ Sincronizar"}
                </Text>
              </TouchableOpacity>
              <Text style={{ color: D.muted, fontSize: 11, flex: 1 }}>
                {lastSync
                  ? "Última vez: " + new Date(lastSync).toLocaleString("es-ES", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" })
                  : "Nunca sincronizado"}
              </Text>
            </View>
            <Nota>También puedes tirar hacia abajo en cualquier pestaña para sincronizar.</Nota>

            {/* ── Programa ── */}
            {programs.length > 0 && (
              <>
                <Seccion titulo="🎓 Programa de estudio" />
                {programs.map(p => {
                  const activo = p.id === activeProgram;
                  return (
                    <TouchableOpacity key={p.id} onPress={() => onSelectProgram(p.id)}
                      style={{ flexDirection: "row", alignItems: "center", gap: 10, padding: 12, borderRadius: 10, marginBottom: 6,
                               backgroundColor: D.card2, borderWidth: 2, borderColor: activo ? p.color : D.border }}>
                      <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: p.color }} />
                      <View style={{ flex: 1, minWidth: 0 }}>
                        <Text style={{ color: D.text, fontSize: 13, fontWeight: "600" }} numberOfLines={1}>{p.name}</Text>
                        <Text style={{ color: D.muted, fontSize: 11 }}>
                          {p.type === "career" ? "Grado" : "Máster"} · {p.years} año{p.years !== 1 ? "s" : ""}
                        </Text>
                      </View>
                      {activo && (
                        <Text style={{ fontSize: 11, color: p.color, backgroundColor: p.color + "22", paddingHorizontal: 8, paddingVertical: 2, borderRadius: 5 }}>Activo</Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
                <Nota>Crear, editar y borrar programas se hace desde el ordenador.</Nota>
              </>
            )}

            {/* ── Apariencia ── */}
            <Seccion titulo="🎨 Apariencia" />
            <Etiqueta>Fondo</Etiqueta>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 6 }}>
              {BG_LABELS.map(([v, l]) => (
                <Opcion key={v} activa={fondo === v} label={l} onPress={() => updateSettings({ bgTheme: v })} />
              ))}
            </View>
            <Nota>El color de acento lo pone el programa activo, igual que en el PC.</Nota>

            {/* ── Horario ── */}
            <Seccion titulo="🕒 Horario" />
            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: D.card2, borderRadius: 9, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: D.text, fontSize: 13, flex: 1 }}>Ajustar a la primera y última clase</Text>
              <Interruptor activo={grid.auto} onPress={() => setGrid({ auto: !grid.auto })} />
            </View>
            {!grid.auto && (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <Text style={{ color: D.muted, fontSize: 12 }}>De</Text>
                <View style={{ flex: 1 }}><TimeField value={grid.start} onChange={v => setGrid({ start: v })} /></View>
                <Text style={{ color: D.muted, fontSize: 12 }}>a</Text>
                <View style={{ flex: 1 }}><TimeField value={grid.end} onChange={v => setGrid({ end: v })} /></View>
              </View>
            )}
            <Nota>Franja que dibuja la rejilla del horario. Una clase fuera de ella la estira, nunca se oculta.</Nota>

            {/* ── Notas ── */}
            <Seccion titulo="🎓 Notas y calificaciones" />

            <Etiqueta>Escala</Etiqueta>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 6 }}>
              {Object.entries(GRADE_SCALES).map(([v, { label }]) => (
                <Opcion key={v} activa={escala === v} label={label} onPress={() => updateSettings({ gradeScale: v })} />
              ))}
            </View>
            <Nota>
              {(GRADE_SCALES[escala] || GRADE_SCALES.es).ayuda}
              {escala !== "es" && " Solo cambia cómo se muestran: por dentro se guardan en 0–10, así que la media no varía."}
            </Nota>

            <Etiqueta>Umbral de aprobado</Etiqueta>
            <View style={{ flexDirection: "row", gap: 6, marginBottom: 6 }}>
              {PASSING.map(v => (
                <Opcion key={v} activa={umbral === v} label={String(v)} onPress={() => updateSettings({ passingGrade: v })} flex />
              ))}
            </View>
            <Nota>Nota mínima para dar una asignatura por aprobada. Afecta a colores y etiquetas.</Nota>

            <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: D.card2, borderRadius: 9, padding: 12, marginBottom: 8 }}>
              <Text style={{ color: D.text, fontSize: 13, flex: 1 }}>Iconos de nota (😈🥉🥇👑…)</Text>
              <Interruptor activo={iconos} onPress={() => updateSettings({ gradeIcons: !iconos })} />
            </View>

            {/* ── Salir ── */}
            <View style={{ height: 1, backgroundColor: D.border, marginVertical: 16 }} />
            <TouchableOpacity onPress={confirmSignOut} style={{ paddingVertical: 12, borderRadius: 10, borderWidth: 1, borderColor: D.red + "44", backgroundColor: D.red + "11", alignItems: "center", marginBottom: 10 }}>
              <Text style={{ color: D.red, fontSize: 14, fontWeight: "600" }}>Cerrar sesión</Text>
            </TouchableOpacity>
            <TouchableOpacity onPress={onClose} style={{ paddingVertical: 12, borderRadius: 10, alignItems: "center" }}>
              <Text style={{ color: D.muted, fontSize: 13 }}>Cerrar</Text>
            </TouchableOpacity>

            <Text style={{ color: D.muted, fontSize: 10, textAlign: "center", marginTop: 12 }}>LixT v1.4.0</Text>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Piezas ─────────────────────────────────────────────────────────────────────

function Seccion({ titulo }) {
  return <Text style={{ color: D.text, fontSize: 14, fontWeight: "700", marginTop: 18, marginBottom: 10 }}>{titulo}</Text>;
}

function Etiqueta({ children }) {
  return <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>{children}</Text>;
}

function Nota({ children }) {
  return <Text style={{ color: D.muted, fontSize: 11, lineHeight: 16, marginBottom: 12 }}>{children}</Text>;
}

function Opcion({ activa, label, onPress, flex }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ flex: flex ? 1 : undefined, paddingVertical: 9, paddingHorizontal: 13, borderRadius: 8, alignItems: "center",
               backgroundColor: activa ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: activa ? D.accent : D.border }}>
      <Text style={{ color: activa ? D.accent : D.muted, fontSize: 12, fontWeight: activa ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}

// Interruptor a mano: el Switch de React Native no deja teñirlo del acento.
function Interruptor({ activo, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} activeOpacity={0.8}
      style={{ width: 44, height: 24, borderRadius: 12, backgroundColor: activo ? D.accent : D.border, justifyContent: "center" }}>
      <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: "#fff", marginLeft: activo ? 23 : 3 }} />
    </TouchableOpacity>
  );
}
