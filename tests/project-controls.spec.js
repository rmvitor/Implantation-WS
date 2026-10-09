import { test, expect } from "./fixtures/test.js";
import { createDemo } from "./fixtures/workspace.js";
const nav = (page) =>
  page.getByRole("navigation", { name: "Navegação do projeto" });
async function open(page) {
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}

test("navegação do projeto mantém cinco áreas em uma linha no celular e ações de encerramento ficam nos dados", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  await expect(page.locator(".workspace-select strong")).toHaveText(
    "Quatro Barras",
  );
  for (const [label, area] of [
    ["Homologação", ".homologation-page"],
    ["Agenda", ".agenda-group"],
    ["Capacitação", ".training-grid"],
    ["Histórico", ".timeline"],
    ["Atividades", ".kanban"],
  ]) {
    await nav(page).getByRole("button", { name: label, exact: true }).click();
    await expect(
      nav(page).getByRole("button", { name: label, exact: true }),
    ).toHaveAttribute("aria-current", "page");
    await expect(page.locator(area).first()).toBeVisible();
    await expect(
      page.getByRole("button", { name: "Encerrar projeto", exact: true }),
    ).toHaveCount(0);
    await expect(
      page.getByRole("button", { name: "Excluir projeto", exact: true }),
    ).toHaveCount(0);
    const boxes = await nav(page)
      .getByRole("button")
      .evaluateAll((items) =>
        items.map((el) => el.getBoundingClientRect().top),
      );
    expect(Math.max(...boxes) - Math.min(...boxes)).toBeLessThan(2);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  }
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Capacitação e suporte", exact: true })
    .click();
  await expect(page.locator(".training-grid")).toBeVisible();
  const activeFits = await nav(page).evaluate((navigation) => {
    const bounds = navigation
      .querySelector(".board-tabs")
      .getBoundingClientRect();
    const active = navigation
      .querySelector('[aria-current="page"]')
      .getBoundingClientRect();
    return active.left >= bounds.left - 1 && active.right <= bounds.right + 1;
  });
  expect(activeFits).toBe(true);
  await page
    .getByRole("button", { name: "Dados do município", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Encerrar projeto", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Excluir projeto", exact: true }),
  ).toBeVisible();
});

test("lista recolhe fases com resumos, preserva tarefas e compartilha a preferência com o quadro e backup", async ({
  page,
}) => {
  await open(page);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  const rows = await page.locator(".activity-list-row").count();
  await page
    .getByRole("button", { name: "Recolher fase Em homologação", exact: true })
    .click();
  const group = page.locator(".list-stage").filter({
    has: page.getByRole("button", {
      name: "Expandir fase Em homologação",
      exact: true,
    }),
  });
  await expect(group.locator(".activity-list-row")).toHaveCount(0);
  await expect(group.locator(".column-overview")).toContainText("Atividades4");
  await page
    .getByRole("button", { name: "Recolher fases", exact: true })
    .click();
  await expect(page.locator(".activity-list-row")).toHaveCount(0);
  await page
    .getByRole("button", { name: "Expandir fases", exact: true })
    .click();
  await expect(page.locator(".activity-list-row")).toHaveCount(rows);
  await page
    .getByRole("button", { name: "Recolher fase Em homologação", exact: true })
    .click();
  await page.reload();
  await page.locator(".municipality-card").click();
  await expect(
    page.getByRole("button", {
      name: "Expandir fase Em homologação",
      exact: true,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await expect(page.locator("#column-homologacao")).toHaveClass(
    /collapsed-column/,
  );
  await page
    .getByRole("button", { name: "Adicionar em Em homologação", exact: true })
    .click();
  await expect(page.getByLabel("Situação", { exact: true })).toHaveValue(
    "homologacao",
  );
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("implanta.workspace.v1")).projects[0]
          .tasks.length,
    ),
  ).toBe(rows);
});

test("botões de adicionar ficam dentro de todas as fases no celular, abertas e recolhidas", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await open(page);
  for (const collapsed of [false, true]) {
    if (collapsed)
      await page
        .getByRole("button", { name: "Recolher fases", exact: true })
        .click();
    const fit = await page.locator(".kanban-column").evaluateAll((columns) =>
      columns.every((el) => {
        const box = el.getBoundingClientRect(),
          button = el
            .querySelector(".column-heading > button")
            .getBoundingClientRect();
        return button.left >= box.left + 1 && button.right <= box.right - 1;
      }),
    );
    expect(fit).toBe(true);
  }
});

test("atalhos editam o município clicado mesmo quando outro projeto estava selecionado", async ({
  page,
}) => {
  const data = createDemo();
  data.projects.push({
    ...structuredClone(data.projects[0]),
    id: "pinhais",
    name: "Pinhais",
    dream: "2000",
  });
  await page.addInitScript(
    (data) =>
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)),
    data,
  );
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Pinhais" })
    .click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Editar dados", exact: true })
    .click();
  await expect(
    page.getByLabel("Nome do município *", { exact: true }),
  ).toHaveValue("Pinhais");
  await page.getByLabel("Código no Dream", { exact: true }).fill("2099");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await expect(page.locator(".workspace-select strong")).toHaveText("Pinhais");
  const projects = await page.evaluate(
    () => JSON.parse(localStorage.getItem("implanta.workspace.v1")).projects,
  );
  expect(projects.find((p) => p.id === "pinhais").dream).toBe("2099");
  expect(projects.find((p) => p.id === "quatro-barras").dream).toBe("1042");
});

test("implantação abre atalhos por botão direito, teclado e toque; editar dados e encerrar continuam com confirmação", async ({
  page,
}) => {
  await page.goto("/");
  const card = page.locator(".municipality-card");
  await card.click({ button: "right" });
  await page
    .getByRole("menuitem", { name: "Dados do município", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Informações do município" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await card.focus();
  await page.keyboard.press("Shift+F10");
  await expect(
    page.getByRole("menu", { name: "Ações do projeto" }),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", {
      name: "Ações do projeto Quatro Barras",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Editar dados", exact: true })
    .click();
  await expect(
    page.getByLabel("Nome do município *", { exact: true }),
  ).toHaveValue("Quatro Barras");
  await page.getByLabel("Código no Dream", { exact: true }).fill("2099");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Ações do projeto Quatro Barras",
      exact: true,
    })
    .click();
  await page
    .getByRole("menuitem", { name: "Encerrar projeto", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Confirmar encerramento", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("implanta.workspace.v1")).projects[0]
          .status,
    ),
  ).not.toBe("closed");
});
