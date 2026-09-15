import React, { useState } from "react";
import { View, Text, TextInput, TouchableOpacity, ActivityIndicator, KeyboardAvoidingView, Platform } from "react-native";
import { signIn, signUp, authErrorMessage } from "../supabase";
import { D } from "../theme";

export default function Auth() {
  const [mode, setMode]         = useState("signin");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [error, setError]       = useState("");
  const [info, setInfo]         = useState("");
  const [busy, setBusy]         = useState(false);
  const [verPassword, setVerPassword] = useState(false);

  async function submit() {
    setError(""); setInfo(""); setBusy(true);
    try {
      if (mode === "signup") {
        const d = await signUp(email.trim(), password);
        if (!d.session) setInfo("Cuenta creada. Confirma tu email.");
      } else {
        await signIn(email.trim(), password);
      }
    } catch (e) {
      setError(authErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  const disabled = busy || !email || !password;

  return (
    <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, backgroundColor: D.bg, justifyContent: "center", padding: 28 }}>
      <Text style={{ color: D.text, fontSize: 30, fontWeight: "700", marginBottom: 6 }}>LixT</Text>
      <Text style={{ color: D.muted, fontSize: 14, marginBottom: 28 }}>Entra con la misma cuenta del ordenador.</Text>

      <View style={{ flexDirection: "row", borderRadius: 9, overflow: "hidden", borderWidth: 1, borderColor: D.border, alignSelf: "flex-start", marginBottom: 16 }}>
        {[["signin", "Entrar"], ["signup", "Crear cuenta"]].map(([k, label]) => (
          <TouchableOpacity key={k} onPress={() => { setMode(k); setError(""); setInfo(""); }}
            style={{ paddingVertical: 9, paddingHorizontal: 18, backgroundColor: mode === k ? D.accent : D.card2 }}>
            <Text style={{ color: mode === k ? "#fff" : D.muted, fontSize: 13 }}>{label}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <TextInput
        placeholder="tu@email.com" placeholderTextColor={D.muted}
        value={email} onChangeText={setEmail}
        autoCapitalize="none" keyboardType="email-address" autoComplete="email"
        style={inputStyle()}
      />
      {/* React Native no dibuja el ojo de "mostrar contraseña" que sí trae el
          navegador en el PC, así que se monta a mano: el campo pierde su
          padding derecho para dejarle sitio al botón, superpuesto encima. */}
      <View style={{ justifyContent: "center", marginBottom: 12 }}>
        <TextInput
          placeholder="Contraseña" placeholderTextColor={D.muted}
          value={password} onChangeText={setPassword}
          secureTextEntry={!verPassword} autoCapitalize="none"
          autoComplete="password" textContentType="password"
          style={{ ...inputStyle(), marginBottom: 0, paddingRight: 48 }}
        />
        <TouchableOpacity
          onPress={() => setVerPassword(v => !v)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          accessibilityLabel={verPassword ? "Ocultar contraseña" : "Mostrar contraseña"}
          style={{ position: "absolute", right: 12, padding: 4 }}>
          <Text style={{ fontSize: 17, opacity: verPassword ? 1 : 0.55 }}>
            {verPassword ? "🙈" : "👁"}
          </Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={{ color: D.red,   fontSize: 13, marginBottom: 10 }}>{error}</Text>}
      {!!info  && <Text style={{ color: D.green, fontSize: 13, marginBottom: 10 }}>{info}</Text>}

      <TouchableOpacity onPress={submit} disabled={disabled}
        style={{ backgroundColor: disabled ? D.card2 : D.accent, paddingVertical: 14, borderRadius: 10, alignItems: "center" }}>
        {busy
          ? <ActivityIndicator color={D.muted} />
          : <Text style={{ color: disabled ? D.muted : "#fff", fontSize: 15, fontWeight: "600" }}>{mode === "signup" ? "Crear cuenta" : "Entrar"}</Text>}
      </TouchableOpacity>
    </KeyboardAvoidingView>
  );
}

const inputStyle = () => ({
  backgroundColor: D.card2,
  borderWidth: 1, borderColor: D.border, borderRadius: 10,
  paddingVertical: 13, paddingHorizontal: 14,
  color: D.text, fontSize: 15, marginBottom: 12,
});
