import { test, expect } from "./fixtures/test.js";

test("acompanhamento configura limites, aplica modelo, registra passagem e exporta boletim no celular", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Acompanhamento geral", exact: true })
    .click();
  await expect(
    page.getByLabel("Prazo próximo (dias)", { exact: true }),
  ).toHaveValue("1");
  await expect(
    page.getByLabel("Chamado parado (dias)", { exact: true }),
  ).toHaveValue("5");
  await page.getByLabel("Chamado parado (dias)", { exact: true }).fill("3");
  await page
    .getByRole("button", { name: "Salvar limites", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("Alterações salvas");
  await page.getByRole("tab", { name: "Modelos", exact: true }).click();
  await page
    .getByLabel("Nome do modelo", { exact: true })
    .fill("Conferência inicial");
  await page
    .getByLabel("Título da tarefa", { exact: true })
    .fill("Comparar saldo inicial");
  await page
    .getByRole("combobox", { name: "Módulo", exact: true })
    .selectOption("Patrimônio");
  await page
    .getByLabel("Checklist (um item por linha)", { exact: true })
    .fill("Comparar relatório\nConferir saldo");
  await page
    .getByRole("button", { name: "Salvar modelo", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aplicar ao município", exact: true })
    .click();
  const task = await page.evaluate(() =>
    JSON.parse(
      localStorage.getItem("implanta.workspace.v1"),
    ).projects[0].tasks.find((t) => t.title === "Comparar saldo inicial"),
  );
  expect(task.stage).toBe("todo");
  expect(task.checklists[0].items).toHaveLength(2);
  expect(task.validation).toBeNull();
  await page
    .getByRole("tab", { name: "Passagem de trabalho", exact: true })
    .click();
  await page
    .getByLabel("Situação atual", { exact: true })
    .fill("Dados migrados; aguardando saldos");
  await page
    .getByLabel("Pendências", { exact: true })
    .fill("Conferir patrimônio");
  await page
    .getByLabel("Próximo passo", { exact: true })
    .fill("Comparar relatórios com Ana");
  await page
    .getByLabel("Responsável pelo próximo passo", { exact: true })
    .fill("Ana");
  await page
    .getByLabel("Riscos identificados", { exact: true })
    .fill("Ausência do fiscal");
  await page
    .getByRole("button", { name: "Registrar passagem", exact: true })
    .click();
  await expect(page.locator(".operations-rows")).toContainText(
    "Comparar relatórios com Ana",
  );
  await page.getByRole("tab", { name: "Municípios", exact: true }).click();
  await expect(page.locator(".operations-rows")).toContainText(
    "Atividades validadas",
  );
  await expect(page.locator(".operations-rows")).toContainText(
    "Comparar relatórios com Ana",
  );
  await page.getByRole("tab", { name: "Boletim semanal", exact: true }).click();
  await page
    .getByRole("button", { name: "Gerar boletim", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "Texto do boletim", exact: true }),
  ).toHaveValue(/Ausência do fiscal/);
  const downloadPromise = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar boletim", exact: true })
    .click();
  expect((await downloadPromise).suggestedFilename()).toMatch(
    /implanta-boletim.*\.md/,
  );
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  expect(errors).toEqual([]);
  await page.reload();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Acompanhamento geral", exact: true })
    .click();
  await expect(
    page.getByLabel("Chamado parado (dias)", { exact: true }),
  ).toHaveValue("3");
});
