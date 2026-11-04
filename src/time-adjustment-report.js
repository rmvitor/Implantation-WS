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
export function timeAdjustmentDocuments(value) {
  const documents = Array.isArray(value) ? value : [value];
  if (!documents.length) throw new Error("Adicione pelo menos uma data.");
  return documents.map(validateTimeAdjustment);
}
const onePageError = () =>
  new Error(
    "O texto não cabe em uma folha com tamanho legível. Reduza os textos ou as linhas em branco e tente emitir novamente. Nenhuma informação foi cortada.",
  );
export async function createTimeAdjustmentPdf(value, templateBytes) {
  const documents = timeAdjustmentDocuments(value);
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
  const pdf = await PDFDocument.create(),
    base = await PDFDocument.load(templateBytes);
  const font = await pdf.embedFont(StandardFonts.Helvetica),
    bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  const x = 84,
    width = 428,
    top = 147,
    bottom = 738,
    padding = 4;
  for (const d of documents) {
    let layout;
    // Measure the entire form before drawing. Never clip or add continuation sheets.
    for (let size = 10; size >= 7.5; size -= 0.25) {
      const lineHeight = size * 1.2;
      const lines = (text, w = width - padding * 2, chosen = font) =>
        wrapReportText(text, w, (s) => chosen.widthOfTextAtSize(s, size));
      const row = (text, heading = false, minHeight = 0) => {
        const content = lines(text, width - padding * 2, heading ? bold : font);
        return {
          lines: content,
          heading,
          height: Math.max(
            minHeight,
            content.length * lineHeight + padding * 2,
          ),
        };
      };
      const rows = [
        row("FUNCIONÁRIO", true),
        row("Nome: " + d.employeeName),
        row("Cargo: " + d.jobTitle),
        row("OCORRÊNCIA", true),
        row("DATA: " + timeAdjustmentDate(d.occurrenceDate)),
        { punch: true, height: lineHeight + padding * 2, heading: true },
        ...Object.entries(PUNCH_FIELDS).map(([key, label]) => ({
          punch: true,
          label,
          point: d.punches[key],
          height: lineHeight + padding * 2,
        })),
        row("JUSTIFICATIVA (PREENCHIDO PELO CLIENTE)", true),
        row(d.justification, false, 95),
        row("Entidade contratante: " + d.entity),
        row("Gerente do contrato: " + d.contractManager),
      ];
      const location = lines(placeDate(d)),
        signer = lines(
          "Nome: " + (d.signerName || "________________________________"),
          width - 40,
        ),
        registration = lines(
          "Registro funcional: " +
            (d.signerRegistration || "________________________"),
          width - 40,
        );
      const tail =
        18 +
        location.length * lineHeight +
        12 +
        40 +
        (signer.length + registration.length) * lineHeight;
      const height = rows.reduce((sum, r) => sum + r.height, 0);
      if (height + tail <= bottom - top) {
        layout = {
          size,
          lineHeight,
          rows,
          location,
          signer,
          registration,
          height,
          tail,
        };
        break;
      }
    }
    if (!layout) throw onePageError();
    const [page] = await pdf.copyPages(base, [0]);
    pdf.addPage(page);
    page.pushOperators(
      beginText(),
      setCharacterSpacing(0),
      setWordSpacing(0),
      setCharacterSqueeze(100),
      endText(),
    );
    // Preserve the original IPM header, title and footer; rebuild the form in its body area.
    page.drawRectangle({
      x: 80,
      y: page.getHeight() - 746,
      width: 437,
      height: 604,
      color: rgb(1, 1, 1),
    });
    const { size, lineHeight } = layout;
    const write = (text, left, y, chosen = font) =>
      page.drawText(text, {
        x: left,
        y: page.getHeight() - y - size,
        size,
        font: chosen,
        color: rgb(0, 0, 0),
      });
    let y = top;
    for (const row of layout.rows) {
      page.drawRectangle({
        x,
        y: page.getHeight() - y - row.height,
        width,
        height: row.height,
        color: row.heading ? rgb(0.9, 0.9, 0.9) : rgb(1, 1, 1),
        borderColor: rgb(0, 0, 0),
        borderWidth: 0.5,
      });
      if (row.punch) {
        const middle = x + width * 0.52;
        page.drawLine({
          start: { x: middle, y: page.getHeight() - y },
          end: { x: middle, y: page.getHeight() - y - row.height },
          thickness: 0.5,
          color: rgb(0, 0, 0),
        });
        write(
          row.heading
            ? "Ausência de registro"
            : `(${row.point.selected ? "X" : " "}) ${row.label}`,
          x + padding,
          y + padding,
          row.heading ? bold : font,
        );
        write(
          row.heading
            ? "Horário não registrado"
            : row.point.selected
              ? row.point.time
              : "____:____",
          middle + padding,
          y + padding,
          row.heading ? bold : font,
        );
      } else
        row.lines.forEach((line, i) =>
          write(
            line,
            x + padding,
            y + padding + i * lineHeight,
            row.heading ? bold : font,
          ),
        );
      y += row.height;
    }
    y += 18;
    layout.location.forEach((line, i) =>
      write(line, x + padding, y + i * lineHeight),
    );
    y += layout.location.length * lineHeight;
    write("Local e data", x + width / 2 - 25, y);
    y += 12 + 35;
    // Keep generous signature space even with a short justification.
    y = Math.max(
      y,
      Math.min(
        697,
        bottom -
          5 -
          (layout.signer.length + layout.registration.length) * lineHeight,
      ),
    );
    page.drawLine({
      start: { x: x + 20, y: page.getHeight() - y },
      end: { x: x + width - 20, y: page.getHeight() - y },
      thickness: 0.5,
      color: rgb(0, 0, 0),
    });
    y += 5;
    [...layout.signer, ...layout.registration].forEach((line, i) =>
      write(line, x + 20, y + i * lineHeight),
    );
  }
  pdf.setCreationDate(new Date());
  pdf.setModificationDate(new Date());
  pdf.setTitle("Justificativa de ponto — " + documents[0].employeeName);
  pdf.setAuthor(documents[0].employeeName);
  pdf.setSubject("Solicitação de ajuste para assinatura");
  pdf.setCreator("Implanta");
  return pdf.save();
}
export function renderTimeAdjustmentHtml(value, header = "") {
  const documents = timeAdjustmentDocuments(value),
    e = escape;
  const sheets = documents
    .map(
      (d) =>
        `<section class="sheet"><div class="art"><img src="${e(header)}" alt="IPM sistemas"></div><h1>JUSTIFICATIVA DE AUSÊNCIA DE PONTO ELETRÔNICO - Dream</h1><div class="content"><table><tbody><tr><th colspan="2">FUNCIONÁRIO</th></tr><tr><td colspan="2"><b>Nome:</b> ${e(d.employeeName)}</td></tr><tr><td colspan="2"><b>Cargo:</b> ${e(d.jobTitle)}</td></tr><tr><th colspan="2">OCORRÊNCIA</th></tr><tr><td colspan="2"><b>DATA:</b> ${e(timeAdjustmentDate(d.occurrenceDate))}</td></tr><tr><td>Ausência de registro</td><td>Horário não registrado</td></tr>${Object.entries(
          PUNCH_FIELDS,
        )
          .map(
            ([key, label]) =>
              `<tr><td>(${d.punches[key].selected ? "X" : " "}) ${e(label)}</td><td>${d.punches[key].selected ? e(d.punches[key].time) : "____:____"}</td></tr>`,
          )
          .join(
            "",
          )}<tr><th colspan="2">JUSTIFICATIVA (PREENCHIDO PELO CLIENTE)</th></tr><tr><td colspan="2" class="note">${e(d.justification)}</td></tr><tr><td colspan="2"><b>Entidade contratante:</b> ${e(d.entity)}</td></tr><tr><td colspan="2"><b>Gerente do contrato:</b> ${e(d.contractManager)}</td></tr></tbody></table><div class="location">${e(placeDate(d))}<div class="label">Local e data</div></div><div class="signature"><div class="sign-line"></div><div>Nome: ${e(d.signerName || "________________________________")}</div><div>Registro funcional: ${e(d.signerRegistration || "________________________")}</div></div></div></section>`,
    )
    .join("");
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Justificativa de ponto — ${e(documents[0].employeeName)}</title><style>@page{size:A4;margin:12mm 18mm}*{box-sizing:border-box}body{font:10pt Arial;color:#111;background:white;margin:0;overflow-wrap:anywhere;line-height:1.2}.sheet{height:272mm;break-after:page;display:flex;flex-direction:column}.sheet:last-child{break-after:auto}.art{height:24mm;margin-bottom:5mm;overflow:hidden;flex-shrink:0}.art img{width:100%;height:auto;transform:translateY(-16mm)}h1{font-size:12pt;text-align:center;margin:0 0 6mm;flex-shrink:0}.content{flex:1;min-height:0}table{border-collapse:collapse;width:100%;table-layout:fixed}th,td{border:1px solid #111;text-align:left;padding:1.6mm;white-space:pre-wrap}th{background:#eee;text-align:center}.note{height:32mm;vertical-align:top}.signature{margin:12mm 8mm 0;white-space:pre-wrap}.sign-line{border-top:1px solid #111;margin-bottom:2mm}.location{text-align:center;margin-top:5mm;white-space:pre-wrap}.label{font-size:.85em;color:#444}@media screen{body{width:174mm;margin:20px auto}.sheet{outline:1px solid #ddd;margin-bottom:20px}}</style></head><body>${sheets}</body></html>`;
}
// Measure real browser fonts (including Unicode) before printing each fixed A4 sheet.
export function fitTimeAdjustmentPrint(doc) {
  for (const content of doc.querySelectorAll(".content")) {
    let fits = false;
    for (let size = 10; size >= 7.5; size -= 0.25) {
      content.style.fontSize = size + "pt";
      if (content.scrollHeight <= content.clientHeight) {
        fits = true;
        break;
      }
    }
    if (!fits) throw onePageError();
  }
}
