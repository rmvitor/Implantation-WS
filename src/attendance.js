export const attendanceTokenValid = (token) =>
  /^[a-f0-9]{64}$/.test(token || "");
export function attendanceUrl(token, base = location.href) {
  if (!attendanceTokenValid(token))
    throw new Error("Link de presença inválido.");
  const url = new URL("./", base);
  url.searchParams.set("presenca", token);
  return url.href;
}
export const attendanceDate = (value) =>
  value ? value.split("-").reverse().join("/") : "";
export function newAttendance(project, actor, training) {
  return {
    title: training?.title || "",
    entity: training?.entity || project.entities?.[0] || "",
    city: project.name || "",
    state: project.state || "",
    system: "Atende.Net",
    module: training?.module || "",
    submodules: "",
    instructor: training?.owner || actor?.name || "",
    hours: training?.duration || "",
    date: training?.date || new Date().toLocaleDateString("en-CA"),
    trainingId: training?.id || "",
  };
}
export function attendanceError(error) {
  if (["PGRST202", "PGRST205", "42P01"].includes(error?.code))
    return "A lista de presença ainda precisa ser ativada no Supabase. Execute o SQL indicado no guia de ativação.";
  if (error?.code === "40001")
    return "Este registro foi alterado por outra pessoa. Atualize os dados antes de tentar novamente; seu formulário foi mantido.";
  if (error?.code === "23505")
    return "Participante já registrado. Confira o e-mail ou atualize a lista.";
  if (/fetch|network|offline/i.test(error?.message || ""))
    return "Não foi possível conectar. Seus dados foram mantidos; tente novamente com internet.";
  return error?.message || "Não foi possível concluir. Tente novamente.";
}
export const attendanceGuide =
  "https://github.com/rmvitor/Implantation-WS/blob/main/docs/lista-presenca.md";
export const escapeAttendance = (s = "") =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
// CPF is already masked by the server for regular reads. Never derive full CPF here.
export function renderAttendanceReport(
  list,
  people,
  { blank = false, header = "" } = {},
) {
  const d = list.data,
    e = escapeAttendance;
  const rows = blank ? Array.from({ length: 14 }, () => ({})) : people;
  const chunks = Array.from(
    { length: Math.max(1, Math.ceil(rows.length / 14)) },
    (_, i) => rows.slice(i * 14, i * 14 + 14),
  );
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Lista de presença — ${e(d.title)}</title><style>
  @page{size:A4 landscape;margin:8mm 10mm 12mm;@bottom-right{content:"Página " counter(page) " de " counter(pages);font:8pt Arial}}*{box-sizing:border-box}body{color:#111;background:#fff;font:9pt Arial;margin:0;overflow-wrap:anywhere}.sheet{break-after:page}.sheet:last-child{break-after:auto}.letterhead{width:100%;height:18mm;object-fit:contain;object-position:left center}h1{text-align:center;font-size:14pt;margin:1mm 0 3mm}p{margin:1mm 0}table{width:100%;border-collapse:collapse;table-layout:fixed;margin-top:4mm}th,td{border:1px solid #666;padding:1.5mm;text-align:left;vertical-align:middle}td{height:6.5mm}tr{break-inside:avoid}th:nth-child(1){width:4%}th:nth-child(2){width:22%}th:nth-child(3){width:13%}th:nth-child(4){width:14%}th:nth-child(5){width:22%}th:nth-child(6){width:25%}.note{font-size:8pt;color:#444;margin-top:3mm}.instructor{margin:8mm auto 2mm;text-align:center;max-width:100mm;border-top:1px solid #555;padding-top:2mm}@media screen{body{padding:12mm;max-width:297mm;margin:auto}.sheet{margin-bottom:12mm}}
  </style></head><body>${chunks.map((chunk, index) => `<section class="sheet">${header ? `<img class="letterhead" src="${e(header)}" alt="IPM sistemas">` : ""}<h1>Treinamento — Lista de presença</h1><p><b>Entidade:</b> ${e(d.entity)} &nbsp; <b>Cidade:</b> ${e(d.city)} &nbsp; <b>UF:</b> ${e(d.state)}</p><p><b>Treinamento:</b> ${e(d.title)}</p><p><b>Sistema:</b> ${e(d.system)} &nbsp; <b>Módulo:</b> ${e(d.module)}<br><b>Submódulos:</b> ${e(d.submodules)}</p><p><b>Instrutor:</b> ${e(d.instructor)} &nbsp; <b>Carga horária:</b> ${e(d.hours)} &nbsp; <b>Data:</b> ${e(attendanceDate(d.date))}</p><table><thead><tr><th>Nº</th><th>Nome completo</th><th>CPF</th><th>Setor</th><th>E-mail</th><th>Assinatura</th></tr></thead><tbody>${chunk.map((p, i) => `<tr><td>${String(index * 14 + i + 1).padStart(2, "0")}</td><td>${e(p.name)}</td><td>${e(p.cpf)}</td><td>${e(p.sector)}</td><td>${e(p.email)}</td><td></td></tr>`).join("")}</tbody></table><p class="note">${blank ? "Lista para preenchimento e assinatura presencial." : "Confirmação no formulário é autodeclaração de participação; não substitui a assinatura nesta lista. CPF omitido ou mascarado, salvo emissão restrita pelo Master."}</p><div class="instructor">${e(d.instructor)} — Assinatura do instrutor</div></section>`).join("")}</body></html>`;
}
