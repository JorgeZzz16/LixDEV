// ═══════════════════════════════════════════════════════════════════════════════
// supabase.js — Versión móvil.
//
// Idéntico al del escritorio salvo por el almacenamiento: React Native no tiene
// `localStorage`, así que la sesión se guarda con AsyncStorage. El resto de la
// app (sync.js incluido) no nota la diferencia.
// ═══════════════════════════════════════════════════════════════════════════════

import "react-native-url-polyfill/auto";   // Supabase usa URL/URLSearchParams, que RN no trae
import AsyncStorage from "@react-native-async-storage/async-storage";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qznrqqwsipngukhmykcn.supabase.co";
const SUPABASE_KEY = "sb_publishable_2ID_UEpBVMlAMIsNhjxlWw_Z_9xXmC8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    storage: AsyncStorage,        // ← única diferencia real con la versión de escritorio
    persistSession: true,
    autoRefreshToken: true,
    storageKey: "lixt_auth",
    detectSessionInUrl: false,    // no hay barra de direcciones en una app nativa
  },
});

// ─── Autenticación ─────────────────────────────────────────────────────────────

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export function authErrorMessage(err) {
  const m = String(err?.message || err || "");
  if (/Invalid login credentials/i.test(m))        return "Email o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m))              return "Confirma tu email antes de entrar.";
  if (/User already registered/i.test(m))          return "Ya existe una cuenta con ese email.";
  if (/Password should be at least/i.test(m))      return "La contraseña debe tener al menos 6 caracteres.";
  if (/rate limit|too many requests/i.test(m))     return "Demasiados intentos. Espera un minuto.";
  if (/fetch|network|Failed to fetch/i.test(m))    return "Sin conexión con el servidor.";
  return m || "Error desconocido.";
}
