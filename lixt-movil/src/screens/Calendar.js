import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { getDaysInMonth, getFirstDay, pad, today, touch, softDelete, newId, bySubjectOrder, shiftMonth } from "../logic";
import { D } from "../theme";
import TaskModal from "./TaskModal";

const MONTHS = ["enero","febrero","marzo","abril","mayo","junio","julio","agosto","septiembre","octubre","noviembre","diciembre"];
const WDAYS  = ["L","M","X","J","V","S","D"];

// Una rejilla de mes. El indicador de tareas son puntos de 7px (antes 4, que en
// un teléfono no se veían) y, si hay más de tres, un "+N" en vez de perderlas.
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
          return (
            <TouchableOpacity key={day} onPress={() => onSelect(isSelected ? null : ds)}
              style={{ width: "14.28%", aspectRatio: 1, padding: 2 }}>
              <View style={{
                flex: 1, borderRadius: 8, alignItems: "center", justifyContent: "center",
                backgroundColor: isSelected ? D.accent + "33" : isToday ? D.accent + "18" : "transparent",
                borderWidth: isToday ? 1.5 : 0, borderColor: D.accent,
              }}>
                <Text style={{ color: isToday ? D.accent : D.text, fontSize: 14, fontWeight: isToday || pendientes ? "700" : "400" }}>{day}</Text>
                {dt.length > 0 && (
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 3, marginTop: 3 }}>
                    {dt.slice(0, 3).map(t => {
                      const s = subjects.find(x => x.id === t.subjectId);
                      return <View key={t.id} style={{ width: 7, height: 7, borderRadius: 3.5, backgroundColor: s?.color || D.muted, opacity: t.status === "completada" ? 0.35 : 1 }} />;
                    })}
                    {dt.length > 3 && <Text style={{ color: D.muted, fontSize: 9, fontWeight: "700" }}>+{dt.length - 3}</Text>}
                  </View>
                )}
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
    setEditingTask(null);
  }
  // Recordatorio suelto: sin asignatura, así que no hace falta tener ninguna
  function newReminderForDay() {
    setTaskSubjId(null);
    setTaskType("recordatorio");
    setEditingTask(null);
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
          todayStr={todayStr} selectedDay={selectedDay} onSelect={setSelectedDay} />

        <Text style={{ color: D.muted, fontSize: 13, fontWeight: "600", textAlign: "center", textTransform: "capitalize", marginTop: 18, marginBottom: 6 }}>
          {MONTHS[mes2]} {anio2}
        </Text>
        <Mes year={anio2} month={mes2} subjects={data.subjects} dayTasks={dayTasks}
          todayStr={todayStr} selectedDay={selectedDay} onSelect={setSelectedDay} />

        {/* Detalle del día seleccionado */}
        {selectedDay && (
          <View style={{ marginTop: 18 }}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 8 }}>
              <Text style={{ color: D.muted, fontSize: 13, flex: 1 }}>{selectedDay}</Text>
              <TouchableOpacity onPress={newReminderForDay}
                style={{ backgroundColor: D.card2, borderWidth: 1, borderColor: D.border, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, marginRight: 6 }}>
                <Text style={{ color: D.text, fontSize: 12, fontWeight: "600" }}>+ Recordatorio</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={newTaskForDay} disabled={!activas.length}
                style={{ backgroundColor: activas.length ? D.accent : D.card2, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8 }}>
                <Text style={{ color: activas.length ? "#fff" : D.muted, fontSize: 12, fontWeight: "600" }}>+ Tarea</Text>
              </TouchableOpacity>
            </View>
            {selectedTasks.length === 0 && <Text style={{ color: D.muted, fontSize: 12 }}>Sin actividades este día.</Text>}
            {selectedTasks.map(t => {
              const s = data.subjects.find(x => x.id === t.subjectId);
              return (
                <TouchableOpacity key={t.id} onPress={() => setEditingTask(t)}
                  style={{ backgroundColor: D.card2, borderLeftWidth: 3, borderLeftColor: s?.color || D.muted, borderRadius: 8, padding: 11, marginBottom: 6 }}>
                  <Text style={{ color: t.status === "completada" ? D.muted : D.text, fontSize: 13, fontWeight: "500", textDecorationLine: t.status === "completada" ? "line-through" : "none" }}>{t.title}</Text>
                  <Text style={{ color: D.muted, fontSize: 11, marginTop: 2 }}>{s?.name || "Sin asignatura"}{t.hour ? " · " + t.hour : ""}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
      </ScrollView>

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
