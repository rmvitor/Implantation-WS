import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";
import { newActivity } from "../src/domain.js";
for (const width of [360, 1440]) {
  test(`colunas limitam altura e rolam de forma independente com cartões longos em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const data = createDemo();
    data.projects[0].tasks = ["todo", "progress"].flatMap((stage) =>
      Array.from({ length: 30 }, (_, i) => ({
        ...newActivity(stage),
        id: `${stage}-${i}`,
        title: i === 0 ? "TextoExtenso".repeat(130) : `${stage} atividade ${i}`,
        module: "Patrimônio",
      })),
    );
    await page.addInitScript(
      (data) =>
        localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)),
      data,
    );
    await page.goto("/");
    await page.locator(".municipality-card").click();
    const column = page.locator("#column-todo"),
      cards = column.locator(".column-cards");
    await column.scrollIntoViewIfNeeded();
    await expect
      .poll(() => cards.evaluate((el) => el.scrollHeight > el.clientHeight))
      .toBe(true);
    const height = await column.evaluate(
      (el) => el.getBoundingClientRect().height,
    );
    expect(height).toBeLessThanOrEqual(720);
    expect(height).toBeGreaterThan(200);
    expect(await cards.evaluate((el) => el.scrollWidth <= el.clientWidth)).toBe(
      true,
    );
    const title = column.locator("h4").first();
    expect(
      await title.evaluate((el) => el.scrollHeight <= el.clientHeight + 1),
    ).toBe(true);
    const headingY = (await column.locator(".column-heading").boundingBox()).y;
    await cards.evaluate((el) => (el.scrollTop = el.scrollHeight));
    await expect
      .poll(() => cards.evaluate((el) => el.scrollTop))
      .toBeGreaterThan(0);
    expect(
      (await column.locator(".column-heading").boundingBox()).y,
    ).toBeCloseTo(headingY, 0);
    expect(
      await page
        .locator("#column-progress .column-cards")
        .evaluate((el) => el.scrollTop),
    ).toBe(0);
    await expect(column.locator(".task-card").last()).toBeInViewport();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("arraste mantém rolagem vertical da coluna e movimentação horizontal entre fases", async ({
  page,
}) => {
  const data = createDemo();
  data.projects[0].tasks = Array.from({ length: 30 }, (_, i) => ({
    ...newActivity("todo"),
    id: `task-${i}`,
    title: `Atividade ${i}`,
    module: "Patrimônio",
  }));
  await page.addInitScript(
    (data) =>
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)),
    data,
  );
  await page.goto("/");
  await page.locator(".municipality-card").click();
  const cards = page.locator("#column-todo .column-cards");
  await cards.scrollIntoViewIfNeeded();
  const bounds = await cards.boundingBox();
  await cards.dispatchEvent("dragover", {
    clientX: bounds.x + bounds.width / 2,
    clientY: bounds.y + bounds.height - 4,
    dataTransfer: await page.evaluateHandle(() => new DataTransfer()),
  });
  await expect
    .poll(() => cards.evaluate((el) => el.scrollTop))
    .toBeGreaterThan(0);
  await cards.dispatchEvent("dragend");
  const transfer = await page.evaluateHandle(() => {
    const data = new DataTransfer();
    data.setData("text/plain", "task-0");
    return data;
  });
  await page
    .locator("#column-progress")
    .dispatchEvent("drop", { dataTransfer: transfer });
  await expect(page.locator("#column-progress .task-card")).toHaveCount(1);
  await expect(page.locator("#column-todo .task-card")).toHaveCount(29);
});
