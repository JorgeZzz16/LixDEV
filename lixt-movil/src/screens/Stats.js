import React, { useState, useMemo } from "react";
import { View, Text, ScrollView, TouchableOpacity, RefreshControl } from "react-native";
import { fmtTime, academicCoursesOf, academicCourseOf, courseRange, weightedAverage, gradeColor, fmtGrade, today, fmtDate } from "../logic";

// Fecha de hace N días, en hora LOCAL. Con `toISOString()` esto daba la fecha UTC,
// que entre las 00:00 y las 02:00 en España va un día por detrás (mismo motivo por
// el que `today()` no puede ser toISOString: ver logic.js).
const daysAgo = n => { const d = new Date(); d.setDate(d.getDate() - n); return fmtDate(d); };
import { D } from "../theme";

const PERIODS = [["global","Global"],["last7","7 días"],["last30","30 días"],["week","Semana"],["month","Mes"]];

export default function Stats({ data, sync, syncing }) {
  // Siempre se entra en el curso académico en el que estás ahora (sep–ago). El
  // periodo elegido NO se recuerda entre sesiones a propósito: lo normal es
  // querer ver el curso en marcha, no el "Global" que dejaste puesto una vez.
  const [period, setPeriod] = useState("course_" + academicCourseOf(today()));
  const selectPeriod = setPeriod;

  const academicCourses = useMemo(
    () => [...new Set([...academicCoursesOf(data.sessions), academicCourseOf(today())])].sort((a, b) => b - a),
    [data.sessions]);

  const filtered = useMemo(() => {
    const now = new Date(), todayStr = today();
    if (period === "global") return data.sessions;
    if (period === "last7" || period === "last30") {
      // 7 y 30 días CONTANDO hoy, como en el PC: antes cogía uno de más
      const fromStr = daysAgo(period === "last7" ? 6 : 29);
      return data.sessions.filter(s => s.date >= fromStr && s.date <= todayStr);
    }
    if (period === "week") {
      const from = daysAgo((now.getDay() + 6) % 7);
      return data.sessions.filter(s => s.date >= from);
    }
    if (period === "month") {
      const from = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
      return data.sessions.filter(s => s.date >= from);
    }
    if (period.startsWith("course_")) {
      const [from, to] = courseRange(parseInt(period.replace("course_", "")));
      return data.sessions.filter(s => s.date >= from && s.date <= to);
    }
    return data.sessions;
  }, [data.sessions, period]);

  const totalMin = filtered.reduce((a, s) => a + s.minutes, 0);
  const bySubject = data.subjects
    .map(s => ({ ...s, minutes: filtered.filter(x => x.subjectId === s.id).reduce((a, b) => a + b.minutes, 0) }))
    .filter(s => s.minutes > 0)
    .sort((a, b) => b.minutes - a.minutes);
  const maxMin = Math.max(...bySubject.map(s => s.minutes), 1);

  const media = weightedAverage(data.tasks, data.subjects);

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: D.bg }}
      contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={syncing} onRefresh={() => sync()} tintColor={D.muted} />}
    >
      <Text style={{ color: D.text, fontSize: 22, fontWeight: "700", marginBottom: 14 }}>Estadísticas</Text>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 8 }}>
        <View style={{ flexDirection: "row", gap: 6 }}>
          {PERIODS.map(([k, l]) => (
            <TouchableOpacity key={k} onPress={() => selectPeriod(k)} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: period === k ? D.accent : D.card2 }}>
              <Text style={{ color: period === k ? "#fff" : D.muted, fontSize: 12, fontWeight: period === k ? "600" : "400" }}>{l}</Text>
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>

      {academicCourses.length > 0 && (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 18 }}>
          <View style={{ flexDirection: "row", gap: 6 }}>
            {academicCourses.map(y => (
              <TouchableOpacity key={y} onPress={() => selectPeriod("course_" + y)} style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 8, backgroundColor: period === "course_" + y ? D.accent : D.card2 }}>
                <Text style={{ color: period === "course_" + y ? "#fff" : D.muted, fontSize: 12 }}>{y}/{String(y + 1).slice(2)}</Text>
              </TouchableOpacity>
            ))}
          </View>
        </ScrollView>
      )}

      <View style={{ flexDirection: "row", gap: 10, marginBottom: 20 }}>
        <StatBox label="Tiempo" value={fmtTime(totalMin)} color={D.accent} />
        <StatBox label="Sesiones" value={String(filtered.length)} />
      </View>

      <Text style={{ color: D.muted, fontSize: 13, fontWeight: "500", marginBottom: 10 }}>Tiempo por asignatura</Text>
      {bySubject.length === 0 && <Text style={{ color: D.muted, fontSize: 12, marginBottom: 20 }}>Sin sesiones en este periodo.</Text>}
      {bySubject.map(s => (
        <View key={s.id} style={{ marginBottom: 10 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
            <Text style={{ color: D.text, fontSize: 12 }} numberOfLines={1}>{s.acronym || s.name}</Text>
            <Text style={{ color: D.muted, fontSize: 12 }}>{fmtTime(s.minutes)}</Text>
          </View>
          <View style={{ height: 6, borderRadius: 3, backgroundColor: D.card2, overflow: "hidden" }}>
            <View style={{ height: "100%", width: `${(s.minutes / maxMin) * 100}%`, backgroundColor: s.color, borderRadius: 3 }} />
          </View>
        </View>
      ))}

      <View style={{ marginTop: 20, backgroundColor: D.card, borderRadius: 12, borderWidth: 1, borderColor: D.border, padding: 16 }}>
        <Text style={{ color: D.muted, fontSize: 12, marginBottom: 4 }}>Nota media ponderada</Text>
        <Text style={{ color: media !== null ? gradeColor(media) : D.muted, fontSize: 24, fontWeight: "700" }}>
          {fmtGrade(media)}
        </Text>
      </View>
    </ScrollView>
  );
}

function StatBox({ label, value, color }) {
  return (
    <View style={{ flex: 1, backgroundColor: D.card, borderRadius: 12, borderWidth: 1, borderColor: D.border, padding: 14 }}>
      <Text style={{ color: D.muted, fontSize: 11 }}>{label}</Text>
      <Text style={{ color: color || D.text, fontSize: 20, fontWeight: "700", marginTop: 2 }}>{value}</Text>
    </View>
  );
}
