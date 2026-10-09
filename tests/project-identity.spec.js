import { test, expect } from "./fixtures/test.js";
import { createDemo } from "./fixtures/workspace.js";
const navigation = (page) =>
  page.getByRole("navigation", { name: "Navegação do projeto" });
async function setupProjects(page) {
  const data = createDemo();
  data.projects[0].color = "#2563eb";
  data.projects.push({
    ...structuredClone(data.projects[0]),
    id: "pinhais",
    name: "Pinhais",
    color: "#be185d",
    demo: false,
    tasks: [{ ...data.projects[0].tasks[0], title: "Conferência de Pinhais" }],
  });
  data.projects.push({
    ...structuredClone(data.projects[0]),
    id: "encerrado",
    name: "Município encerrado",
    status: "closed",
    closedAt: "2026-10-09T12:00:00Z",
  });
  await page.addInitScript((data) => {
    if (sessionStorage.getItem("implanta.identity.fixture")) return;
    localStorage.setItem("implanta.workspace.v1", JSON.stringify(data));
    sessionStorage.setItem("implanta.identity.fixture", "true");
  }, data);
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}

for (const width of [360, 1440]) {
  test(`troca rápida mostra só projetos ativos e preserva a área, o nome e a cor em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    await setupProjects(page);
    await expect(page.locator(".sidebar")).not.toContainText("MEUS MUNICÍPIOS");
    await expect(page.locator(".management-label")).toHaveText("GERENCIAMENTO");
    await expect(page.locator(".project-nav")).toHaveCount(0);
    for (const area of [
      "Homologação",
      "Agenda",
      "Capacitação",
      "Histórico",
      "Atividades",
    ]) {
      await navigation(page)
        .getByRole("button", { name: area, exact: true })
        .click();
      await expect(page.locator("h1")).toHaveText("Quatro Barras");
      await expect(page).toHaveTitle(new RegExp(`Quatro Barras .* Implanta`));
    }
    await navigation(page)
      .getByRole("button", { name: "Capacitação", exact: true })
      .click();
    if (width === 360)
      await page
        .getByRole("button", { name: "Abrir menu", exact: true })
        .click();
    const trigger = page.getByRole("button", {
      name: "Trocar projeto ativo",
      exact: true,
    });
    await trigger.focus();
    await trigger.press("ArrowDown");
    const choices = page.getByRole("listbox", { name: "Projetos ativos" });
    await expect(choices.getByRole("option")).toHaveCount(2);
    await expect(choices).not.toContainText("Município encerrado");
    await choices
      .getByRole("option", { name: "Quatro Barras", exact: true })
      .press("ArrowDown");
    await expect(
      choices.getByRole("option", { name: "Pinhais", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(choices).toHaveCount(0);
    await expect(page.locator("h1")).toHaveText("Pinhais");
    await expect(
      navigation(page).getByRole("button", {
        name: "Capacitação",
        exact: true,
      }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(".project-heading")).toHaveCSS(
      "border-left-color",
      "rgb(190, 24, 93)",
    );
    await expect(page.locator(".topbar")).toHaveCSS(
      "border-top-color",
      "rgb(190, 24, 93)",
    );
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await navigation(page)
      .getByRole("button", { name: "Atividades", exact: true })
      .click();
    await expect(page.locator(".task-card")).toHaveCount(1);
    await expect(page.locator(".task-card")).toContainText(
      "Conferência de Pinhais",
    );
    await page.reload();
    await expect(page.locator(".workspace-select strong")).toHaveText(
      "Pinhais",
    );
  });
}

test("cor do município é editável, persiste e não altera a cor do perfil; seletor fecha por Escape e clique fora", async ({
  page,
}) => {
  await setupProjects(page);
  const trigger = page.getByRole("button", {
    name: "Trocar projeto ativo",
    exact: true,
  });
  await trigger.click();
  await page.keyboard.press("Escape");
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await trigger.click();
  await page.locator("h1").click();
  await expect(trigger).toHaveAttribute("aria-expanded", "false");
  await page
    .getByRole("button", { name: "Dados do município", exact: true })
    .click();
  await page.getByRole("button", { name: "Editar dados", exact: true }).click();
  await page.getByLabel("Cor do projeto", { exact: true }).fill("#b45309");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await expect(page.locator(".project-heading")).toHaveCSS(
    "border-left-color",
    "rgb(180, 83, 9)",
  );
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    ),
  ).toBe("#2563eb");
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await expect(page.locator(".project-heading")).toHaveCSS(
    "border-left-color",
    "rgb(180, 83, 9)",
  );
  await page
    .getByRole("button", { name: "Abrir configurações do perfil" })
    .click();
  await page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await page.getByRole("button", { name: "Salvar aparência" }).click();
  await expect(page.locator(".sidebar")).toHaveCSS(
    "background-color",
    "rgb(0, 0, 0)",
  );
  await expect(page.locator(".project-heading")).toHaveCSS(
    "border-left-color",
    "rgb(180, 83, 9)",
  );
});
