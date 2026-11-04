import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";
import { PDFDocument } from "pdf-lib";
const userId = "00000000-0000-4000-8000-000000000001";
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
async function setup(page, { missing = false } = {}) {
  const user = {
    id: userId,
    email: "tecnico@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: {},
    user_metadata: {},
    created_at: "2026-11-04T12:00:00Z",
  };
  const session = {
    access_token: jwt("authenticated"),
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  const state = { rows: [], calls: [], fail: false, hold: false, held: false };
  await page.addInitScript(
    ({ session, key }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify({ url: "https://time-test.supabase.co", key }),
      );
      localStorage.setItem("sb-time-test-auth-token", JSON.stringify(session));
    },
    { session, key: jwt("anon") },
  );
  await page.route("https://time-test.supabase.co/**", async (route) => {
    const request = route.request(),
      path = new URL(request.url()).pathname,
      args = request.postDataJSON() || {};
    state.calls.push({ path, args });
    let data = [],
      status = 200;
    if (path.endsWith("/rpc/implanta_access"))
      data = {
        id: userId,
        name: "Técnico Teste",
        email: user.email,
        active: true,
        admin: false,
        master: false,
        rolesVersion: 1,
        projectRoles: [],
      };
    else if (path.endsWith("/rpc/implanta_read_v2"))
      data = { records: [], projects: [], access: [], preferences: {} };
    else if (path === "/auth/v1/user") data = user;
    else if (path === "/auth/v1/token") data = session;
    else if (path.endsWith("/rpc/implanta_time_adjustments")) {
      if (missing) {
        status = 404;
        data = { code: "PGRST202" };
      } else data = state.rows;
    } else if (path.endsWith("/rpc/implanta_time_adjustment_save")) {
      if (state.hold) {
        state.hold = false;
        state.held = true;
        await new Promise((resolve) => (state.release = resolve));
      }
      if (state.fail) {
        status = 409;
        data = { code: "40001" };
      } else {
        const old = state.rows.find((r) => r.id === args.p_id);
        data = {
          id: args.p_id,
          user_id: userId,
          data: args.p_data,
          revision: (old?.revision || 0) + 1,
          created_at: old?.created_at || new Date().toISOString(),
          updated_at: new Date().toISOString(),
        };
        state.rows = [data, ...state.rows.filter((r) => r.id !== data.id)];
      }
    } else if (path.endsWith("/rpc/implanta_time_adjustment_delete")) {
      state.rows = state.rows.filter((r) => r.id !== args.p_id);
      data = null;
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Projetos e municípios", exact: true }),
  ).toBeVisible();
  if (
    await page
      .getByRole("button", { name: "Abrir menu", exact: true })
      .isVisible()
  )
    await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page
    .getByRole("button", { name: "Ajuste de ponto", exact: true })
    .click();
  await expect(
    page.getByRole("heading", { name: "Ajuste de ponto", exact: true }),
  ).toBeVisible();
  return state;
}
async function fill(page) {
  await page.getByRole("button", { name: "Novo ajuste", exact: true }).click();
  await expect(
    page.getByLabel("Nome do funcionário", { exact: false }),
  ).toHaveValue("Técnico Teste");
  await expect(page.getByLabel("Cargo", { exact: false })).toHaveValue(
    "Técnico de implantação",
  );
  await expect(
    page.getByLabel("Horário de entrada", { exact: false }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Hora de emissão", { exact: false }),
  ).not.toHaveValue("");
  await page.getByRole("checkbox", { name: "Entrada", exact: true }).check();
  await expect(
    page.getByLabel("Horário de entrada", { exact: false }),
  ).toHaveValue("");
  await page.getByLabel("Horário de entrada", { exact: false }).fill("08:10");
  await page
    .getByRole("combobox", { name: "Justificativa sugerida", exact: true })
    .selectOption("travel");
  await page
    .getByRole("button", { name: "Inserir sugestão", exact: true })
    .click();
  await page.getByLabel("Local", { exact: false }).fill("São José / SC");
}
for (const width of [390, 1440])
  test(`ponto independente de projetos, PDF sem salvar, histórico e edição em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await setup(page);
    await fill(page);
    await page
      .getByRole("checkbox", { name: "Intervalo", exact: true })
      .check();
    await page
      .getByLabel("Horário de intervalo", { exact: false })
      .fill("12:00");
    await page
      .getByRole("checkbox", { name: "Intervalo", exact: true })
      .uncheck();
    await page.getByRole("checkbox", { name: "Saída", exact: true }).check();
    await page.getByLabel("Horário de saída", { exact: false }).fill("17:40");
    await page
      .getByText("Responsável pela assinatura (opcional)", { exact: true })
      .click();
    await page
      .getByLabel("Nome de quem assina", { exact: true })
      .fill("Coordenador Teste");
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Baixar PDF", exact: true })
      .click();
    const download = await downloaded;
    expect(download.suggestedFilename()).toMatch(/^ajuste-ponto-.*\.pdf$/);
    const pdf = await PDFDocument.load(await readFile(await download.path()));
    expect(pdf.getPageCount()).toBe(1);
    expect(pdf.getAuthor()).toBe("Técnico Teste");
    expect(state.rows).toHaveLength(0);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Salvar ajuste", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".time-adjustment-card")).toHaveCount(1);
    expect(state.rows[0].data.punches.breakStart).toEqual({
      selected: false,
      time: "",
    });
    expect(state.rows[0].data.punches.entry.time).toBe("08:10");
    expect(state.rows[0].data.issuedTime).not.toBe("");
    expect(state.calls.some((c) => c.path.includes("implanta_commit"))).toBe(
      false,
    );
    if (width === 390)
      await page.screenshot({
        path: ".local/time-adjustments-mobile.png",
        fullPage: true,
      });
    await page.getByRole("button", { name: "Editar", exact: true }).click();
    await page
      .getByRole("textbox", { name: "Justificativa *", exact: true })
      .fill("Texto digitado pelo usuário.");
    await page
      .getByRole("button", { name: "Inserir sugestão", exact: true })
      .click();
    await expect(
      page.getByRole("textbox", { name: "Justificativa *", exact: true }),
    ).toHaveValue(/Texto digitado pelo usuário\./);
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Salvar ajuste", exact: true })
      .first()
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    expect(state.rows[0].revision).toBe(2);
    await page.getByRole("button", { name: "Excluir", exact: true }).click();
    await expect(page.getByRole("dialog")).toContainText(
      "não pode ser desfeita",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect(page.locator(".time-adjustment-card")).toHaveCount(0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
test("localização é opcional, pede no botão e não salva coordenadas; recusa mantém local manual", async ({
  page,
  context,
}) => {
  const state = await setup(page);
  let requests = 0;
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: -27.593548, longitude: -48.558312 });
  await page.route("https://nominatim.openstreetmap.org/**", async (route) => {
    requests++;
    expect(new URL(route.request().url()).searchParams.get("lat")).toBe(
      "-27.59",
    );
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        address: { city: "Florianópolis", "ISO3166-2-lvl4": "BR-SC" },
      }),
    });
  });
  await fill(page);
  expect(requests).toBe(0);
  await page
    .getByRole("button", { name: "Usar cidade atual", exact: true })
    .click();
  await expect(page.getByLabel("Local", { exact: false })).toHaveValue(
    "Florianópolis / SC",
  );
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ajuste", exact: true })
    .first()
    .click();
  expect(JSON.stringify(state.rows[0].data)).not.toMatch(
    /latitude|longitude|coordinates/,
  );
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.evaluate(() => {
    navigator.geolocation.getCurrentPosition = (ok, fail) => fail({ code: 1 });
  });
  await page
    .getByRole("button", { name: "Usar cidade atual", exact: true })
    .click();
  await expect(
    page.getByText(/Permissão de localização não concedida/),
  ).toBeVisible();
  await expect(page.getByLabel("Local", { exact: false })).toHaveValue(
    "Florianópolis / SC",
  );
});
test("falha mantém texto; Voltar não sai durante salvamento; emissão funciona sem SQL de histórico", async ({
  page,
}) => {
  const state = await setup(page, { missing: true });
  await expect(page.getByRole("alert")).toContainText("Ative a rotina");
  await fill(page);
  const download = page.waitForEvent("download");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Baixar PDF", exact: true })
    .click();
  await download;
  expect(state.rows).toHaveLength(0);
  state.fail = true;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ajuste", exact: true })
    .first()
    .click();
  await expect(page.getByRole("dialog").getByRole("alert")).toContainText(
    "alterado em outro aparelho",
  );
  await expect(
    page.getByRole("textbox", { name: "Justificativa *", exact: true }),
  ).not.toHaveValue("");
  state.fail = false;
  state.hold = true;
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Salvar ajuste", exact: true })
    .first()
    .click();
  await expect.poll(() => state.held).toBe(true);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  state.release();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    new Set(
      state.calls
        .filter((c) => c.path.endsWith("/implanta_time_adjustment_save"))
        .map((c) => c.args.p_id),
    ).size,
  ).toBe(1);
});
