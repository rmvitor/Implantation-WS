import { test, expect } from "./fixtures/test.js";

async function openProject(page) {
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
  ).toBeVisible();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}

test("quadro permite editar checklists, concluir e recuperar os dados salvos", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openProject(page);
  await expect(
    page.getByRole("heading", { name: "Quatro Barras", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Homologação de Frotas/ }).click();
  await page.getByRole("checkbox").nth(1).check();
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.getByRole("button", { name: /Homologação de Frotas/ }),
  ).toContainText("2/6");
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByLabel("Título da atividade")
    .fill("Validar fluxo de requisição");
  await page.getByLabel("Categoria").selectOption("chamado");
  await page.getByLabel("Número do chamado").fill("123456");
  await page
    .getByRole("button", { name: "Criar atividade", exact: true })
    .click();
  const card = page.getByRole("button", {
    name: /Validar fluxo de requisição/,
  });
  await expect(card).toBeVisible();
  await card.click();
  await page.getByLabel("Situação", { exact: true }).selectOption("concluido");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await page
    .getByLabel("Critério de conclusão", { exact: true })
    .fill("Executar a requisição e confirmar o saldo.");
  await page.getByLabel("Validado por").fill("Colega de Teste");
  await page
    .getByLabel("Evidência da validação")
    .fill("Relatório de saldo reconciliado e requisição conferida.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator("#column-concluido")).toContainText(
    "Validar fluxo de requisição",
  );
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await expect(page.locator("#column-concluido")).toContainText(
    "Validar fluxo de requisição",
  );
  await page
    .locator(".board-tabs")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(
    page
      .locator(".timeline-item")
      .filter({ hasText: "Validar fluxo de requisição" })
      .first(),
  ).toContainText("Concluída");
  expect(errors).toEqual([]);
});

test("município, agenda de treinamentos e backup funcionam de ponta a ponta", async ({
  page,
}) => {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Novo município", exact: true })
    .click();
  await page.getByLabel("Nome do município").fill("Município de Teste");
  await page.getByLabel("Código no Dream").press("End");
  await page.getByLabel("Nome do fiscal").fill("Fiscal de Teste");
  await page.getByLabel("E-mail do fiscal").fill("fiscal@example.com");
  await page.getByLabel("Entidades do projeto").fill("Prefeitura\nCâmara");
  await page.getByRole("button", { name: "Salvar município" }).click();
  await expect(
    page.getByRole("heading", { name: "Município de Teste", exact: true }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Capacitação e suporte" })
    .click();
  await page
    .getByRole("button", { name: "Novo treinamento/atendimento", exact: true })
    .first()
    .click();
  await page.getByLabel("Tema / módulo").fill("Treinamento de patrimônio");
  await page
    .getByRole("button", { name: "Salvar treinamento/atendimento" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Treinamento de patrimônio" }),
  ).toBeVisible();
  await page
    .locator("nav")
    .getByRole("button", { name: "Minha agenda" })
    .click();
  await expect(page.locator(".agenda-row")).toContainText(
    "Treinamento de patrimônio",
  );
  await page.getByRole("button", { name: "Dados e backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar backup/ }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  let body = "";
  for await (const chunk of stream) body += chunk.toString();
  const backup = JSON.parse(body);
  expect(backup.projects).toHaveLength(2);
  expect(backup.projects[1].trainings[0].title).toBe(
    "Treinamento de patrimônio",
  );
  await page.locator("input[type=file]").setInputFiles({
    name: "backup.json",
    mimeType: "application/json",
    buffer: Buffer.from(body),
  });
  await expect(
    page.getByRole("heading", { name: "Restaurar este backup?" }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Restaurar dados", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
  ).toBeVisible();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Município de Teste" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Município de Teste", exact: true }),
  ).toBeVisible();
});

test("layout móvel mantém navegação e não estoura a largura da página", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Quatro Barras.*Dream/ }).click();
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  ).toBe(true);
});

test("arrastar, filtrar e excluir mantém o histórico da atividade", async ({
  page,
}) => {
  await openProject(page);
  const card = page.getByRole("button", { name: /Homologação de Frotas/ });
  await card.dragTo(page.locator("#column-todo"), {
    targetPosition: { x: 45, y: 25 },
  });
  await expect(page.locator("#column-todo")).toContainText(
    "Homologação de Frotas",
  );
  await page
    .getByRole("textbox", { name: "Buscar uma atividade" })
    .fill("frotas");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await card.click();
  await page.getByRole("button", { name: "Excluir", exact: true }).click();
  await page.getByRole("button", { name: "Sim, excluir" }).click();
  await expect(page.locator(".task-card")).toHaveCount(0);
  await page
    .locator(".board-tabs")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(page.locator(".timeline-item").first()).toContainText(
    "Excluída",
  );
});

test("lista, tabela e calendário compartilham atividades, filtros e datas", async ({
  page,
}) => {
  await openProject(page);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(
    page.getByRole("region", { name: "Lista de atividades" }),
  ).toBeVisible();
  const row = page
    .locator(".activity-list-row")
    .filter({ hasText: "Corrigir baixas e depreciações" });
  await row.getByRole("combobox").selectOption("homologacao");
  await page.getByRole("button", { name: "Tabela", exact: true }).click();
  const tableRow = page
    .getByRole("row")
    .filter({ hasText: "Corrigir baixas e depreciações" });
  await expect(tableRow.getByRole("combobox")).toHaveValue("homologacao");
  await expect(tableRow).toContainText("Chamado");
  await expect(tableRow).toContainText("IPM: analisar");
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por categoria").selectOption("chamado");
  await expect(page.locator(".activities-table tbody tr")).toHaveCount(3);
  await page.getByRole("button", { name: "Limpar filtros" }).click();
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  await expect(
    page
      .locator(".calendar-event")
      .filter({ hasText: "Validar migração com a equipe" }),
  ).toBeVisible();
  await page
    .locator(".calendar-event")
    .filter({ hasText: "Validar migração com a equipe" })
    .click();
  await page
    .getByLabel("Título da atividade")
    .fill("Validar migração e relatório detalhado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(
    page.locator(".calendar-event").filter({ hasText: "relatório detalhado" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Próximo mês", exact: true }).click();
  await expect(
    page.locator(".calendar-event").filter({ hasText: "relatório detalhado" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(
    page.locator(".calendar-event").filter({ hasText: "relatório detalhado" }),
  ).toBeVisible();
  await page
    .locator(".calendar-today")
    .getByRole("button", { name: /Adicionar atividade em/ })
    .click();
  await page
    .getByLabel("Título da atividade")
    .fill("Conferência agendada pelo calendário");
  await page
    .getByRole("button", { name: "Criar atividade", exact: true })
    .click();
  await expect(page.locator(".calendar-today")).toContainText(
    "Conferência agendada pelo calendário",
  );
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await expect(
    page.getByRole("button", { name: "Calendário", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".calendar-today")).toContainText(
    "Conferência agendada pelo calendário",
  );
});

test("contexto e anexos são preservados no backup; conclusão registra validação e reabertura", async ({
  page,
}) => {
  await openProject(page);
  await page
    .getByRole("button", { name: /Corrigir baixas e depreciações/ })
    .click();
  await expect(page.getByLabel("Problema", { exact: true })).toHaveValue(
    /Bens migrados/,
  );
  await page.getByLabel("Quem precisa agir agora").fill("Ana — consultoria");
  await page
    .getByLabel("Próxima ação", { exact: true })
    .fill("Ana: conferir o saldo do bem 0042 após a correção IPM.");
  await page.getByLabel("Anexar evidência", { exact: true }).setInputFiles({
    name: "relatorio-teste.txt",
    mimeType: "text/plain",
    buffer: Buffer.from("Bem 0042: saldo conferido."),
  });
  await expect(page.locator(".evidence-file")).toContainText(
    "relatorio-teste.txt",
  );
  await page.getByLabel("Situação", { exact: true }).selectOption("concluido");
  await page.getByLabel("Validado por").fill("Ana");
  await page
    .getByLabel("Evidência da validação")
    .fill("Relatório anexado: bem 0042 com saldo correto.");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await expect(page.locator("#column-concluido")).toContainText(
    "Validado por Ana",
  );
  await page.getByRole("button", { name: "Dados e backup" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar backup/ }).click();
  const stream = await (await downloadPromise).createReadStream();
  let body = "";
  for await (const c of stream) body += c.toString();
  const workspace = JSON.parse(body);
  const saved = workspace.projects[0].tasks.find((t) => t.ticket === "872797");
  expect(workspace.version).toBe(2);
  expect(saved.nextOwner).toBe("Ana — consultoria");
  expect(saved.attachments[0].data).toContain("data:text/plain;base64,");
  expect(saved.validation.by).toBe("Ana");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: /Corrigir baixas e depreciações/ })
    .click();
  await page.getByLabel("Situação", { exact: true }).selectOption("progress");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  await page
    .locator(".board-tabs")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(
    page.locator(".timeline-item").filter({ hasText: "Validado por Ana" }),
  ).toContainText("Relatório anexado");
});

test("migração local mantém chamados e distingue conclusões antigas sem validação", async ({
  page,
}) => {
  const legacyTask = (id, title, stage) => ({
    id,
    title,
    module: "Patrimônio",
    stage,
    owner: "Colega",
    priority: "normal",
    date: "",
    time: "",
    ticket: id === "t1" ? "872797" : "",
    description: "Notas antigas",
    checklists: [],
  });
  const legacy = {
    version: 1,
    selectedId: "p1",
    projects: [
      {
        id: "p1",
        name: "Município legado",
        state: "PR",
        dream: "99",
        entities: ["Prefeitura"],
        tasks: [
          legacyTask("t1", "Chamado legado", "chamado"),
          legacyTask("t2", "Atividade antiga concluída", "concluido"),
        ],
        trainings: [],
        logs: [],
      },
    ],
  };
  await page.addInitScript(
    (value) =>
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(value)),
    legacy,
  );
  await page.goto("/");
  await page.locator(".municipality-card").click();
  await expect(page.locator("#column-waiting")).toContainText("872797");
  await expect(page.locator("#column-concluido")).toContainText(
    "Validação não registrada",
  );
  await page.getByRole("button", { name: /Chamado legado/ }).click();
  await expect(page.getByLabel("Problema", { exact: true })).toHaveValue(
    "Notas antigas",
  );
  await expect(page.getByLabel("Categoria")).toHaveValue("chamado");
  await page.getByRole("button", { name: "Salvar alterações" }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
  expect(stored.version).toBe(2);
  expect(stored.projects[0].tasks[1].validation).toBe(null);
});

test("falha de armazenamento mantém formulário e não declara salvamento", async ({
  page,
}) => {
  await openProject(page);
  await page
    .getByRole("button", { name: "Nova atividade", exact: true })
    .click();
  await page
    .getByLabel("Título da atividade")
    .fill("Atividade sem espaço para salvar");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("quota", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Criar atividade", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toContainText(
    "Não foi possível salvar",
  );
  await expect(page.getByLabel("Título da atividade")).toHaveValue(
    "Atividade sem espaço para salvar",
  );
});

test("perfil aplica cor principal e True Black, persiste e cancela a prévia", async ({
  page,
}) => {
  await openProject(page);
  await page
    .getByRole("button", { name: "Abrir configurações do perfil" })
    .click();
  await page.getByLabel("Tema", { exact: true }).selectOption("dark");
  await page.getByLabel("Cor principal", { exact: true }).fill("#7c3aed");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page
      .locator(".sidebar")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  expect(
    await page
      .locator(".main")
      .evaluate((el) => getComputedStyle(el).backgroundColor),
  ).toBe("rgb(0, 0, 0)");
  await page.getByRole("button", { name: "Salvar aparência" }).click();
  await expect(
    page.getByRole("button", { name: "Nova atividade", exact: true }),
  ).toHaveCSS("background-color", "rgb(124, 58, 237)");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Abrir configurações do perfil" })
    .click();
  await expect(page.getByLabel("Cor principal", { exact: true })).toHaveValue(
    "#7c3aed",
  );
  await page.getByLabel("Tema", { exact: true }).selectOption("light");
  await page.getByLabel("Cor principal", { exact: true }).fill("#2563eb");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  expect(
    await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--primary")
        .trim(),
    ),
  ).toBe("#7c3aed");
  await expect(page.locator(".page-footer")).toContainText("v1.8.1");
});

test("categorias, módulos e número aparecem nos cartões; prioridade ordena todas as fases", async ({
  page,
}) => {
  await openProject(page);
  for (const [category, priority, title, ticket, module] of [
    ["tarefa", "baixa", "Conferir saldo", "", "Frota"],
    ["agenda", "normal", "Reunião com fiscal", "", "Fiscalização de contrato"],
    ["pendencia", "alta", "Corrigir resultado", "904321", "Elicita"],
    ["chamado", "alta", "Verificar relatório", "904322", "Compras e Contratos"],
  ]) {
    await page
      .getByRole("button", { name: "Nova atividade", exact: true })
      .click();
    await page.getByLabel("Título da atividade").fill(title);
    const options = await page
      .getByLabel("Módulo", { exact: true })
      .locator("option")
      .allTextContents();
    expect(options).toEqual([
      "Selecione o módulo",
      "Compras e Contratos",
      "Almoxarifado",
      "Patrimônio",
      "Frota",
      "Fiscalização de contrato",
      "Elicita",
    ]);
    await page.getByLabel("Categoria", { exact: true }).selectOption(category);
    await page.getByLabel("Prioridade", { exact: true }).selectOption(priority);
    await page.getByLabel("Módulo", { exact: true }).selectOption(module);
    if (ticket) {
      await page
        .getByLabel("Categoria", { exact: true })
        .selectOption("chamado");
      await page.getByLabel("Número do chamado").fill(ticket);
      await page
        .getByLabel("Categoria", { exact: true })
        .selectOption(category);
    }
    await page
      .getByRole("button", { name: "Criar atividade", exact: true })
      .click();
    const card = page.locator(".task-card").filter({ hasText: title });
    await expect(card.locator("h4")).toHaveText(
      category === "chamado" && ticket ? `${title} — #${ticket}` : title,
    );
    await expect(card.locator(".priority-tag")).toHaveText(
      priority === "alta" ? "Alta" : priority === "baixa" ? "Baixa" : "Normal",
    );
  }
  await page.getByLabel("Ordenar cartões").selectOption("priority");
  const priorities = await page
    .locator("#column-todo .priority-tag")
    .allTextContents();
  expect(priorities).toEqual(
    [...priorities].sort(
      (a, b) =>
        ["Alta", "Normal", "Baixa"].indexOf(a) -
        ["Alta", "Normal", "Baixa"].indexOf(b),
    ),
  );
  await page.getByRole("button", { name: "Filtros", exact: true }).click();
  await page.getByLabel("Filtrar por categoria").selectOption("pendencia");
  await expect(page.locator(".task-card")).toHaveCount(1);
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page
    .getByLabel("Situação de Corrigir resultado")
    .selectOption("progress");
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  await expect(page.locator("#column-progress")).toContainText(
    "Corrigir resultado",
  );
  await page.locator(".task-card").click();
  await expect(page.getByLabel("Situação", { exact: true })).toHaveValue(
    "progress",
  );
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(
    "pendencia",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await expect(page.getByLabel("Ordenar cartões")).toHaveValue("priority");
});

test("rolagem alcança todas as fases em telas menores e anima movimentação respeitando movimento reduzido", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  const board = page.getByRole("region", { name: "Quadro de implantação" });
  await page
    .getByLabel("Rolar quadro horizontalmente", { exact: true })
    .press("End");
  await expect
    .poll(() =>
      board.evaluate((el) =>
        Math.abs(el.scrollWidth - el.clientWidth - el.scrollLeft),
      ),
    )
    .toBeLessThan(2);
  await expect(page.locator("#column-concluido h3")).toBeInViewport();
  await board.focus();
  await page.keyboard.press("ArrowLeft");
  await expect
    .poll(() =>
      board.evaluate((el) => el.scrollWidth - el.clientWidth - el.scrollLeft),
    )
    .toBeGreaterThan(10);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.setViewportSize({ width: 1440, height: 1080 });
  await page.evaluate(() => {
    window.cardAnimations = 0;
    const original = Element.prototype.animate;
    Element.prototype.animate = function (...args) {
      if (this.dataset.taskId) window.cardAnimations++;
      return original.apply(this, args);
    };
  });
  await page
    .getByLabel("Rolar quadro horizontalmente", { exact: true })
    .press("Home");
  const card = page
    .locator(".task-card")
    .filter({ hasText: "Homologação de Frotas" });
  await card.dragTo(page.locator("#column-todo"), {
    targetPosition: { x: 45, y: 25 },
  });
  await expect(page.locator("#column-todo")).toContainText(
    "Homologação de Frotas",
  );
  expect(await page.evaluate(() => window.cardAnimations)).toBeGreaterThan(0);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.evaluate(() => (window.cardAnimations = 0));
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await page
    .getByLabel("Situação de Homologação de Frotas")
    .selectOption("waiting");
  await page.getByRole("button", { name: "Quadro", exact: true }).click();
  expect(await page.evaluate(() => window.cardAnimations)).toBe(0);
  await expect(page.locator("#column-waiting")).toContainText(
    "Homologação de Frotas",
  );
});
