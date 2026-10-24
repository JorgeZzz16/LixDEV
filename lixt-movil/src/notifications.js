// ═══════════════════════════════════════════════════════════════════════════════
// Avisos locales de los recordatorios.
//
// Avisan las tareas con recordatorios configurados (`task.reminders`) y las
// notas rápidas del calendario (`type === "recordatorio"`), que avisan a su hora.
// Cuándo salta cada aviso lo calcula `reminderTimes` (logic.js), el mismo que
// usa el PC.
//
// La estrategia es "cancelar todo y reprogramar". Es idempotente y no hay que
// llevar la cuenta de qué aviso corresponde a qué tarea ni limpiar los de las
// borradas: son pocos (recordatorios pendientes con fecha futura) y el sistema
// solo tiene que aguantar esa lista.
//
// Todo es local: no hay servidor de push ni token, el propio teléfono dispara el
// aviso a la hora indicada aunque esté sin conexión.
// ═══════════════════════════════════════════════════════════════════════════════

import { Platform } from "react-native";
import { reminderTimes } from "./logic";
import { TASK_TYPES } from "./constants";

// El módulo se carga a demanda, no al arrancar. Expo Go ya no trae el módulo
// nativo de notificaciones en Android, y un `import` arriba del todo revienta la
// app entera antes de pintar nada. Así, si no está, lo único que pasa es que no
// hay avisos: la app funciona igual y los recordatorios se siguen viendo.
let Notifications = null;
async function cargarModulo() {
  if (Notifications) return Notifications;
  Notifications = await import("expo-notifications");
  return Notifications;
}

// Hora por defecto de los avisos de tareas sin hora (ninguna app obliga a ponerla;
// si es un rango "18:00-20:30", vale el inicio).
// Se puede cambiar en Ajustes; si el ajuste viene roto se usa esta.
const HORA_POR_DEFECTO = [9, 0];

function horaPorDefecto(ajustes) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(ajustes?.notifyHour || "");
  if (!m) return HORA_POR_DEFECTO;
  const h = Number(m[1]), min = Number(m[2]);
  return h <= 23 && min <= 59 ? [h, min] : HORA_POR_DEFECTO;
}

// Android aguanta ~500 avisos programados e iOS 64: se programan los más próximos
// y el resto entra en las siguientes pasadas (cada vez que cambian las tareas).
const MAX_AVISOS = 60;

function cuerpo(t) {
  const label = TASK_TYPES.find(x => x.key === t.type)?.label || "Tarea";
  const [, m, d] = String(t.dueDate || "").split("-");
  return `${label}${d ? ` · ${Number(d)}/${Number(m)}` : ""}${t.hour ? " · " + t.hour : ""}`;
}

let permiso = null; // null = sin preguntar todavía
async function hayPermiso() {
  if (permiso !== null) return permiso;
  const { status } = await Notifications.getPermissionsAsync();
  permiso = status === "granted" || (await Notifications.requestPermissionsAsync()).status === "granted";
  return permiso;
}

// Android no muestra nada si el canal no existe.
async function prepararCanal() {
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("recordatorios", {
    name: "Recordatorios",
    importance: Notifications.AndroidImportance.DEFAULT,
    vibrationPattern: [0, 250, 250, 250],
  });
}

// `ajustes` es el blob de settings compartido con el PC. Solo se miran dos claves
// (`notifyReminders` y `notifyHour`); el PC las ignora y no las pisa.
export async function syncReminders(tasks, ajustes) {
  try {
    await cargarModulo();
    // Los avisos vienen activados salvo que los apagues a propósito.
    const activos = ajustes?.notifyReminders !== false;
    const ahora = new Date(), hora = horaPorDefecto(ajustes);
    const pendientes = !activos ? [] : (tasks || [])
      .flatMap(t => reminderTimes(t, hora).filter(fecha => fecha > ahora).map(fecha => ({ t, fecha })))
      .sort((a, b) => a.fecha - b.fecha)
      .slice(0, MAX_AVISOS);

    // Se cancela SIEMPRE antes de nada: así, al apagar los avisos en Ajustes, los
    // que ya estaban programados se van en la misma pasada en vez de seguir
    // saltando hasta que caduquen.
    // Sin nada que avisar no se pide permiso: molestar con el diálogo del sistema
    // a quien no usa recordatorios sería gratuito.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    if (!pendientes.length) return;
    if (!(await hayPermiso())) return;
    await prepararCanal();

    for (const { t, fecha } of pendientes) {
      await Notifications.scheduleNotificationAsync({
        content: { title: "🔔 " + (t.title || "Recordatorio"), body: cuerpo(t), channelId: "recordatorios" },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fecha },
      });
    }
  } catch {
    // Un fallo aquí (permiso denegado, sistema sin notificaciones) no puede tirar
    // la app: los recordatorios siguen viéndose en el calendario igual.
  }
}
