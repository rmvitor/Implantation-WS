import { test, expect } from "@playwright/test";
import {
  preparedImplantation,
  completeImplantation,
  technicalActor,
} from "./fixtures/implantation.js";
import { issueImplantationTerm } from "../src/implantation.js";
import { readFile, mkdir } from "node:fs/promises";
import { customerPortalUrl } from "../src/customer-access.js";
const invite = "22222222-2222-4222-8222-222222222222";
const userId = "00000000-0000-4000-8000-000000000004";
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
async function setup(page, { session = false, readFailure = false } = {}) {
  const user = {
    id: userId,
    email: "ana@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: { display_name: "Ana" },
    created_at: "2026-10-26T12:00:00Z",
  };
  const auth = {
    access_token: jwt("authenticated"),
    refresh_token: "customer-refresh",
    token_type: "bearer",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user,
  };
  const state = {
    auth,
    calls: [],
    otp: [],
    fail: false,
    readFailure,
    report: null,
    data: {
      projectName: "Município do cliente",
      entity: "Prefeitura",
      module: "Frota",
      name: "Ana",
      role: "Diretora",
      email: user.email,
      expiresAt: new Date(Date.now() + 7 * 86400000).toISOString(),
      total: 11,
      points: [],
      ready: false,
      readOnly: false,
    },
  };
  await page.addInitScript(
    ({ auth, key, invite }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify({ url: "https://portal.supabase.co", key }),
      );
      localStorage.setItem(
        "sb-portal-auth-token",
        "INTERNAL-SESSION-UNCHANGED",
      );
      if (auth)
        sessionStorage.setItem(
          "implanta.customer.auth.v1:" + invite,
          JSON.stringify(auth),
        );
    },
    { auth: session ? auth : null, key: jwt("anon"), invite },
  );
  await page.route("https://portal.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname;
    state.calls.push(path);
    let data = null,
      status = 200;
    if (path === "/auth/v1/verify") {
      const args = req.postDataJSON();
      if (args.token !== "123456") {
        status = 403;
        data = {
          code: "otp_expired",
          error_code: "otp_expired",
          msg: "Code expired",
        };
      } else data = auth;
    } else if (path === "/auth/v1/user") data = user;
    else if (path === "/auth/v1/logout") data = {};
    else if (path === "/auth/v1/otp") {
      state.otp.push(req.postDataJSON());
      data = {};
    } else if (path.endsWith("/rpc/implanta_customer_read")) {
      if (state.readFailure) {
        status = 403;
        data = { code: "42501", message: "expired" };
      } else if (state.holdRead) {
        state.holdRead = false;
        state.readHeld = true;
        data = structuredClone(state.data);
        await new Promise((resolve) => (state.releaseRead = resolve));
      } else data = state.data;
    } else if (path.endsWith("/rpc/implanta_customer_accept")) {
      if (state.hold) {
        state.hold = false;
        state.held = true;
        await new Promise((resolve) => (state.release = resolve));
      }
      if (state.fail) {
        status = 503;
        data = { message: "Falha temporária ao salvar." };
      } else {
        const args = req.postDataJSON(),
          p = state.data.points.find((p) => p.id === args.p_question);
        if (!p || p.revision !== args.p_revision) {
          status = 409;
          data = { code: "40001", message: "stale" };
        } else {
          p.accepted = args.p_accept;
          p.revision++;
          data = state.data;
        }
      }
    } else if (path.endsWith("/rpc/implanta_customer_report"))
      data = state.report;
    else throw new Error("Unexpected customer request: " + path);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
      headers: { "x-supabase-api-version": "2024-01-01" },
    });
  });
  return state;
}
const point = () => ({
  id: "01",
  text: "Cadastro de motoristas apresentado?",
  help: "",
  notes: "Validação de exemplo",
  revision: 1,
  technical: {
    actorId: technicalActor.id,
    by: "Consultor",
    at: "2026-10-26T12:00:00Z",
    source: "server",
  },
  accepted: false,
  recordedInternally: false,
});
for (const width of [390, 1440])
  test(`cliente entra por código, recebe pontos e confirma sem acessar a equipe em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    await page.clock.install();
    const state = await setup(page);
    await page.goto("/?aceite=" + invite);
    await expect(
      page.getByRole("heading", { name: "Aceite da implantação", exact: true }),
    ).toBeVisible();
    expect(state.calls.some((c) => c.includes("/rpc/"))).toBe(false);
    await page
      .getByLabel("E-mail do responsável", { exact: true })
      .fill("ana@example.invalid");
    await page
      .getByText("Recebi um código por e-mail", { exact: true })
      .click();
    await page
      .getByLabel("Código recebido por e-mail", { exact: true })
      .fill("000000");
    await page
      .getByRole("button", { name: "Entrar no formulário", exact: true })
      .click();
    await expect(page.getByRole("alert")).toContainText("código inválido");
    await page
      .getByLabel("Código recebido por e-mail", { exact: true })
      .fill("123456");
    await page
      .getByRole("button", { name: "Entrar no formulário", exact: true })
      .click();
    await expect(
      page.getByText("Aguardando os primeiros pontos"),
    ).toBeVisible();
    state.data.points = [point()];
    await page.clock.fastForward(5100);
    await expect(
      page.getByRole("heading", {
        name: "1. Cadastro de motoristas apresentado?",
        exact: true,
      }),
    ).toBeVisible();
    const flag = page.getByRole("checkbox", {
      name: "Meu aceite como responsável",
      exact: true,
    });
    state.hold = true;
    await flag.click();
    await expect.poll(() => state.held).toBe(true);
    await expect(flag).toBeDisabled();
    expect(state.data.points[0].accepted).toBe(false);
    state.release();
    await expect(flag).toBeChecked();
    await expect(
      page.getByRole("status").filter({ hasText: "Seu aceite foi confirmado" }),
    ).toBeVisible();
    expect(
      state.calls.some(
        (c) => c.includes("implanta_read_v2") || c.includes("implanta_access"),
      ),
    ).toBe(false);
    expect(
      await page.evaluate(() => localStorage.getItem("sb-portal-auth-token")),
    ).toBe("INTERNAL-SESSION-UNCHANGED");
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await mkdir(".local", { recursive: true });
    await page.screenshot({
      path: `.local/customer-portal-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByRole("button", { name: "Sair do portal", exact: true })
      .click();
    await expect(
      page.getByRole("button", { name: "Enviar link de acesso", exact: true }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => localStorage.getItem("sb-portal-auth-token")),
    ).toBe("INTERNAL-SESSION-UNCHANGED");
  });
test("falha não confirma aceite e acesso revogado retira dados da tela", async ({
  page,
}) => {
  const state = await setup(page, { session: true });
  state.data.points = [point()];
  await page.goto("/?aceite=" + invite);
  const flag = page.getByRole("checkbox", {
    name: "Meu aceite como responsável",
    exact: true,
  });
  await expect(flag).toBeVisible();
  state.fail = true;
  await flag.click();
  await expect(page.getByRole("alert")).toContainText("Falha temporária");
  await expect(flag).not.toBeChecked();
  state.fail = false;
  await flag.click();
  await expect(flag).toBeChecked();
  state.readFailure = true;
  await page
    .getByRole("button", { name: "Atualizar pontos", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("Acesso indisponível");
  await expect(page.getByRole("checkbox")).toHaveCount(0);
});
test("link inválido não abre o workspace; novo acesso usa o e-mail digitado e o retorno do convite", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto("/?aceite=invalid");
  await expect(page.getByRole("alert")).toContainText("Link inválido");
  expect(state.calls).toHaveLength(0);
  await page.goto("/?aceite=" + invite);
  await page
    .getByLabel("E-mail do responsável", { exact: true })
    .fill("ana@example.invalid");
  await page
    .getByRole("button", { name: "Enviar link de acesso", exact: true })
    .click();
  expect(state.otp[0].email).toBe("ana@example.invalid");
  expect(state.otp[0].create_user).toBe(false);
  await expect(page.getByRole("status")).toContainText("novo acesso");
});

test("cliente gera o termo do módulo com timbre e assina como cliente, preservando técnicos", async ({
  page,
}) => {
  const state = await setup(page, { session: true });
  const p = issueImplantationTerm(
    completeImplantation(),
    "Prefeitura",
    { id: userId, name: "Ana" },
    new Date().toISOString(),
    "Frota",
  );
  state.report = {
    ...p.implantation.terms[0],
    origin: "customer-portal",
    source: "server",
  };
  state.report.snapshot.entries[0].questions[0].clients[0].origin =
    "customer-portal";
  state.data.ready = true;
  state.data.points = [{ ...point(), accepted: true }];
  await page.goto("/?aceite=" + invite);
  await page
    .getByRole("button", { name: "Gerar relatório final", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page
    .getByRole("button", { name: "Baixar documento", exact: true })
    .click();
  const html = await readFile(await (await download).path(), "utf8");
  expect(html).toContain("confirmado pelo cliente no portal");
  expect(html).toContain("data:image/png;base64,");
  expect(html).not.toContain("123.456.789-00");
  const doc = await page.context().newPage();
  await doc.setContent(html);
  await expect(doc.locator(".technical-signature")).toHaveCount(1);
  await expect(doc.locator(".technical-signature")).toContainText(
    technicalActor.name,
  );
  await expect(doc.locator(".technical-signature")).not.toContainText("Ana");
  await expect(
    doc.locator(".client-signature").filter({ hasText: "Ana" }),
  ).toContainText("Diretora de Frota");
  await expect(doc.locator(".module")).toHaveCount(1);
  await mkdir(".local", { recursive: true });
  await doc.pdf({
    path: ".local/customer-term.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
  await doc.close();
  state.data.points[0].revision++;
  await page
    .getByRole("button", { name: "Atualizar pontos", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "Baixar documento", exact: true }),
  ).toHaveCount(0);
});

test("uma leitura antiga não sobrescreve os pontos recebidos depois", async ({
  page,
}) => {
  const state = await setup(page, { session: true });
  state.data.points = [point()];
  await page.goto("/?aceite=" + invite);
  await expect(
    page.getByRole("heading", {
      name: "1. Cadastro de motoristas apresentado?",
      exact: true,
    }),
  ).toBeVisible();
  state.holdRead = true;
  await page
    .getByRole("button", { name: "Atualizar pontos", exact: true })
    .click();
  await expect.poll(() => state.readHeld).toBe(true);
  state.data.points = [
    { ...point(), id: "02", text: "Segundo ponto atribuído" },
  ];
  await page
    .getByRole("button", { name: "Atualizar pontos", exact: true })
    .click();
  await expect(
    page.getByRole("heading", {
      name: "1. Segundo ponto atribuído",
      exact: true,
    }),
  ).toBeVisible();
  const response = page.waitForResponse((r) =>
    r.url().endsWith("/rpc/implanta_customer_read"),
  );
  state.releaseRead();
  await (await response).finished();
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  await expect(
    page.getByRole("heading", {
      name: "1. Segundo ponto atribuído",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      name: "1. Cadastro de motoristas apresentado?",
      exact: true,
    }),
  ).toHaveCount(0);
});

for (const type of ["signup", "magiclink"])
  test(`e-mail padrão ${type} abre o formulário pelo link sem digitar código e sem afetar a equipe`, async ({
    page,
  }) => {
    const state = await setup(page);
    state.data.points = [point()];
    const hash = new URLSearchParams({
      access_token: state.auth.access_token,
      refresh_token: state.auth.refresh_token,
      expires_in: "3600",
      token_type: "bearer",
      type,
    });
    await page.goto("/?aceite=" + invite + "#" + hash);
    await expect(
      page.getByRole("heading", { name: "Município do cliente", exact: true }),
    ).toBeVisible();
    await expect(
      page.getByRole("checkbox", {
        name: "Meu aceite como responsável",
        exact: true,
      }),
    ).toBeVisible();
    await expect(
      page.getByLabel("Código recebido por e-mail", { exact: true }),
    ).toHaveCount(0);
    expect(state.calls.some((p) => p === "/auth/v1/verify")).toBe(false);
    expect(
      state.calls.some(
        (p) => p.includes("implanta_access") || p.includes("implanta_read_v2"),
      ),
    ).toBe(false);
    expect(await page.evaluate(() => location.hash)).toBe("");
    expect(
      await page.evaluate(() => localStorage.getItem("sb-portal-auth-token")),
    ).toBe("INTERNAL-SESSION-UNCHANGED");
  });

test("link padrão vencido informa o motivo e permite pedir outro sem exigir código", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto(
    "/?aceite=" +
      invite +
      "#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Link ou código inválido ou vencido",
  );
  await expect(
    page.getByLabel("Código recebido por e-mail", { exact: true }),
  ).not.toBeVisible();
  await page
    .getByLabel("E-mail do responsável", { exact: true })
    .fill("ana@example.invalid");
  await page
    .getByRole("button", { name: "Enviar link de acesso", exact: true })
    .click();
  await expect(page.getByRole("status")).toContainText("novo acesso");
  expect(state.otp[0].email).toBe("ana@example.invalid");
  expect(state.calls.some((p) => p.includes("/rpc/"))).toBe(false);
});

test("erro no retorno do e-mail mostra orientação própria, sem reproduzir texto da URL", async ({
  page,
}) => {
  const state = await setup(page);
  await page.goto(
    "/?aceite=" +
      invite +
      "#error=access_denied&error_code=unexpected&error_description=TEXTO_EXTERNO_NAO_CONFIAVEL",
  );
  await expect(page.getByRole("alert")).toContainText(
    "Não foi possível entrar por este link",
  );
  await expect(page.getByRole("alert")).not.toContainText(
    "TEXTO_EXTERNO_NAO_CONFIAVEL",
  );
  expect(state.calls.some((p) => p.includes("/rpc/"))).toBe(false);
});
