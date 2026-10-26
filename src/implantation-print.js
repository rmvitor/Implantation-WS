import header from "./assets/ipm-letterhead-clean.png";
import { ANSWERS, implantationTemplate } from "./implantation.js";

const escape = (s = "") =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
const date = (at) =>
  new Date(at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
async function imageData(url) {
  const response = await fetch(url);
  if (!response.ok)
    throw new Error("Não foi possível carregar o timbre para o documento.");
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    response.blob().then((blob) => reader.readAsDataURL(blob), reject);
  });
}
export function renderImplantationTerm(term, artwork = { header }) {
  const s = term.snapshot;
  const people = new Map(),
    technicians = new Map();
  if (term.actorName?.trim() && term.origin !== "customer-portal")
    technicians.set(term.actorId || term.actorName, term.actorName);
  for (const entry of s.entries) {
    for (const r of entry.responsibles)
      people.set(
        JSON.stringify([
          r.name.toLocaleLowerCase("pt-BR"),
          r.role.toLocaleLowerCase("pt-BR"),
        ]),
        r,
      );
    for (const q of entry.questions) {
      if (q.technical)
        technicians.set(q.technical.actorId || q.technical.by, q.technical.by);
    }
  }
  const signatures =
    [...technicians.values()]
      .map(
        (name) =>
          `<div class="signature technical-signature"><strong>${escape(name)}</strong><span>Consultor de implantação</span><small>Assinatura do técnico</small></div>`,
      )
      .join("") +
    [...people.values()]
      .map(
        (r) =>
          `<div class="signature client-signature"><strong>${escape(r.name)}</strong><span>${escape(r.role)} · ${escape(s.entity)}</span>${r.email ? `<small>${escape(r.email)}</small>` : ""}<small>Carimbo e assinatura do responsável</small></div>`,
      )
      .join("") +
    (!technicians.size
      ? '<div class="signature technical-signature"><strong>Nome: ________________________________</strong><span>Consultor de implantação</span><small>Assinatura do técnico</small></div>'
      : "") +
    (!people.size
      ? '<div class="signature client-signature"><strong>Nome: ________________________________</strong><span>Cargo: ________________________________</span><small>Assinatura do responsável do cliente</small></div>'
      : "");
  const modules = s.entries
    .map((entry) => {
      const original = implantationTemplate(entry.module);
      const adapted =
        !original ||
        entry.questions.length !== original.questions.length ||
        entry.questions.some(
          (q, i) =>
            q.id !== original.questions[i]?.id ||
            ["text", "help", "kind", "justifyWhen", "condition"].some(
              (key) => (q[key] || "") !== (original.questions[i]?.[key] || ""),
            ),
        );
      return `<section class="module"><h1>${term.draft ? "Relatório de Homologação da Implantação" : "Homologação da Implantação"}</h1>${term.draft ? '<p class="small">Relatório em preenchimento · não constitui termo final.</p>' : ""}<p><b>Cliente:</b> ${escape(s.projectName)}${s.state ? ` / ${escape(s.state)}` : ""}<br><b>Entidade:</b> ${escape(s.entity)}<br><b>Conjunto:</b> Suprimentos &nbsp; <b>Módulo:</b> ${escape(entry.module)}<br><b>Consultor(es):</b> ${escape([...new Set([...entry.questions.map((q) => q.technical?.by), term.origin === "customer-portal" ? null : term.actorName].filter(Boolean))].join(", "))}</p><table class="people"><caption>Responsável(eis)</caption><thead><tr><th>Nome</th><th>Cargo</th><th>E-mail</th></tr></thead><tbody>${entry.responsibles.map((r) => `<tr><td>${escape(r.name)}</td><td>${escape(r.role)}</td><td>${escape(r.email)}</td></tr>`).join("")}</tbody></table><p class="small">Modelo ${escape(entry.modelVersion)}${adapted ? " · Perguntas do modelo personalizado" : " · Perguntas do modelo fornecido"}</p><ol>${entry.questions.map((q) => `<li><div class="question"><p>${escape(q.text)}</p>${q.help ? `<p class="small">${escape(q.help)}</p>` : ""}${q.condition ? `<p class="small">${escape(q.condition)}</p>` : ""}<p class="answer">${["yes", "no", "na"].map((v) => `(${q.answer === v ? "X" : " "}) ${ANSWERS[v]}`).join(" &nbsp; &nbsp; ")}</p>${q.notes ? `<p class="notes"><b>Justificativa / observações:</b> ${escape(q.notes)}</p>` : ""}${q.notUsed ? "<p><b>Dispensa justificada:</b> este ponto não será utilizado e não foi apresentado.</p>" : ""}${q.technical?.source === "imported-unverified" || q.clients.some((c) => c.source === "imported-unverified") ? '<p class="small">Registro importado · requer reconfirmação.</p>' : ""}<p class="small"><b>${q.notUsed ? "OK técnico da dispensa" : "Apresentado"}:</b> ${escape(q.technical?.by || (["no", "na"].includes(q.answer) ? "Não exigido nesta resposta" : "Ainda não confirmado"))} · ${q.technical ? escape(date(q.technical.at)) : ""}</p><p class="small"><b>Aceite do cliente:</b> ${q.clients.map((c) => `${escape(c.clientName)} (${escape(c.clientRole)}) · ${escape(date(c.at))}; ${c.origin === "customer-portal" ? (c.source === "imported-unverified" ? "registro externo importado, requer confirmação" : "confirmado pelo cliente no portal") : `registrado por ${escape(c.by)}`}`).join("<br>") || (["no", "na"].includes(q.answer) ? "Não exigido nesta resposta" : "Sem aceite registrado")}</p></div></li>`).join("")}</ol></section>`;
    })
    .join("");
  const signing = term.draft
    ? `<section class="signing report-signing"><h1>Assinaturas do relatório</h1><p><b>Cliente:</b> ${escape(s.projectName)}<br><b>Entidade:</b> ${escape(s.entity)}<br><b>Módulos:</b> ${escape(s.entries.map((e) => e.module).join(", "))}</p><p>Relatório em preenchimento · não constitui termo final.</p><p>${escape(s.projectName)}, ______ de ____________________ de __________.</p><div class="signatures">${signatures}</div></section>`
    : `<section class="signing"><h1>Termo de Homologação da Implantação</h1><p><b>Cliente:</b> ${escape(s.projectName)}<br><b>Entidade:</b> ${escape(s.entity)}<br><b>Módulos:</b> ${escape(s.entries.map((e) => e.module).join(", "))}</p><p>Os pontos aplicáveis relacionados neste documento foram apresentados e tiveram os aceites registrados conforme cada pergunta. Pontos não aplicáveis possuem justificativa; perguntas sobre impedimentos seguem o sentido de suas respostas.</p><p>${s.entries.some((e) => e.questions.some((q) => q.clients.some((c) => c.origin === "customer-portal"))) ? "Os aceites identificados como externos foram confirmados pelos próprios clientes no portal; os demais foram informados à equipe técnica." : "Os aceites foram registrados durante a reunião pela equipe técnica."} Este documento é emitido para assinatura dos participantes.</p><p class="identity">Documento ${escape(term.id)}<br>Emitido por ${escape(term.actorName)} em ${escape(date(term.at))}${term.source === "imported-unverified" ? "<br>Cópia importada — registros não reconfirmados no sistema." : ""}</p><p>${escape(s.projectName)}, ______ de ____________________ de __________.</p><div class="signatures">${signatures}<div class="signature"><strong>________________________________</strong><span>Coordenador de projetos</span></div>${s.fiscal ? `<div class="signature"><strong>${escape(s.fiscal)}</strong><span>Fiscal do contrato · Carimbo e assinatura</span></div>` : '<div class="signature"><strong>________________________________</strong><span>Fiscal do contrato · Carimbo e assinatura</span></div>'}</div></section>`;
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Homologação da implantação — ${escape(s.projectName)} — ${escape(s.entity)}</title><style>
@page { size:A4; margin:0mm 0mm 5mm; @bottom-right { content:"Página " counter(page) " de " counter(pages); vertical-align:middle; font:8pt Arial; padding-right:15mm; } }
* { box-sizing:border-box } body { margin:0; color:#111; background:#fff; font:11pt "Times New Roman",serif; line-height:1.45; overflow-wrap:anywhere; }
.letterhead-header { position:fixed; top:0; left:0; width:210mm; height:33mm; object-fit:fill; } .letterhead-footer { position:fixed; bottom:0; left:0; width:210mm; height:28mm; border:0; }
.print-frame {width:100%;table-layout:fixed;border-collapse:collapse} .print-frame>thead>tr>td,.print-frame>tfoot>tr>td,.print-frame>tbody>tr>td {border:0;padding:0} .print-frame>tbody>tr>td {padding:0 15mm} .header-space {height:37mm} .footer-space {height:36mm}
.signatures {display:grid;grid-template-columns:1fr 1fr;gap:0 12mm}.signatures .signature{width:100%;margin:17mm 0 4mm;max-width:none}
h1 { font-size:16pt; text-align:center; margin:0 0 7mm } h2 { font-size:13pt } p { margin:2mm 0; white-space:pre-wrap } .small {font-size:9pt} .people { border-collapse:collapse; width:100%; margin:6mm 0; table-layout:fixed; } .people caption {border:1px solid #111;border-bottom:0;font-weight:bold;padding:1mm} th,td {border:1px solid #111;text-align:left;padding:1.5mm} ol {padding-left:6mm} li {padding-left:1mm} .question {break-inside:avoid; margin:5mm 0 7mm} .notes {white-space:pre-wrap;border-bottom:1px solid #777;padding-bottom:3mm} .module + .module,.signing {break-before:page} .signature {break-inside:avoid;text-align:center;border-top:1px solid #222;padding:2mm;margin:10mm auto 4mm;max-width:125mm} .signature span,.signature small {display:block} .identity {margin:6mm 0;color:#444;font-size:9pt}
@media screen {body {max-width:210mm;margin:0 auto;padding:40mm 15mm 36mm;box-shadow:0 0 8px #aaa}.letterhead-header {position:absolute;top:0;left:0;right:0;margin:auto}.letterhead-footer {display:none}.module {margin-bottom:15mm}.signing{margin-top:15mm}.print-frame>tbody>tr>td{padding:0}.header-space,.footer-space{display:none}}
</style></head><body><svg class="letterhead-header" viewBox="0 128 2172 302" preserveAspectRatio="none" aria-label="IPM sistemas"><image href="${escape(artwork.header)}" width="2172" height="724" /></svg><svg class="letterhead-footer" viewBox="-100 455 2272 269" preserveAspectRatio="none" aria-label="Rodapé institucional IPM"><image href="${escape(artwork.header)}" width="2172" height="724" /></svg><table class="print-frame"><thead><tr><td><div class="header-space"></div></td></tr></thead><tfoot><tr><td><div class="footer-space"></div></td></tr></tfoot><tbody><tr><td>${modules}${signing}</td></tr></tbody></table></body></html>`;
}
export async function termDocument(term) {
  return renderImplantationTerm(term, { header: await imageData(header) });
}
export async function downloadImplantationTerm(term) {
  const html = await termDocument(term);
  const url = URL.createObjectURL(
    new Blob([html], { type: "text/html;charset=utf-8" }),
  );
  const a = document.createElement("a");
  a.href = url;
  a.download =
    `homologacao-implantacao-${term.snapshot.projectName}-${term.entity}${term.module ? `-${term.module}` : ""}-${term.id.slice(0, 8)}.html`.replace(
      /[/\\:*?"<>|]/g,
      "-",
    );
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function printImplantationTerm(term) {
  const html = await termDocument(term);
  const frame = document.createElement("iframe");
  frame.title = "Impressão do termo de homologação";
  frame.setAttribute("sandbox", "allow-same-origin allow-modals");
  Object.assign(frame.style, {
    position: "fixed",
    width: "1px",
    height: "1px",
    border: "0",
    left: "-10000px",
  });
  try {
    await new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
      frame.srcdoc = html;
      document.body.append(frame);
    });
    await frame.contentDocument.fonts.ready;
    await Promise.all(
      [...frame.contentDocument.images].map((img) => img.decode()),
    );
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {
      once: true,
    });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (e) {
    frame.remove();
    throw e;
  }
}
