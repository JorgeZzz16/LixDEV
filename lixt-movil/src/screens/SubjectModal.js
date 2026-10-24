import React, { useState, useEffect } from "react";
import { Modal, View, Text, Pressable, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { COLORS } from "../constants";
import { soloNumero, parseNum } from "../logic";
import { D, input, botonPrimario, botonSecundario, VELO } from "../theme";

const emptyForm = { name: "", acronym: "", color: COLORS[0], year: null, semester: null, annual: false, credits: "" };

export default function SubjectModal({ visible, subject, years, onClose, onSave }) {
  const [f, setF] = useState(emptyForm);

  useEffect(() => {
    if (!visible) return;
    if (subject) {
      let sem = subject.semester ?? null;
      // `annual` es un campo antiguo que ya no se guarda: se traduce a "todos los
      // cuatrimestres", igual que en el PC. Poniéndolo a null la asignatura salía
      // de su curso en Notas y caía en "sin asignar".
      if (subject.annual) sem = [1, 2];
      else if (typeof sem === "number") sem = [sem];
      else if (!Array.isArray(sem)) sem = sem ? [sem] : null;
      setF({ name: subject.name, acronym: subject.acronym || "", color: subject.color, year: subject.year ?? null, semester: sem, annual: false, credits: subject.credits != null ? String(subject.credits) : "" });
    } else {
      setF(emptyForm);
    }
  }, [visible, subject]);

  function toggleSem(n) {
    setF(prev => {
      const cur = prev.semester || [];
      const next = cur.includes(n) ? cur.filter(x => x !== n) : [...cur, n].sort();
      return { ...prev, semester: next.length ? next : null };
    });
  }

  function save() {
    if (!f.name.trim()) return;
    onSave({
      name: f.name.trim(),
      acronym: f.acronym.trim().toUpperCase(),
      color: f.color,
      year: f.year,
      semester: f.semester,
      annual: false,
      credits: parseNum(f.credits, { min: 0, max: 100 }),
    });
  }

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "flex-end" }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, maxHeight: "88%" }}>
            <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 30 }}>
              <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", marginBottom: 16 }}>
                {subject ? "Editar asignatura" : "Nueva asignatura"}
              </Text>

              <Label>Nombre</Label>
              <TextInput value={f.name} onChangeText={t => setF(p => ({ ...p, name: t }))} placeholder="Ej: Cálculo I" placeholderTextColor={D.muted} style={input()} />

              <Label>Siglas (para el horario)</Label>
              <TextInput value={f.acronym} onChangeText={t => setF(p => ({ ...p, acronym: t.toUpperCase() }))} placeholder="Ej: MCM" placeholderTextColor={D.muted} maxLength={6} style={input()} />

              <Label>Color</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 }}>
                {COLORS.map(c => (
                  <TouchableOpacity key={c} onPress={() => setF(p => ({ ...p, color: c }))}
                    style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: c, borderWidth: f.color === c ? 3 : 0, borderColor: D.text }} />
                ))}
              </View>

              <Label>Curso</Label>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 16 }}>
                {[null, ...Array.from({ length: years || 4 }, (_, i) => i + 1)].map(y => (
                  <Chip key={y ?? "none"} active={f.year === y} onPress={() => setF(p => ({ ...p, year: y }))} label={y === null ? "—" : y + "º"} />
                ))}
              </View>

              <Label>Cuatrimestre</Label>
              <View style={{ flexDirection: "row", gap: 7, marginBottom: 16 }}>
                {[1, 2].map(n => (
                  <Chip key={n} active={(f.semester || []).includes(n)} onPress={() => toggleSem(n)} label={"C" + n} />
                ))}
              </View>

              <Label>Créditos ECTS</Label>
              <TextInput value={f.credits} onChangeText={t => setF(p => ({ ...p, credits: soloNumero(t) }))} placeholder="6" placeholderTextColor={D.muted} keyboardType="decimal-pad" style={input()} />

              <View style={{ flexDirection: "row", gap: 10, marginTop: 10 }}>
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

