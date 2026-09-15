// ═══════════════════════════════════════════════════════════════════════════════
// supabase.js — Cliente de Supabase.
//
// Sobre la clave: `sb_publishable_...` es PÚBLICA por diseño. Va dentro de la app
// y cualquiera que abra las DevTools puede verla. No es un descuido: la seguridad
// real está en las políticas RLS de la base de datos, que solo dejan a cada
// usuario tocar sus propias filas.
//
// La que NUNCA debe aparecer aquí es la `sb_secret_...`: esa se salta el RLS.
// ═══════════════════════════════════════════════════════════════════════════════

import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "https://qznrqqwsipngukhmykcn.supabase.co";
const SUPABASE_KEY = "sb_publishable_2ID_UEpBVMlAMIsNhjxlWw_Z_9xXmC8";

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: {
    // La sesión se guarda en localStorage y se renueva sola: no tendrás que
    // volver a entrar cada vez que abras la app.
    persistSession: true,
    autoRefreshToken: true,
    // Con clave propia para no chocar con el resto de datos de LixT
    storageKey: "lixt_auth",
    // Solo se usa en flujos OAuth con redirección por URL. Aquí es login por
    // email y contraseña dentro de una ventana de escritorio: no aplica.
    detectSessionInUrl: false,
  },
});

// ─── Autenticación ─────────────────────────────────────────────────────────────

export async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

export async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

export async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

export async function getSession() {
  const { data } = await supabase.auth.getSession();
  return data.session;
}

// Traduce los errores de Supabase (en inglés) a algo legible.
export function authErrorMessage(err) {
  const m = String(err?.message || err || "");
  if (/Invalid login credentials/i.test(m))       return "Email o contraseña incorrectos.";
  if (/Email not confirmed/i.test(m))             return "Confirma tu email antes de entrar (revisa tu bandeja).";
  if (/User already registered/i.test(m))         return "Ya existe una cuenta con ese email.";
  if (/Password should be at least/i.test(m))     return "La contraseña debe tener al menos 6 caracteres.";
  if (/Unable to validate email address/i.test(m))return "El email no tiene un formato válido.";
  if (/rate limit|too many requests/i.test(m))    return "Demasiados intentos. Espera un minuto.";
  if (/fetch|network|Failed to fetch/i.test(m))   return "Sin conexión con el servidor.";
  return m || "Error desconocido.";
}
