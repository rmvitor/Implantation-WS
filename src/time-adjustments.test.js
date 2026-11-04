import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
import {
  newTimeAdjustment,
  cleanTimeAdjustment,
  validateTimeAdjustment,
  TIME_JUSTIFICATIONS,
  currentTimeAdjustmentCity,
} from "./time-adjustments.js";
import {
  wrapReportText,
  createTimeAdjustmentPdf,
  renderTimeAdjustmentHtml,
} from "./time-adjustment-report.js";
import {
  readLocalTimeAdjustments,
  saveLocalTimeAdjustment,
  deleteLocalTimeAdjustment,
  timeAdjustmentStorageKey,
} from "./time-adjustment-store.js";
import { availableRoute, screenRoute } from "./navigation.js";
const filled = () => {
  const d = newTimeAdjustment(
    { id: "user", name: "João Silva" },
    new Date(2026, 10, 4, 13, 25),
  );
  d.punches.entry = { selected: true, time: "00:00" };
  d.justification = TIME_JUSTIFICATIONS.forgotten;
  d.place = "São José / SC";
  return d;
};
test("ajuste é geral, inicia com funcionário/data de emissão e não preenche horas de batida", () => {
  const d = newTimeAdjustment(
    { name: "João Silva" },
    new Date(2026, 10, 4, 13, 25),
  );
  assert.equal(d.jobTitle, "Técnico de implantação");
  assert.equal(d.employeeName, "João Silva");
  assert.equal(d.issuedTime, "13:25");
  assert.equal(d.occurrenceDate, "2026-11-04");
  assert(Object.values(d.punches).every((p) => !p.selected && p.time === ""));
  assert.deepEqual(screenRoute("timeAdjustments", "project"), {
    view: "timeAdjustments",
    projectId: "",
  });
  assert.equal(
    availableRoute({ view: "timeAdjustments", projectId: "" }, []).view,
    "timeAdjustments",
  );
});
test("valida somente horários selecionados sem impor ordem de jornada; desmarcar omite horário anterior", () => {
  assert.equal(validateTimeAdjustment(filled()).punches.entry.time, "00:00");
  const d = filled();
  d.punches.entry.time = "22:00";
  d.punches.exit = { selected: true, time: "02:00" };
  validateTimeAdjustment(d);
  d.punches.breakStart = { selected: false, time: "12:00" };
  assert.equal(cleanTimeAdjustment(d).punches.breakStart.time, "");
  d.punches.entry.time = "";
  assert.throws(
    () => validateTimeAdjustment(cleanTimeAdjustment(d)),
    /horário/,
  );
  d.punches.entry = { selected: false, time: "" };
  d.punches.exit.selected = false;
  assert.throws(
    () => validateTimeAdjustment(cleanTimeAdjustment(d)),
    /pelo menos/,
  );
  const bad = filled();
  bad.occurrenceDate = "2026-02-30";
  assert.throws(() => validateTimeAdjustment(bad), /datas válidas/);
});
test("consulta localização somente quando solicitada, aproxima coordenadas e retorna só cidade/UF", async () => {
  let request;
  const geo = {
    getCurrentPosition(success) {
      success({ coords: { latitude: -27.593548, longitude: -48.558312 } });
    },
  };
  const city = await currentTimeAdjustmentCity(geo, async (url) => {
    request = new URL(url);
    return {
      ok: true,
      json: async () => ({
        address: { city: "Florianópolis", "ISO3166-2-lvl4": "BR-SC" },
      }),
    };
  });
  assert.equal(city, "Florianópolis / SC");
  assert.equal(request.searchParams.get("lat"), "-27.59");
  assert.equal(request.searchParams.get("lon"), "-48.56");
  await assert.rejects(
    currentTimeAdjustmentCity({
      getCurrentPosition(ok, fail) {
        fail({ code: 1 });
      },
    }),
    /Permissão/,
  );
});
test("histórico local pessoal conserva versões e não sobrescreve edições concorrentes", () => {
  const values = new Map(),
    storage = {
      getItem: (k) => values.get(k),
      setItem: (k, v) => values.set(k, v),
    },
    key = timeAdjustmentStorageKey("a");
  saveLocalTimeAdjustment(storage, key, "one", 0, filled());
  assert.equal(
    readLocalTimeAdjustments(storage, timeAdjustmentStorageKey("b")).length,
    0,
  );
  saveLocalTimeAdjustment(storage, key, "one", 1, {
    ...filled(),
    place: "Curitiba / PR",
  });
  assert.throws(
    () => saveLocalTimeAdjustment(storage, key, "one", 1, filled()),
    (e) => e.code === "40001",
  );
  assert.throws(
    () => deleteLocalTimeAdjustment(storage, key, "one", 1),
    (e) => e.code === "40001",
  );
  deleteLocalTimeAdjustment(storage, key, "one", 2);
  assert.equal(readLocalTimeAdjustments(storage, key).length, 0);
});
test("PDF usa modelo A4 original, pagina texto longo e HTML trata conteúdo como texto", async () => {
  const bytes = await readFile(
    new URL("./assets/ipm-justificativa-ponto.pdf", import.meta.url),
  );
  const normal = await PDFDocument.load(
    await createTimeAdjustmentPdf(filled(), bytes),
  );
  assert.equal(normal.getPageCount(), 1);
  assert.equal(Math.round(normal.getPage(0).getHeight()), 842);
  assert.equal(normal.getAuthor(), "João Silva");
  assert(normal.getCreationDate().getFullYear() > 2025);
  const long = {
    ...filled(),
    justification:
      "Atividades e horários conforme boletim, para conferência e assinatura. ".repeat(
        40,
      ),
  };
  assert(
    (
      await PDFDocument.load(await createTimeAdjustmentPdf(long, bytes))
    ).getPageCount() > 1,
  );
  const html = renderTimeAdjustmentHtml({
    ...filled(),
    justification: "<img src=x onerror=alert(1)> texto",
  });
  assert(html.includes("&lt;img"));
  assert(!html.includes("<img src=x"));
  assert(html.includes("Registro funcional"));
  assert(html.includes("00:00"));
  assert(
    wrapReportText("x".repeat(100), 10, (s) => s.length).every(
      (s) => s.length <= 10,
    ),
  );
});
