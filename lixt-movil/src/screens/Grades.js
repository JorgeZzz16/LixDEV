import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, TextInput, RefreshControl } from "react-native";
import { calcFinalGrade, weightedAverage, gradeColor, subjectMedal, touch, softDelete, fmtGrade, soloNumero, parseNum } from "../logic";
import { D } from "../theme";
import TaskModal from "./TaskModal";

// ─── Fila de asignatura ─────────────────────────────────────────────────────────
// Va FUERA de Grades a propósito. Definida dentro, cada pulsación en el campo de
// nota manual cambiaba el estado del padre → nueva identidad de función → React
// la trataba como otro componente y remontaba el subárbol, así que el TextInput
// perdía el foco y se cerraba el teclado en cada tecla.
function Row({ s, data, expanded, setExpanded, manualDraft, setManualDraft, applyManual, onEditTask }) {
  const { finalGrade, totalPct, gradedTasks, pointsTasks } = calcFinalGrade(data.tasks, data.subjects, s.id);
  const rowKey = s._splitSem ? s.id + "_" + s._splitSem : s.id;
  const isOpen = expanded === rowKey;
  const medal = subjectMedal(finalGrade, s.approved);
  const showGrade = totalPct >= 100 || (s.manualGrade !== null && s.manualGrade !== undefined);
  const isManual = s.manualGrade !== null && s.manualGrade !== undefined;
  const draft = manualDraft[rowKey];

  return (
    <View style={{ marginBottom: 6 }}>
      <TouchableOpacity onPress={() => setExpanded(isOpen ? null : rowKey)}
        style={{
          backgroundColor: isOpen ? s.color + "22" : D.card2, borderRadius: 9, borderLeftWidth: 3, borderLeftColor: s.color || D.muted,
          padding: 12, flexDirection: "row", alignItems: "center", gap: 10,
        }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: D.text, fontSize: 13, fontWeight: "500" }} numberOfLines={1}>
            {s.archived ? "📁 " : ""}{s.name}{s._splitSem ? <Text style={{ color: D.muted, fontSize: 10 }}> C{s._splitSem}</Text> : null}
          </Text>
          <Text style={{ color: D.muted, fontSize: 11, marginTop: 2 }}>
            {s.credits ? s.credits + " ECTS" : "—"}{totalPct > 0 ? " · " + totalPct + "%" : ""}
          </Text>
        </View>
        {s.approved && !medal && (
          <View style={{ backgroundColor: D.green + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: D.green, fontSize: 10, fontWeight: "600" }}>✓</Text>
          </View>
        )}
        <Text style={{ color: showGrade && finalGrade !== null ? gradeColor(finalGrade) : D.muted, fontSize: 15, fontWeight: "700", minWidth: 46, textAlign: "right" }}>
          {showGrade && finalGrade !== null ? fmtGrade(finalGrade) + (medal ? " " + medal : "") : "—"}
        </Text>
        <Text style={{ color: D.muted, fontSize: 11 }}>{isOpen ? "▲" : "▼"}</Text>
      </TouchableOpacity>

      {isOpen && (
        <View style={{ backgroundColor: D.card, borderRadius: 9, borderWidth: 1, borderColor: s.color + "66", padding: 12, marginTop: 4 }}>
          {gradedTasks.length === 0 && pointsTasks.length === 0 && (
            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 10 }}>Sin actividades calificadas todavía.</Text>
          )}
          {gradedTasks.map(t => (
            <TouchableOpacity key={t.id} onPress={() => onEditTask(s.id, t)}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, backgroundColor: D.card2, borderRadius: 6, padding: 8 }}>
              <Text style={{ color: D.text, fontSize: 12, flex: 1 }} numberOfLines={1}>{t.title}</Text>
              <Text style={{ color: D.muted, fontSize: 11, marginRight: 8 }}>{t.pct}%</Text>
              <Text style={{ color: gradeColor(t.grade), fontSize: 12, fontWeight: "700", minWidth: 40, textAlign: "right" }}>{fmtGrade(t.grade)}</Text>
              <Text style={{ color: D.muted, fontSize: 11, marginLeft: 6 }}>✎</Text>
            </TouchableOpacity>
          ))}
          {pointsTasks.map(t => (
            <TouchableOpacity key={t.id} onPress={() => onEditTask(s.id, t)}
              style={{ flexDirection: "row", alignItems: "center", marginBottom: 6, backgroundColor: D.card2, borderRadius: 6, padding: 8 }}>
              <Text style={{ color: D.text, fontSize: 12, flex: 1 }} numberOfLines={1}>{t.title}</Text>
              <Text style={{ color: D.accent, fontSize: 11, marginRight: 8 }}>+{t.pts} pts</Text>
              <Text style={{ color: gradeColor(t.grade), fontSize: 12, fontWeight: "700", minWidth: 40, textAlign: "right" }}>{fmtGrade(t.grade)}</Text>
              <Text style={{ color: D.muted, fontSize: 11, marginLeft: 6 }}>✎</Text>
            </TouchableOpacity>
          ))}

          <View style={{ height: 1, backgroundColor: D.border, marginVertical: 10 }} />

          <Text style={{ color: D.muted, fontSize: 11, marginBottom: 6 }}>Nota manual (sobreescribe el cálculo)</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <TextInput
              value={draft !== undefined ? draft : (s.manualGrade ?? "").toString()}
              onChangeText={t => setManualDraft(prev => ({ ...prev, [rowKey]: soloNumero(t) }))}
              onEndEditing={() => applyManual(s.id, rowKey, draft ?? (s.manualGrade ?? "").toString())}
              placeholder="Auto" placeholderTextColor={D.muted} keyboardType="decimal-pad"
              style={{ backgroundColor: D.card2, borderWidth: 1, borderColor: D.border, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 12, color: D.text, fontSize: 13, width: 110 }}
            />
            {isManual && (
              <TouchableOpacity onPress={() => applyManual(s.id, rowKey, "")} style={{ paddingVertical: 8, paddingHorizontal: 12, borderRadius: 8, borderWidth: 1, borderColor: D.border }}>
                <Text style={{ color: D.muted, fontSize: 12 }}>Quitar</Text>
              </TouchableOpacity>
            )}
            <Text style={{ color: D.muted, fontSize: 11, flex: 1, textAlign: "right" }}>Completado: {totalPct}%</Text>
          </View>
        </View>
      )}
    </View>
  );
}

export default function Grades({ data, sync, syncing, mutate, program }) {
  const [expanded, setExpanded] = useState(null); // id de la asignatura desplegada (o id_semX si está partida)
  const [editingTask, setEditingTask] = useState(undefined);
  const [manualDraft, setManualDraft] = useState({}); // borrador del input de nota manual, por fila

  const years     = Array.from({ length: program?.years ?? 4 }, (_, i) => i + 1);
  const semesters = Array.from({ length: program?.semestersPerYear ?? 2 }, (_, i) => i + 1);

  // ── Agrupamiento por curso/cuatrimestre, igual que el PC ────────────────────
  // Una asignatura con varios cuatrimestres se reparte entre ellos (créditos
  // divididos a partes iguales) para que aparezca en cada uno.
  const grid = {};
  years.forEach(y => { grid[y] = {}; semesters.forEach(s => { grid[y][s] = []; }); });
  const unassigned = [];
  data.subjects.forEach(s => {
    if (!s.year) { unassigned.push(s); return; }
    let sems = s.semester;
    if (s.annual) sems = semesters;
    else if (!sems) { unassigned.push(s); return; }
    else if (!Array.isArray(sems)) sems = [sems];
    // Un array vacío no es "sin cuatrimestre": sin esto la asignatura se perdía
    // por el hueco (grid[año][undefined] no existe y el push se descartaba).
    if (sems.length === 0) { unassigned.push(s); return; }
    if (sems.length === 1) {
      grid[s.year]?.[sems[0]]?.push(s);
    } else {
      const splitCredits = s.credits ? s.credits / sems.length : null;
      sems.forEach(sem => grid[s.year]?.[sem]?.push({ ...s, credits: splitCredits, _splitSem: sem }));
    }
  });

  const media = weightedAverage(data.tasks, data.subjects);
  const creditosAprobados = data.subjects.filter(s => s.approved).reduce((a, s) => a + (s.credits || 0), 0);

  // ── Edición ───────────────────────────────────────────────────────────────
  function saveTask(fields) {
    mutate("tasks", prev => prev.map(t => t.id === editingTask.id ? touch({ ...t, ...fields }) : t));
    setEditingTask(undefined);
  }
  function applyManual(subjId, rowKey, value) {
    const v = value.trim();
    mutate("subjects", prev => prev.map(x => x.id === subjId ? touch({ ...x, manualGrade: parseNum(v) }) : x));
    setManualDraft(prev => ({ ...prev, [rowKey]: undefined }));
  }
  // `subjId` lo pasan las filas, pero aquí el modal no deja cambiar de asignatura
  function openTask(subjId, t) { setEditingTask(t); }

  // Todo lo que Row necesita del padre, en un sitio
  const rowProps = { data, expanded, setExpanded, manualDraft, setManualDraft, applyManual, onEditTask: openTask };

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: D.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}
    >
      <Text style={{ color: D.text, fontSize: 22, fontWeight: "700", marginBottom: 18 }}>Notas</Text>

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 22 }}>
        <View style={{ flex: 1, backgroundColor: D.card, borderRadius: 12, borderWidth: 1, borderColor: D.border, padding: 14 }}>
          <Text style={{ color: D.muted, fontSize: 12 }}>Nota media</Text>
          <Text style={{ color: media !== null ? gradeColor(media) : D.muted, fontSize: 26, fontWeight: "700" }}>
            {fmtGrade(media)}
          </Text>
        </View>
        <View style={{ flex: 1, backgroundColor: D.card, borderRadius: 12, borderWidth: 1, borderColor: D.border, padding: 14 }}>
          <Text style={{ color: D.muted, fontSize: 12 }}>Créditos</Text>
          <Text style={{ color: D.text, fontSize: 26, fontWeight: "700" }}>{creditosAprobados}</Text>
        </View>
      </View>

      {years.map(y => {
        const hasAny = semesters.some(sem => grid[y][sem].length > 0);
        if (!hasAny) return null;
        return (
          <View key={y} style={{ marginBottom: 18 }}>
            <Text style={{ color: D.text, fontSize: 15, fontWeight: "700", marginBottom: 8 }}>{y}º curso</Text>
            {semesters.map(sem => grid[y][sem].length > 0 && (
              <View key={sem} style={{ marginBottom: 10 }}>
                <Text style={{ color: D.muted, fontSize: 11, fontWeight: "600", marginBottom: 6, textTransform: "uppercase", letterSpacing: 0.5 }}>
                  Cuatrimestre {sem}
                </Text>
                {grid[y][sem].map(s => <Row key={s._splitSem ? s.id + "_" + s._splitSem : s.id} s={s} {...rowProps} />)}
              </View>
            ))}
          </View>
        );
      })}

      {unassigned.length > 0 && (
        <View style={{ marginBottom: 18 }}>
          <Text style={{ color: D.muted, fontSize: 13, fontWeight: "600", marginBottom: 8 }}>Sin curso asignado</Text>
          {unassigned.map(s => <Row key={s.id} s={s} {...rowProps} />)}
        </View>
      )}

      <TaskModal
        visible={editingTask !== undefined}
        task={editingTask}
        onClose={() => setEditingTask(undefined)}
        onSave={saveTask}
        onDelete={id => { mutate("tasks", prev => prev.map(t => t.id === id ? softDelete(t) : t)); setEditingTask(undefined); }}
      />
    </ScrollView>
  );
}
