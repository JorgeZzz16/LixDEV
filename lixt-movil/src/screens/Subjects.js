import React, { useState } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, Alert } from "react-native";
import { newId, touch, softDelete, daysUntil, calcFinalGrade, gradeColor, subjectMedal, fmtTime, fmtGrade, byDueDate, bySubjectOrder, subjectGroupKey } from "../logic";
import { STATUS_COLOR } from "../constants";
import { D } from "../theme";
import SubjectModal from "./SubjectModal";
import TaskModal from "./TaskModal";

export default function Subjects({ data, sync, syncing, mutate, program }) {
  const [filterYear, setFilterYear]     = useState(null);
  const [filterStatus, setFilterStatus] = useState("all"); // active | approved | archived | all
  const [expanded, setExpanded]         = useState(() => new Set()); // tarjetas minimizadas por defecto
  const [showApproved, setShowApproved] = useState(false);  // plegada por defecto, como en el PC
  const [showArchived, setShowArchived] = useState(false);  // archivadas plegadas por defecto
  const [editingSubj, setEditingSubj]   = useState(undefined); // undefined=cerrado, null=nueva, obj=editar
  const [editingTask, setEditingTask]   = useState(undefined);
  const [taskSubject, setTaskSubject]   = useState(null);      // asignatura a la que pertenece editingTask

  // Mismo orden que en el PC y que en el resto del móvil: cuatrimestre y alfabético
  const visible = data.subjects.filter(s => {
    if (filterYear !== null && s.year !== filterYear) return false;
    if (filterStatus === "active"   && (s.archived || s.approved)) return false;
    if (filterStatus === "approved" && !s.approved) return false;
    if (filterStatus === "archived" && !s.archived) return false;
    return true;
  }).sort(bySubjectOrder);
  const activeList   = visible.filter(s => !s.archived && !s.approved);
  const approvedList = visible.filter(s => s.approved && !s.archived);
  const archivedList = visible.filter(s => s.archived);

  function toggleExpand(id) {
    setExpanded(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
  }

  // ── Mutaciones de asignatura ────────────────────────────────────────────────
  function saveSubject(fields) {
    if (editingSubj) {
      mutate("subjects", prev => prev.map(s => s.id === editingSubj.id ? touch({ ...s, ...fields }) : s));
    } else {
      mutate("subjects", prev => [...prev, touch({ id: newId(), ...fields, archived: false, approved: false })]);
    }
    setEditingSubj(undefined);
  }
  function toggleApprove(s) { mutate("subjects", prev => prev.map(x => x.id === s.id ? touch({ ...x, approved: !x.approved, archived: false }) : x)); }
  function toggleArchive(s) { mutate("subjects", prev => prev.map(x => x.id === s.id ? touch({ ...x, archived: !x.archived, approved: false }) : x)); }
  // Borrado en cascada, igual que en el PC: sin esto las tareas, sesiones y clases
  // se quedaban colgando de un id muerto — sin nombre en la lista, como "?" en el
  // horario, y sumando tiempo en las estadísticas.
  function deleteSubject(s) {
    const nTasks = data.tasks.filter(t => t.subjectId === s.id).length;
    const nSes   = data.sessions.filter(x => x.subjectId === s.id).length;
    const nClas  = data.schedule.filter(x => x.subjectId === s.id).length;
    const arrastra = [nTasks && `${nTasks} actividad${nTasks !== 1 ? "es" : ""}`,
                      nSes   && `${nSes} sesion${nSes !== 1 ? "es" : ""}`,
                      nClas  && `${nClas} clase${nClas !== 1 ? "s" : ""} del horario`].filter(Boolean);
    const aviso = arrastra.length ? `

Se borrarán también ${arrastra.join(", ")}.` : "";
    Alert.alert("Eliminar asignatura", `¿Seguro que quieres eliminar "${s.name}"?` + aviso, [
      { text: "Cancelar", style: "cancel" },
      { text: "Eliminar", style: "destructive", onPress: () => {
        const borrarDe = x => x.subjectId === s.id ? softDelete(x) : x;
        mutate("subjects", prev => prev.map(x => x.id === s.id ? softDelete(x) : x));
        mutate("tasks",    prev => prev.map(borrarDe));
        mutate("sessions", prev => prev.map(borrarDe));
        mutate("schedule", prev => prev.map(borrarDe));
      } },
    ]);
  }

  // ── Mutaciones de tarea ──────────────────────────────────────────────────────
  function saveTask(fields) {
    if (editingTask) {
      mutate("tasks", prev => prev.map(t => t.id === editingTask.id ? touch({ ...t, ...fields }) : t));
    } else {
      mutate("tasks", prev => [...prev, touch({ id: newId(), subjectId: taskSubject.id, ...fields })]);
    }
    setEditingTask(undefined);
  }
  function deleteTask(id) {
    mutate("tasks", prev => prev.map(t => t.id === id ? softDelete(t) : t));
    setEditingTask(undefined);
  }

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }}>
      <ScrollView
        contentContainerStyle={{ padding: 16, paddingBottom: 90 }}
        refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}
      >
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ color: D.text, fontSize: 22, fontWeight: "700", flex: 1 }}>Asignaturas</Text>
          <TouchableOpacity onPress={() => setEditingSubj(null)} style={{ backgroundColor: D.accent, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}>
            <Text style={{ color: "#fff", fontSize: 13, fontWeight: "600" }}>+ Nueva</Text>
          </TouchableOpacity>
        </View>

        {/* Filtro de curso */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[null, ...Array.from({ length: program?.years || 4 }, (_, i) => i + 1)].map(y => (
              <FilterChip key={y ?? "all"} active={filterYear === y} onPress={() => setFilterYear(y)} label={y === null ? "Todos" : y + "º"} />
            ))}
          </View>
        </ScrollView>

        {/* Filtro de estado */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 16 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {[["all", "Todas"], ["active", "En curso"], ["approved", "Aprobadas"], ["archived", "Archivadas"]].map(([v, label]) => (
              <FilterChip key={v} active={filterStatus === v} onPress={() => setFilterStatus(v)} label={label} />
            ))}
          </View>
        </ScrollView>

        {/* En curso */}
        {activeList.length === 0 && approvedList.length === 0 && archivedList.length === 0 && (
          <Text style={{ color: D.muted, fontSize: 13, textAlign: "center", marginTop: 30 }}>Sin asignaturas.</Text>
        )}
        {activeList.map((s, i) => (
          <View key={s.id}>
          {/* Separador al cambiar de cuatrimestre */}
          {i > 0 && subjectGroupKey(activeList[i - 1]) !== subjectGroupKey(s) &&
            <View style={{ height: 4, borderRadius: 2, backgroundColor: D.muted + "33", marginVertical: 12 }} />}
          <SubjectCard subj={s} data={data}
            expanded={expanded.has(s.id)} onToggle={() => toggleExpand(s.id)}
            onEdit={() => setEditingSubj(s)}
            onApprove={() => toggleApprove(s)} onArchive={() => toggleArchive(s)} onDelete={() => deleteSubject(s)}
            onNewTask={() => { setTaskSubject(s); setEditingTask(null); }}
            onEditTask={t => { setTaskSubject(s); setEditingTask(t); }}
          />
          </View>
        ))}

        {/* Aprobadas: sección desplegada por defecto, con tarjeta completa y nota */}
        {approvedList.length > 0 && (filterStatus === "all" || filterStatus === "approved") && (
          <View style={{ marginTop: 4 }}>
            {filterStatus !== "approved" && (
              <TouchableOpacity onPress={() => setShowApproved(a => !a)} style={{ marginBottom: 8 }}>
                <Text style={{ color: D.green, fontSize: 13 }}>{showApproved ? "▲" : "▶"} ✓ Aprobadas ({approvedList.length})</Text>
              </TouchableOpacity>
            )}
            {(showApproved || filterStatus === "approved") && approvedList.map(s => (
              <SubjectCard key={s.id} subj={s} data={data}
                expanded={expanded.has(s.id)} onToggle={() => toggleExpand(s.id)}
                onEdit={() => setEditingSubj(s)}
                onApprove={() => toggleApprove(s)} onArchive={() => toggleArchive(s)} onDelete={() => deleteSubject(s)}
                onNewTask={() => { setTaskSubject(s); setEditingTask(null); }}
                onEditTask={t => { setTaskSubject(s); setEditingTask(t); }}
              />
            ))}
          </View>
        )}

        {/* Archivadas: aparte y plegadas por defecto */}
        {archivedList.length > 0 && (filterStatus === "all" || filterStatus === "archived") && (
          <View style={{ marginTop: 6 }}>
            {filterStatus !== "archived" && (
              <TouchableOpacity onPress={() => setShowArchived(a => !a)} style={{ marginBottom: 8 }}>
                <Text style={{ color: D.muted, fontSize: 13 }}>{showArchived ? "▲" : "▶"} 📁 Archivadas ({archivedList.length})</Text>
              </TouchableOpacity>
            )}
            {(showArchived || filterStatus === "archived") && archivedList.map(s => (
              <CompactRow key={s.id} s={s} tone="archived" onEdit={() => setEditingSubj(s)} onRestore={() => toggleArchive(s)} onDelete={() => deleteSubject(s)} />
            ))}
          </View>
        )}
      </ScrollView>

      <SubjectModal
        visible={editingSubj !== undefined}
        subject={editingSubj}
        years={program?.years}
        onClose={() => setEditingSubj(undefined)}
        onSave={saveSubject}
      />
      <TaskModal
        visible={editingTask !== undefined}
        task={editingTask}
        onClose={() => setEditingTask(undefined)}
        onSave={saveTask}
        onDelete={deleteTask}
      />
    </View>
  );
}

// ─── Tarjeta expandible de asignatura en curso ──────────────────────────────────
function SubjectCard({ subj, data, expanded, onToggle, onEdit, onApprove, onArchive, onDelete, onNewTask, onEditTask }) {
  const subjTasks = data.tasks.filter(t => t.subjectId === subj.id).sort(byDueDate);
  const totalMins = data.sessions.filter(s => s.subjectId === subj.id).reduce((a, s) => a + s.minutes, 0);
  const { finalGrade } = calcFinalGrade(data.tasks, data.subjects, subj.id);
  const medal = subjectMedal(finalGrade, subj.approved);
  const pendientes = subjTasks.filter(t => t.status !== "completada").length;

  const sems = Array.isArray(subj.semester) ? subj.semester : (subj.semester ? [subj.semester] : []);

  return (
    <View style={{ backgroundColor: D.card, borderRadius: 12, borderWidth: 1, borderColor: subj.approved ? D.green + "55" : D.border, marginBottom: 10, overflow: "hidden" }}>
      <TouchableOpacity onPress={onToggle} style={{ backgroundColor: subj.approved ? D.green + "18" : D.card2, padding: 12, flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Text style={{ color: D.muted, fontSize: 11 }}>{expanded ? "▼" : "▶"}</Text>
        <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: subj.color }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ color: D.text, fontSize: 14, fontWeight: "600" }} numberOfLines={1}>{subj.name}</Text>
          <Text style={{ color: D.muted, fontSize: 11, marginTop: 1 }} numberOfLines={1}>
            {subj.year ? subj.year + "º" : ""}{sems.length ? " · C" + sems.join("+") : ""}{subj.credits ? " · " + subj.credits + " ECTS" : ""}
          </Text>
        </View>
        {subj.approved && (
          <View style={{ backgroundColor: D.green + "22", borderRadius: 5, paddingHorizontal: 6, paddingVertical: 2 }}>
            <Text style={{ color: D.green, fontSize: 10, fontWeight: "700" }}>✓</Text>
          </View>
        )}
        {finalGrade !== null && (
          <View style={{ backgroundColor: D.card, borderRadius: 20, borderWidth: 1, borderColor: D.border, paddingVertical: 3, paddingHorizontal: 9 }}>
            <Text style={{ color: gradeColor(finalGrade), fontSize: 12, fontWeight: "700" }}>{fmtGrade(finalGrade)}{medal ? " " + medal : ""}</Text>
          </View>
        )}
        {!expanded && pendientes > 0 && <Text style={{ color: D.muted, fontSize: 11 }}>{pendientes} pend.</Text>}
      </TouchableOpacity>

      {expanded && (
        <View style={{ padding: 14 }}>
          {/* Acciones */}
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 14, flexWrap: "wrap" }}>
            <ActionBtn label="+ Tarea" color={D.accent} onPress={onNewTask} />
            <ActionBtn label="✎ Editar" color={D.muted} onPress={onEdit} />
            <ActionBtn label="✓ Aprobar" color={D.green} onPress={onApprove} />
            <ActionBtn label="📁 Archivar" color={D.muted} onPress={onArchive} />
            <ActionBtn label="✕ Eliminar" color={D.red} onPress={onDelete} />
          </View>

          {totalMins > 0 && (
            <Text style={{ color: D.muted, fontSize: 12, marginBottom: 10 }}>⏱ {fmtTime(totalMins)} estudiados</Text>
          )}

          <Text style={{ color: D.muted, fontSize: 12, fontWeight: "500", marginBottom: 8 }}>Actividades</Text>
          {subjTasks.length === 0 && <Text style={{ color: D.muted, fontSize: 12 }}>Sin actividades.</Text>}
          {subjTasks.map(t => {
            const d = t.dueDate ? daysUntil(t.dueDate) : null;
            return (
              <TouchableOpacity key={t.id} onPress={() => onEditTask(t)}
                style={{ backgroundColor: D.card2, borderLeftWidth: 3, borderLeftColor: subj.color, borderRadius: 8, padding: 10, marginBottom: 6, flexDirection: "row", alignItems: "center", gap: 8 }}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ color: t.status === "completada" ? D.muted : D.text, fontSize: 12, fontWeight: "500", textDecorationLine: t.status === "completada" ? "line-through" : "none" }} numberOfLines={1}>
                    {t.title}
                  </Text>
                  <View style={{ flexDirection: "row", gap: 8, marginTop: 3 }}>
                    <Text style={{ color: STATUS_COLOR[t.status] || D.muted, fontSize: 10 }}>{t.status}</Text>
                    {d !== null && <Text style={{ color: D.muted, fontSize: 10 }}>{d < 0 ? "Vencida" : d === 0 ? "Hoy" : d + "d"}</Text>}
                  </View>
                </View>
                {t.grade !== null && t.grade !== undefined && (
                  <Text style={{ color: gradeColor(t.grade), fontSize: 13, fontWeight: "700" }}>{fmtGrade(t.grade)}</Text>
                )}
              </TouchableOpacity>
            );
          })}
        </View>
      )}
    </View>
  );
}

// ─── Fila compacta para aprobadas/archivadas ────────────────────────────────────
function CompactRow({ s, tone, onEdit, onRestore, onDelete }) {
  const archived = tone === "archived";
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 9, marginBottom: 6,
      backgroundColor: D.card, borderWidth: 1, borderColor: archived ? D.border : D.green + "44", opacity: archived ? 0.65 : 1,
    }}>
      <View style={{ width: 9, height: 9, borderRadius: 5, backgroundColor: s.color }} />
      <Text style={{ flex: 1, color: archived ? D.muted : D.text, fontSize: 12, textDecorationLine: archived ? "line-through" : "none" }} numberOfLines={1}>{s.name}</Text>
      <Text style={{ fontSize: 9, color: archived ? D.muted : D.green, backgroundColor: (archived ? D.card2 : D.green + "22"), paddingHorizontal: 6, paddingVertical: 2, borderRadius: 5 }}>
        {archived ? "📁" : "✓"}
      </Text>
      <TouchableOpacity onPress={onEdit}><Text style={{ color: D.muted, fontSize: 13 }}>✎</Text></TouchableOpacity>
      <TouchableOpacity onPress={onRestore}><Text style={{ color: D.muted, fontSize: 11 }}>↩</Text></TouchableOpacity>
      <TouchableOpacity onPress={onDelete}><Text style={{ color: D.red, fontSize: 13 }}>✕</Text></TouchableOpacity>
    </View>
  );
}

function FilterChip({ active, onPress, label }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 6, paddingHorizontal: 12, borderRadius: 7, backgroundColor: active ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: active ? D.accent : D.border }}>
      <Text style={{ color: active ? D.accent : D.muted, fontSize: 12, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}

function ActionBtn({ label, color, onPress }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ borderWidth: 1, borderColor: D.border, borderRadius: 7, paddingVertical: 6, paddingHorizontal: 10 }}>
      <Text style={{ color, fontSize: 11, fontWeight: "500" }}>{label}</Text>
    </TouchableOpacity>
  );
}
