import { test, expect } from "@playwright/test";
import { createDemo } from "./fixtures/workspace.js";
import { projectRecords } from "../src/records.js";
const actor = "00000000-0000-4000-8000-000000000001",
  token = "a".repeat(64);
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: actor, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
async function setup(
  page,
  { publicPage = false, role = "editor", unavailable = false } = {},
) {
  const workspace = createDemo(),
    project = workspace.projects[0];
  const auth = {
    access_token: jwt("authenticated"),
    refresh_token: "test-refresh",
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    expires_in: 3600,
    token_type: "bearer",
    user: {
      id: actor,
      email: "test@example.invalid",
      aud: "authenticated",
      role: "authenticated",
      app_metadata: {},
      user_metadata: {},
      created_at: "2026-11-03T12:00:00Z",
    },
  };
  const state = {
    lists: [],
    people: [],
    calls: [],
    fail: false,
    failRegister: false,
    reads: 0,
    unavailable,
  };
  await page.addInitScript(
    ({ auth, key }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify({ url: "https://attendance.supabase.co", key }),
      );
      localStorage.setItem("sb-attendance-auth-token", JSON.stringify(auth));
    },
    { auth, key: jwt("anon") },
  );
  await page.route("https://attendance.supabase.co/**", async (route) => {
    const req = route.request(),
      path = new URL(req.url()).pathname,
      args = req.postDataJSON() || {};
    state.calls.push({ path, args });
    if (
      path.endsWith("/rpc/implanta_attendance_person_save") &&
      state.holdPerson
    ) {
      state.holdPerson = false;
      state.personHeld = true;
      await new Promise((resolve) => {
        state.releasePerson = resolve;
      });
    }
    let data = [],
      status = 200;
    if (path.endsWith("/rpc/implanta_access"))
      data = {
        id: actor,
        name: "Técnico Teste",
        active: true,
        admin: role === "master",
        master: role === "master",
        rolesVersion: 1,
        projectRoles: [
          { id: project.id, ownerId: "other", ownerName: "Gestor" },
        ],
      };
    else if (path.endsWith("/rpc/implanta_read_v2"))
      data = {
        projects: [{ id: project.id, version: 1 }],
        records: projectRecords(project).map((r) => ({ ...r, revision: 1 })),
        access: [{ project_id: project.id, user_id: actor, role }],
        preferences: {},
      };
    else if (path.endsWith("/rpc/implanta_commit_v2"))
      data = {
        projects: [{ id: project.id, version: 1 }],
        records: projectRecords(project).map((r) => ({ ...r, revision: 1 })),
        access: [{ project_id: project.id, user_id: actor, role }],
        preferences: args.p_preferences || {},
      };
    else if (path === "/auth/v1/user") data = auth.user;
    else if (path === "/auth/v1/token") data = auth;
    else if (path.endsWith("/rpc/implanta_attendance_lists")) {
      state.reads++;
      if (state.unavailable) {
        status = 404;
        data = { code: "PGRST202", message: "Missing RPC" };
      } else
        data = state.lists.map((l) => ({
          ...l,
          count: state.people.filter((p) => p.list_id === l.id).length,
        }));
    } else if (path.endsWith("/rpc/implanta_attendance_save")) {
      if (state.fail) {
        status = 409;
        data = { code: "40001", message: "Conflict" };
      } else {
        const old = state.lists.find((l) => l.id === args.p_id);
        data = {
          id: args.p_id,
          project_id: project.id,
          data: args.p_data,
          revision: (old?.revision || 0) + 1,
          signup_open: false,
          created_by: actor,
          created_at: new Date().toISOString(),
        };
        if (old) Object.assign(old, data);
        else state.lists.push(data);
      }
    } else if (path.endsWith("/rpc/implanta_attendance_read"))
      data = {
        list: state.lists.find((l) => l.id === args.p_id),
        people: state.people.filter((p) => p.list_id === args.p_id),
        audit: [],
      };
    else if (path.endsWith("/rpc/implanta_attendance_person_save")) {
      if (state.fail) {
        status = 409;
        data = { code: "40001", message: "Conflict" };
      } else {
        const old = state.people.find((p) => p.id === args.p_id);
        const p = {
          ...args.p_data,
          id: args.p_id,
          list_id: args.p_list,
          revision: (old?.revision || 0) + 1,
          cpf: args.p_data.cpf ? "***.***.***-25" : "",
          hasCpf: !!args.p_data.cpf,
          origin: "manual",
          confirmed_at: args.p_data.confirmed ? new Date().toISOString() : null,
        };
        if (old) Object.assign(old, p);
        else state.people.push(p);
        data = null;
      }
    } else if (path.endsWith("/rpc/implanta_attendance_link")) {
      const l = state.lists.find((l) => l.id === args.p_id);
      l.signup_open = args.p_action === "generate";
      l.expires_at = args.p_expires;
      l.revision++;
      data = { token: args.p_action === "generate" ? token : null };
    } else if (path.endsWith("/rpc/implanta_attendance_delete")) {
      if (args.p_person)
        state.people = state.people.filter((p) => p.id !== args.p_person);
      else {
        state.lists = state.lists.filter((l) => l.id !== args.p_list);
        state.people = state.people.filter((p) => p.list_id !== args.p_list);
      }
      data = null;
    } else if (path.endsWith("/rpc/implanta_attendance_public_read")) {
      if (state.unavailable) {
        status = 403;
        data = { code: "42501", message: "Link indisponível ou encerrado." };
      } else
        data = {
          title: "Treinamento presencial",
          entity: "Prefeitura",
          city: "Quatro Barras",
          state: "PR",
          date: "2026-11-03",
          module: "Frota",
          submodules: "Abastecimentos",
          hours: "2h",
          instructor: "Técnico Teste",
        };
    } else if (path.endsWith("/rpc/implanta_attendance_register")) {
      if (!state.people.some((p) => p.id === args.p_request))
        state.people.push({ ...args.p_data, id: args.p_request });
      if (state.failRegister) {
        state.failRegister = false;
        await route.abort("failed");
        return;
      }
      data = { registered: true };
    }
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
    });
  });
  if (!publicPage) {
    await page.goto("/");
    await page
      .locator(".municipality-card")
      .filter({ hasText: "Quatro Barras" })
      .click();
    await page
      .locator(".project-navigation")
      .getByRole("button", { name: "Presença", exact: true })
      .click();
  }
  return state;
}
for (const width of [390, 1440]) {
  test(`lista presencial, inclusão manual, QR e exclusão em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await setup(page);
    await page.getByRole("button", { name: "Nova lista", exact: true }).click();
    const form = page.getByRole("dialog");
    await expect(form.getByLabel("Vincular a um treinamento")).toHaveValue("");
    await form.getByLabel("Título do treinamento").fill("Presença Frota");
    await form.getByLabel("Módulo", { exact: true }).fill("Frota");
    await form
      .getByRole("button", { name: "Salvar lista", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.locator(".attendance-panel h3")).toHaveText(
      "Presença Frota",
    );
    expect(state.lists[0].data.trainingId).toBe("");
    await page
      .getByRole("button", { name: "Participante", exact: true })
      .click();
    await page.getByLabel("Nome completo").fill("Cliente Manual");
    await page
      .getByLabel("CPF (opcional)", { exact: true })
      .fill("529.982.247-25");
    await page.getByLabel("Setor (opcional)").fill("Frota");
    await page.getByLabel("E-mail (opcional)").fill("cliente@example.invalid");
    await page
      .getByRole("checkbox", {
        name: "Confirmar participação informada à equipe",
      })
      .check();
    await page
      .getByRole("button", { name: "Salvar participante", exact: true })
      .click();
    await expect(page.locator(".attendance-table")).toContainText(
      "Cliente Manual",
    );
    await expect(page.locator(".attendance-table")).toContainText(
      "***.***.***-25",
    );
    await page
      .getByRole("button", { name: "Link e QR code", exact: true })
      .click();
    await page
      .getByRole("button", { name: "Gerar link e QR code", exact: true })
      .click();
    await expect(page.getByLabel("Link do participante")).toHaveValue(
      `http://127.0.0.1:5173/?presenca=${token}`,
    );
    await expect(
      page.getByRole("img", { name: "QR code para registrar presença" }),
    ).toHaveAttribute("src", /^data:image\/png;base64,/);
    expect(
      state.calls.filter((c) => c.path.includes("attendance_link")),
    ).toHaveLength(1);
    await page
      .getByRole("button", { name: "Encerrar recebimento", exact: true })
      .click();
    await expect(page.getByLabel("Link do participante")).toHaveCount(0);
    if (width === 390)
      await page.screenshot({
        path: ".local/attendance-share-mobile.png",
        fullPage: true,
      });
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Fechar", exact: true })
      .click();
    // Poll refreshes another client's submission without reload or workspace writes.
    state.people.push({
      id: "external",
      list_id: state.lists[0].id,
      name: "Cliente Externo",
      email: "",
      sector: "",
      cpf: "",
      revision: 1,
      origin: "public",
      confirmed: true,
    });
    await expect(page.locator(".attendance-table")).toContainText(
      "Cliente Externo",
      { timeout: 8000 },
    );
    if (width === 390)
      await page.screenshot({
        path: ".local/attendance-list-mobile.png",
        fullPage: true,
      });
    await page.getByLabel("Buscar participante").fill("Manual");
    await expect(page.locator(".attendance-table tbody tr")).toHaveCount(1);
    await page.getByLabel("Buscar participante").fill("");
    await page
      .getByRole("button", { name: "Excluir lista", exact: true })
      .click();
    await expect(page.getByRole("dialog")).toContainText(
      "todas as participações",
    );
    await page
      .getByRole("dialog")
      .getByRole("button", { name: "Excluir", exact: true })
      .click();
    await expect(page.locator(".attendance-list-nav button")).toHaveCount(0);
    expect(
      state.calls
        .filter((c) => c.path.endsWith("/implanta_commit_v2"))
        .every((c) => !c.args.p_changes.length && !c.args.p_removed.length),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
  test(`formulário público preserva sessão, confirma sem CPF e repete envio com segurança em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const state = await setup(page, { publicPage: true });
    state.failRegister = true;
    await page.goto(`/?presenca=${token}`);
    await expect(
      page.getByRole("heading", {
        name: "Treinamento presencial",
        exact: true,
      }),
    ).toBeVisible();
    if (width === 390)
      await page.screenshot({
        path: ".local/attendance-public-mobile.png",
        fullPage: true,
      });
    await page.getByLabel("Nome completo").fill("Cliente Externo");
    await page.getByRole("checkbox").check();
    await page
      .getByRole("button", { name: "Confirmar participação", exact: true })
      .click();
    await expect(page.getByRole("alert")).toBeVisible();
    await expect(page.getByLabel("Nome completo")).toHaveValue(
      "Cliente Externo",
    );
    await page
      .getByRole("button", { name: "Confirmar participação", exact: true })
      .click();
    await expect(
      page.getByRole("heading", { name: "Participação registrada" }),
    ).toBeVisible();
    const sends = state.calls.filter((c) =>
      c.path.endsWith("/implanta_attendance_register"),
    );
    expect(sends).toHaveLength(2);
    expect(sends[0].args.p_request).toBe(sends[1].args.p_request);
    expect(state.people).toHaveLength(1);
    expect(sends[0].args.p_data.cpf).toBe("");
    expect(
      state.calls.every((c) => c.path.includes("/implanta_attendance_")),
    ).toBe(true);
    expect(
      await page.evaluate(
        () =>
          !!JSON.parse(localStorage.getItem("sb-attendance-auth-token"))
            ?.access_token,
      ),
    ).toBe(true);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}
test("vínculo opcional preenche os dados sem alterar treinamento e conflito mantém o rascunho", async ({
  page,
}) => {
  const state = await setup(page);
  await page.getByRole("button", { name: "Nova lista", exact: true }).click();
  const select = page.getByLabel("Vincular a um treinamento");
  const options = await select.locator("option").all();
  expect(options.length).toBeGreaterThan(1);
  const value = await options[1].getAttribute("value");
  await select.selectOption(value);
  const title = await page.getByLabel("Título do treinamento").inputValue();
  expect(title).not.toBe("");
  state.fail = true;
  await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText(
    "alterado por outra pessoa",
  );
  const reads = state.reads;
  await expect
    .poll(() => state.reads, { timeout: 8000 })
    .toBeGreaterThan(reads);
  await expect(page.getByRole("alert")).toContainText(
    "alterado por outra pessoa",
  );
  await expect(page.getByLabel("Título do treinamento")).toHaveValue(title);
  state.fail = false;
  await page.getByRole("button", { name: "Salvar lista", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.lists[0].data.trainingId).toBe(value);
});
test("viewer não cadastra nem muda recebimento; SQL pendente mostra guia", async ({
  page,
}) => {
  await setup(page, { role: "viewer", unavailable: true });
  await expect(
    page.getByRole("button", { name: "Nova lista", exact: true }),
  ).toBeDisabled();
  await expect(page.getByRole("alert")).toContainText("ativada no Supabase");
  await expect(
    page.getByRole("link", { name: "Guia de ativação" }),
  ).toBeVisible();
});
test("link público inválido ou encerrado não abre cadastros e não lê a equipe", async ({
  page,
}) => {
  const state = await setup(page, { publicPage: true, unavailable: true });
  await page.goto("/?presenca=invalido");
  await expect(page.getByRole("alert")).toContainText("inválido");
  expect(state.calls).toHaveLength(0);
  await page.goto(`/?presenca=${token}`);
  await expect(page.getByRole("alert")).toContainText("encerrado");
  await expect(page.getByLabel("Nome completo")).toHaveCount(0);
  expect(
    state.calls.every((c) =>
      c.path.endsWith("/implanta_attendance_public_read"),
    ),
  ).toBe(true);
});

test("conflito mantém participante, recarga é explícita e Voltar aguarda a confirmação do banco", async ({
  page,
}) => {
  const state = await setup(page);
  const id = "22222222-2222-4222-8222-222222222222",
    person = "33333333-3333-4333-8333-333333333333";
  state.lists.push({
    id,
    revision: 1,
    data: {
      title: "Frota presencial",
      entity: "Prefeitura",
      city: "Quatro Barras",
      state: "PR",
      system: "Atende.Net",
      module: "Frota",
      submodules: "",
      instructor: "Ana",
      hours: "2h",
      date: "2026-11-03",
      trainingId: "",
    },
    signup_open: false,
    created_at: new Date().toISOString(),
  });
  state.people.push({
    id: person,
    list_id: id,
    name: "Cliente Original",
    cpf: "",
    sector: "Frota",
    email: "",
    confirmed: true,
    origin: "manual",
    revision: 1,
  });
  await page.getByRole("button", { name: "Atualizar", exact: true }).click();
  await page.getByRole("button", { name: "Editar", exact: true }).click();
  await page.getByLabel("Nome completo").fill("Rascunho local");
  state.fail = true;
  await page
    .getByRole("button", { name: "Salvar participante", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText(
    "alterado por outra pessoa",
  );
  state.people[0].name = "Atualização de colega";
  state.people[0].revision++;
  await page.getByText("Recarregar a edição", { exact: true }).click();
  await page
    .getByRole("button", {
      name: "Descartar rascunho e recarregar",
      exact: true,
    })
    .click();
  await expect(page.getByLabel("Nome completo")).toHaveValue(
    "Atualização de colega",
  );
  state.fail = false;
  state.holdPerson = true;
  await page.getByLabel("Nome completo").fill("Nome confirmado");
  await page
    .getByRole("button", { name: "Salvar participante", exact: true })
    .click();
  await expect.poll(() => state.personHeld).toBe(true);
  await page.goBack();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Salvando…", exact: true }),
  ).toBeDisabled();
  state.releasePerson();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".attendance-table")).toContainText(
    "Nome confirmado",
  );
});
