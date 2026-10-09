export const APPOINTMENT_TYPES = {
  treinamento: "Treinamento",
  atendimento: "Atendimento remoto",
};
export const appointmentType = (event) => event.type || "treinamento";
export const appointmentLabel = (event) =>
  APPOINTMENT_TYPES[appointmentType(event)] || "Treinamento";

// These are local calendar fields, not UTC instants. UTC arithmetic keeps
// wall-clock dates stable across machines and daylight-saving boundaries.
const minute = (date, time) => {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(date || "") ||
    !/^\d{2}:\d{2}$/.test(time || "")
  )
    return NaN;
  const [y, m, d] = date.split("-").map(Number),
    [h, n] = time.split(":").map(Number);
  const value = Date.UTC(y, m - 1, d, h, n),
    parsed = new Date(value);
  return parsed.getUTCFullYear() === y &&
    parsed.getUTCMonth() === m - 1 &&
    parsed.getUTCDate() === d &&
    h < 24 &&
    n < 60
    ? value / 60000
    : NaN;
};
const fields = (minutes) => {
  const value = new Date(minutes * 60000),
    pad = (n) => String(n).padStart(2, "0");
  return {
    endDate: `${value.getUTCFullYear()}-${pad(value.getUTCMonth() + 1)}-${pad(value.getUTCDate())}`,
    endTime: `${pad(value.getUTCHours())}:${pad(value.getUTCMinutes())}`,
  };
};
export function appointmentEnd(event) {
  if (event.endDate && event.endTime)
    return { endDate: event.endDate, endTime: event.endTime };
  // Infer old end times only from recognized durations. Preserve unknown
  // legacy durations instead of assigning a made-up end to existing records.
  const duration = String(event.duration || "")
    .trim()
    .match(/^(?:(\d+)\s*h)?\s*(?:(\d+)\s*(?:min|m))?$/i);
  const compact = String(event.duration || "")
    .trim()
    .match(/^(\d+)\s*h\s*(\d+)$/i);
  const parsed = duration || compact;
  const minutes = parsed
    ? Number(parsed[1] || 0) * 60 + Number(parsed[2] || 0)
    : 0;
  const start = minute(event.date, event.time);
  return minutes > 0 && Number.isFinite(start)
    ? fields(start + minutes)
    : { endDate: event.date, endTime: "" };
}
export function appointmentOccursOn(event, date) {
  const end = appointmentEnd(event);
  return (
    event.date <= date &&
    end.endDate >= date &&
    !(date === end.endDate && end.endTime === "00:00" && event.date !== date)
  );
}
export const appointmentHasUpcomingDays = (event, today) => {
  const end = appointmentEnd(event);
  return (
    event.status !== "Realizado" &&
    (end.endDate > today || appointmentOccursOn(event, today))
  );
};
export const appointmentTimeOn = (event, date) =>
  date === event.date ? event.time : "00:00";
export function appointmentDuration(event) {
  const end = appointmentEnd(event),
    difference =
      minute(end.endDate, end.endTime) - minute(event.date, event.time);
  if (!Number.isFinite(difference) || difference <= 0)
    return event.duration || "Término não informado";
  const days = Math.floor(difference / 1440),
    hours = Math.floor((difference % 1440) / 60),
    minutes = difference % 60;
  return [
    days ? `${days}d` : "",
    hours ? `${hours}h` : "",
    minutes ? `${minutes}min` : "",
  ]
    .filter(Boolean)
    .join(" ");
}
export function appointmentRange(event) {
  const end = appointmentEnd(event);
  const format = (date) =>
    /^\d{4}-\d{2}-\d{2}$/.test(date || "")
      ? date.split("-").reverse().join("/")
      : date;
  const start = `${format(event.date)} · ${event.time || "Sem hora"}`;
  return end.endTime
    ? `${start} → ${end.endDate === event.date ? end.endTime : `${format(end.endDate)} · ${end.endTime}`}`
    : `${start} · ${event.duration || "Término não informado"}`;
}
export function validateAppointment(event, requireEnd = false) {
  if (
    !event ||
    typeof event.id !== "string" ||
    typeof event.title !== "string" ||
    (requireEnd && !event.title.trim())
  )
    throw new Error("Informe um título para o treinamento/atendimento.");
  if (event.type !== undefined && !Object.hasOwn(APPOINTMENT_TYPES, event.type))
    throw new Error("Tipo de treinamento/atendimento inválido.");
  if (event.meetingUrl !== undefined && typeof event.meetingUrl !== "string")
    throw new Error("Link da sala inválido.");
  if (event.meetingUrl) {
    let url;
    try {
      url = new URL(event.meetingUrl);
    } catch {
      throw new Error("Informe um link HTTP ou HTTPS válido para a sala.");
    }
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password
    )
      throw new Error("Informe um link HTTP ou HTTPS válido para a sala.");
  }
  if (
    requireEnd ||
    event.endDate !== undefined ||
    event.endTime !== undefined
  ) {
    const start = minute(event.date, event.time),
      end = minute(event.endDate, event.endTime);
    if (!Number.isFinite(start) || !Number.isFinite(end))
      throw new Error("Informe as datas e os horários de início e término.");
    if (end <= start)
      throw new Error("O término precisa ser posterior ao início.");
  }
  return event;
}
