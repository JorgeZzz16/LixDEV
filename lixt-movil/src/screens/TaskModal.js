import React, { useState, useEffect, useRef } from "react";
import { Modal, View, Text, Pressable, TextInput, TouchableOpacity, ScrollView, KeyboardAvoidingView, Platform, useWindowDimensions } from "react-native";
import { TASK_TYPES } from "../constants";
import { DateField, TimeField } from "./DateTimeField";
import { today, soloNumero, parseNum, pad, byDueDate, REMINDER_PRESETS, DEFAULT_REMINDERS, reminderTimes } from "../logic";
import { D, input, botonPrimario, botonSecundario, botonPeligro, VELO, sc } from "../theme";

const emptyForm = {
  title: "", type: "tarea", dueDate: today(), start: "", end: "", status: "pendiente", priority: "media",
  mode: "pct", grade: "", pct: "", reminders: null, parentId: null,
};

const DIAS  = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const fmtWhen = d => `${DIAS[d.getDay()]} ${d.getDate()} ${MESES[d.getMonth()]}, ${pad(d.getHours())}:${pad(d.getMinutes())}`;

export default function TaskModal({ visible, task, tasks, subjects, subjectId, initialDate, initialType, onSubjectChange, onClose, onSave, onDelete }) {
  const [f, setF] = useState(emptyForm);
  const { height } = useWindowDimensions();
  // ¿Queda formulario por debajo? Se compara lo que mide el contenido con lo que
  // se ve. Las medidas van en una ref y solo se repinta cuando cambia el sí/no:
  // con estado, cada evento de scroll repintaba el formulario entero.
  const medidas = useRef({ caja: 0, contenido: 0, y: 0 });
  const [masAbajo, setMasAbajo] = useState(false);
  const medir = cambio => {
    Object.assign(medidas.current, cambio);
    const { caja, contenido, y } = medidas.current;
    const hay = contenido - caja - y > 12;
    setMasAbajo(prev => prev === hay ? prev : hay);
  };

  // Título automático, como en el PC: "Examen Termodinámica". Solo se rehace
  // mientras sigue siendo uno automático; si lo has escrito tú, no se toca.
  const nombreAsig = id => (subjects || []).find(s => s.id === id)?.name;
  const autoTitle = (type, id) => ((TASK_TYPES.find(t => t.key === type)?.label ?? "Tarea") + " " + (nombreAsig(id) ?? "")).trim();
  const esAuto = t => !t || TASK_TYPES.some(x => t === x.label || (subjects || []).some(s => t === x.label + " " + s.name));

  useEffect(() => {
    if (!visible) return;
    if (task) {
      setF({
        title: task.title, type: task.type || "tarea", dueDate: task.dueDate || today(),
        // Mismo formato que el PC: "17:00" (hora límite de una entrega) o "17:00-20:00"
        start: (task.hour || "").split("-")[0] || "", end: (task.hour || "").split("-")[1] || "",
        status: task.status || "pendiente", priority: task.priority || "media",
        mode: task.gradeMode || "pct",
        grade: task.grade != null ? String(task.grade) : "",
        pct: task.pct != null ? String(task.pct) : "",
        reminders: task.reminders ?? null, parentId: task.parentId ?? null,
      });
    } else {
      const type = initialType || "tarea";
      // Las notas rápidas del calendario no llevan título automático
      setF({ ...emptyForm, type, dueDate: initialDate || today(), title: type === "recordatorio" ? "" : autoTitle(type, subjectId) });
    }
  }, [visible, task, initialDate, initialType]);

  // La asignatura la lleva la pantalla que abre el formulario: al cambiarla se
  // rehace el título si sigue siendo automático
  useEffect(() => {
    if (!visible) return;
    setF(p => p.type !== "recordatorio" && esAuto(p.title) ? { ...p, title: autoTitle(p.type, subjectId) } : p);
  }, [subjectId]);

  // Los puntos extra solo se configuran en el PC. Aquí se conservan tal cual: si
  // se enviara gradeMode "pct" y pts null, al sincronizar ganaría esta versión
  // (updated_at más reciente) y el PC perdería el bonus sin avisar.
  const isPoints = task?.gradeMode === "points";
  const tt = TASK_TYPES.find(t => t.key === f.type);
  // El examen siempre lleva nota; entregas y prácticas pueden ir "sin nota"
  const modos = [
    ["pct", "Porcentaje"],
    ...(isPoints ? [["points", "Puntos extra"]] : []),
    ...(f.type !== "examen" ? [["none", "Sin nota"]] : []),
  ];
  const conNota = tt?.hasGrade !== false && f.mode !== "none";
  const entrega = f.type === "tarea";

  // Prácticas de la misma asignatura a las que enlazar una entrega
  // Con selector de asignatura manda `subjectId`; sin él (editar desde el
  // calendario o las notas) la de la propia tarea
  const subj = subjects ? subjectId ?? null : task?.subjectId ?? subjectId ?? null;
  const practicas = (tasks || [])
    .filter(t => t.type === "practica" && t.id !== task?.id && (t.subjectId === subj || t.id === f.parentId))
    .sort(byDueDate);

  function setType(type) {
    setF(p => ({
      ...p, type,
      title: esAuto(p.title) ? autoTitle(type, subj) : p.title,
      // La entrega lleva una sola hora (la límite); el resto, un rango
      end: type === "tarea" ? "" : p.end,
      start: type === "tarea" ? (p.end || p.start) : p.start,
      mode: type === "examen" && p.mode === "none" ? "pct" : p.mode,
      parentId: type === "tarea" ? p.parentId : null,
    }));
  }

  function save() {
    if (!f.title.trim()) return;
    const mode = f.mode === "points" && !isPoints ? "pct" : f.mode;
    onSave({
      title: f.title.trim(), type: f.type, dueDate: f.dueDate, status: f.status, priority: f.priority,
      hour: !f.start ? "" : entrega || !f.end ? f.start : f.start + "-" + f.end,
      grade: conNota ? parseNum(f.grade) : null,
      gradeMode: mode,
      pct: !conNota ? null : mode === "points" ? (task.pct ?? null) : parseNum(f.pct, { min: 0, max: 100 }),
      pts: mode === "points" ? (task.pts ?? null) : null,
      reminders: f.reminders?.list?.length ? f.reminders : null,
      parentId: entrega ? f.parentId : null,
    });
  }

  return (
    <Modal visible={visible} animationType="fade" transparent statusBarTranslucent onRequestClose={onClose}>
      {/* Popup centrado, como en el PC. Los botones van fuera del scroll para
          que nunca queden cortados por la barra de navegación del sistema. */}
      <Pressable style={{ flex: 1, backgroundColor: VELO, justifyContent: "center", padding: 14 }} onPress={onClose}>
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <Pressable onPress={() => {}} style={{ backgroundColor: D.card, borderRadius: 16, borderWidth: 1, borderColor: D.border, maxHeight: height * 0.86, overflow: "hidden" }}>
            <View style={{ flexDirection: "row", alignItems: "center", paddingHorizontal: 18, paddingTop: 16, paddingBottom: 10 }}>
              <Text style={{ color: D.text, fontSize: 17, fontWeight: "700", flex: 1 }}>{task ? "Editar" : "Nueva actividad"}</Text>
              <TouchableOpacity onPress={onClose} hitSlop={10}><Text style={{ color: D.muted, fontSize: 18 }}>✕</Text></TouchableOpacity>
            </View>

            <View style={{ flexShrink: 1 }}>
              <ScrollView persistentScrollbar contentContainerStyle={{ paddingHorizontal: 18, paddingBottom: 14 }}
                onLayout={e => medir({ caja: e.nativeEvent.layout.height })}
                onContentSizeChange={(_, contenido) => medir({ contenido })}
                onScroll={e => medir({ y: e.nativeEvent.contentOffset.y })}
                scrollEventThrottle={32}>

                <Label>Tipo</Label>
                {/* Los recordatorios solo se crean desde el calendario */}
                <Segmented value={f.type} onChange={setType}
                  options={TASK_TYPES.filter(t => f.type === "recordatorio" ? t.quick : !t.quick).map(t => [t.key, t.label])} />

                {subjects && (
                  <>
                    <Label>Asignatura</Label>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginBottom: 14 }}>
                      <TouchableOpacity onPress={() => onSubjectChange(null)}
                        style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: subjectId == null ? D.card : D.card2, borderWidth: 1, borderColor: subjectId == null ? D.accent : D.border }}>
                        <Text style={{ color: subjectId == null ? D.text : D.muted, fontSize: 12 }}>Sin asignatura</Text>
                      </TouchableOpacity>
                      {subjects.map(s => (
                        <TouchableOpacity key={s.id} onPress={() => onSubjectChange(s.id)}
                          style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: subjectId === s.id ? s.color + "33" : D.card2, borderWidth: 1, borderColor: subjectId === s.id ? sc(s.color) : D.border }}>
                          <Text style={{ color: subjectId === s.id ? D.text : D.muted, fontSize: 12 }}>{s.acronym || s.name}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                  </>
                )}

                <Label>Título</Label>
                <TextInput value={f.title} onChangeText={t => setF(p => ({ ...p, title: t }))} placeholder="Ej: Examen parcial" placeholderTextColor={D.muted} style={{ ...input(), marginBottom: 14 }} />

                <Label>Prioridad</Label>
                <Segmented value={f.priority} onChange={v => setF(p => ({ ...p, priority: v }))}
                  options={[["alta", "Alta"], ["media", "Media"], ["baja", "Baja"]]} />

                <Label>Estado</Label>
                <Segmented value={f.status} onChange={v => setF(p => ({ ...p, status: v }))}
                  options={[["pendiente", "Pendiente"], ["en progreso", "En progreso"], ["completada", "Completada"]]} />

                {/* Fecha y hora en la misma fila, como en el PC. El rango necesita
                    dos campos, así que va en su propia fila. */}
                <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                  <View style={{ flex: 1 }}>
                    <Label>Fecha</Label>
                    <DateField value={f.dueDate} onChange={v => setF(p => ({ ...p, dueDate: v }))} />
                  </View>
                  {entrega && (
                    <View style={{ flex: 1 }}>
                      <Label>Hora límite</Label>
                      <TimeField value={f.start} onChange={v => setF(p => ({ ...p, start: v }))} />
                    </View>
                  )}
                </View>
                {!entrega && (
                  <View style={{ flexDirection: "row", gap: 10, marginBottom: 14 }}>
                    <View style={{ flex: 1 }}>
                      <Label>Inicio</Label>
                      <TimeField value={f.start} onChange={v => setF(p => ({ ...p, start: v }))} />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Label>Fin</Label>
                      <TimeField value={f.end} onChange={v => setF(p => p.start ? { ...p, end: v } : { ...p, start: v })} />
                    </View>
                  </View>
                )}
                {!!f.start && (
                  <TouchableOpacity onPress={() => setF(p => ({ ...p, start: "", end: "" }))} style={{ alignSelf: "flex-start", marginTop: -6, marginBottom: 14 }}>
                    <Text style={{ color: D.muted, fontSize: 12 }}>✕ Quitar hora</Text>
                  </TouchableOpacity>
                )}

                {entrega && (practicas.length > 0 || f.parentId) && (
                  <Caja>
                    <Label>🔗 Pertenece a la práctica</Label>
                    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7 }}>
                      <Chip active={!f.parentId} onPress={() => setF(p => ({ ...p, parentId: null }))} label="Ninguna" />
                      {practicas.map(t => (
                        <Chip key={t.id} active={f.parentId === t.id} onPress={() => setF(p => ({ ...p, parentId: t.id }))} label={t.title} />
                      ))}
                    </View>
                  </Caja>
                )}

                {tt?.hasGrade !== false && (
                  <>
                    <Label>Modo de calificación</Label>
                    <Segmented value={f.mode} onChange={m => setF(p => ({ ...p, mode: m }))} options={modos} />
                  </>
                )}

                {conNota && (
                  <View style={{ flexDirection: "row", gap: 10 }}>
                    <View style={{ flex: 1 }}>
                      <Label>Nota (0–10)</Label>
                      <TextInput value={f.grade} onChangeText={t => setF(p => ({ ...p, grade: soloNumero(t) }))} placeholder="—" placeholderTextColor={D.muted} keyboardType="decimal-pad" style={{ ...input(), marginBottom: 14 }} />
                    </View>
                    <View style={{ flex: 1 }}>
                      {f.mode === "points" ? (
                        <>
                          <Label>Puntos extra</Label>
                          <View style={{ ...input(), marginBottom: 14, justifyContent: "center" }}>
                            <Text style={{ color: D.green, fontSize: 14 }}>
                              +{(((parseNum(f.grade) ?? 0) / 10) * (task.pts || 0)).toFixed(2)} de {task.pts} máx.
                            </Text>
                          </View>
                        </>
                      ) : (
                        <>
                          <Label>Peso (%)</Label>
                          <TextInput value={f.pct} onChangeText={t => setF(p => ({ ...p, pct: soloNumero(t) }))} placeholder="—" placeholderTextColor={D.muted} keyboardType="decimal-pad" style={{ ...input(), marginBottom: 14 }} />
                        </>
                      )}
                    </View>
                  </View>
                )}

                {f.type === "recordatorio"
                  ? <Text style={{ color: D.muted, fontSize: 12 }}>🔔 Avisa ese día a su hora (o a la hora de los avisos de Ajustes si no tiene).</Text>
                  : <ReminderEditor f={f} setF={setF} />}
              </ScrollView>

              {/* Si queda formulario abajo, el borde inferior se difumina: el
                  contenido "se mete" bajo los botones. Desaparece al llegar al final. */}
              {masAbajo && (
                <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: 28 }}>
                  {[0.15, 0.35, 0.55, 0.75, 0.9].map((o, i) => (
                    <View key={i} style={{ flex: 1, backgroundColor: D.card, opacity: o }} />
                  ))}
                </View>
              )}
            </View>

            {/* Acciones fijas: siempre a la vista, haya o no más formulario */}
            <View style={{ flexDirection: "row", gap: 10, padding: 14, borderTopWidth: 1, borderTopColor: D.border, backgroundColor: D.card }}>
              {task && (
                <TouchableOpacity onPress={() => onDelete(task.id)} style={botonPeligro()}>
                  <Text style={{ color: D.red, fontSize: 14 }}>Eliminar</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={onClose} style={botonSecundario()}>
                <Text style={{ color: D.muted, fontSize: 14 }}>Cancelar</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={save} style={botonPrimario()}>
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "600" }}>Guardar</Text>
              </TouchableOpacity>
            </View>
          </Pressable>
        </KeyboardAvoidingView>
      </Pressable>
    </Modal>
  );
}

// Avisos de la tarea. El formato está explicado en logic.js (reminderTimes).
function ReminderEditor({ f, setF }) {
  const r = f.reminders;
  const list = r?.list || [];
  const set = next => setF(p => ({ ...p, reminders: next }));
  const toggle = () => set(r ? null : { list: (DEFAULT_REMINDERS[f.type] || [1440]).map(before => ({ before })), insist: false });
  const has = b => list.some(x => x.before === b);
  const flip = b => set({ ...r, list: has(b) ? list.filter(x => x.before !== b) : [...list, { before: b }] });
  const setAt = (i, at) => set({ ...r, list: list.map((x, j) => j === i ? { at } : x) });
  const hour = !f.start ? "" : f.type === "tarea" || !f.end ? f.start : f.start + "-" + f.end;
  // Vista previa con la hora por defecto de 9:00; el aviso real usa la de Ajustes
  const next = r ? reminderTimes({ ...f, hour, status: "pendiente" }).find(d => d > new Date()) : null;

  return (
    <View style={{ borderRadius: 10, borderWidth: 1, borderColor: D.border, backgroundColor: D.card2, padding: 12 }}>
      <TouchableOpacity onPress={toggle} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <View style={{ width: 18, height: 18, borderRadius: 5, borderWidth: 2, borderColor: r ? D.accent : D.border, backgroundColor: r ? D.accent : "transparent", alignItems: "center", justifyContent: "center" }}>
          {r && <Text style={{ color: "#fff", fontSize: 11, fontWeight: "700" }}>✓</Text>}
        </View>
        <Text style={{ color: D.text, fontSize: 14 }}>🔔 Añadir recordatorio</Text>
      </TouchableOpacity>
      {r && (
        <>
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: 12 }}>
            {REMINDER_PRESETS.map(p => <Chip key={p.before} active={has(p.before)} onPress={() => flip(p.before)} label={p.label} />)}
            <Chip active={false} onPress={() => set({ ...r, list: [...list, { at: (f.dueDate || today()) + "T09:00" }] })} label="+ Personalizado" />
          </View>
          {list.map((x, i) => {
            if (!x.at) return null;
            const [ds, hm] = x.at.split("T");
            return (
              <View key={i} style={{ flexDirection: "row", gap: 8, alignItems: "center", marginTop: 10 }}>
                <View style={{ flex: 1 }}><DateField value={ds} onChange={v => setAt(i, v + "T" + hm)} /></View>
                <View style={{ flex: 1 }}><TimeField value={hm} onChange={v => setAt(i, ds + "T" + v)} /></View>
                <TouchableOpacity onPress={() => set({ ...r, list: list.filter((_, j) => j !== i) })} style={{ padding: 6 }}>
                  <Text style={{ color: D.muted, fontSize: 16 }}>✕</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {f.type === "tarea" && (
            <TouchableOpacity onPress={() => set({ ...r, insist: !r.insist })} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
              <View style={{ width: 16, height: 16, borderRadius: 4, borderWidth: 2, borderColor: r.insist ? D.accent : D.border, backgroundColor: r.insist ? D.accent : "transparent" }} />
              <Text style={{ color: D.text, fontSize: 12, flex: 1 }}>Insistir: avisar cada día hasta que la marques como hecha</Text>
            </TouchableOpacity>
          )}
          <Text style={{ color: D.muted, fontSize: 11, marginTop: 10 }}>
            {next ? "Próximo aviso: " + fmtWhen(next) : list.length ? "Todos los avisos ya han pasado" : "Elige cuándo avisar"}
          </Text>
        </>
      )}
    </View>
  );
}

// Fila de opciones excluyentes, como los botones de tipo del PC
function Segmented({ value, onChange, options }) {
  return (
    <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
      {options.map(([v, label]) => {
        const on = value === v;
        return (
          <TouchableOpacity key={v} onPress={() => onChange(v)}
            style={{ flex: 1, paddingVertical: 9, borderRadius: 8, borderWidth: 1, borderColor: on ? D.accent : D.border, backgroundColor: on ? D.accent : D.card2, alignItems: "center" }}>
            <Text style={{ color: on ? "#fff" : D.muted, fontSize: 12, fontWeight: on ? "600" : "400" }} numberOfLines={1}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

function Caja({ children }) {
  return <View style={{ borderRadius: 10, borderWidth: 1, borderColor: D.border, backgroundColor: D.card2, padding: 12, marginBottom: 14 }}>{children}</View>;
}

function Label({ children }) {
  return <Text style={{ color: D.muted, fontSize: 12, marginBottom: 6 }}>{children}</Text>;
}

function Chip({ active, onPress, label }) {
  return (
    <TouchableOpacity onPress={onPress} style={{ paddingVertical: 7, paddingHorizontal: 13, borderRadius: 8, backgroundColor: active ? D.accent + "22" : D.card2, borderWidth: 1, borderColor: active ? D.accent : D.border }}>
      <Text style={{ color: active ? D.accent : D.muted, fontSize: 12, fontWeight: active ? "600" : "400" }}>{label}</Text>
    </TouchableOpacity>
  );
}
