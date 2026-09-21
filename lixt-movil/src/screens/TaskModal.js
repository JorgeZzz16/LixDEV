import React, { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { TASK_TYPES } from "../constants";
import { DateField } from "./DateTimeField";
import { today, soloNumero, parseNum } from "../logic";
import { D, input, botonPrimario, botonSecundario, botonPeligro, VELO } from "../theme";

const emptyForm = { title: "", type: "tarea", dueDate: today(), status: "pendiente", priority: "media", grade: "", pct: "" };

export default function TaskModal({ visible, task, subjects, subjectId, initialDate, initialType, onSubjectChange, onClose, onSave, onDelete }) {
  const [f, setF] = useState(emptyForm);

  useEffect(() => {
    if (!visible) return;
    if (task) {
      setF({
        title: task.title, type: task.type || "tarea", dueDate: task.dueDate || today(),
        status: task.status || "pendiente", priority: task.priority || "media",
        grade: task.grade != null ? String(task.grade) : "",
        pct: task.pct != null ? String(task.pct) : "",
      });
    } else {
      setF({ ...emptyForm, type: initialType || "tarea", dueDate: initialDate || today() });
    }
  }, [visible, task, initialDate, initialType]);

  // El modo "puntos extra" solo se configura en el PC. Aquí se conserva tal cual:
  // si se enviara gradeMode "pct" y pts null, al sincronizar ganaría esta versión
  // (updated_at más reciente) y el PC perdería el bonus sin avisar.
  const isPoints = task?.gradeMode === "points";
  // Los recordatorios no llevan nota ni peso
  const conNota = TASK_TYPES.find(t => t.key === f.type)?.hasGrade !== false;

  function save() {
    if (!f.title.trim()) return;
    onSave({
      title: f.title.trim(), type: f.type, dueDate: f.dueDate, status: f.status, priority: f.priority,
      grade: conNota ? parseNum(f.grade) : null,
      gradeMode: isPoints ? "points" : "pct",
      pct: !conNota ? null : isPoints ? (task.pct ?? null) : parseNum(f.pct, { min: 0, max: 100 }),
      pts: isPoints ? (task.pts ?? null) : null,
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "flex-end" }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88%" }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
              <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", marginBottom: 16 }}>
                {task ? "Editar actividad" : "Nueva actividad"}
              </Text>

              {subjects && (
                <>
                  <Label>Asignatura</Label>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                    <TouchableOpacity onPress={() => onSubjectChange(null)}
                      style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: subjectId == null ? D.card : D.card2, borderWidth: 1, borderColor: subjectId == null ? D.accent : D.border }}>
                      <Text style={{ color: subjectId == null ? D.text : D.muted, fontSize: 12 }}>Sin asignatura</Text>
                    </TouchableOpacity>
                    {subjects.map(s => (
                      <TouchableOpacity key={s.id} onPress={() => onSubjectChange(s.id)}
                        style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: subjectId === s.id ? s.color + "33" : D.card2, borderWidth: 1, borderColor: subjectId === s.id ? s.color : D.border }}>
                        <Text style={{ color: subjectId === s.id ? D.text : D.muted, fontSize: 12 }}>{s.acronym || s.name}</Text>
                      </TouchableOpacity>
                    ))}
                  </View>
                </>
              )}

              <Label>Título</Label>
              <TextInput value={f.title} onChangeText={t => setF(p => ({ ...p, title: t }))} placeholder="Ej: Examen parcial" placeholderTextColor={D.muted} style={input()} />

              <Label>Tipo</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                {TASK_TYPES.map(t => (
                  <Chip key={t.key} active={f.type === t.key} onPress={() => setF(p => ({ ...p, type: t.key }))} label={t.label} />
                ))}
              </View>

              <Label>Fecha</Label>
              <View style={{ marginBottom: 16 }}>
                <DateField value={f.dueDate} onChange={v => setF(p => ({ ...p, dueDate: v }))} />
              </View>

              <Label>Estado</Label>
              <View style={{ flexDirection: "row", gap: 7, marginBottom: 16 }}>
                {["pendiente", "en progreso", "completada"].map(s => (
                  <Chip key={s} active={f.status === s} onPress={() => setF(p => ({ ...p, status: s }))} label={s} />
                ))}
              </View>

              <Label>Prioridad</Label>
              <View style={{ flexDirection: "row", gap: 7, marginBottom: 16 }}>
                {["alta", "media", "baja"].map(p => (
                  <Chip key={p} active={f.priority === p} onPress={() => setF(prev => ({ ...prev, priority: p }))} label={p} />
                ))}
              </View>

              {conNota && (
              <View style={{ flexDirection: "row", gap: 12 }}>
                <View style={{ flex: 1 }}>
                  <Label>Nota (0-10)</Label>
                  <TextInput value={f.grade} onChangeText={t => setF(p => ({ ...p, grade: soloNumero(t) }))} placeholder="—" placeholderTextColor={D.muted} keyboardType="decimal-pad" style={input()} />
                </View>
                <View style={{ flex: 1 }}>
                  {isPoints ? (
                    <>
                      <Label>Puntos extra</Label>
                      <View style={{ ...input(), justifyContent: "center" }}>
                        <Text style={{ color: D.green, fontSize: 14 }}>
                          +{(((parseNum(f.grade) ?? 0) / 10) * (task.pts || 0)).toFixed(2)} de {task.pts} máx.
                        </Text>
                      </View>
                    </>
                  ) : (
                    <>
                      <Label>Peso (% nota final)</Label>
                      <TextInput value={f.pct} onChangeText={t => setF(p => ({ ...p, pct: soloNumero(t) }))} placeholder="0" placeholderTextColor={D.muted} keyboardType="decimal-pad" style={input()} />
                    </>
                  )}
                </View>
              </View>
              )}

              <View style={{ flexDirection: "row", gap: 10, marginTop: 6 }}>
                {task && (
                  <TouchableOpacity onPress={() => onDelete(task.id)} style={botonPeligro()}>
                    <Text style={{ color: D.red, fontSize: 14 }}>Eliminar</Text>
                  </TouchableOpacity>
                )}
                <TouchableOpacity onPress={onClose} style={botonSecundario()}>
                  <Text style={{ color: D.muted, fontSize: 14 }}>Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={save} style={botonPrimario()}>
                  <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Guardar</Text>
                </TouchableOpacity>
              </View>
            </ScrollView>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

function Label({ children }) {
  return <Text style={{ color: D.muted, fontSize: 12, marginBottom: 6 }}>{children}</Text>;
}

function Chip({ active, onPress, label }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8, backgroundColor: active ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: active ? D.accent : D.border }}>
      <Text style={{ color: active ? D.accent : D.muted, fontSize: 12, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}

