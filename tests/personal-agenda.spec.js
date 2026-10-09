import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";
async function setup(page, projects = false) {
  const data = projects
    ? createDemo()
    : { version: 2, selectedId: "", projects: [] };
  await page.addInitScript((data) => {
    if (!localStorage.getItem("implanta.workspace.v1"))
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(data));
  }, data);
  await page.goto("/");
  await open(page);
  return data;
}
async function open(page) {
  if (
    await page
      .getByRole("button", { name: "Abrir menu", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Agenda geral", exact: true })
    .click();
}
async function showList(page) {
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page
    .getByLabel("Período da lista", { exact: true })
    .selectOption("all");
}
async function add(page, kind, title) {
  await page
    .getByRole("button", { name: "Novo compromisso", exact: true })
    .click();
  await page.getByLabel("Título do compromisso", { exact: true }).fill(title);
  await page
    .getByRole("combobox", { name: "Tipo", exact: true })
    .selectOption(kind);
  await page.getByLabel("Data de início", { exact: true }).fill("2026-10-13");
  await page.getByLabel("Data de término", { exact: true }).fill("2026-10-16");
}
const saved = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );

test("agenda geral funciona sem projetos e salva datas prováveis sem criar município", async ({
  page,
}) => {
  await setup(page);
  await expect(page.locator("h1")).toHaveText("Agenda geral");
  await expect(page).toHaveTitle("Agenda geral · Implanta");
  await add(page, "project", "Implantação provável em Pinhais");
  await expect(
    page.getByRole("combobox", { name: "Situação", exact: true }),
  ).toHaveValue("tentative");
  await page
    .getByLabel("Local / município (opcional)", { exact: true })
    .fill("Pinhais");
  await page
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  expect((await saved(page)).projects).toEqual([]);
  expect((await saved(page)).personalAgenda[0]).toMatchObject({
    kind: "project",
    tentative: true,
    place: "Pinhais",
  });
  await page.reload();
  await open(page);
  await showList(page);
  await expect(page.locator(".personal-agenda-row")).toContainText(
    "Implantação provável em Pinhais",
  );
});

test("celular acompanha viagem por período, edita e filtra; datas inválidas e falha ao excluir preservam registro", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await setup(page);
  await add(page, "travel", "Visita técnica");
  await page
    .getByRole("textbox", { name: "Observações", exact: true })
    .fill("Reservar hotel");
  await page
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  await page.getByLabel("Mês da agenda geral", { exact: true }).fill("2026-10");
  for (const day of ["13", "14", "15", "16"])
    await expect(
      page.locator(
        `.personal-calendar [data-date="2026-10-${day}"] .personal-event`,
      ),
    ).toContainText("Visita técnica");
  await expect(
    page.locator('.personal-calendar [data-date="2026-10-17"] .personal-event'),
  ).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/implanta-personal-calendar-mobile.png",
    fullPage: true,
  });
  await showList(page);
  await page
    .getByLabel("Tipo de compromisso na agenda geral", { exact: true })
    .selectOption("holiday");
  await expect(page.locator(".personal-agenda-row")).toHaveCount(0);
  await page
    .getByLabel("Tipo de compromisso na agenda geral", { exact: true })
    .selectOption("travel");
  await page.locator(".personal-agenda-row").click();
  await expect(
    page.getByRole("textbox", { name: "Observações", exact: true }),
  ).toHaveValue("Reservar hotel");
  await page.getByLabel("Data de término", { exact: true }).fill("2026-10-12");
  await page
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("anterior ao início");
  await page.getByLabel("Data de término", { exact: true }).fill("2026-10-16");
  await page
    .getByRole("button", { name: "Excluir compromisso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Manter compromisso", exact: true })
    .click();
  expect((await saved(page)).personalAgenda).toHaveLength(1);
  await page
    .getByRole("button", { name: "Excluir compromisso", exact: true })
    .click();
  await page.evaluate(() => {
    window.originalAgendaSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  await page
    .getByRole("button", {
      name: "Confirmar exclusão do compromisso",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await saved(page)).personalAgenda).toHaveLength(1);
  await page.evaluate(() => {
    Storage.prototype.setItem = window.originalAgendaSetItem;
  });
  await page
    .getByRole("button", {
      name: "Confirmar exclusão do compromisso",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect((await saved(page)).personalAgenda).toHaveLength(0);
});

test("feriado pessoal não altera atividades, agenda ou histórico do município e permanece após excluir o último projeto", async ({
  page,
}) => {
  const original = await setup(page, true);
  await add(page, "holiday", "Feriado municipal pessoal");
  await page
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  expect((await saved(page)).projects).toEqual(original.projects);
  await page
    .locator("nav")
    .getByRole("button", { name: /^Minha agenda/ })
    .click();
  await expect(page.locator(".agenda-group").first()).toBeVisible();
  await expect(page.locator("main")).not.toContainText(
    "Feriado municipal pessoal",
  );
  await page
    .locator("nav")
    .getByRole("button", { name: /^Histórico/ })
    .click();
  await expect(page.locator(".timeline")).not.toContainText(
    "Feriado municipal pessoal",
  );
  await page
    .getByRole("button", { name: "Dados do município", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await page
    .getByLabel("Digite o nome do projeto para confirmar")
    .fill("Quatro Barras");
  await page
    .getByRole("button", { name: "Confirmar exclusão", exact: true })
    .click();
  await open(page);
  await showList(page);
  await expect(page.locator(".personal-agenda-row")).toContainText(
    "Feriado municipal pessoal",
  );
  expect((await saved(page)).projects).toEqual([]);
});

test("backup exporta agenda pessoal e restauração de um backup antigo preserva os compromissos atuais", async ({
  page,
}) => {
  await setup(page);
  await add(page, "personal", "Compromisso particular");
  await page
    .getByRole("button", { name: "Salvar compromisso", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dados e backup", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar backup/ }).click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.personalAgenda[0].title).toBe("Compromisso particular");
  await page.getByRole("button", { name: /Restaurar backup/ }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: "backup-antigo.json",
    mimeType: "application/json",
    buffer: Buffer.from(
      JSON.stringify({ version: 2, selectedId: "", projects: [] }),
    ),
  });
  await page
    .getByRole("button", { name: "Restaurar dados", exact: true })
    .click();
  await open(page);
  await showList(page);
  await expect(page.locator(".personal-agenda-row")).toContainText(
    "Compromisso particular",
  );
});
