import {
  PUNCH_FIELDS,
  validateTimeAdjustment,
  timeAdjustmentDate,
} from "./time-adjustments.js";
const escape = (s) =>
  String(s ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const placeDate = (d) =>
  `${d.place}, ${new Date(d.issuedDate + "T12:00:00").toLocaleDateString("pt-BR", { day: "numeric", month: "long", year: "numeric" })} às ${d.issuedTime}.`;
// Split long words too, so e-mails/identifiers cannot overflow their box.
export function wrapReportText(text, width, measure) {
  const lines = [];
  for (const paragraph of String(text).split(/\r?\n/)) {
    let line = "";
    for (const word of paragraph.trim().split(/\s+/).filter(Boolean)) {
      const candidate = line ? line + " " + word : word;
      if (measure(candidate) <= width) {
        line = candidate;
        continue;
      }
      if (line) {
        lines.push(line);
        line = "";
      }
      for (const letter of word) {
        if (line && measure(line + letter) > width) {
          lines.push(line);
          line = "";
        }
        line += letter;
      }
    }
    lines.push(line);
  }
  return lines;
}
export async function createTimeAdjustmentPdf(data, templateBytes) {
  validateTimeAdjustment(data);
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    beginText,
    endText,
    setCharacterSpacing,
    setWordSpacing,
    setCharacterSqueeze,
  } = await import("pdf-lib");
  const pdf = await PDFDocument.load(templateBytes);
  const base = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const extras = [];
  const write = (page, text, x, top, size = 10, chosen = font) =>
    page.drawText(text, {
      x,
      y: page.getHeight() - top - size,
      size,
      font: chosen,
      color: rgb(0, 0, 0),
    });
  const white = (page, x, top, width, height) =>
    page.drawRectangle({
      x,
      y: page.getHeight() - top - height,
      width,
      height,
      color: rgb(1, 1, 1),
    });
  const box = (page, value, x, top, width, height, label) => {
    if (!value) return;
    let size = 10,
      lines;
    while (size >= 7.5) {
      lines = wrapReportText(value, width, (s) =>
        font.widthOfTextAtSize(s, size),
      );
      if (lines.length * size * 1.2 <= height) break;
      size -= 0.5;
    }
    if (size < 7.5) {
      extras.push(label + ": " + value);
      write(page, "Ver complemento ao final do documento.", x, top, 8);
      return;
    }
    lines.forEach((line, i) =>
      write(page, line, x, top + i * size * 1.2, size),
    );
  };
  const noteLines = wrapReportText(data.justification, 414, (s) =>
    font.widthOfTextAtSize(s, 10),
  );
  const perPage = 9,
    total = Math.max(1, Math.ceil(noteLines.length / perPage));
  for (let n = 0; n < total; n++) {
    const page = n === 0 ? pdf.getPage(0) : (await pdf.copyPages(base, [0]))[0];
    if (n) pdf.addPage(page);
    page.pushOperators(
      beginText(),
      setCharacterSpacing(0),
      setWordSpacing(0),
      setCharacterSqueeze(100),
      endText(),
    );
    box(page, data.employeeName, 132, 182, 375, 23, "Nome do funcionário");
    box(page, data.jobTitle, 132, 212, 375, 23, "Cargo");
    white(page, 85.5, 266.3, 425, 13.6);
    write(
      page,
      "DATA: " + timeAdjustmentDate(data.occurrenceDate),
      88,
      267,
      10,
    );
    Object.entries(PUNCH_FIELDS).forEach(([key], i) => {
      const point = data.punches[key];
      if (point.selected) {
        write(page, "X", 96, 295 + i * 15, 10);
        white(page, 360, 296 + i * 15, 75, 13.9);
        write(page, point.time, 378, 295 + i * 15, 10);
      }
    });
    noteLines
      .slice(n * perPage, (n + 1) * perPage)
      .forEach((line, i) => write(page, line, 90, 389 + i * 14, 10));
    box(page, data.entity, 215, 535, 291, 24, "Entidade contratante");
    box(page, data.contractManager, 210, 565, 296, 24, "Gerente do contrato");
    white(page, 89, 621, 420, 16);
    box(
      page,
      placeDate(data),
      91,
      623,
      415,
      12,
      "Local, data e hora de emissão",
    );
    box(
      page,
      data.signerName,
      192,
      705,
      251,
      14,
      "Nome do responsável pela assinatura",
    );
    box(
      page,
      data.signerRegistration,
      258,
      719,
      187,
      14,
      "Registro funcional do responsável",
    );
    if (total > 1)
      write(page, `Justificativa: página ${n + 1} de ${total}`, 88, 136, 7);
  }
  if (extras.length) {
    const text = [...new Set(extras)].join("\n\n"),
      lines = wrapReportText(text, 480, (s) => font.widthOfTextAtSize(s, 10));
    for (let start = 0; start < lines.length; start += 51) {
      const page = pdf.addPage([595.22, 842]);
      write(page, "Complemento da justificativa de ponto", 55, 45, 15, bold);
      write(
        page,
        "Ocorrência: " + timeAdjustmentDate(data.occurrenceDate),
        55,
        73,
        10,
      );
      lines
        .slice(start, start + 51)
        .forEach((line, i) => write(page, line, 55, 105 + i * 13, 10));
    }
  }
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());
  pdf.setTitle("Justificativa de ponto — " + data.employeeName);
  pdf.setAuthor(data.employeeName);
  pdf.setSubject("Solicitação de ajuste para assinatura");
  pdf.setCreator("Implanta");
  return pdf.save();
}
export function renderTimeAdjustmentHtml(d, header = "") {
  validateTimeAdjustment(d);
  const e = escape;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Justificativa de ponto — ${e(d.employeeName)}</title><style>@page{size:A4;margin:12mm 18mm}*{box-sizing:border-box}body{font:11pt Arial;color:#111;background:white;margin:0;overflow-wrap:anywhere;line-height:1.45}.art{height:25mm;margin-bottom:7mm;overflow:hidden}.art img{width:100%;height:auto;transform:translateY(-16mm)}h1{font-size:13pt;text-align:center;margin:0 0 6mm}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #111;text-align:left;padding:2mm;white-space:pre-wrap}th{background:#f2f2f2;text-align:center}thead{display:table-header-group}.note{min-height:50mm;white-space:pre-wrap;padding:3mm;border:1px solid #111;border-top:0}.details{margin:0}p{margin:3mm 0}.signature{margin:17mm 12mm 3mm;break-inside:avoid}.sign-line{border-top:1px solid #111;margin-bottom:2mm}.location{text-align:center;margin-top:10mm;break-inside:avoid}.label{font-size:9pt;color:#444}tr{break-inside:avoid}@media screen{body{max-width:210mm;margin:20px auto;padding:12mm;border:1px solid #ddd}}</style></head><body><div class="art"><img src="${e(header)}" alt="IPM sistemas"></div><h1>JUSTIFICATIVA DE AUSÊNCIA DE PONTO ELETRÔNICO - Dream</h1><table><tbody><tr><th colspan="2">FUNCIONÁRIO</th></tr><tr><td colspan="2"><b>Nome:</b> ${e(d.employeeName)}</td></tr><tr><td colspan="2"><b>Cargo:</b> ${e(d.jobTitle)}</td></tr><tr><th colspan="2">OCORRÊNCIA</th></tr><tr><td colspan="2"><b>DATA:</b> ${e(timeAdjustmentDate(d.occurrenceDate))}</td></tr><tr><td>Ausência de registro</td><td>Horário de ponto não registrado</td></tr>${Object.entries(
    PUNCH_FIELDS,
  )
    .map(
      ([key, label]) =>
        `<tr><td>(${d.punches[key].selected ? "X" : " "}) ${e(label)}</td><td>${d.punches[key].selected ? e(d.punches[key].time) : "____:____"}</td></tr>`,
    )
    .join(
      "",
    )}<tr><th colspan="2">JUSTIFICATIVA (PREENCHIDO PELO CLIENTE)</th></tr></tbody></table><div class="note">${e(d.justification)}</div><table class="details"><tbody><tr><td><b>Entidade contratante:</b> ${e(d.entity)}</td></tr><tr><td><b>Gerente do contrato:</b> ${e(d.contractManager)}</td></tr></tbody></table><div class="location">${e(placeDate(d))}<div class="label">Local e data</div></div><div class="signature"><div class="sign-line"></div><div>Nome: ${e(d.signerName || "________________________________")}</div><div>Registro funcional: ${e(d.signerRegistration || "________________________")}</div></div></body></html>`;
}
