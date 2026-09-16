import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform } from "react-native";
import { newId, touch } from "../logic";
import { COLORS } from "../constants";
import { D, input } from "../theme";

// Sin esto, un usuario que empiece por el móvil (sin haber usado nunca el PC) no
// tendría ningún programa de estudio: no habría dónde guardar las asignaturas y
// la app se quedaría vacía sin explicar por qué.
export default function Onboarding({ onCreate }) {
  const [name, setName]   = useState("Mi Carrera");
  const [years, setYears] = useState(4);
  const [sems, setSems]   = useState(2);
  const [color, setColor] = useState("#378ADD");

  function crear() {
    const id = "prog_" + newId();
    onCreate({
      activeProgram: id,
      programs: [touch({ id, name: name.trim() || "Mi Carrera", type: "career", years, semestersPerYear: sems, color })],
      programData: { [id]: { subjects: [], tasks: [], sessions: [], schedule: [] } },
    });
  }

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: D.bg }}>
      <ScrollView contentContainerStyle={{ padding: 28, paddingTop: 70, paddingBottom: 40 }}>
        <Text style={{ color: D.text, fontSize: 30, fontWeight: "800", letterSpacing: -1 }}>
          Lix<Text style={{ color: D.accent }}>T</Text>
        </Text>
        <Text style={{ color: D.muted, fontSize: 14, marginTop: 6, marginBottom: 30 }}>
          Configura tu programa de estudio para empezar.
        </Text>

        <Label>Nombre</Label>
        <TextInput value={name} onChangeText={setName} placeholder="Ej: Ingeniería Aeroespacial" placeholderTextColor={D.muted} style={input({ grande: true })} />

        <Label>Cursos</Label>
        <View style={{ flexDirection: "row", gap: 7, marginBottom: 18 }}>
          {[3, 4, 5, 6].map(n => (
            <Chip key={n} active={years === n} onPress={() => setYears(n)} label={n + " años"} />
          ))}
        </View>

        <Label>Cuatrimestres por curso</Label>
        <View style={{ flexDirection: "row", gap: 7, marginBottom: 18 }}>
          {[1, 2, 3].map(n => (
            <Chip key={n} active={sems === n} onPress={() => setSems(n)} label={String(n)} />
          ))}
        </View>

        <Label>Color</Label>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 28 }}>
          {COLORS.filter((_, i) => i % 3 === 0).map(c => (
            <TouchableOpacity key={c} onPress={() => setColor(c)}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: c, borderWidth: color === c ? 3 : 0, borderColor: "#fff" }} />
          ))}
        </View>

        <TouchableOpacity onPress={crear}
          style={{ backgroundColor: D.accent, paddingVertical: 15, borderRadius: 12, alignItems: "center" }}>
          <Text style={{ color: "#fff", fontSize: 15, fontWeight: "600" }}>Empezar</Text>
        </TouchableOpacity>

        <Text style={{ color: D.muted, fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 16 }}>
          Podrás cambiarlo más adelante. Si ya usas LixT en el ordenador, sincroniza
          desde allí y tus datos aparecerán aquí solos.
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function Label({ children }) {
  return <Text style={{ color: D.muted, fontSize: 12, marginBottom: 7 }}>{children}</Text>;
}

function Chip({ active, onPress, label }) {
  return (
    <TouchableOpacity onPress={onPress}
      style={{ paddingVertical: 9, paddingHorizontal: 15, borderRadius: 9, backgroundColor: active ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: active ? D.accent : D.border }}>
      <Text style={{ color: active ? D.accent : D.muted, fontSize: 13, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}

