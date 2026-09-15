import React, { useState, useEffect } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { newId, touch, softDelete, daysUntil, gradeColor, fmtGradeFull, academicCourseOf, academicCourseLabel, byDueDate, bySubjectOrder, subjectGroupKey } from "../logic";
import { TASK_TYPES, PRIORITY_COLOR } from "../constants";
import { D } from "../theme";
import TaskModal from "./TaskModal";

export default function Tasks({ data, sync, syncing, mutate }) {
  const [filterSubj, setFilterSubj]     = useState("all");
  const [filterStatus, setFilterStatus] = useState("all");
  const [filterCourse, setFilterCourse] = useState(null); // año de inicio del curso, o null = todos
  const [editingTask, setEditingTask]   = useState(undefined); // undefined=cerrado, null=nueva
  const [taskSubjId, setTaskSubjId]     = useState(null);

  // Recuerda el curso seleccionado entre sesiones
  useEffect(() => {
    AsyncStorage.getItem("lixt_tasks_course").then(v => { if (v !== null) setFilterCourse(v === "all" ? null : Number(v)); });
  }, []);
  function selectCourse(y) {
    setFilterCourse(y);
    AsyncStorage.setItem("lixt_tasks_course", y === null ? "all" : String(y));
  }

  const activas = data.subjects.filter(s => !s.archived && !s.approved).sort(bySubjectOrder);

  // Cursos académicos presentes en las tareas, según su FECHA (no la de creación):
  // una tarea con dueDate 2027-01 pertenece al curso 26/27 aunque la añadas hoy.
  const courses = [...new Set(data.tasks.filter(t => t.dueDate).map(t => academicCourseOf(t.dueDate)))].sort((a, b) => b - a);

  const filtered = data.tasks
    .filter(t => filterSubj === "all" || String(t.subjectId) === filterSubj)
    .filter(t => filterStatus === "all" || t.status === filterStatus)
    // Sin fecha no pertenece a ningún curso: se ve siempre, si no desaparecería
    // al filtrar y no habría forma de encontrarla
    .filter(t => filterCourse === null || !t.dueDate || academicCourseOf(t.dueDate) === filterCourse)
    .sort((a, b) => {
      // Completadas al final; dentro de cada grupo, cronológico (más próxima primero)
      const ac = a.status === "completada", bc = b.status === "completada";
      if (ac !== bc) return ac ? 1 : -1;
      return byDueDate(a, b);
    });

  function toggleStatus(t) {
    mutate("tasks", prev => prev.map(x => x.id === t.id ? touch({ ...x, status: x.status === "completada" ? "pendiente" : "completada" }) : x));
  }
  function saveTask(fields) {
    if (editingTask) {
      // `subjectId` va aparte porque el selector lo lleva el padre, no el formulario
      // del modal: sin esto, cambiar de asignatura al editar no guardaba nada.
      mutate("tasks", prev => prev.map(t => t.id === editingTask.id ? touch({ ...t, ...fields, subjectId: taskSubjId ?? null }) : t));
    } else {
      mutate("tasks", prev => [...prev, touch({ id: newId(), subjectId: taskSubjId, ...fields })]);
    }
    setEditingTask(undefined);
  }
  function deleteTask(id) {
    mutate("tasks", prev => prev.map(t => t.id === id ? softDelete(t) : t));
    setEditingTask(undefined);
  }

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 90 }} refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ color: D.text, fontSize: 22, fontWeight: "700", flex: 1 }}>Tareas</Text>
          <TouchableOpacity onPress={() => { setTaskSubjId(activas[0]?.id || null); setEditingTask(null); }} disabled={!activas.length}
            style={{ backgroundColor: activas.length ? D.accent : D.card2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}>
            <Text style={{ color: activas.length ? "#fff" : D.muted, fontSize: 13, fontWeight: "600" }}>+ Nueva</Text>
          </TouchableOpacity>
        </View>

        {courses.length > 1 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
            <View style={{ flexDirection: "row", gap: 6 }}>
              <Chip active={filterCourse === null} onPress={() => selectCourse(null)} label="Todos los cursos" />
              {courses.map(y => <Chip key={y} active={filterCourse === y} onPress={() => selectCourse(y)} label={academicCourseLabel(y)} />)}
            </View>
          </ScrollView>
        )}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <Chip active={filterSubj === "all"} onPress={() => setFilterSubj("all")} label="Todas" />
            {activas.map((s, i) => (
              <React.Fragment key={s.id}>
                {/* Separador al cambiar de cuatrimestre */}
                {i > 0 && subjectGroupKey(activas[i - 1]) !== subjectGroupKey(s) &&
                  <View style={{ width: 3, borderRadius: 2, backgroundColor: D.muted + "33", marginHorizontal: 3 }} />}
                <Chip active={filterSubj === String(s.id)} onPress={() => setFilterSubj(String(s.id))} label={s.acronym || s.name} dot={s.color} />
              </React.Fragment>
            ))}
          </View>
        </ScrollView>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[["all", "Todos"], ["pendiente", "Pendiente"], ["en progreso", "En progreso"], ["completada", "Completada"]].map(([v, l]) => (
              <Chip key={v} active={filterStatus === v} onPress={() => setFilterStatus(v)} label={l} />
            ))}
          </View>
        </ScrollView>

        {filtered.length === 0 && <Text style={{ color: D.muted, fontSize: 13, textAlign: "center", marginTop: 30 }}>Sin actividades.</Text>}

        {filtered.map(t => {
          const subj = data.subjects.find(s => s.id === t.subjectId);
          const d = t.dueDate ? daysUntil(t.dueDate) : null;
          const done = t.status === "completada";
          const tt = TASK_TYPES.find(x => x.key === t.type);
          return (
            <View key={t.id} style={{
              flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: D.card,
              borderRadius: 10, borderWidth: 1, borderColor: D.border, borderLeftWidth: 4, borderLeftColor: subj?.color || D.muted,
              padding: 12, marginBottom: 7, opacity: done ? 0.55 : 1,
            }}>
              <TouchableOpacity onPress={() => toggleStatus(t)} style={{ width: 20, height: 20, borderRadius: 5, borderWidth: 2, borderColor: done ? D.accent : D.border, backgroundColor: done ? D.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
                {done && <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>✓</Text>}
              </TouchableOpacity>

              <TouchableOpacity style={{ flex: 1, minWidth: 0 }} onPress={() => { setTaskSubjId(t.subjectId); setEditingTask(t); }}>
                <Text style={{ color: D.text, fontSize: 13, fontWeight: "500", textDecorationLine: done ? "line-through" : "none" }} numberOfLines={1}>{t.title}</Text>
                <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4, flexWrap: "wrap" }}>
                  <Badge label={tt?.label || t.type} color={D.muted} />
                  <Badge label={t.priority} color={PRIORITY_COLOR[t.priority] || D.muted} />
                  {t.grade !== null && t.grade !== undefined && <Badge label={fmtGradeFull(t.grade)} color={gradeColor(t.grade)} />}
                </View>
                <Text style={{ color: D.muted, fontSize: 11, marginTop: 3 }} numberOfLines={1}>
                  {subj?.name || "Sin asignatura"}{t.dueDate ? " · " + t.dueDate : ""}
                  {d !== null ? "  ·  " + (d < 0 ? "Vencida" : d === 0 ? "Hoy" : d + "d") : ""}
                </Text>
              </TouchableOpacity>
            </View>
          );
        })}
      </ScrollView>

      <TaskModal
        visible={editingTask !== undefined}
        task={editingTask}
        subjects={activas}
        subjectId={taskSubjId}
        onSubjectChange={setTaskSubjId}
        onClose={() => setEditingTask(undefined)}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </View>
  );
}

function Chip({ active, onPress, label, dot }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ flexDirection: "row", alignItems: "center", gap: 5, paddingVertical: 6, paddingHorizontal: 11, borderRadius: 7, backgroundColor: active ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: active ? D.accent : D.border }}>
      {dot && <View style={{ width: 7, height: 7, borderRadius: 4, backgroundColor: dot }} />}
      <Text style={{ color: active ? D.accent : D.muted, fontSize: 12, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function Badge({ label, color }) {
  return (
    <View style={{ backgroundColor: D.card2, borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ color, fontSize: 10 }}>{label}</Text>
    </View>
  );
}
