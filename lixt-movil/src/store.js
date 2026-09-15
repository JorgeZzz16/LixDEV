// ═══════════════════════════════════════════════════════════════════════════════
// store.js — Estado de la app y su persistencia.
//
// Misma idea que en el escritorio: los datos viven en el dispositivo y la nube es
// para compartirlos entre aparatos. Así la app funciona en el metro sin cobertura.
//
// Diferencia con el escritorio: AsyncStorage es asíncrono (localStorage no lo es),
// así que hay un estado de "cargando" que allí no hacía falta.
// ═══════════════════════════════════════════════════════════════════════════════

import { useState, useEffect, useCallback, useRef } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { supabase } from "./supabase";
import { syncAll } from "./sync";
import { alive, setGradeConfig, GRADE_SCALES } from "./logic";
import { applyTheme } from "./theme";

const KEY  = "lixt_v2";
const KEY_SYNC = "lixt_last_sync";

// `settings` es un único blob JSON compartido con el PC. El móvil solo entiende
// una parte (notas y fondo); el resto — duraciones del timer, examCount,
// showEmptyDays… — se conserva tal cual al guardar, o al tocar cualquier ajuste
// desde aquí se borrarían los del ordenador.
function applyGradeSettings(s) {
  if (!s) return;
  const cfg = {};
  if (typeof s.passingGrade === "number")  cfg.passingGrade = s.passingGrade;
  if (typeof s.gradeIcons   === "boolean") cfg.gradeIcons   = s.gradeIcons;
  if (GRADE_SCALES[s.gradeScale]) cfg.gradeScale = s.gradeScale;
  if (Object.keys(cfg).length) setGradeConfig(cfg);
}

export function useStore() {
  const [state,   setState]   = useState(null);
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [syncing, setSyncing] = useState(false);
  const [syncMsg, setSyncMsg] = useState("");
  // Marca si la primera sincronización ya terminó. Hasta entonces no se sabe si el
  // usuario tiene datos en la nube, y mostrar el onboarding antes de tiempo le
  // haría crear un programa duplicado encima de los suyos.
  const [initialSyncDone, setInitialSyncDone] = useState(false);
  const [lastSync, setLastSync] = useState(null);
  // Fuerza un repintado cuando cambia el tema: `D` se muta en sitio y React no se
  // entera solo (ver el comentario de theme.js). El valor da igual, solo cambiarlo:
  // como useStore() se llama desde App, esto repinta el árbol entero.
  const [, repintarTema] = useState(0);
  const syncingRef = useRef(false);
  const msgTimer   = useRef(null);
  // El móvil solo sube los ajustes si los has tocado AQUÍ. Si no, manda el PC:
  // sin esto, cada sincronización del móvil pisaría los del ordenador con lo que
  // tuviera guardado de la última vez.
  const settingsDirty = useRef(false);

  // El mensaje de sincronización se borra solo: si no, "Todo al día" se queda
  // fijo en pantalla hasta la siguiente sincronización.
  const mostrarMensaje = (texto, ms = 3500) => {
    clearTimeout(msgTimer.current);
    setSyncMsg(texto);
    msgTimer.current = setTimeout(() => setSyncMsg(""), ms);
  };
  useEffect(() => () => clearTimeout(msgTimer.current), []);

  // ── Carga inicial desde el dispositivo ──────────────────────────────────────
  // ── Carga inicial: datos locales Y sesión, antes de mostrar nada ────────────
  // Ambas cosas se resuelven en paralelo. `loading` no se apaga hasta que las dos
  // estén listas, para que no se vea un parpadeo de la pantalla de login cuando
  // en realidad hay una sesión guardada que aún se estaba recuperando.
  useEffect(() => {
    let cancel = false;
    (async () => {
      const [rawResult, sessResult, syncResult] = await Promise.allSettled([
        AsyncStorage.getItem(KEY),
        supabase.auth.getSession(),
        AsyncStorage.getItem(KEY_SYNC),
      ]);
      if (cancel) return;
      if (rawResult.status === "fulfilled" && rawResult.value) {
        try {
          const saved = JSON.parse(rawResult.value);
          setState(saved);
          // Para arrancar sin red con el umbral y el fondo correctos
          applyGradeSettings(saved.settings);
          applyTheme({
            bgTheme: saved.settings?.bgTheme,
            accent: (saved.programs || []).find(p => p.id === saved.activeProgram)?.color,
          });
        } catch {}
      }
      if (sessResult.status === "fulfilled") {
        setSession(sessResult.value.data.session);
      }
      if (syncResult.status === "fulfilled" && syncResult.value) setLastSync(syncResult.value);
      setLoading(false);
    })();
    return () => { cancel = true; };
  }, []);

  // ── Persistencia: cada cambio se guarda ─────────────────────────────────────
  useEffect(() => {
    if (!state) return;
    AsyncStorage.setItem(KEY, JSON.stringify(state)).catch(() => {});
  }, [state]);

  // ── Ajustes → logic.js y tema ───────────────────────────────────────────────
  // Va en un efecto y no dentro de los setState: los updaters tienen que ser puros
  // (React puede llamarlos dos veces y `applyTheme` muta un objeto compartido).
  // Un único sitio cubre las tres formas de cambiar esto: tocar un ajuste,
  // cambiar de programa y recibir los del PC al sincronizar.
  useEffect(() => {
    applyGradeSettings(state?.settings);
    applyTheme({
      bgTheme: state?.settings?.bgTheme,
      accent: state?.programs?.find(p => p.id === state?.activeProgram)?.color,
    });
    repintarTema(t => t + 1);
  }, [state?.settings, state?.programs, state?.activeProgram]);

  // ── Cambios de sesión posteriores (login / logout desde la propia app) ──────
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub?.subscription?.unsubscribe();
  }, []);

  // ── Sincronización ──────────────────────────────────────────────────────────
  const sync = useCallback(async ({ silent = false } = {}) => {
    if (syncingRef.current || !session) return;
    syncingRef.current = true;
    if (!silent) { setSyncing(true); setSyncMsg(""); }
    try {
      // Un dispositivo nuevo aún no tiene estado: se parte de uno vacío para que
      // la fusión traiga todo lo que haya en el servidor.
      const base = state || { activeProgram: null, programs: [], programData: {} };
      // Solo se suben los ajustes si se han tocado en el móvil; si no manda el PC.
      const subir = settingsDirty.current ? (base.settings || null) : null;
      const { state: merged, pushed, pulled, remoteSettings } = await syncAll(base, subir);

      // Los del servidor solo se aplican si aquí no hay cambios sin subir, para no
      // deshacer lo que el usuario acaba de tocar en el teléfono.
      const efectivos = settingsDirty.current ? base.settings : (remoteSettings || base.settings);
      settingsDirty.current = false;
      setState(efectivos ? { ...merged, settings: efectivos } : merged);

      const ts = new Date().toISOString();
      setLastSync(ts);
      AsyncStorage.setItem(KEY_SYNC, ts).catch(() => {});
      if (!silent) mostrarMensaje(pushed || pulled ? `${pushed} subidos · ${pulled} recibidos` : "Todo al día");
    } catch (e) {
      // Los errores duran más, para dar tiempo a leerlos
      if (!silent) mostrarMensaje("Error: " + (e?.message || "no se pudo sincronizar"), 6000);
    } finally {
      syncingRef.current = false;
      if (!silent) setSyncing(false);
    }
  }, [state, session]);

  // Al entrar (o al arrancar con sesión guardada) se baja todo automáticamente
  const didInitialSync = useRef(false);
  useEffect(() => {
    if (loading) return;
    // Sin sesión no hay nada que descargar: la primera sincronización se da por
    // resuelta para no dejar la app esperando indefinidamente. Al cerrar sesión
    // se rearma, para que el siguiente inicio de sesión vuelva a descargar.
    if (!session) { setInitialSyncDone(true); didInitialSync.current = false; return; }
    if (didInitialSync.current) return;
    didInitialSync.current = true;
    // Justo después de iniciar sesión hay que volver a esperar: si no, se decidiría
    // entre app y onboarding con los datos del usuario todavía sin descargar.
    setInitialSyncDone(false);
    const t0 = Date.now();
    sync({ silent: true }).finally(() => {
      // Mínimo visible: si la descarga es muy rápida, sin esto la pantalla sería
      // un parpadeo entre el login y lo que venga después.
      const resto = Math.max(0, 600 - (Date.now() - t0));
      setTimeout(() => setInitialSyncDone(true), resto);
    });
  }, [session, loading, sync]);

  // ── Datos del programa activo, ya sin los borrados ──────────────────────────
  const pd = state?.programData?.[state?.activeProgram] || {};
  const data = {
    subjects: alive(pd.subjects),
    tasks:    alive(pd.tasks),
    sessions: alive(pd.sessions),
    schedule: alive(pd.schedule),
    program:  (state?.programs || []).find(p => p.id === state?.activeProgram) || null,
  };

  // ── Mutaciones ──────────────────────────────────────────────────────────────
  // Modifican una lista del programa activo respetando la estructura del estado.
  const mutate = useCallback((key, fn) => {
    setState(prev => {
      if (!prev) return prev;
      const pid = prev.activeProgram;
      const cur = prev.programData[pid] || {};
      return {
        ...prev,
        programData: {
          ...prev.programData,
          [pid]: { ...cur, [key]: fn(cur[key] || []) },
        },
      };
    });
  }, []);

  // ── Ajustes ─────────────────────────────────────────────────────────────────
  // Se mezclan sobre los que ya había: el blob es compartido con el PC y trae
  // claves que el móvil no conoce (duraciones del timer, examCount…). Enviar solo
  // las de aquí las borraría, porque sync.js reemplaza el JSON entero.
  const updateSettings = useCallback(partial => {
    settingsDirty.current = true;
    setState(prev => prev ? { ...prev, settings: { ...(prev.settings || {}), ...partial } } : prev);
  }, []);

  const settings = state?.settings || {};

  // Cambiar de programa activo. El acento sigue al color del programa, igual que
  // en el PC; de aplicarlo se encarga el efecto de arriba.
  const setActiveProgram = useCallback(id => {
    setState(prev => prev ? { ...prev, activeProgram: id } : prev);
  }, []);

  return {
    state, setState, loading, session, data, sync, syncing, syncMsg, mutate,
    initialSyncDone, settings, updateSettings, setActiveProgram, lastSync,
  };
}
