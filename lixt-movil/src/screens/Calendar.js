import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Modal, Pressable } from "react-native";
import { getDaysInMonth, getFirstDay, pad, today, touch, softDelete, newId, bySubjectOrder, shiftMonth, parseDate } from "../logic";
import { D, VELO } from "../theme";
import TaskModal from "./TaskModal";

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const WDAYS  = ["L","M","X","J","V","S","D"];
const WDAYS_LARGO = ["lunes","martes","miércoles","jueves","viernes","sábado","domingo"];

// "2026-09-16" → "miércoles, 16 de septiembre". Con parseDate, que no se desplaza
// de día por la zona horaria (new Date("2026-09-16") sí lo haría).
function fechaLarga(ds) {
  const d = parseDate(ds);
  if (isNaN(d)) return "";
  return `${WDAYS_LARGO[(d.getDay() + 6) % 7]}, ${d.getDate()} de ${MONTHS[d.getMonth()]}`;
}

// Una rejilla de mes. Los días con tareas se marcan con un recuadro del color de
// la asignatura, que se ve de un vistazo mucho mejor que los puntos que había
// antes. Un día solo tiene un recuadro, así que si hay varias tareas manda la
// primera pendiente (y si están todas hechas, se atenúa).
function Mes({ year, month, subjects, dayTasks, todayStr, selectedDay, onSelect }) {
  const firstOffset = (getFirstDay(year, month) + 6) % 7;
  const daysIn = getDaysInMonth(year, month);
  return (
    <>
      <View style={{ flexDirection: "row", marginBottom: 4 }}>
        {WDAYS.map(d => <Text key={d} style={{ flex: 1, textAlign: "center", color: D.muted, fontSize: 11, fontWeight: "600" }}>{d}</Text>)}
      </View>
      <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
        {Array(firstOffset).fill(null).map((_, i) => <View key={"e" + i} style={{ width: "14.28%", aspectRatio: 1 }} />)}
        {Array(daysIn).fill(null).map((_, i) => {
          const day = i + 1;
          const ds = `${year}-${pad(month + 1)}-${pad(day)}`;
          const dt = dayTasks(ds);
          const pendientes = dt.filter(t => t.status !== "completada").length;
          const isToday = ds === todayStr;
          const isSelected = ds === selectedDay;
          // El recuadro: color de la asignatura de la primera tarea pendiente (o de
          // la primera que haya, atenuado, si ya están todas hechas). Si no hay
          // ninguna tarea manda "hoy", con el acento. Sin tareas ni hoy, sin borde.
          const marca = dt.find(t => t.status !== "completada") || dt[0];
          const colorMarca = marca && (subjects.find(x => x.id === marca.subjectId)?.color || D.muted);
          const borde = colorMarca ? (pendientes ? colorMarca : colorMarca + "59") : (isToday ? D.accent : null);
          return (
            <TouchableOpacity key={day} onPress={() => onSelect(isSelected ? null : ds)}
              style={{ width: "14.28%", aspectRatio: 1, padding: 2 }}>
              <View style={{
                flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center",
                backgroundColor: isSelected ? D.accent + "33" : isToday ? D.accent + "18" : "transparent",
                borderWidth: borde ? 1.5 : 0, borderColor: borde || D.accent,
              }}>
                <Text style={{ color: isToday ? D.accent : D.text, fontSize: 14, fontWeight: isToday || pendientes ? "700" : "400" }}>{day}</Text>
              </View>
            </TouchableOpacity>
          );
        })}
      </View>
    </>
  );
}

export default function CalendarScreen({ data, sync, syncing, mutate }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear]   = useState(now.getFullYear());
  const [selectedDay, setSelectedDay] = useState(null); // fecha "YYYY-MM-DD" seleccionada
  // El popup del día. Va aparte de `selectedDay` porque al abrir el modal de una
  // tarea hay que cerrar el popup pero SEGUIR sabiendo de qué día era: TaskModal
  // lo necesita como `initialDate`.
  const [diaAbierto, setDiaAbierto] = useState(false);
  const [editingTask, setEditingTask] = useState(undefined); // undefined=cerrado, null=nueva, obj=editar
  const [taskSubjId, setTaskSubjId]   = useState(null);
  const [taskType, setTaskType]       = useState("tarea");

  const activas = data.subjects.filter(s => !s.archived && !s.approved).sort(bySubjectOrder);

  function move(delta) {
    const d = new Date(year, month + delta, 1);
    setMonth(d.getMonth()); setYear(d.getFullYear());
  }

  const todayStr = today();
  // Dos meses a la vista, como en el PC: casi todo lo que buscas cae a caballo
  // entre el mes actual y el siguiente (entregas, exámenes de la semana que viene)
  const [mes2, anio2] = shiftMonth(month, year, 1);

  const dayTasks = ds => data.tasks.filter(t => t.dueDate === ds);
  const selectedTasks = selectedDay ? dayTasks(selectedDay) : [];

  function saveTask(fields) {
    if (editingTask) {
      mutate("tasks", prev => prev.map(t => t.id === editingTask.id ? touch({ ...t, ...fields }) : t));
    } else {
      mutate("tasks", prev => [...prev, touch({ id: newId(), subjectId: taskSubjId, ...fields })]);
    }
    setEditingTask(undefined);
  }
  function deleteTask(id) {
    mutate("tasks", prev => prev.map(t => t.id === id ? softDelete(t) : t));
    setEditingTask(undefined);
  }
  function newTaskForDay() {
    setTaskSubjId(activas[0]?.id ?? null);
    setTaskType("tarea");
    setDiaAbierto(false);
    setEditingTask(null);
  }
  // Recordatorio suelto: sin asignatura, así que no hace falta tener ninguna
  function newReminderForDay() {
    setTaskSubjId(null);
    setTaskType("recordatorio");
    setDiaAbierto(false);
    setEditingTask(null);
  }
  // Tocar el mismo día otra vez lo deselecciona, así que `ds` puede venir null.
  function abrirDia(ds) {
    setSelectedDay(ds);
    setDiaAbierto(!!ds);
  }

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 16 }}>
          <TouchableOpacity onPress={() => move(-1)} style={{ padding: 8 }}><Text style={{ color: D.text, fontSize: 20 }}>‹</Text></TouchableOpacity>
          <Text style={{ color: D.text, fontSize: 16, fontWeight: "700", flex: 1, textAlign: "center", textTransform: "capitalize" }}>{MONTHS[month]} {year}</Text>
          <TouchableOpacity onPress={() => move(1)} style={{ padding: 8 }}><Text style={{ color: D.text, fontSize: 20 }}>›</Text></TouchableOpacity>
        </View>

        <Mes year={year}  month={month} subjects={data.subjects} dayTasks={dayTasks}
          todayStr={todayStr} selectedDay={selectedDay} onSelect={abrirDia} />

        <Text style={{ color: D.muted, fontSize: 13, fontWeight: "600", textAlign: "center", textTransform: "capitalize", marginTop: 18, marginBottom: 6 }}>
          {MONTHS[mes2]} {anio2}
        </Text>
        <Mes year={anio2} month={mes2} subjects={data.subjects} dayTasks={dayTasks}
          todayStr={todayStr} selectedDay={selectedDay} onSelect={abrirDia} />

      </ScrollView>

      {/* Detalle del día, en popup. Antes era una sección al final del scroll y
          había que bajar a buscarla después de tocar un día de arriba. */}
      <Modal visible={diaAbierto} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setDiaAbierto(false)}>
        <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "center", padding: 22 }} onPress={() => setDiaAbierto(false)}>
          <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderRadius: 16, padding: 18, maxHeight: "80%" }}>
            <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", textTransform: "capitalize" }}>{fechaLarga(selectedDay)}</Text>
            <Text style={{ color: D.muted, fontSize: 12, marginTop: 2, marginBottom: 14 }}>
              {selectedTasks.length === 0
                ? "Sin actividades"
                : selectedTasks.length + (selectedTasks.length === 1 ? " actividad" : " actividades")}
            </Text>

            <ScrollView style={{ flexGrow: 0 }}>
              {selectedTasks.map(t => {
                const s = data.subjects.find(x => x.id === t.subjectId);
                return (
                  <TouchableOpacity key={t.id} onPress={() => { setDiaAbierto(false); setEditingTask(t); }}
                    style={{ backgroundColor: D.card2, borderLeftWidth: 3, borderLeftColor: s?.color || D.muted, borderRadius: 8, padding: 11, marginBottom: 6 }}>
                    <Text style={{ color: t.status === "completada" ? D.muted : D.text, fontSize: 13, fontWeight: "500", textDecorationLine: t.status === "completada" ? "line-through" : "none" }}>{t.title}</Text>
                    <Text style={{ color: D.muted, fontSize: 11, marginTop: 2 }}>{s?.name || "Sin asignatura"}{t.hour ? " · " + t.hour : ""}</Text>
                  </TouchableOpacity>
                );
              })}
            </ScrollView>

            <View style={{ flexDirection: "row", gap: 8, marginTop: 14 }}>
              <TouchableOpacity onPress={newReminderForDay}
                style={{ flex: 1, backgroundColor: D.card2, borderWidth: 1, borderColor: D.border, paddingVertical: 11, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: D.text, fontSize: 13, fontWeight: "600" }}>+ Recordatorio</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={newTaskForDay} disabled={!activas.length}
                style={{ flex: 1, backgroundColor: activas.length ? D.accent : D.card2, paddingVertical: 11, borderRadius: 8, alignItems: "center" }}>
                <Text style={{ color: activas.length ? "#fff" : D.muted, fontSize: 13, fontWeight: "600" }}>+ Tarea</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </Pressable>
      </Modal>

      <TaskModal
        visible={editingTask !== undefined}
        task={editingTask}
        subjects={editingTask === null ? activas : undefined}
        subjectId={taskSubjId}
        initialDate={selectedDay}
        initialType={taskType}
        onSubjectChange={setTaskSubjId}
        onClose={() => setEditingTask(undefined)}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </View>
  );
}
