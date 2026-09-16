import React, { useState, useEffect, useRef } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl, useWindowDimensions } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { weekdayIndex, timeToMinutes, newId, touch, softDelete, academicCourseOf, academicCourseLabel, today, bySubjectOrder } from "../logic";
import { D } from "../theme";
import ScheduleModal from "./ScheduleModal";

const DAYS = ["Lu","Ma","Mi","Ju","Vi","Sá","Do"];

// Días que se pintan, según Ajustes. `DAYS` se queda entero pase lo que pase:
// `weekdayIndex` indexa sobre él para saber qué día es hoy, y si le quitas el
// domingo, el lunes pasa a ser "Do". Ocultar un día es solo no dibujarlo.
const diasVisibles = grid => {
  const elegidos = grid?.dias;
  if (!Array.isArray(elegidos) || !elegidos.length) return DAYS;
  const vis = DAYS.filter(d => elegidos.includes(d));
  return vis.length ? vis : DAYS;
};

// En semana las siete columnas van en fila; en día se convierten en un carrusel
// que pasa de día en día siguiendo el dedo.
function Dias({ semana, pager, anchoDia, onAncho, onDay, dias, children }) {
  if (semana) return children;
  return (
    <ScrollView ref={pager} horizontal pagingEnabled showsHorizontalScrollIndicator={false}
      style={{ flex: 1 }}
      onLayout={e => onAncho(e.nativeEvent.layout.width)}
      onMomentumScrollEnd={e => {
        const i = Math.round(e.nativeEvent.contentOffset.x / anchoDia);
        onDay(dias[Math.min(dias.length - 1, Math.max(0, i))]);
      }}>
      {children}
    </ScrollView>
  );
}

// Las clases que ya existían no tenían curso; se consideran del 2026/27, que es
// el que estás cursando ahora. Las nuevas se crean eligiendo curso.
const LEGACY_COURSE = 2026;

// Dos vistas: semana (los 7 días, como el PC) y día (un solo día, columnas más
// anchas para cuando el acrónimo no se lee). Ambas usan la misma rejilla horaria.
// Por defecto se ve la semana entera; cambiarlo está en Ajustes, no aquí, porque
// es una preferencia que se toca una vez y no en cada visita a la pantalla.
export default function Schedule({ data, sync, syncing, mutate, grid }) {
  // Reloj para la línea de hora actual y la clase en curso; cada minuto basta
  const [ahora, setAhora] = useState(new Date());
  const hoy = DAYS[weekdayIndex(ahora)];
  const [day, setDay] = useState(hoy);
  const [course, setCourse] = useState(null); // null = automático (ver cursoVisible)
  useEffect(() => {
    const i = setInterval(() => setAhora(new Date()), 60000);
    return () => clearInterval(i);
  }, []);
  const [editingSlot, setEditingSlot] = useState(undefined); // undefined=cerrado, null=nueva, obj=editar

  // Recuerda el curso seleccionado entre sesiones
  useEffect(() => {
    AsyncStorage.getItem("lixt_schedule_course").then(v => { if (v) setCourse(Number(v)); });
  }, []);
  function selectCourse(y) {
    setCourse(y);
    AsyncStorage.setItem("lixt_schedule_course", String(y));
  }

  const activas = data.subjects.filter(s => !s.archived && !s.approved).sort(bySubjectOrder);
  const courseOf = s => s.course ?? LEGACY_COURSE;

  // Cursos presentes en el horario, más el actual, para el selector
  const conClases   = [...new Set(data.schedule.map(courseOf))].sort((a, b) => b - a);
  const cursoActual = academicCourseOf(today());
  const courses = [...new Set([...conClases, cursoActual])].sort((a, b) => b - a);
  // Si no has elegido ninguno a mano se usa el actual si tiene clases y, si no, el
  // más reciente que sí las tenga: igual que el PC. Sin esto, al empezar un curso
  // nuevo el móvil decía "sin clases" mientras el ordenador seguía enseñándolas.
  const cursoVisible = course ?? (conClases.includes(cursoActual) ? cursoActual : (conClases[0] ?? cursoActual));

  // `grid` viene de App y puede ser anterior a que la vista viviera ahí, así que
  // semana es el valor por defecto si falta.
  const semana = (grid.vista ?? "semana") === "semana";
  const dias = diasVisibles(grid);
  const delCurso = data.schedule.filter(s => courseOf(s) === cursoVisible);
  const slotsDe = d => delCurso.filter(s => s.day === d);
  // Se dibujan SIEMPRE los siete días: en semana caben todos a la vez y en día se
  // deslizan de uno en uno. La rejilla se mide con el curso entero, no con el día
  // que estés viendo, para que no cambie de alto a mitad del gesto. Sí se filtran
  // los días ocultos: si no, una clase de un sábado que no se pinta seguiría
  // estirando la rejilla y dejando una franja vacía en toda la semana.
  const visibles = delCurso.filter(s => dias.includes(s.day));

  // Ancho de página del carrusel. Se estima con el de la ventana (menos el padding
  // del scroll y el eje de horas) y se corrige con la medida real en onLayout.
  const { width: anchoVentana } = useWindowDimensions();
  const [anchoDia, setAnchoDia] = useState(anchoVentana - 32 - 42);
  const pager = useRef(null);
  // Mantiene el carrusel y los botones de día sincronizados, en los dos sentidos.
  // Sin animación: animar aquí pelearía con el dedo al soltar el gesto.
  useEffect(() => {
    if (!semana) pager.current?.scrollTo({ x: Math.max(0, dias.indexOf(day)) * anchoDia, animated: false });
  }, [day, anchoDia, semana, dias]);

  // Si el día en el que estabas deja de mostrarse (lo has quitado en Ajustes),
  // salta al primero visible en vez de quedarse en una columna que ya no existe.
  useEffect(() => {
    if (!dias.includes(day)) setDay(dias[0]);
  }, [dias, day]);

  // Al entrar se abre en hoy. Si las clases de hoy ya han acabado (o no hay), salta
  // al siguiente día que tenga. Solo al montar: el día elegido no se recuerda.
  useEffect(() => {
    const minAhora = ahora.getHours() * 60 + ahora.getMinutes();
    const finHoy = Math.max(...slotsDe(hoy).map(s => timeToMinutes(s.end)));
    if (finHoy !== -Infinity && minAhora < finHoy) return;
    for (let i = 1; i <= 7; i++) {
      const d = DAYS[(DAYS.indexOf(hoy) + i) % 7];
      if (dias.includes(d) && slotsDe(d).length) { setDay(d); return; }
    }
  }, []);

  function saveSlot(fields) {
    if (editingSlot) {
      mutate("schedule", prev => prev.map(x => x.id === editingSlot.id ? touch({ ...x, ...fields }) : x));
    } else {
      mutate("schedule", prev => [...prev, touch({ id: newId(), course: cursoVisible, ...fields })]);
    }
    setEditingSlot(undefined);
  }
  function deleteSlot(id) {
    mutate("schedule", prev => prev.map(x => x.id === id ? softDelete(x) : x));
    setEditingSlot(undefined);
  }

  // En automático la rejilla va de la primera a la última clase visible. A mano,
  // del rango de Ajustes, estirado si alguna clase cae fuera para que no se oculte.
  // Sin clases, Math.min/max de un array vacío da ±Infinity y manda el rango a mano.
  const PX_HORA = semana ? 52 : 64;
  const minClase = Math.min(...visibles.map(s => timeToMinutes(s.start)));
  const maxClase = Math.max(...visibles.map(s => timeToMinutes(s.end)));
  const startMin = grid.auto && visibles.length ? minClase : Math.min(timeToMinutes(grid.start), minClase);
  const endMin   = grid.auto && visibles.length ? maxClase : Math.max(timeToMinutes(grid.end),   maxClase);
  const spanMin  = Math.max(60, endMin - startMin);
  const altura   = (spanMin / 60) * PX_HORA;
  const horas    = Array.from({ length: Math.floor(spanMin / 60) + 1 }, (_, i) => startMin + i * 60);
  // Marca de la hora actual, cruzando el horario entero
  const nowMin    = ahora.getHours() * 60 + ahora.getMinutes();
  const enRejilla = nowMin >= startMin && nowMin <= endMin;
  // Clase que está ocurriendo ahora mismo: se le pone un aro de SU color, no del
  // acento, para que se lea de un vistazo qué asignatura es sin cruzar con la leyenda
  const esAhora = slot => slot.day === hoy && nowMin >= timeToMinutes(slot.start) && nowMin < timeToMinutes(slot.end);
  const nowTop    = ((nowMin - startMin) / 60) * PX_HORA;

  return (
    <View style={{ flex: 1, backgroundColor: D.bg }}>
      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 14 }}>
          <Text style={{ color: D.text, fontSize: 22, fontWeight: "700", flex: 1 }}>Horario</Text>
          <TouchableOpacity onPress={() => setEditingSlot(null)} disabled={!activas.length}
            style={{ backgroundColor: activas.length ? D.accent : D.card2, paddingVertical: 8, paddingHorizontal: 14, borderRadius: 8 }}>
            <Text style={{ color: activas.length ? "#fff" : D.muted, fontSize: 13, fontWeight: "600" }}>+ Clase</Text>
          </TouchableOpacity>
        </View>

        {/* Selector de curso académico */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {courses.map(y => (
              <TouchableOpacity key={y} onPress={() => selectCourse(y)}
                style={{ paddingVertical: 6, paddingHorizontal: 13, borderRadius: 8, backgroundColor: cursoVisible === y ? D.accent : D.card2, borderWidth: 1, borderColor: cursoVisible === y ? D.accent : D.border }}>
                <Text style={{ color: cursoVisible === y ? "#fff" : D.muted, fontSize: 12, fontWeight: cursoVisible === y ? "600" : "400" }}>Curso {academicCourseLabel(y)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>

        {!semana && (
          <View style={{ flexDirection: "row", gap: 5, marginBottom: 20 }}>
            {dias.map(d => (
              <TouchableOpacity key={d} onPress={() => setDay(d)} style={{ flex: 1, paddingVertical: 8, borderRadius: 8, alignItems: "center", backgroundColor: day === d ? D.accent : D.card2 }}>
                <Text style={{ color: day === d ? "#fff" : D.muted, fontSize: 12, fontWeight: day === d ? "600" : "400" }}>{d}</Text>
                {slotsDe(d).length > 0 && <View style={{ width: 4, height: 4, borderRadius: 2, backgroundColor: day === d ? "#fff" : D.muted, marginTop: 3 }} />}
              </TouchableOpacity>
            ))}
          </View>
        )}

        {visibles.length === 0 ? (
          <Text style={{ color: D.muted, fontSize: 13, textAlign: "center", marginTop: 30 }}>
            Sin clases este curso.{"\n"}Pulsa "+ Clase" para añadir una.
          </Text>
        ) : (
          <View>
            {/* Cabecera de días (solo en semana; en día ya está el selector) */}
            {semana && (
              <View style={{ flexDirection: "row", marginBottom: 4 }}>
                <View style={{ width: 34 }} />
                {dias.map(d => (
                  <Text key={d} style={{ flex: 1, textAlign: "center", fontSize: 11, fontWeight: d === hoy ? "700" : "500", color: d === hoy ? D.accent : D.muted }}>{d}</Text>
                ))}
              </View>
            )}

            <View style={{ flexDirection: "row" }}>
              {/* Eje de horas */}
              <View style={{ width: semana ? 34 : 42, height: altura }}>
                {horas.map((m, i) => (
                  <Text key={m} style={{ position: "absolute", top: i * PX_HORA - 6, right: 5, color: D.muted, fontSize: 9 }}>
                    {String(Math.floor(m / 60)).padStart(2, "0")}:{String(m % 60).padStart(2, "0")}
                  </Text>
                ))}
                {enRejilla && (
                  <Text style={{ position: "absolute", top: nowTop - 6, right: 3, color: "#fff", backgroundColor: D.red, borderRadius: 4, paddingHorizontal: 2, fontSize: 9, fontWeight: "700", zIndex: 4 }}>
                    {String(Math.floor(nowMin / 60)).padStart(2, "0")}:{String(nowMin % 60).padStart(2, "0")}
                  </Text>
                )}
              </View>

              {/* Una columna por día, con líneas de hora y bloques posicionados */}
              <Dias semana={semana} pager={pager} anchoDia={anchoDia} onAncho={setAnchoDia} onDay={setDay} dias={dias}>
              {dias.map(d => (
                <View key={d} style={{ ...(semana ? { flex: 1 } : { width: anchoDia }), height: altura, position: "relative" }}>
                  {horas.map((m, i) => (
                    <View key={m} style={{ position: "absolute", top: i * PX_HORA, left: 0, right: 0, height: 1, backgroundColor: D.border }} />
                  ))}

                  {/* Hora actual: un trozo por columna, sin huecos entre ellas.
                      Translúcida para no tapar la clase por la que cruza. */}
                  {enRejilla && (
                    <View pointerEvents="none" style={{ position: "absolute", top: nowTop, left: 0, right: 0, height: 2, backgroundColor: D.red + "80", zIndex: 4 }} />
                  )}

                  {slotsDe(d).map(slot => {
                    const subj = data.subjects.find(s => s.id === slot.subjectId);
                    const top = ((timeToMinutes(slot.start) - startMin) / 60) * PX_HORA;
                    const h   = Math.max(24, ((timeToMinutes(slot.end) - timeToMinutes(slot.start)) / 60) * PX_HORA);
                    const color = subj?.color || D.muted;
                    const activa = esAhora(slot);
                    return (
                      <TouchableOpacity key={slot.id} onPress={() => setEditingSlot(slot)}
                        style={{
                          position: "absolute", top, left: 2, right: 1, height: h - 3,
                          backgroundColor: color + "33", borderLeftWidth: 3, borderLeftColor: color,
                          borderRadius: 6, paddingHorizontal: semana ? 3 : 7, paddingVertical: 3,
                          justifyContent: "center", overflow: "hidden",
                          borderWidth: activa ? 1.5 : 0, borderColor: color,
                          zIndex: activa ? 2 : 1,
                        }}>
                        <Text style={{ color: D.text, fontSize: semana ? 9 : 12, fontWeight: "700", textAlign: "center" }} numberOfLines={1}>
                          {subj?.acronym || subj?.name || "?"}
                        </Text>
                        {h > 44 && !semana && (
                          <Text style={{ color: D.muted, fontSize: 10, marginTop: 1, textAlign: "center" }} numberOfLines={1}>
                            {slot.start}–{slot.end}
                          </Text>
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </View>
              ))}
              </Dias>
            </View>
          </View>
        )}

        {visibles.length > 0 && (
          <Text style={{ color: D.muted, fontSize: 11, textAlign: "center", marginTop: 16 }}>Toca una clase para editarla.</Text>
        )}
      </ScrollView>

      <ScheduleModal
        visible={editingSlot !== undefined}
        slot={editingSlot}
        subjects={activas}
        day={day}
        onClose={() => setEditingSlot(undefined)}
        onSave={saveSlot}
        onDelete={deleteSlot}
      />
    </View>
  );
}
