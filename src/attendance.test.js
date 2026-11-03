import { test } from "node:test";
import assert from "node:assert/strict";
import {
  attendanceUrl,
  attendanceRequiredFields,
  attendanceTokenValid,
  newAttendance,
  renderAttendanceReport,
} from "./attendance.js";
import { availableRoute } from "./navigation.js";
test("link de presença fica fora de sessão e parâmetros de outras áreas", () => {
  const token = "a".repeat(64);
  const url = attendanceUrl(
    token,
    "https://example.invalid/Implantation-WS/?aceite=old#access_token=secret",
  );
  assert.equal(
    url,
    `https://example.invalid/Implantation-WS/?presenca=${token}`,
  );
  assert(!attendanceTokenValid("../bad"));
  assert.throws(() => attendanceUrl("bad", "https://example.invalid/"));
  assert.deepEqual(
    availableRoute({ view: "attendance", projectId: "p" }, [{ id: "p" }]),
    { view: "attendance", projectId: "p" },
  );
  assert.equal(
    availableRoute({ view: "attendance", projectId: "other" }, [{ id: "p" }])
      .view,
    "municipalities",
  );
});
test("lista presencial não exige treinamento e vínculo preserva os dados do encontro", () => {
  const project = { name: "Município", entities: ["Prefeitura"], state: "SC" };
  const list = newAttendance(project, { name: "Técnico" });
  assert.equal(list.trainingId, "");
  assert.equal(list.instructor, "Técnico");
  assert.equal(list.entity, "Prefeitura");
  const event = {
    id: "t",
    title: "Compras",
    entity: "Fundo",
    date: "2026-11-03",
    owner: "Instrutor",
    duration: "2h",
  };
  const linked = newAttendance(project, { name: "Técnico" }, event);
  assert.equal(linked.trainingId, "t");
  assert.equal(linked.entity, "Fundo");
  assert.equal(linked.instructor, "Instrutor");
  assert.equal(linked.hours, "2h");
});
test("relatório mantém campos do modelo, espaço de assinatura e pagina nomes longos sem executar texto", () => {
  const data = {
    ...newAttendance(
      { name: "Cidade", entities: ["Prefeitura"] },
      { name: "Ana" },
    ),
    title: "<script>bad()</script>",
    date: "2026-11-03",
  };
  const people = Array.from({ length: 15 }, (_, i) => ({
    name: `Pessoa ${i} <img onerror=alert(1)>`,
    cpf: "***.***.***-25",
    sector: "Área",
    email: "a@example.invalid",
  }));
  const html = renderAttendanceReport({ data }, people);
  assert.equal((html.match(/class="sheet"/g) || []).length, 2);
  assert(html.includes("03/11/2026"));
  assert(html.includes("Assinatura"));
  assert(html.includes("Submódulos"));
  assert(!html.includes("<script>"));
  assert(!html.includes("<img onerror"));
  assert(html.includes("&lt;script&gt;"));
  const blank = renderAttendanceReport({ data }, people, { blank: true });
  assert(!blank.includes("Pessoa 0"));
  assert.equal((blank.match(/<td>\d\d<\/td>/g) || []).length, 14);
});

test("presença exige os quatro campos por padrão e só desmarca com booleano false", () => {
  assert.deepEqual(attendanceRequiredFields(), {
    name: true,
    cpf: true,
    sector: true,
    email: true,
  });
  assert.deepEqual(
    attendanceRequiredFields({ cpf: false, email: false, sector: "false" }),
    { name: true, cpf: false, sector: true, email: false },
  );
});
