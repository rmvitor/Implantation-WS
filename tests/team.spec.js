import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";

// Browser contract tests use a controlled Supabase HTTP double. The database
// restrictions are exercised separately against real PostgreSQL, not this mock.
const userId = "00000000-0000-4000-8000-000000000001";
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
const config = { url: "https://test.supabase.co", key: jwt("anon") };
async function setup(page, { role = "editor", loggedIn = true } = {}) {
  const demo = createDemo();
  const state = {
    row: { id: demo.projects[0].id, data: demo.projects[0], version: 1 },
    role,
    active: role !== "pending",
    revoked: false,
    fail: false,
    writes: 0,
    reads: 0,
    preferences: {},
    grants: [],
  };
  const user = {
    id: userId,
    email: "teste@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    app_metadata: { provider: "email" },
    user_metadata: {},
    created_at: "2026-10-09T00:00:00Z",
  };
  const session = {
    access_token: jwt("authenticated"),
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  await page.addInitScript(
    ({ config, demo, session }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify(config),
      );
      localStorage.setItem("implanta.workspace.v1", JSON.stringify(demo));
      if (session)
        localStorage.setItem("sb-test-auth-token", JSON.stringify(session));
    },
    { config, demo, session: loggedIn ? session : null },
  );
  await page.route("https://test.supabase.co/**", async (route) => {
    const req = route.request(),
      url = new URL(req.url()),
      path = url.pathname;
    let data = null,
      status = 200;
    if (path === "/auth/v1/token") data = session;
    else if (path === "/auth/v1/user") data = user;
    else if (path === "/auth/v1/signup") data = { user, session: null };
    else if (path === "/auth/v1/logout") {
      status = 204;
    } else if (path.endsWith("/rpc/implanta_access"))
      data = {
        id: userId,
        name: "Colega teste",
        email: user.email,
        active: state.active,
        admin: role === "admin",
      };
    else if (path.endsWith("/rpc/implanta_admin_users"))
      data = [
        {
          id: userId,
          name: "Colega teste",
          email: user.email,
          active: true,
          admin: true,
        },
        {
          id: "00000000-0000-4000-8000-000000000002",
          name: "Nova colega",
          email: "colega@example.invalid",
          active: false,
          admin: false,
        },
      ];
    else if (path.endsWith("/rpc/implanta_grant_project")) {
      const args = req.postDataJSON();
      state.grants.push(args);
      state.members = [
        { project_id: args.p_project, user_id: args.p_user, role: args.p_role },
      ];
    } else if (path.endsWith("/rpc/implanta_commit")) {
      const args = req.postDataJSON();
      if (state.fail) {
        status = 503;
        data = { message: "network temporarily unavailable" };
      } else if (
        args.p_changes.some((c) => c.version !== state.row.version && !c.create)
      ) {
        status = 409;
        data = { code: "40001", message: "version conflict" };
      } else {
        state.writes++;
        for (const change of args.p_changes)
          state.row = {
            id: change.id,
            data: change.data,
            version: state.row.version + 1,
          };
        if (args.p_preferences) state.preferences = args.p_preferences;
      }
    } else if (path.endsWith("/implanta_projects")) {
      state.reads++;
      data =
        state.revoked || !state.active
          ? []
          : url.searchParams.has("id")
            ? state.row
            : [state.row];
    } else if (path.endsWith("/implanta_members"))
      data =
        state.members ||
        (role === "admin"
          ? []
          : [
              {
                project_id: state.row.id,
                user_id: userId,
                role: role === "viewer" ? "viewer" : "editor",
              },
            ]);
    else if (path.endsWith("/implanta_preferences"))
      data = { data: state.preferences };
    else if (path === "/auth/v1/recover") data = {};
    else throw new Error(`Unexpected test request: ${path}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: status === 204 ? "" : JSON.stringify(data),
    });
  });
  return state;
}
async function openProject(page) {
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}

test("login protege os projetos e logout retira os dados online da tela", async ({
  page,
}) => {
  await setup(page, { loggedIn: false });
  await page.goto("/");
  await expect(
    page.getByRole("heading", { name: "Entrar na equipe" }),
  ).toBeVisible();
  await expect(page.locator(".municipality-card")).toHaveCount(0);
  await page
    .getByLabel("E-mail", { exact: true })
    .fill("teste@example.invalid");
  await page.getByLabel("Senha", { exact: true }).fill("senha-de-teste");
  await page.getByRole("button", { name: "Entrar", exact: true }).click();
  await expect(page.locator(".municipality-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Equipe e acessos", exact: true })
    .click();
  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "Entrar na equipe" }),
  ).toBeVisible();
  await expect(page.locator(".task-card,.municipality-card")).toHaveCount(0);
});
test("cadastro pendente não carrega projetos", async ({ page }) => {
  const state = await setup(page, { role: "pending" });
  await page.goto("/");
  await expect(page.getByText(/Seu cadastro aguarda liberação/)).toBeVisible();
  expect(state.reads).toBe(0);
  await expect(page.locator(".municipality-card")).toHaveCount(0);
});
test("visualizador abre contexto mas não edita, arrasta, encerra ou exclui", async ({
  page,
}) => {
  await setup(page, { role: "viewer" });
  await openProject(page);
  await expect(
    page.getByRole("button", { name: "Nova atividade", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Encerrar projeto", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Excluir projeto", exact: true }),
  ).toBeDisabled();
  const card = page
    .locator(".task-card")
    .filter({ hasText: "Homologação de Frotas" });
  await expect(card).toHaveAttribute("draggable", "false");
  await card.click();
  await expect(
    page.getByLabel("Título da atividade *", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salvar atividade no topo" }),
  ).toBeDisabled();
  await page.getByRole("button", { name: "Fechar" }).click();
  await page.getByRole("button", { name: "Lista", exact: true }).click();
  await expect(
    page.getByLabel("Situação de Homologação de Frotas"),
  ).toBeDisabled();
});
test("edição online combina alteração de colega; falha mantém o formulário e não grava backup local", async ({
  page,
}) => {
  const state = await setup(page);
  await openProject(page);
  const originalLocal = await page.evaluate(() =>
    localStorage.getItem("implanta.workspace.v1"),
  );
  await page
    .locator(".task-card")
    .filter({ hasText: "Homologação de Frotas" })
    .click();
  await page
    .getByLabel("Atividades executadas", { exact: true })
    .fill("Conferência executada online");
  const task = state.row.data.tasks.find(
    (t) => t.title === "Homologação de Frotas",
  );
  task.nextAction = "Próxima ação atualizada pelo colega";
  state.row.version++;
  state.fail = true;
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByLabel("Atividades executadas", { exact: true }),
  ).toHaveValue("Conferência executada online");
  await expect(
    page.getByText(/Não foi possível conectar ao banco/),
  ).toBeVisible();
  state.fail = false;
  await page.getByRole("button", { name: "Salvar atividade no topo" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const saved = state.row.data.tasks.find((t) => t.id === task.id);
  expect(saved.executedWork).toBe("Conferência executada online");
  expect(saved.nextAction).toBe("Próxima ação atualizada pelo colega");
  expect(
    await page.evaluate(() => localStorage.getItem("implanta.workspace.v1")),
  ).toBe(originalLocal);
});
test("administrador define permissão de projeto por usuário", async ({
  page,
}) => {
  const state = await setup(page, { role: "admin" });
  await page.goto("/");
  await page
    .getByRole("button", { name: "Equipe e acessos", exact: true })
    .click();
  await page.getByLabel("Acesso de Nova colega").selectOption("editor");
  await expect.poll(() => state.grants.length).toBe(1);
  expect(state.grants[0].p_role).toBe("editor");
  expect(state.grants[0].p_project).toBe(state.row.id);
});
test("revogar projeto fecha formulário e retira o município da sessão", async ({
  page,
}) => {
  const state = await setup(page);
  await openProject(page);
  await page
    .locator(".task-card")
    .filter({ hasText: "Homologação de Frotas" })
    .click();
  state.revoked = true;
  await page.evaluate(() => window.dispatchEvent(new Event("focus")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".municipality-card,.task-card")).toHaveCount(0);
});
