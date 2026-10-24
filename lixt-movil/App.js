// ═══════════════════════════════════════════════════════════════════════════════
// LixT móvil
//
// Navegación por pestañas con estado, igual que en el escritorio, para no meter
// react-navigation antes de necesitarlo.
// ═══════════════════════════════════════════════════════════════════════════════

import React, { useState, useEffect, useMemo } from "react";
import { View, Text, TouchableOpacity, ActivityIndicator, SafeAreaView, StatusBar, Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { useStore } from "./src/store";
import { studyStreak, migrateTaskType } from "./src/logic";
import { syncReminders } from "./src/notifications";
import { D, esClaro } from "./src/theme";
import Splash from "./src/screens/Splash";
import Onboarding from "./src/screens/Onboarding";

import Auth     from "./src/screens/Auth";
import Subjects from "./src/screens/Subjects";
import Tasks    from "./src/screens/Tasks";
import CalendarScreen from "./src/screens/Calendar";
import Grades   from "./src/screens/Grades";
import Stats    from "./src/screens/Stats";
import Schedule from "./src/screens/Schedule";
import Settings from "./src/screens/Settings";

// Racha de estudio en la cabecera. El PC la enseña como tarjeta entera; aquí no
// hay sitio, así que es la llama + el número, y apagada en gris cuando no hay
// racha. Si hoy todavía no cuenta se deja a media tinta: avisa de que está en
// juego sin gritar.
function Racha({ sessions }) {
  const { dias, hoy } = useMemo(() => studyStreak(sessions), [sessions]);
  if (!dias) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginRight: 14, opacity: hoy ? 1 : 0.5 }}>
      <Text style={{ fontSize: 14 }}>🔥</Text>
      <Text style={{ color: hoy ? D.amber : D.muted, fontSize: 13, fontWeight: "700", marginLeft: 3 }}>{dias}</Text>
    </View>
  );
}

// Orden pedido: Tareas, Calendario, Horario, Asignaturas, Notas, Stats
const TABS = [
  { k: "tasks",    icon: "📝", label: "Tareas"      },
  { k: "calendar", icon: "📅", label: "Calendario"  },
  { k: "horario",  icon: "🕒", label: "Horario"     },
  { k: "subjects", icon: "📚", label: "Asignaturas" },
  { k: "grades",   icon: "🎓", label: "Notas"       },
  { k: "stats",    icon: "📊", label: "Stats"       },
];

export default function App() {
  const store = useStore();
  // Sobre fondo claro los iconos de la barra de estado tienen que ir en negro.
  const barra = esClaro(store.settings?.bgTheme) ? "dark-content" : "light-content";
  const [tab, setTab] = useState("tasks");
  const [showSettings, setShowSettings] = useState(false);

  // Rango de la rejilla del horario y vista (semana/día): lo edita Ajustes y lo
  // pinta Horario, así que vive aquí. Preferencia local del teléfono, no se
  // sincroniza con el PC.
  const [grid, setGridState] = useState({ auto: true, start: "08:30", end: "14:30", vista: "semana" });
  useEffect(() => {
    AsyncStorage.getItem("lixt_grid").then(v => { if (v) setGridState(g => ({ ...g, ...JSON.parse(v) })); });
  }, []);
  const setGrid = campos => setGridState(g => {
    const nuevo = { ...g, ...campos };
    AsyncStorage.setItem("lixt_grid", JSON.stringify(nuevo));
    return nuevo;
  });

  // Los datos suelen cargarse en milisegundos, así que sin un tiempo mínimo la
  // pantalla de carga aparecería y desaparecería sin llegar a verse. Mismo valor
  // que en el ordenador.
  const [splashDone, setSplashDone] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSplashDone(true), 1200);
    return () => clearTimeout(t);
  }, []);

  // Reprograma los avisos cada vez que cambian las tareas (creadas aquí o bajadas
  // del PC al sincronizar). Es un "cancelar todo y volver a programar", así que
  // repetirlo de más no duplica nada.
  // También al cambiar los ajustes: apagar los avisos tiene que cancelar de
  // verdad los que ya estaban puestos, no solo dejar de crear nuevos.
  useEffect(() => { syncReminders(store.data?.tasks, store.settings); }, [store.data?.tasks, store.settings]);

  // "Trabajo" ya no es un tipo: lo que llegue así (datos viejos, el PC sin
  // actualizar) pasa a entrega.
  useEffect(() => {
    if (store.data?.tasks?.some(t => t.type === "trabajo")) store.mutate("tasks", prev => prev.map(migrateTaskType));
  }, [store.data?.tasks]);

  // La pantalla de carga se mantiene hasta que: los datos locales estén, haya
  // pasado el tiempo mínimo, y la primera sincronización haya terminado. Ese
  // último punto evita mostrar el onboarding a alguien que sí tiene datos en la
  // nube pero todavía se están descargando.
  if (store.loading || !splashDone || (store.session && !store.initialSyncDone)) {
    // Tras iniciar sesión el arranque ya pasó, así que se indica qué se está
    // haciendo en vez de dejar la pantalla muda.
    const label = splashDone && store.session ? "Cargando tus datos…" : null;
    return <><StatusBar barStyle={barra} backgroundColor={D.bg} /><Splash label={label} /></>;
  }

  if (!store.session) return <><StatusBar barStyle={barra} /><Auth /></>;

  // Con sesión pero sin ningún programa de estudio: usuario nuevo que empieza por
  // el móvil. Sin esto no habría dónde guardar las asignaturas.
  if (!store.state?.programs?.length) {
    return (
      <>
        <StatusBar barStyle={barra} backgroundColor={D.bg} />
        <Onboarding onCreate={st => store.setState(st)} />
      </>
    );
  }

  const props = { data: store.data, sync: store.sync, syncing: store.syncing, mutate: store.mutate, program: store.data.program };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: D.bg, paddingTop: Platform.OS === "android" ? 28 : 0 }}>
      <StatusBar barStyle={barra} backgroundColor={D.bg} />

      {/* Cabecera */}
      <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: D.border }}>
        <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", flex: 1 }}>
          LixT <Text style={{ color: D.muted, fontSize: 11, fontWeight: "400" }}>v1.4.5</Text>
        </Text>
        {store.syncing && <ActivityIndicator color={D.muted} size="small" style={{ marginRight: 14 }} />}
        <Racha sessions={store.data.sessions} />
        <TouchableOpacity onPress={() => setShowSettings(true)}>
          <Text style={{ color: D.muted, fontSize: 19 }}>⚙</Text>
        </TouchableOpacity>
      </View>

      {!!store.syncMsg && (
        <Text style={{ color: D.muted, fontSize: 11, textAlign: "center", paddingVertical: 4, backgroundColor: D.card2 }}>
          {store.syncMsg}
        </Text>
      )}

      {/* Contenido */}
      <View style={{ flex: 1 }}>
        {tab === "tasks"    && <Tasks    {...props} />}
        {tab === "calendar" && <CalendarScreen {...props} />}
        {tab === "horario"  && <Schedule {...props} grid={grid} />}
        {tab === "subjects" && <Subjects {...props} />}
        {tab === "grades"   && <Grades   {...props} />}
        {tab === "stats"    && <Stats    {...props} />}
      </View>

      {/* Pestañas abajo. Más alta que antes para que el gesto/barra del sistema
          en Android no la tape ni recorte el texto. */}
      <View style={{ flexDirection: "row", borderTopWidth: 1, borderTopColor: D.border, backgroundColor: D.sidebar, paddingBottom: Platform.OS === "ios" ? 26 : 18, paddingTop: 10 }}>
        {TABS.map(t => (
          <TouchableOpacity key={t.k} onPress={() => setTab(t.k)} style={{ flex: 1, alignItems: "center", paddingVertical: 4 }}>
            <Text style={{ fontSize: 17, opacity: tab === t.k ? 1 : 0.45 }}>{t.icon}</Text>
            <Text style={{ color: tab === t.k ? D.accent : D.muted, fontSize: 9.5, marginTop: 3, fontWeight: tab === t.k ? "600" : "400" }} numberOfLines={1}>
              {t.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <Settings
        visible={showSettings}
        session={store.session}
        onClose={() => setShowSettings(false)}
        settings={store.settings}
        updateSettings={store.updateSettings}
        grid={grid}
        setGrid={setGrid}
        programs={store.state?.programs || []}
        activeProgram={store.state?.activeProgram}
        onSelectProgram={store.setActiveProgram}
        data={store.data}
        mutate={store.mutate}
        sync={store.sync}
        syncing={store.syncing}
        lastSync={store.lastSync}
      />
    </SafeAreaView>
  );
}
