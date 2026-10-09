import { test, expect } from "./fixtures/test.js";
import { readFile } from "node:fs/promises";

const stored = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
const card = (page, title = "Homologação de Frotas") =>
  page.locator(".task-card").filter({ hasText: title });
async function openProject(page) {
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}

async function home(page) {
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
}

test("controles compactos mantêm as visualizações em uma linha e o nome da fase recolhe os cartões", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 800 });
  await openProject(page);
  const buttons = page.locator(".view-switcher button");
  const tops = await buttons.evaluateAll((items) =>
    items.map((el) => el.getBoundingClientRect().top),
  );
  expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(2);
  await expect(
    page
      .locator(".filter-actions")
      .getByRole("button", { name: "Recolher fases", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Rolar quadro para/ }),
  ).toHaveCount(0);
  await expect(page.getByText("Visão das fases", { exact: true })).toHaveCount(
    0,
  );
  const title = page.locator("#column-todo .column-title-toggle span").nth(1);
  await title.click();
  await expect(page.locator("#column-todo .task-card")).toHaveCount(0);
  await title.click();
  await expect(page.locator("#column-todo .task-card").first()).toBeVisible();
  await page.screenshot({ path: ".local/compact-mobile.png", fullPage: true });
});

test("recolher fases no celular mantém resumo, dados e preferência por projeto no backup", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  const before = await stored(page);
  const items = before.projects[0].tasks.filter((t) => t.stage === "todo");
  await page
    .getByRole("button", { name: "Recolher fase A fazer", exact: true })
    .click();
  const phase = page.locator("#column-todo");
  await expect(phase.locator(".task-card")).toHaveCount(0);
  await expect(
    phase.locator(".column-overview dl > div").first().locator("dd"),
  ).toHaveText(String(items.length));
  await expect(
    phase.locator(".column-overview dl > div").nth(1).locator("dd"),
  ).toHaveText(String(items.filter((t) => t.priority === "alta").length));
  await page
    .getByRole("button", { name: "Recolher fases", exact: true })
    .click();
  await expect(page.locator(".collapsed-column")).toHaveCount(5);
  await expect(page.locator(".task-card")).toHaveCount(0);
  expect((await stored(page)).projects).toEqual(before.projects);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.reload();
  await page.locator(".municipality-card").click();
  await expect(page.locator(".collapsed-column")).toHaveCount(5);
  await page
    .getByRole("button", { name: "Expandir fases", exact: true })
    .click();
  await expect(page.locator(".task-card")).toHaveCount(
    before.projects[0].tasks.length,
  );
  await page
    .getByRole("button", { name: "Recolher fase A fazer", exact: true })
    .click();
  // The second project starts expanded; returning keeps the first preference.
  await home(page);
  await page
    .getByRole("button", { name: "Novo município", exact: true })
    .click();
  await page.getByLabel("Nome do município").fill("Segundo projeto");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await expect(page.locator(".collapsed-column")).toHaveCount(0);
  await home(page);
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await expect(phase).toHaveClass(/collapsed-column/);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .getByRole("button", { name: "Dados e backup", exact: true })
    .click();
  const promise = page.waitForEvent("download");
  await page.locator(".backup-options button").first().click();
  const file = await promise;
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.boardCollapsed[before.projects[0].id]).toEqual(["todo"]);
});

test("barras nativas se espelham nos dois sentidos e ajustam ao recolher e redimensionar", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  const top = page.locator(".board-scroll-mirror");
  const board = page.locator(".kanban");
  await expect(
    page.locator('.board-scroll-toolbar input[type="range"]'),
  ).toHaveCount(0);
  const max = await board.evaluate((e) => e.scrollWidth - e.clientWidth);
  expect(max).toBeGreaterThan(0);
  expect(await top.evaluate((e) => e.clientWidth)).toBe(
    await board.evaluate((e) => e.clientWidth),
  );
  await expect
    .poll(() => top.evaluate((e) => e.scrollWidth - e.clientWidth))
    .toBe(max);
  await top.evaluate(
    (e) => (e.scrollLeft = Math.round((e.scrollWidth - e.clientWidth) * 0.6)),
  );
  await expect
    .poll(() =>
      page.evaluate(() =>
        Math.abs(
          document.querySelector(".kanban").scrollLeft -
            document.querySelector(".board-scroll-mirror").scrollLeft,
        ),
      ),
    )
    .toBeLessThanOrEqual(1);
  expect(await board.evaluate((e) => e.scrollLeft)).toBeGreaterThan(max * 0.5);
  await board.evaluate((e) => (e.scrollLeft = e.scrollWidth));
  await expect.poll(() => top.evaluate((e) => e.scrollLeft)).toBe(max);
  const styles = await page.evaluate(() =>
    [".kanban", ".board-scroll-mirror"].map((selector) => {
      const element = document.querySelector(selector);
      return [
        getComputedStyle(element).scrollbarColor,
        getComputedStyle(element, "::-webkit-scrollbar").height,
      ];
    }),
  );
  expect(styles[0]).toEqual(styles[1]);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page
    .getByRole("button", { name: "Recolher fases", exact: true })
    .click();
  await expect.poll(() => board.evaluate((e) => e.scrollLeft)).toBe(0);
  await expect.poll(() => top.evaluate((e) => e.scrollLeft)).toBe(0);
  await page
    .getByRole("button", { name: "Expandir fases", exact: true })
    .click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const a = document.querySelector(".kanban"),
          b = document.querySelector(".board-scroll-mirror");
        return Math.abs(
          a.scrollWidth - a.clientWidth - (b.scrollWidth - b.clientWidth),
        );
      }),
    )
    .toBeLessThanOrEqual(1);
});

test("salvar no cabeçalho funciona sem rolar, checklists vêm primeiro e execução preserva versões no histórico", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  await card(page).click();
  const top = page.getByRole("button", {
    name: "Salvar atividade no topo",
    exact: true,
  });
  await expect(top).toBeInViewport();
  expect(
    await page.evaluate(
      () =>
        !!(
          document
            .querySelector(".checklist-section")
            .compareDocumentPosition(
              document.querySelector(".handoff-section"),
            ) & Node.DOCUMENT_POSITION_FOLLOWING
        ),
    ),
  ).toBe(true);
  await page.getByLabel("Título da atividade").clear();
  await top.click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Título da atividade").fill("Homologação de Frotas");
  await page
    .getByLabel("Atividades executadas", { exact: true })
    .fill("09/10 — Cadastros conferidos.\nDuas divergências encaminhadas.");
  await page
    .locator(".modal-body")
    .evaluate((e) => (e.scrollTop = e.scrollHeight));
  await expect(top).toBeInViewport();
  await top.click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await card(page).click();
  await expect(
    page.getByLabel("Atividades executadas", { exact: true }),
  ).toHaveValue(
    "09/10 — Cadastros conferidos.\nDuas divergências encaminhadas.",
  );
  await page
    .getByLabel("Atividades executadas", { exact: true })
    .fill("10/10 — Retorno recebido e dados conferidos.");
  await top.click();
  await page.reload();
  await page.locator(".municipality-card").click();
  const data = await stored(page);
  expect(data.projects[0].tasks[0].executedWork).toContain("Retorno recebido");
  expect(data.projects[0].logs[0].executedWork).toContain("Retorno recebido");
  expect(data.projects[0].logs[1].executedWork).toContain("Duas divergências");
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(page.locator(".history-executed-work").first()).toContainText(
    "Retorno recebido",
  );
  await expect(page.locator(".history-executed-work").nth(1)).toContainText(
    "Duas divergências",
  );
});

test("número e campos do chamado só aparecem nessa categoria em todas as visualizações sem apagar o valor", async ({
  page,
}) => {
  await openProject(page);
  const title = "Corrigir baixas e depreciações dos bens migrados";
  await card(page, title).click();
  await expect(page.getByLabel("Número do chamado")).toHaveValue("872797");
  await page.getByLabel("Categoria", { exact: true }).selectOption("tarefa");
  await expect(page.getByLabel("Número do chamado")).toHaveCount(0);
  await expect(page.getByLabel("Situação na fábrica")).toHaveCount(0);
  await expect(page.getByLabel("Link do chamado")).toHaveCount(0);
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(card(page, title).locator("h4")).toHaveText(title);
  for (const view of ["Lista", "Tabela", "Calendário"]) {
    await page.getByRole("button", { name: view, exact: true }).click();
    await expect(page.locator("main")).not.toContainText("#872797");
  }
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await card(page, title).click();
  await page.getByLabel("Categoria", { exact: true }).selectOption("chamado");
  await expect(page.getByLabel("Número do chamado")).toHaveValue("872797");
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(card(page, title).locator("h4")).toContainText("#872797");
});

test("botão direito muda situação e prioridade; conclusão exige validação e teclado fecha o menu", async ({
  page,
}) => {
  await openProject(page);
  await card(page).click({ button: "right" });
  const menu = page.getByRole("menu", { name: "Atalhos da atividade" });
  await expect(menu).toBeVisible();
  await menu
    .getByRole("group", { name: "Alterar situação" })
    .getByRole("menuitemradio", { name: "Em andamento", exact: true })
    .click();
  await expect(menu).toHaveCount(0);
  await expect(page.locator("#column-progress")).toContainText(
    "Homologação de Frotas",
  );
  expect((await stored(page)).projects[0].logs[0].action).toBe(
    "movida para Em andamento",
  );
  await card(page).click({ button: "right" });
  await menu
    .getByRole("group", { name: "Alterar prioridade" })
    .getByRole("menuitemradio", { name: "Alta", exact: true })
    .click();
  await expect(card(page).locator(".priority-tag")).toHaveText("Alta");
  await card(page).focus();
  await page.keyboard.press("Shift+F10");
  await expect(menu).toBeVisible();
  await page.keyboard.press("ArrowDown");
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await card(page).click({ button: "right" });
  await menu
    .getByRole("group", { name: "Alterar situação" })
    .getByRole("menuitemradio", { name: "Concluídos", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect((await stored(page)).projects[0].tasks[0].stage).toBe("progress");
  await page
    .getByLabel("Critério de conclusão", { exact: true })
    .fill("Comparar dados e conferir saldos.");
  await page.getByLabel("Validado por").fill("Consultor de teste");
  await page.getByLabel("Evidência da validação").fill("Relatório conferido.");
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(page.locator("#column-concluido")).toContainText(
    "Homologação de Frotas",
  );
});

test("atalhos estão acessíveis por toque, ficam dentro da tela e funcionam na lista e tabela", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  await page
    .locator(".task-card-shell")
    .filter({ hasText: "Homologação de Frotas" })
    .getByRole("button", { name: "Atalhos da atividade" })
    .click();
  const menu = page.getByRole("menu", { name: "Atalhos da atividade" });
  await expect(menu).toBeInViewport();
  const bounds = await menu.boundingBox();
  expect(bounds.x).toBeGreaterThanOrEqual(0);
  expect(bounds.x + bounds.width).toBeLessThanOrEqual(390);
  await menu.getByRole("menuitem", { name: "Editar atividade" }).click();
  await expect(page.getByLabel("Título da atividade")).toHaveValue(
    "Homologação de Frotas",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page
    .locator(".activity-list-row")
    .filter({ hasText: "Homologação de Frotas" })
    .click({ button: "right" });
  await menu
    .getByRole("group", { name: "Alterar situação" })
    .getByRole("menuitemradio", { name: "Aguardando retorno", exact: true })
    .click();
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  await page
    .locator("tbody tr")
    .filter({ hasText: "Homologação de Frotas" })
    .click({ button: "right" });
  await menu
    .getByRole("group", { name: "Alterar situação" })
    .getByRole("menuitemradio", { name: "A fazer", exact: true })
    .click();
  expect((await stored(page)).projects[0].tasks[0].stage).toBe("todo");
});

test("CPF começa com asteriscos, olhinho revela e volta a ocultar; excluir tem texto", async ({
  page,
}) => {
  await openProject(page);
  await page
    .getByRole("button", { name: "Dados do município", exact: true })
    .click();
  const deleteButton = page.getByRole("button", {
    name: "Excluir projeto",
    exact: true,
  });
  await expect(deleteButton).toHaveText("Excluir");
  await page.getByRole("button", { name: "Editar dados", exact: true }).click();
  await page.getByLabel("CPF do fiscal").fill("123.456.789-00");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await expect(page.locator(".cpf-display strong")).toHaveText(
    "***.***.***-**",
  );
  await page.getByRole("button", { name: "Mostrar CPF do fiscal" }).click();
  await expect(page.locator(".cpf-display strong")).toHaveText(
    "123.456.789-00",
  );
  await page.getByRole("button", { name: "Ocultar CPF do fiscal" }).click();
  await expect(page.locator(".cpf-display strong")).toHaveText(
    "***.***.***-**",
  );
  await page.getByRole("button", { name: "Mostrar CPF do fiscal" }).click();
  await page.getByRole("button", { name: "Ver quadro", exact: true }).click();
  await page
    .getByRole("button", { name: "Dados do município", exact: true })
    .click();
  await expect(page.locator(".cpf-display strong")).toHaveText(
    "***.***.***-**",
  );
  expect((await stored(page)).projects[0].cpf).toBe("123.456.789-00");
});
