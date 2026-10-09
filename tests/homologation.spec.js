import { test, expect } from "@playwright/test";
async function open(page) {
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
}
async function configure(page, pairs) {
  await page.getByRole("button", { name: "Configurar migração" }).click();
  for (const [module, entity] of pairs)
    await page
      .locator(".scope-module")
      .filter({ hasText: module })
      .getByLabel(entity, { exact: true })
      .check();
  await page.getByRole("button", { name: "Salvar escopo" }).click();
}
async function ok(page, module, entity) {
  await page
    .getByRole("button", {
      name: `Conferir ${module} — ${entity}`,
      exact: true,
    })
    .click();
  for (const check of await page.locator(".migration-check input").all())
    await check.check();
  await page.getByLabel("Resultado da conferência").selectOption("ok");
  await page.getByLabel("Validado por", { exact: true }).fill("Vitor");
  await page
    .getByLabel("Referência / evidência da conferência")
    .fill("Saldos e relatório de referência dos dois sistemas conferidos.");
  await page.getByRole("button", { name: "Registrar OK", exact: true }).click();
}
test("homologação por módulo e entidade libera apenas o escopo escolhido, persiste e reabre com histórico", async ({
  page,
}) => {
  await open(page);
  await expect(
    page.getByRole("button", { name: "Liberar homologação", exact: true }),
  ).toBeDisabled();
  await configure(page, [
    ["Patrimônio", "Prefeitura"],
    ["Patrimônio", "Fundo de Saúde"],
    ["Frota", "Prefeitura"],
  ]);
  await expect(page.locator(".homologation-summary")).toContainText("0/3");
  await page
    .getByRole("button", {
      name: "Conferir Patrimônio — Prefeitura",
      exact: true,
    })
    .click();
  await page.getByLabel("Resultado da conferência").selectOption("ok");
  await page.getByLabel("Validado por", { exact: true }).fill("Vitor");
  await page
    .getByLabel("Referência / evidência da conferência")
    .fill("Comparação de relatórios");
  await page.getByRole("button", { name: "Registrar OK", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("status")).toContainText("conclua a conferência");
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await ok(page, "Patrimônio", "Prefeitura");
  await expect(
    page.getByRole("button", { name: "Liberar homologação", exact: true }),
  ).toBeDisabled();
  await ok(page, "Patrimônio", "Fundo de Saúde");
  await ok(page, "Frota", "Prefeitura");
  await expect(page.locator(".homologation-summary")).toContainText("3/3");
  await page
    .getByRole("button", { name: "Liberar homologação", exact: true })
    .click();
  await page.getByLabel("Liberado por").fill("Colega");
  await page.getByRole("button", { name: "Confirmar liberação" }).click();
  await expect(page.locator(".homologation-release-state")).toContainText(
    "Homologação liberada",
  );
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Dados e backup", exact: true })
    .click();
  await page.getByRole("button", { name: /Exportar backup/ }).click();
  const file = await download;
  const { readFile } = await import("node:fs/promises");
  const backup = JSON.parse(await readFile(await file.path(), "utf8"));
  expect(backup.projects[0].homologation.release.by).toBe("Colega");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await expect(page.locator(".homologation-release-state")).toContainText(
    "Colega",
  );
  await page
    .getByRole("button", { name: "Conferir Frota — Prefeitura", exact: true })
    .click();
  await page.getByLabel("Resultado da conferência").selectOption("pending");
  await page
    .getByRole("button", { name: "Salvar conferência", exact: true })
    .click();
  await expect(page.locator(".homologation-summary")).toContainText("2/3");
  await page
    .locator("nav")
    .getByRole("button", { name: "Histórico", exact: true })
    .click();
  await expect(page.locator(".timeline")).toContainText(
    "Homologação de Quatro Barras",
  );
  await expect(page.locator(".timeline")).toContainText("Validado por Colega");
});
test("divergência cria uma pendência vinculada e homologação continua independente do quadro", async ({
  page,
}) => {
  await open(page);
  await configure(page, [["Almoxarifado", "Prefeitura"]]);
  await page
    .getByRole("button", {
      name: "Conferir Almoxarifado — Prefeitura",
      exact: true,
    })
    .click();
  await page.getByLabel("Resultado da conferência").selectOption("issue");
  await page
    .getByLabel("Observações / divergências")
    .fill("Saldo de material não corresponde ao sistema anterior.");
  await page
    .getByLabel("Criar pendência no quadro para esta divergência")
    .check();
  await page
    .getByRole("button", { name: "Salvar conferência", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Conferir Almoxarifado — Prefeitura",
      exact: true,
    }),
  ).toContainText("Divergência");
  await page
    .getByRole("button", {
      name: "Conferir Almoxarifado — Prefeitura",
      exact: true,
    })
    .click();
  await page.getByRole("button", { name: /Abrir pendência vinculada/ }).click();
  await expect(page.getByLabel("Categoria", { exact: true })).toHaveValue(
    "pendencia",
  );
  await expect(page.getByLabel("Problema", { exact: true })).toHaveValue(
    "Saldo de material não corresponde ao sistema anterior.",
  );
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  const stored = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
  expect(
    stored.projects[0].tasks.filter((t) => t.homologationEntryId),
  ).toHaveLength(1);
});
test("homologação móvel permite conferir sem estourar a tela e preserva formulário se falhar o salvamento", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await page.locator(".municipality-card").click();
  await page.getByRole("button", { name: "Abrir menu" }).click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await configure(page, [["Elicita", "Câmara Municipal"]]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page
    .getByRole("button", {
      name: "Conferir Elicita — Câmara Municipal",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Observações / divergências")
    .fill("Conferência em andamento, não perder notas.");
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new DOMException("Sem espaço", "QuotaExceededError");
    };
  });
  await page
    .getByRole("button", { name: "Salvar conferência", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByLabel("Observações / divergências")).toHaveValue(
    "Conferência em andamento, não perder notas.",
  );
  await expect(page.getByRole("status")).toContainText(
    "Não foi possível salvar",
  );
});

test("cada município mantém seu próprio escopo de homologação", async ({
  page,
}) => {
  await open(page);
  await configure(page, [["Patrimônio", "Prefeitura"]]);
  await page
    .locator("nav")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Novo município", exact: true })
    .click();
  await page
    .getByLabel("Nome do município")
    .fill("Município com outra migração");
  await page
    .getByRole("button", { name: "Salvar município", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await expect(page.locator(".homologation-summary")).toContainText("0/0");
  await configure(page, [["Frota", "Prefeitura"]]);
  await expect(
    page.getByRole("button", {
      name: "Conferir Frota — Prefeitura",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Conferir Patrimônio — Prefeitura",
      exact: true,
    }),
  ).toHaveCount(0);
  await page
    .locator(".project-nav")
    .getByRole("button", { name: "Quatro Barras", exact: true })
    .click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Conferir Patrimônio — Prefeitura",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: "Conferir Frota — Prefeitura",
      exact: true,
    }),
  ).toHaveCount(0);
});
