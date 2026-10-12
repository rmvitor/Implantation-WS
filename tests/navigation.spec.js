import { test, expect } from "./fixtures/test.js";

const back = async (page) => {
  // Android Back delivers the same History API popstate event. Calling the
  // native browser API also covers installed PWAs without browser chrome.
  await page.evaluate(() => history.back());
};
const open = async (page) => {
  await page.goto("/");
  await page.locator(".municipality-card").filter({ hasText: "Quatro Barras" }).click();
  await expect(page.locator(".kanban")).toBeVisible();
};
const area = (page, name) => page.locator(".project-navigation").getByRole("button", { name, exact: true });

for (const width of [390, 1440]) {
  test(`Voltar fecha atividade antes de retornar entre áreas e ao início em ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 });
    await open(page);
    await area(page, "Agenda").click();
    await area(page, "Capacitação").click();
    await back(page);
    await expect(area(page, "Agenda")).toHaveAttribute("aria-current", "page");
    await back(page);
    await expect(area(page, "Atividades")).toHaveAttribute("aria-current", "page");
    await page.locator(".task-card").filter({ hasText: "Homologação de Frotas" }).click();
    await page.getByLabel("Título da atividade").fill("Rascunho privado de navegação");
    expect(await page.evaluate(() => JSON.stringify(history.state))).not.toContain("Rascunho privado");
    await back(page);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".task-card").filter({ hasText: "Homologação de Frotas" })).toBeVisible();
    await back(page);
    await expect(page.getByRole("heading", { name: "Projetos e municípios", exact: true })).toBeVisible();
    await page.evaluate(() => history.forward());
    await expect(area(page, "Atividades")).toHaveAttribute("aria-current", "page");
  });
}

test("Voltar fecha menus móveis em ordem e não sai do app ao fechar janela no início", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 900 });
  await page.goto("/?previous-document=1");
  await page.goto("/");
  await page.getByRole("button", { name: "Abrir configurações do perfil", exact: true }).click();
  await back(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Projetos e municípios", exact: true })).toBeVisible();
  await expect(page).toHaveURL("http://127.0.0.1:5173/");
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "Trocar projeto ativo", exact: true }).click();
  await expect(page.getByRole("listbox", { name: "Projetos ativos" })).toBeVisible();
  await back(page);
  await expect(page.getByRole("listbox")).toHaveCount(0);
  await expect(page.locator(".sidebar")).toHaveClass(/\bopen\b/);
  await back(page);
  await expect(page.locator(".sidebar")).not.toHaveClass(/\bopen\b/);
  await expect(page.getByRole("heading", { name: "Projetos e municípios", exact: true })).toBeVisible();
});

test("Salvar e Cancelar não deixam etapas vazias nem desfazem registros ao voltar", async ({ page }) => {
  await open(page);
  await area(page, "Agenda").click();
  await area(page, "Atividades").click();
  const historyLength = await page.evaluate(() => history.length);
  for (let i = 0; i < 4; i++) {
    await page.getByRole("button", { name: "Nova atividade", exact: true }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancelar", exact: true }).click();
  }
  expect(await page.evaluate(() => history.length)).toBe(historyLength + 1);
  await page.getByRole("button", { name: "Nova atividade", exact: true }).click();
  await page.getByLabel("Título da atividade").fill("Atividade persistida pelo teste Voltar");
  await page.getByRole("button", { name: "Criar atividade", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await back(page);
  await expect(area(page, "Agenda")).toHaveAttribute("aria-current", "page");
  await area(page, "Atividades").click();
  await expect(page.locator(".task-card").filter({ hasText: "Atividade persistida pelo teste Voltar" })).toBeVisible();
});

test("Voltar recolhe confirmação de exclusão antes de fechar o cartão e não exclui dados", async ({ page }) => {
  await open(page);
  const card = page.locator(".task-card").filter({ hasText: "Homologação de Frotas" });
  await card.click();
  await page.getByRole("dialog").getByRole("button", { name: "Excluir", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sim, excluir", exact: true })).toBeVisible();
  await back(page);
  await expect(page.getByRole("button", { name: "Sim, excluir", exact: true })).toHaveCount(0);
  await expect(page.getByRole("dialog")).toBeVisible();
  await back(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(card).toBeVisible();
});

test("homologação e ações rápidas fecham com Voltar mantendo a área", async ({ page }) => {
  await open(page);
  await area(page, "Homologação").click();
  await page.getByRole("button", { name: "Configurar migração", exact: true }).click();
  await back(page);
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(area(page, "Homologação")).toHaveAttribute("aria-current", "page");
  await back(page);
  await expect(area(page, "Atividades")).toHaveAttribute("aria-current", "page");
  await page.locator(".task-card").filter({ hasText: "Homologação de Frotas" }).click({ button: "right" });
  await expect(page.getByRole("menu")).toBeVisible();
  await back(page);
  await expect(page.getByRole("menu")).toHaveCount(0);
  await expect(area(page, "Atividades")).toHaveAttribute("aria-current", "page");
});
