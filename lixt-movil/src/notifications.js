// ═══════════════════════════════════════════════════════════════════════════════
// Avisos locales de los recordatorios.
//
// Solo los recordatorios (`type === "recordatorio"`): son lo único que se apunta
// para que el teléfono te lo recuerde; las entregas y exámenes ya se ven en el
// calendario y en la lista.
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
import * as Notifications from "expo-notifications";
import { parseDate } from "./logic";

// Hora por defecto cuando el recordatorio no la lleva (el móvil no pide hora al
// crearlo; el PC sí, y puede ser un rango "18:00-20:30", del que vale el inicio).
const HORA_POR_DEFECTO = [9, 0];

function cuando(task) {
  const d = parseDate(task.dueDate);
  if (isNaN(d)) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(task.hour || "");
  d.setHours(m ? Number(m[1]) : HORA_POR_DEFECTO[0], m ? Number(m[2]) : HORA_POR_DEFECTO[1], 0, 0);
  return d;
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

export async function syncReminders(tasks) {
  try {
    const pendientes = (tasks || [])
      .filter(t => t.type === "recordatorio" && t.status !== "completada" && !t.deleted_at && t.dueDate)
      .map(t => ({ t, fecha: cuando(t) }))
      .filter(({ fecha }) => fecha && fecha > new Date());

    // Sin nada que avisar no se pide permiso: molestar con el diálogo del sistema
    // a quien no usa recordatorios sería gratuito.
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
    if (!pendientes.length) return;
    if (!(await hayPermiso())) return;
    await prepararCanal();

    for (const { t, fecha } of pendientes) {
      await Notifications.scheduleNotificationAsync({
        content: { title: t.title || "Recordatorio", body: "Hoy", channelId: "recordatorios" },
        trigger: { type: Notifications.SchedulableTriggerInputTypes.DATE, date: fecha },
      });
    }
  } catch {
    // Un fallo aquí (permiso denegado, sistema sin notificaciones) no puede tirar
    // la app: los recordatorios siguen viéndose en el calendario igual.
  }
}
