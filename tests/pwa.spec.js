import packageInfo from "../package.json" with { type: "json" };
import { test, expect } from "./fixtures/test.js";
import { chromium } from "@playwright/test";
import { readFile, writeFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
const url = "http://127.0.0.1:5176/Implantation-WS/";
const appVersion = packageInfo.version;
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
  // id resolves against the origin, not the manifest directory. './' would
  // identify this app as the domain root and collide with other Pages PWAs.
  const origin = new URL(url).origin;
  expect(new URL(details.manifest.id, origin).pathname).toBe(
    "/Implantation-WS/",
  );
  expect(new URL(details.manifest.id, origin).href).not.toBe(
    new URL("/Video_Translate/", origin).href,
  );
  expect(details.manifest.display).toBe("standalone");
  expect(details.images).toEqual([
    { width: 192, height: 192, purpose: "any" },
    { width: 512, height: 512, purpose: "any" },
    { width: 512, height: 512, purpose: "maskable" },
  ]);
  const cdp = await context.newCDPSession(page);
  const processed = await cdp.send("Page.getAppManifest");
  expect(processed.manifest.id).toBe(`${origin}/Implantation-WS/`);
  expect(processed.manifest.scope).toBe(url);
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
  await expect(page.locator(".page-footer")).toContainText(`v${appVersion}`);
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

test("login com falha no banco registra PWA e oferece atualização sem entrar no workspace", async ({
  page,
}) => {
  const path = ".local/pwa-site/Implantation-WS/sw.js",
    original = await readFile(path, "utf8");
  const key = "sb_publishable_test_public",
    id = "00000000-0000-4000-8000-000000000001";
  const auth = {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: id, role: "authenticated", exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`,
    refresh_token: "test-session-preserved",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user: {
      id,
      email: "teste@example.invalid",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-04T12:00:00Z",
    },
  };
  await page.addInitScript(
    ({ auth, key }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify({ url: "https://access-test.supabase.co", key }),
      );
      if (!localStorage.getItem("sb-access-test-auth-token"))
        localStorage.setItem("sb-access-test-auth-token", JSON.stringify(auth));
    },
    { auth, key },
  );
  await page.route("https://access-test.supabase.co/**", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({ code: "PGRST202", message: "RPC unavailable" }),
    }),
  );
  try {
    await page.goto(url);
    await expect(
      page.getByRole("heading", { name: "Seu acesso à equipe" }),
    ).toBeVisible();
    await controlled(page);
    const before = await page.evaluate(() => ({
      session: localStorage.getItem("sb-access-test-auth-token"),
      data: localStorage.getItem("implanta.workspace.v1"),
    }));
    await writeFile(path, original + `\n// auth update ${Date.now()}\n`);
    await page
      .getByRole("button", { name: "Atualizar aplicativo", exact: true })
      .click();
    await expect
      .poll(() =>
        page.evaluate(() => performance.getEntriesByType("navigation")[0].type),
      )
      .toBe("reload");
    await expect(
      page.getByRole("heading", { name: "Seu acesso à equipe" }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => ({
        session: localStorage.getItem("sb-access-test-auth-token"),
        data: localStorage.getItem("implanta.workspace.v1"),
      })),
    ).toEqual(before);
  } finally {
    await writeFile(path, original);
  }
});

test("recuperação ultrapassa tela antiga sem JavaScript, atualiza o worker e preserva sessão, cadastros e outros caches", async ({
  page,
}) => {
  const path = ".local/pwa-site/Implantation-WS/sw.js",
    original = await readFile(path, "utf8");
  const legacy = `self.addEventListener('install',()=>self.skipWaiting());self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>{if(e.request.mode==='navigate' && !new URL(e.request.url).pathname.includes('/assets/'))e.respondWith(Promise.resolve(new Response('<!doctype html><html><body><h1>Versão antiga sem atualização</h1></body></html>',{headers:{'Content-Type':'text/html;charset=utf-8'}})));});`;
  try {
    await writeFile(path, legacy);
    await page.goto(url);
    await controlled(page);
    await page.reload();
    await expect(
      page.getByRole("heading", { name: "Versão antiga sem atualização" }),
    ).toBeVisible();
    await page.evaluate(async () => {
      localStorage.setItem(
        "implanta.recovery.test.session",
        "sessão preservada",
      );
      const c = await caches.open("another-app-preserved");
      await c.put("/other-data", new Response("não apagar"));
    });
    const saved = await page.evaluate(() =>
      localStorage.getItem("implanta.workspace.v1"),
    );
    await writeFile(path, original);
    // v1.18.0 already excludes /assets/ from its navigation fallback.
    await page.goto(url + "assets/atualizar.html");
    await expect(
      page.getByRole("heading", { name: "Atualizar este aparelho" }),
    ).toBeVisible();
    await page
      .getByRole("button", { name: "Atualizar este aparelho", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
    ).toBeVisible({ timeout: 30000 });
    expect(
      await page.evaluate(() =>
        localStorage.getItem("implanta.recovery.test.session"),
      ),
    ).toBe("sessão preservada");
    expect(
      await page.evaluate(() => localStorage.getItem("implanta.workspace.v1")),
    ).toBe(saved);
    expect(
      await page.evaluate(async () =>
        (await caches.open("another-app-preserved"))
          .match("/other-data")
          .then((r) => r.text()),
      ),
    ).toBe("não apagar");
    expect(new URL(page.url()).pathname).toBe("/Implantation-WS/");
  } finally {
    await writeFile(path, original);
  }
});

test("ajuste de ponto em várias datas baixa PDF e salva histórico pessoal offline", async ({
  page,
  context,
}) => {
  await page.goto(url);
  await controlled(page);
  await page
    .getByRole("button", { name: "Ajuste de ponto", exact: true })
    .click();
  await page.getByRole("button", { name: "Novo ajuste", exact: true }).click();
  await page
    .getByLabel("Nome do funcionário", { exact: false })
    .fill("Técnico Local");
  await page.getByRole("checkbox", { name: "Entrada", exact: true }).check();
  await page.getByLabel("Horário de entrada", { exact: false }).fill("08:15");
  await page
    .getByRole("textbox", { name: "Justificativa *", exact: true })
    .fill("Esquecimento de batida, conforme o boletim.");
  await page.getByLabel("Local *", { exact: true }).fill("São José / SC");
  await page
    .getByLabel("Data da ocorrência 1 *", { exact: true })
    .fill("2026-11-04");
  await page
    .getByRole("button", { name: "Adicionar data", exact: true })
    .click();
  await page
    .getByLabel("Data da ocorrência 2 *", { exact: true })
    .fill("2026-11-05");
  await page.getByRole("checkbox", { name: "Saída", exact: true }).check();
  await page.getByLabel("Horário de saída", { exact: false }).fill("18:20");
  await context.setOffline(true);
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Baixar PDF", exact: true })
    .click();
  const file = await download;
  const { PDFDocument } = await import("pdf-lib");
  expect(
    (await PDFDocument.load(await readFile(await file.path()))).getPageCount(),
  ).toBe(2);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ajuste", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".time-adjustment-card")).toHaveCount(2);
  await expect(page.locator(".time-adjustment-card").first()).toContainText(
    "08:15",
  );
  await page.reload();
  await page
    .getByRole("button", { name: "Ajuste de ponto", exact: true })
    .click();
  await expect(page.locator(".time-adjustment-card")).toHaveCount(2);
  await expect(page.locator(".time-adjustment-card").first()).toContainText(
    "Técnico Local",
  );
  const later = page
    .locator(".time-adjustment-card")
    .filter({
      has: page.getByRole("heading", { name: "05/11/2026", exact: true }),
    });
  await expect(later).toContainText("Saída · 18:20");
  await expect(later).not.toContainText("Entrada · 08:15");
  await later.getByRole("button", { name: "Editar", exact: true }).click();
  await expect(
    page.getByRole("checkbox", { name: "Saída", exact: true }),
  ).toBeChecked();
  await expect(
    page.getByRole("checkbox", { name: "Entrada", exact: true }),
  ).not.toBeChecked();
  await expect(
    page.getByLabel("Horário de saída", { exact: false }),
  ).toHaveValue("18:20");
});
