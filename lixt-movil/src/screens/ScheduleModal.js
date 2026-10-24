import React, { useState, useEffect } from "react";
import { Modal, View, Text, TouchableOpacity, Pressable, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { D, botonPrimario, botonSecundario, botonPeligro, VELO, sc } from "../theme";
import { TimeField } from "./DateTimeField";

const DAYS = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

// El selector de asignatura va en UNA fila con scroll horizontal, no en una
// rejilla que se envuelve: con muchas asignaturas la altura del modal crecía
// tanto que obligaba a hacer scroll vertical para llegar a los botones.
export default function ScheduleModal({ visible, slot, subjects, day, onClose, onSave, onDelete }) {
  const [subjectId, setSubjectId] = useState(null);
  const [d, setD]         = useState("Lu");
  const [start, setStart] = useState("09:00");
  const [end, setEnd]     = useState("10:00");

  useEffect(() => {
    if (!visible) return;
    if (slot) {
      setSubjectId(slot.subjectId); setD(slot.day); setStart(slot.start); setEnd(slot.end);
    } else {
      setSubjectId(subjects[0]?.id ?? null); setD(day || "Lu"); setStart("09:00"); setEnd("10:00");
    }
  }, [visible, slot]);

  function save() {
    if (!subjectId) return;
    onSave({ subjectId, day: d, start, end });
  }

  const elegida = subjects.find(s => s.id === subjectId);

  return (
    <Modal visible={visible} animationType="slide" transparent statusBarTranslucent onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "flex-end" }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 20, paddingBottom: 28 }}>

            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
              <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", flex: 1 }}>
                {slot ? "Editar clase" : "Nueva clase"}
              </Text>
              {!!elegida && <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: sc(elegida.color) }} />}
            </View>

            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>Asignatura</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
              <View style={{ flexDirection: "row", gap: 7 }}>
                {subjects.map(s => (
                  <TouchableOpacity key={s.id} onPress={() => setSubjectId(s.id)}
                    style={{ paddingVertical: 9, paddingHorizontal: 14, borderRadius: 8, backgroundColor: subjectId === s.id ? s.color + "33" : D.card2, borderWidth: 1, borderColor: subjectId === s.id ? sc(s.color) : D.border }}>
                    <Text style={{ color: subjectId === s.id ? D.text : D.muted, fontSize: 13, fontWeight: subjectId === s.id ? "600" : "400" }}>
                      {s.acronym || s.name}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </ScrollView>

            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>Día</Text>
            <View style={{ flexDirection: "row", gap: 4, marginBottom: 16 }}>
              {DAYS.map(x => (
                <TouchableOpacity key={x} onPress={() => setD(x)}
                  style={{ flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center", backgroundColor: d === x ? D.accent : D.card2, borderWidth: 1, borderColor: d === x ? D.accent : D.border }}>
                  <Text style={{ color: d === x ? "#fff" : D.muted, fontSize: 12, fontWeight: d === x ? "600" : "400" }}>{x}</Text>
                </TouchableOpacity>
              ))}
            </View>

            <View style={{ flexDirection: "row", gap: 12, marginBottom: 18 }}>
              <View style={{ flex: 1 }}>
                <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>Inicio</Text>
                <TimeField value={start} onChange={setStart} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>Fin</Text>
                <TimeField value={end} onChange={setEnd} />
              </View>
            </View>

            <View style={{ flexDirection: "row", gap: 10 }}>
              {slot && (
                <TouchableOpacity onPress={() => onDelete(slot.id)}
                  style={botonPeligro()}>
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

          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}
