import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";
async function create(page, name) {
  await page
    .getByRole("button", { name: "Novo município", exact: true })
    .click();
  await page.getByLabel("Nome do município").fill(name);
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
}
test("primeiro acesso inicia vazio, aceita backup vazio e permite criar o primeiro município", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await expect(
    page.getByText("Seu workspace está vazio.", { exact: false }),
  ).toBeVisible();
  await expect(
    page
      .locator("nav")
      .getByRole("button", { name: "Homologação", exact: true }),
  ).toBeDisabled();
  await page
    .getByRole("button", { name: "Importar dados", exact: true })
    .click();
  await page
    .locator('input[type="file"]')
    .setInputFiles({
      name: "vazio.json",
      mimeType: "application/json",
      buffer: Buffer.from(
        JSON.stringify({ version: 2, selectedId: "", projects: [] }),
      ),
    });
  await page
    .getByRole("button", { name: "Restaurar dados", exact: true })
    .click();
  await page.reload();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await create(page, "Primeira implantação");
  await expect(
    page.getByRole("heading", { name: "Primeira implantação", exact: true }),
  ).toBeVisible();
  expect(errors).toEqual([]);
});
test("encerrados saem dos ativos, preservam histórico e podem ser reabertos", async ({
  page,
}) => {
  await page.goto("/");
  await create(page, "Projeto finalizado");
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page.getByLabel("Título da atividade").fill("Registro preservado");
  await page
    .getByRole("button", { name: "Criar atividade", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Encerrar projeto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar encerramento", exact: true })
    .click();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await expect(page.locator(".project-nav button")).toHaveCount(0);
  await page.getByRole("button", { name: /^Encerrados / }).click();
  await expect(page.locator(".municipality-card")).toHaveCount(1);
  await page.reload();
  await page.getByRole("button", { name: /^Encerrados / }).click();
  await page.locator(".municipality-card").click();
  await expect(page.locator(".task-card")).toContainText("Registro preservado");
  await page
    .locator("nav")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(page.locator(".timeline")).toContainText("Projeto encerrado");
  await page
    .getByRole("button", { name: "Reabrir projeto", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await expect(page.locator(".municipality-card")).toHaveCount(1);
});
test("exclusão exige confirmação, cancela sem perda e excluir último projeto retorna ao início vazio", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await create(page, "Projeto de teste");
  await page
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar exclusão" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Projeto de teste", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Excluir projeto", exact: true })
    .click();
  await page
    .getByLabel("Digite o nome do projeto para confirmar")
    .fill("Projeto de teste");
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
});
test("limpar workspace conserva aparência e exportação anterior inclui projetos encerrados", async ({
  page,
}) => {
  await page.goto("/");
  await create(page, "Limpeza local");
  await page
    .getByRole("button", { name: "Abrir configurações do perfil" })
    .click();
  await page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Salvar aparência" }).click();
  await page
    .getByRole("button", { name: "Encerrar projeto", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar encerramento", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Dados e backup", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Limpar workspace", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Exportar backup antes de excluir" })
    .click();
  const { readFile } = await import("node:fs/promises");
  const file = await download;
  const exported = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(exported.projects[0].status).toBe("closed");
  await page.getByLabel("Digite LIMPAR para confirmar").fill("LIMPAR");
  await page
    .getByRole("button", { name: "Confirmar limpeza", exact: true })
    .click();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
  expect(stored.projects).toEqual([]);
  expect(stored.appearance.theme).toBe("dark");
});
test("atualização preserva cadastros anteriores e falha de armazenamento mantém confirmação de exclusão", async ({
  page,
}) => {
  await page.addInitScript(
    (data) =>
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)),
    createDemo(),
  );
  await page.goto("/");
  await expect(page.locator(".municipality-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Excluir projeto Quatro Barras", exact: true })
    .click();
  await page
    .getByLabel("Digite o nome do projeto para confirmar")
    .fill("Quatro Barras");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Sem espaço", "QuotaExceededError");
    };
  });
  await page.getByRole("button", { name: "Confirmar exclusão" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Não foi possível salvar",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("implanta.workspace.v1")).projects
          .length,
    ),
  ).toBe(1);
});
