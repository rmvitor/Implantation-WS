import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";
const names = (page) => page.locator(".municipality-card h2");
async function setup(page) {
  const data = createDemo();
  data.projects = [
    "Alfa",
    "Beta",
    "Gama",
    "Encerrado um",
    "Encerrado dois",
  ].map((name, index) => ({
    ...structuredClone(data.projects[0]),
    id: `p${index}`,
    name,
    demo: false,
    status: index > 2 ? "closed" : "active",
  }));
  data.selectedId = "p0";
  await page.addInitScript((data) => {
    if (!localStorage.getItem("implanta.workspace.v1"))
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(data));
  }, data);
  await page.goto("/");
  return data;
}

test("arrastar projeto salva ordem, mantém os dados e sincroniza o seletor após recarregar", async ({
  page,
}) => {
  const initial = await setup(page);
  await page
    .getByRole("button", { name: "Ordenar projetos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Arrastar projeto Alfa", exact: true })
    .dragTo(page.locator('[data-project-id="p2"]'));
  await expect(names(page)).toHaveText(["Beta", "Gama", "Alfa"]);
  await expect(page.locator(".project-order-status")).toContainText(
    "Ordem dos projetos salva.",
  );
  const saved = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
  expect(saved.projects).toEqual(initial.projects);
  await page
    .getByRole("button", { name: "Concluir ordenação", exact: true })
    .click();
  await expect(page.locator(".project-order-controls")).toHaveCount(0);
  await page.reload();
  await expect(names(page)).toHaveText(["Beta", "Gama", "Alfa"]);
  await page
    .getByRole("button", { name: "Trocar projeto ativo", exact: true })
    .click();
  await expect(
    page.getByRole("listbox", { name: "Projetos ativos" }).getByRole("option"),
  ).toHaveText(["Beta", "Gama", "Alfa"]);
});

test("celular ordena por botões, filtra sem perder ordem e organiza encerrados preservando os ativos", async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 900 });
  await setup(page);
  await page
    .getByRole("button", { name: "Ordenar projetos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Mover projeto Gama antes", exact: true })
    .click();
  await expect(names(page)).toHaveText(["Alfa", "Gama", "Beta"]);
  await page.getByLabel("Buscar município", { exact: true }).fill("Beta");
  await expect(names(page)).toHaveText(["Beta"]);
  await expect(
    page.getByRole("button", { name: "Mover projeto Beta antes", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("Buscar município", { exact: true }).fill("");
  await expect(names(page)).toHaveText(["Alfa", "Gama", "Beta"]);
  await page.getByRole("button", { name: /^Encerrados / }).click();
  await page
    .getByRole("button", {
      name: "Mover projeto Encerrado dois antes",
      exact: true,
    })
    .click();
  await expect(names(page)).toHaveText(["Encerrado dois", "Encerrado um"]);
  await page.getByRole("button", { name: /^Ativos / }).click();
  await expect(names(page)).toHaveText(["Alfa", "Gama", "Beta"]);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: "/tmp/implanta-project-order-mobile.png",
    fullPage: true,
  });
});

test("falha de armazenamento conserva a ordem anterior e informa que não foi salva", async ({
  page,
}) => {
  await setup(page);
  await page
    .getByRole("button", { name: "Ordenar projetos", exact: true })
    .click();
  await page.evaluate(() => {
    Storage.prototype.setItem = () => {
      throw new Error("quota");
    };
  });
  await page
    .getByRole("button", { name: "Mover projeto Gama antes", exact: true })
    .click();
  await expect(names(page)).toHaveText(["Alfa", "Beta", "Gama"]);
  await expect(page.locator(".project-order-status")).toContainText(
    "Não foi possível salvar a ordem.",
  );
});
