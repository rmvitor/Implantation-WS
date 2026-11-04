export const PUNCH_FIELDS = {
  entry: "Entrada",
  breakStart: "Intervalo",
  breakEnd: "Retorno do intervalo",
  exit: "Saída",
};
export const TIME_JUSTIFICATIONS = {
  delay:
    "Solicito o ajuste da marcação de ponto em razão de atraso, considerando o horário efetivamente realizado e informado nesta solicitação.",
  travel:
    "Solicito o ajuste da marcação de ponto em razão de deslocamento a serviço, conforme os horários informados nesta solicitação e no boletim de atividades.",
  forgotten:
    "Solicito o ajuste da marcação de ponto devido ao esquecimento da batida, conforme o horário efetivamente realizado e informado nesta solicitação.",
};
export function localTimeFields(now = new Date()) {
  const pad = (v) => String(v).padStart(2, "0");
  return {
    date: `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`,
    time: `${pad(now.getHours())}:${pad(now.getMinutes())}`,
  };
}
export function newTimeAdjustment(actor, now = new Date()) {
  const { date, time } = localTimeFields(now);
  return {
    employeeName: actor?.name || "",
    jobTitle: "Técnico de implantação",
    occurrenceDate: date,
    punches: Object.fromEntries(
      Object.keys(PUNCH_FIELDS).map((k) => [k, { selected: false, time: "" }]),
    ),
    justification: "",
    entity: "",
    contractManager: "",
    place: "",
    issuedDate: date,
    issuedTime: time,
    signerName: "",
    signerRegistration: "",
  };
}
const limits = {
  employeeName: 160,
  jobTitle: 160,
  justification: 3000,
  entity: 240,
  contractManager: 200,
  place: 200,
  signerName: 160,
  signerRegistration: 100,
};
export function validateTimeAdjustment(data) {
  if (!data || typeof data !== "object")
    throw new Error("Dados do ajuste de ponto inválidos.");
  for (const [k, max] of Object.entries(limits))
    if (typeof data[k] !== "string" || data[k].length > max)
      throw new Error("Confira os textos do ajuste de ponto.");
  for (const k of ["employeeName", "jobTitle", "justification", "place"])
    if (!data[k].trim())
      throw new Error("Informe nome, cargo, justificativa e local.");
  for (const k of ["occurrenceDate", "issuedDate"]) {
    const value = data[k],
      date = new Date(`${value}T12:00:00Z`);
    if (
      !/^\d{4}-\d{2}-\d{2}$/.test(value || "") ||
      !Number.isFinite(date.getTime()) ||
      date.toISOString().slice(0, 10) !== value
    )
      throw new Error("Informe datas válidas para a ocorrência e a emissão.");
  }
  const time = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
  if (!time.test(data.issuedTime || ""))
    throw new Error("Informe o horário de emissão.");
  if (!data.punches || Object.keys(data.punches).length !== 4)
    throw new Error("Confira as marcações do ajuste.");
  let selected = 0;
  for (const [key, label] of Object.entries(PUNCH_FIELDS)) {
    const p = data.punches[key];
    if (!p || typeof p.selected !== "boolean" || typeof p.time !== "string")
      throw new Error("Marcação inválida.");
    if (p.selected) {
      selected++;
      if (!time.test(p.time))
        throw new Error(`Informe o horário de ${label.toLowerCase()}.`);
    } else if (p.time !== "")
      throw new Error("Horário informado em uma marcação não selecionada.");
  }
  if (!selected)
    throw new Error("Selecione pelo menos uma marcação que precisa de ajuste.");
  return data;
}
export function cleanTimeAdjustment(draft) {
  const result = Object.fromEntries(
    Object.keys(limits).map((k) => [k, String(draft[k] ?? "").trim()]),
  );
  return {
    ...result,
    occurrenceDate: draft.occurrenceDate,
    issuedDate: draft.issuedDate,
    issuedTime: draft.issuedTime,
    punches: Object.fromEntries(
      Object.keys(PUNCH_FIELDS).map((k) => [
        k,
        {
          selected: draft.punches[k].selected,
          time: draft.punches[k].selected ? draft.punches[k].time : "",
        },
      ]),
    ),
  };
}
export const timeAdjustmentDate = (date) => date.split("-").reverse().join("/");
export function timeAdjustmentPlace(address) {
  const city =
    address?.city ||
    address?.town ||
    address?.village ||
    address?.municipality ||
    address?.county;
  if (!city)
    throw new Error(
      "A consulta não identificou a cidade. Digite o local manualmente.",
    );
  const region =
    address["ISO3166-2-lvl4"]?.match(/^BR-([A-Z]{2})$/)?.[1] || address.state;
  return `${city}${region ? " / " + region : ""}`.slice(0, 200);
}
export async function currentTimeAdjustmentCity(
  geolocation = navigator.geolocation,
  request = fetch,
) {
  if (!geolocation)
    throw new Error(
      "Localização indisponível neste navegador. Digite o local manualmente.",
    );
  const coords = await new Promise((resolve, reject) =>
    geolocation.getCurrentPosition(
      (p) => resolve(p.coords),
      (e) =>
        reject(
          new Error(
            e.code === 1
              ? "Permissão de localização não concedida. Digite o local manualmente."
              : "Não foi possível obter a localização. Digite o local manualmente.",
          ),
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    ),
  );
  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.search = new URLSearchParams({
    format: "jsonv2",
    lat: coords.latitude.toFixed(2),
    lon: coords.longitude.toFixed(2),
    zoom: "10",
    "accept-language": "pt-BR",
  }).toString();
  const r = await request(url.href, {
    signal: AbortSignal.timeout(10000),
    referrerPolicy: "origin",
    cache: "no-store",
    credentials: "omit",
  });
  if (!r.ok)
    throw new Error(
      "A consulta da cidade está indisponível. Digite o local manualmente.",
    );
  return timeAdjustmentPlace((await r.json()).address);
}
export const timeAdjustmentError = (e) =>
  ["PGRST202", "PGRST205", "42P01"].includes(e?.code)
    ? "Ative a rotina de ajuste de ponto no Supabase pelo SQL indicado no guia."
    : e?.code === "40001"
      ? "Este ajuste foi alterado em outro aparelho. Seu rascunho foi mantido; feche a edição e recarregue o registro antes de salvar."
      : e?.message ||
        "Não foi possível concluir. Confira a conexão e tente novamente.";
