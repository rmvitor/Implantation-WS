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

test("mouse navega pelas fases sem disputar a rolagem vertical dos cartões", async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 900 });
  const data = createDemo();
  data.projects[0].tasks = Array.from({ length: 20 }, (_, i) => ({
    ...newActivity("todo"), id: `mouse-${i}`, title: `Atividade ${i}`,
  }));
  await page.addInitScript((data) => localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)), data);
  await page.goto("/");
  await page.locator(".municipality-card").click();
  const board = page.locator(".kanban"), top = page.locator(".board-scroll-mirror");
  const cards = page.locator("#column-todo .column-cards");
  await cards.hover();
  await page.mouse.wheel(0, 180);
  await expect.poll(() => cards.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  expect(await board.evaluate((el) => el.scrollLeft)).toBe(0);
  await page.keyboard.down("Shift");
  await page.mouse.wheel(0, 180);
  await page.keyboard.up("Shift");
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
  await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".kanban").scrollLeft - document.querySelector(".board-scroll-mirror").scrollLeft))).toBeLessThanOrEqual(1);
  await top.hover();
  await page.mouse.wheel(0, 180);
  await expect.poll(() => top.evaluate((el) => el.scrollLeft)).toBeGreaterThan(300);
  await top.focus();
  await page.keyboard.press("Home");
  await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBe(0);
  // Successive trackpad movements must keep going forward, not be rewound by
  // delayed scroll events from the mirrored bar.
  await cards.hover();
  let previous = 0;
  for (let i = 0; i < 5; i++) {
    await page.mouse.wheel(80, 0);
    await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(previous + 30);
    previous = await board.evaluate((el) => el.scrollLeft);
  }
  await expect.poll(() => top.evaluate((el) => el.scrollLeft)).toBe(previous);
});

test("gesto horizontal no celular percorre as fases sobre a lista de cartões", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  try {
    const page = await context.newPage();
    await page.addInitScript((data) => localStorage.setItem("implanta.workspace.v1", JSON.stringify(data)), createDemo());
    await page.goto("/");
    await page.locator(".municipality-card").click();
    const board = page.locator(".kanban");
    await board.scrollIntoViewIfNeeded();
    const bounds = await page.locator("#column-todo .column-cards").boundingBox();
    const y = Math.max(20, Math.min(780, bounds.y + 45));
    const cdp = await context.newCDPSession(page);
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: 290, y }] });
    for (let x = 270; x >= 80; x -= 20) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y }] });
      await page.waitForTimeout(16);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect.poll(() => board.evaluate((el) => el.scrollLeft)).toBeGreaterThan(150);
    await expect.poll(() => page.evaluate(() => Math.abs(document.querySelector(".kanban").scrollLeft - document.querySelector(".board-scroll-mirror").scrollLeft))).toBeLessThanOrEqual(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  } finally { await context.close(); }
});
