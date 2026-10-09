import { test, expect } from "./fixtures/test.js";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const url = "http://127.0.0.1:5176/Implantation-WS/";
async function controlled(page) {
  await page.evaluate(() => navigator.serviceWorker.ready);
  if (!(await page.evaluate(() => !!navigator.serviceWorker.controller)))
    await page.reload();
  await expect
    .poll(() => page.evaluate(() => !!navigator.serviceWorker.controller))
    .toBe(true);
}
test("PWA tem identidade, ícones válidos, escopo do Pages e abre offline preservando homologação", async ({
  page,
  context,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(url);
  await controlled(page);
  const details = await page.evaluate(async () => {
    const link = document.querySelector('link[rel="manifest"]');
    const manifestUrl = new URL(link.href);
    const manifest = await (await fetch(manifestUrl)).json();
    const images = await Promise.all(
      manifest.icons.map(async (icon) => {
        const image = new Image();
        image.src = new URL(icon.src, manifestUrl).href;
        await image.decode();
        return {
          width: image.naturalWidth,
          height: image.naturalHeight,
          purpose: icon.purpose,
        };
      }),
    );
    const worker = await navigator.serviceWorker.getRegistration();
    return {
      manifest,
      scope: worker.scope,
      images,
      manifestUrl: manifestUrl.href,
    };
  });
  expect(
    new URL(details.manifest.start_url, details.manifestUrl).pathname,
  ).toBe("/Implantation-WS/");
  expect(new URL(details.manifest.scope, details.manifestUrl).pathname).toBe(
    "/Implantation-WS/",
  );
  expect(details.scope).toBe(url);
  expect(details.manifest.display).toBe("standalone");
  expect(details.images).toEqual([
    { width: 192, height: 192, purpose: "any" },
    { width: 512, height: 512, purpose: "any" },
    { width: 512, height: 512, purpose: "maskable" },
  ]);
  const cdp = await context.newCDPSession(page);
  const installability = await cdp.send("Page.getInstallabilityErrors");
  expect(installability.installabilityErrors.map((e) => e.errorId)).toEqual([
    "in-incognito",
  ]);
  await page.locator(".municipality-card").click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await page.getByRole("button", { name: "Configurar migração" }).click();
  await page
    .locator(".scope-module")
    .filter({ hasText: "Patrimônio" })
    .getByLabel("Prefeitura", { exact: true })
    .check();
  await page.getByRole("button", { name: "Salvar escopo" }).click();
  await context.setOffline(true);
  await page.reload();
  await expect(page.locator(".page-footer")).toContainText("v1.7.1");
  await page.locator(".municipality-card").click();
  await page
    .locator("nav")
    .getByRole("button", { name: "Homologação", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Conferir Patrimônio — Prefeitura",
      exact: true,
    })
    .click();
  await page
    .getByLabel("Observações / divergências")
    .fill("Conferência salva offline");
  await page
    .getByRole("button", { name: "Salvar conferência", exact: true })
    .click();
  await page.reload();
  const data = await page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );
  expect(
    data.projects[0].homologation.entries.find((e) => e.included).notes,
  ).toBe("Conferência salva offline");
  expect(errors).toEqual([]);
});
test("instalação respeita aceite e mostra instruções quando o navegador não oferece o prompt", async ({
  page,
}) => {
  await page.goto(url);
  await controlled(page);
  await page.getByRole("button", { name: "Instalar app", exact: true }).click();
  await expect(page.getByRole("dialog")).toContainText("iPhone / iPad");
  await expect(page.getByRole("dialog")).toContainText("PC · Chrome ou Edge");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.evaluate(() => {
    const event = new Event("beforeinstallprompt");
    event.prompt = async () => {
      window.didPrompt = true;
    };
    event.userChoice = Promise.resolve({ outcome: "accepted" });
    window.dispatchEvent(event);
  });
  await page.getByRole("button", { name: "Instalar app", exact: true }).click();
  await page
    .getByRole("button", { name: "Instalar neste dispositivo" })
    .click();
  expect(await page.evaluate(() => window.didPrompt)).toBe(true);
  await page.evaluate(() => window.dispatchEvent(new Event("appinstalled")));
  await expect(
    page.getByRole("button", { name: "App instalado", exact: true }),
  ).toBeVisible();
});
test("atualização aguarda formulários e preserva cadastros locais", async ({
  page,
}) => {
  const path = ".local/pwa-site/Implantation-WS/sw.js";
  const original = await readFile(path, "utf8");
  try {
    await page.goto(url);
    await controlled(page);
    await page.locator(".municipality-card").click();
    await page
      .getByRole("button", { name: "Nova atividade", exact: true })
      .click();
    await page
      .getByLabel("Título da atividade")
      .fill("Preservar atividade durante atualização");
    await page
      .getByRole("button", { name: "Criar atividade", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Nova atividade", exact: true })
      .click();
    await page
      .getByLabel("Título da atividade")
      .fill("Rascunho ainda não salvo");
    await writeFile(
      path,
      original + `\n// Teste de atualização ${Date.now()}\n`,
    );
    await page.evaluate(async () => {
      const r = await navigator.serviceWorker.getRegistration();
      await r.update();
    });
    await expect(
      page.getByRole("button", { name: "Atualização disponível", exact: true }),
    ).toBeDisabled();
    await expect(page.getByLabel("Título da atividade")).toHaveValue(
      "Rascunho ainda não salvo",
    );
    await page.getByRole("button", { name: "Cancelar", exact: true }).click();
    await page
      .getByRole("button", { name: "Atualizar app", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
    ).toBeVisible();
    const data = await page.evaluate(() =>
      JSON.parse(localStorage.getItem("implanta.workspace.v1")),
    );
    expect(
      data.projects[0].tasks.some(
        (t) => t.title === "Preservar atividade durante atualização",
      ),
    ).toBe(true);
  } finally {
    await writeFile(path, original);
  }
});

test("Chromium com perfil normal reconhece o site como instalável", async () => {
  const directory = await mkdtemp(join(tmpdir(), "implanta-pwa-install-"));
  const context = await chromium.launchPersistentContext(directory, {
    ...test.info().project.use.launchOptions,
    headless: true,
  });
  try {
    const page = await context.newPage();
    await page.goto(url);
    await controlled(page);
    const cdp = await context.newCDPSession(page);
    await expect
      .poll(
        async () =>
          (await cdp.send("Page.getInstallabilityErrors")).installabilityErrors,
      )
      .toEqual([]);
  } finally {
    await context.close();
    await rm(directory, { recursive: true, force: true });
  }
});
