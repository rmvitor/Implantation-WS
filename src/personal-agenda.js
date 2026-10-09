export const PERSONAL_KINDS = {
  project: "Novo projeto",
  travel: "Viagem",
  holiday: "Feriado municipal",
  personal: "Compromisso pessoal",
};
const validDate = (value) => {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value))
    return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
};
const validTime = (value) =>
  typeof value === "string" && /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
export function validatePersonalEvent(event) {
  if (
    !event ||
    typeof event.id !== "string" ||
    !event.id ||
    typeof event.title !== "string" ||
    !event.title.trim() ||
    event.title.length > 160
  )
    throw new Error(
      "Informe um título de até 160 caracteres para o compromisso.",
    );
  if (
    typeof event.kind !== "string" ||
    !Object.hasOwn(PERSONAL_KINDS, event.kind) ||
    typeof event.tentative !== "boolean" ||
    typeof event.allDay !== "boolean"
  )
    throw new Error("Tipo ou situação do compromisso inválidos.");
  if (
    !validDate(event.date) ||
    (event.endDate !== "" && !validDate(event.endDate))
  )
    throw new Error("Informe datas válidas para início e término.");
  if (event.endDate && event.endDate < event.date)
    throw new Error("O término não pode ser anterior ao início.");
  if (
    typeof event.time !== "string" ||
    typeof event.endTime !== "string" ||
    typeof event.place !== "string" ||
    typeof event.notes !== "string" ||
    event.place.length > 160 ||
    event.notes.length > 12000
  )
    throw new Error("Horários, local ou observações inválidos.");
  if (!event.allDay) {
    if (!validTime(event.time)) throw new Error("Informe o horário de início.");
    if (event.endDate && !validTime(event.endTime))
      throw new Error("Informe os horários de início e término.");
    if (!event.endDate && event.endTime !== "")
      throw new Error("Informe a data de término antes do horário de término.");
    if (event.date === event.endDate && event.endTime <= event.time)
      throw new Error("O horário de término precisa ser posterior ao início.");
  }
  return event;
}
export function validatePersonalAgenda(events) {
  if (!Array.isArray(events)) throw new Error("Backup inválido: agenda geral.");
  const ids = new Set();
  for (const event of events) {
    validatePersonalEvent(event);
    if (ids.has(event.id))
      throw new Error(
        "Backup inválido: compromissos duplicados na agenda geral.",
      );
    ids.add(event.id);
  }
}
export function personalEventOccursOn(event, day) {
  if (!event.endDate) return event.date === day;
  return (
    event.date <= day &&
    event.endDate >= day &&
    !(
      event.allDay === false &&
      event.endTime === "00:00" &&
      event.date !== day &&
      event.endDate === day
    )
  );
}
export const personalEventUpcoming = (event, today) =>
  !event.endDate ||
  event.endDate > today ||
  personalEventOccursOn(event, today);
export function personalEventRange(event) {
  const format = (date) => date.split("-").reverse().join("/");
  if (!event.endDate)
    return `${format(event.date)}${event.allDay ? "" : ` · ${event.time}`} · Término a definir`;
  const start = format(event.date),
    end = format(event.endDate);
  if (event.allDay)
    return `${start}${event.date !== event.endDate ? ` → ${end}` : ""} · Dia inteiro`;
  return `${start} · ${event.time} → ${event.date !== event.endDate ? `${end} · ` : ""}${event.endTime}`;
}
