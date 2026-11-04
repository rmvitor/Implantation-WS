import templateUrl from "./assets/ipm-justificativa-ponto.pdf?url";
import artwork from "./assets/ipm-letterhead-clean.png";
import {
  createTimeAdjustmentPdf,
  renderTimeAdjustmentHtml,
} from "./time-adjustment-report.js";
export async function downloadTimeAdjustmentPdf(data) {
  const response = await fetch(templateUrl);
  if (!response.ok)
    throw new Error(
      "Não foi possível carregar o modelo. Tente novamente com internet.",
    );
  let bytes;
  try {
    bytes = await createTimeAdjustmentPdf(data, await response.arrayBuffer());
  } catch (error) {
    if (/WinAnsi|encode|glyph|character/i.test(error.message || ""))
      throw new Error(
        "Há um símbolo não suportado pelo PDF direto. Use Imprimir / Salvar PDF para preservar esse texto.",
      );
    throw error;
  }
  const url = URL.createObjectURL(
      new Blob([bytes], { type: "application/pdf" }),
    ),
    a = document.createElement("a");
  a.href = url;
  a.download = `ajuste-ponto-${data.occurrenceDate}-${data.employeeName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .slice(0, 60)}.pdf`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function printTimeAdjustment(data) {
  const response = await fetch(artwork);
  if (!response.ok) throw new Error("Não foi possível carregar o timbre.");
  const header = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    response.blob().then((b) => reader.readAsDataURL(b), reject);
  });
  const frame = document.createElement("iframe");
  frame.title = "Justificativa de ponto";
  Object.assign(frame.style, {
    position: "fixed",
    left: "-10000px",
    width: "1px",
    height: "1px",
    border: 0,
  });
  try {
    const loaded = new Promise((resolve, reject) => {
      frame.onload = resolve;
      frame.onerror = reject;
    });
    frame.srcdoc = renderTimeAdjustmentHtml(data, header);
    document.body.append(frame);
    await loaded;
    await frame.contentDocument.fonts.ready;
    await Promise.all([...frame.contentDocument.images].map((i) => i.decode()));
    frame.contentWindow.addEventListener("afterprint", () => frame.remove(), {
      once: true,
    });
    frame.contentWindow.focus();
    frame.contentWindow.print();
    setTimeout(() => frame.remove(), 120000);
  } catch (error) {
    frame.remove();
    throw error;
  }
}
