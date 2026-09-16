import React, { useState } from "react";
import { Text, TouchableOpacity, Platform } from "react-native";
import DateTimePicker from "@react-native-community/datetimepicker";
import { D, campo } from "../theme";

// ═══════════════════════════════════════════════════════════════════════════════
// Campos de fecha y hora con el selector nativo del sistema.
//
// Las fechas se manejan como texto ("2027-01-15", "09:45") porque es el formato
// que ya usan los datos y el que viaja a la base de datos. La conversión a Date
// se hace solo para abrir el selector, y se construye con año/mes/día locales
// para que no se desplace un día por la zona horaria.
// ═══════════════════════════════════════════════════════════════════════════════

const pad = n => String(n).padStart(2, "0");

function parseDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return new Date();
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}
const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function parseTime(str) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(str || "");
  const d = new Date();
  d.setSeconds(0, 0);
  if (m) d.setHours(Number(m[1]), Number(m[2]));
  return d;
}
const fmtTimeHM = d => `${pad(d.getHours())}:${pad(d.getMinutes())}`;

// Texto legible: "15 ene 2027"
const MESES = ["ene","feb","mar","abr","may","jun","jul","ago","sep","oct","nov","dic"];
function etiquetaFecha(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(str || "");
  if (!m) return "Elegir fecha";
  return `${Number(m[3])} ${MESES[Number(m[2]) - 1]} ${m[1]}`;
}

export function DateField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={campo()}>
        <Text style={{ color: value ? D.text : D.muted, fontSize: 15 }}>{etiquetaFecha(value)}</Text>
        <Text style={{ fontSize: 15 }}>📅</Text>
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={parseDate(value)}
          mode="date"
          display={Platform.OS === "ios" ? "inline" : "default"}
          onChange={(e, d) => {
            // En Android el diálogo se cierra solo; en iOS hay que cerrarlo aquí
            setOpen(Platform.OS === "ios" ? e.type !== "set" && e.type !== "dismissed" : false);
            if (e.type !== "dismissed" && d) onChange(fmtDate(d));
          }}
        />
      )}
    </>
  );
}

export function TimeField({ value, onChange }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <TouchableOpacity onPress={() => setOpen(true)} style={campo()}>
        <Text style={{ color: value ? D.text : D.muted, fontSize: 15 }}>{value || "--:--"}</Text>
        <Text style={{ fontSize: 15 }}>🕒</Text>
      </TouchableOpacity>
      {open && (
        <DateTimePicker
          value={parseTime(value)}
          mode="time"
          is24Hour
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={(e, d) => {
            setOpen(Platform.OS === "ios" ? e.type !== "set" && e.type !== "dismissed" : false);
            if (e.type !== "dismissed" && d) onChange(fmtTimeHM(d));
          }}
        />
      )}
    </>
  );
}

