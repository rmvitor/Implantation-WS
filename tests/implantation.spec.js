import {
  implantationCatalog,
  configureImplantation,
} from "../src/implantation.js";
import { test, expect } from "@playwright/test";
import { projectRecords, assembleRecords, recordKey } from "../src/records.js";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  implantationProject,
  preparedImplantation,
  completeImplantation,
  technicalActor,
} from "./fixtures/implantation.js";
import {
  issueImplantationTerm,
  importedImplantation,
} from "../src/implantation.js";

const userId = technicalActor.id;
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
// UI contract double; scripts/test-implantation.mjs tests the real SQL separately.
async function setup(
  page,
  {
    project = implantationProject(),
    viewer = false,
    schema = true,
    master = false,
    normalized = false,
  } = {},
) {
  const user = {
    id: userId,
    email: "consultor@example.invalid",
    aud: "authenticated",
    role: "authenticated",
    user_metadata: {},
    app_metadata: {},
    created_at: "2026-10-24T00:00:00Z",
  };
  const session = {
    access_token: jwt("authenticated"),
    refresh_token: "test-refresh",
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    token_type: "bearer",
    user,
  };
  const canonical = (p) => {
    const next = structuredClone(p);
    for (const e of next.implantation?.entries || [])
      for (const q of e.questions) {
        for (const proof of [q.technical, ...q.clients].filter(Boolean))
          if (proof.source === "authenticated-client")
            Object.assign(proof, {
              actorId: userId,
              by: "Consultor autenticado",
              source: "server",
              at: "2026-10-24T15:00:00.000Z",
            });
      }
    for (const t of next.implantation?.terms || [])
      if (t.source === "authenticated-client")
        Object.assign(t, {
          actorId: userId,
          actorName: "Consultor autenticado",
          source: "server",
          at: "2026-10-24T15:00:00.000Z",
        });
    return next;
  };
  const state = {
    row: { id: project.id, data: canonical(project), version: 1 },
    preferences: {},
    fail: false,
    writes: 0,
    catalog: implantationCatalog(),
    invites: [],
    otp: [],
    smtpFail: false,
    inviteNumber: 0,
  };
  state.records = projectRecords(state.row.data).map((r) => ({
    ...r,
    revision: 1,
  }));
  state.changes = [];
  const snapshot = () => ({
    records: state.records,
    admin: master,
    projects: [{ id: state.row.id, version: state.row.version }],
    access: [
      {
        project_id: state.row.id,
        user_id: userId,
        role: viewer ? "viewer" : "editor",
      },
    ],
    preferences: state.preferences,
  });
  await page.addInitScript(
    ({ session, key }) => {
      localStorage.setItem(
        "implanta.team.connection.v1",
        JSON.stringify({ url: "https://acceptance.supabase.co", key }),
      );
      localStorage.setItem("sb-acceptance-auth-token", JSON.stringify(session));
    },
    { session, key: jwt("anon") },
  );
  await page.route("https://acceptance.supabase.co/**", async (route) => {
    const request = route.request(),
      url = new URL(request.url()),
      path = url.pathname;
    let data,
      status = 200;
    if (path === "/auth/v1/otp") {
      state.otp.push({
        body: request.postDataJSON(),
        authorization: request.headers().authorization,
        url: request.url(),
      });
      status = state.smtpFail ? 500 : 200;
      data = state.smtpFail ? { message: "SMTP indisponível" } : {};
    } else if (path.endsWith("/rpc/implanta_customer_invites"))
      data = state.invites;
    else if (path.endsWith("/rpc/implanta_customer_invite_create")) {
      const args = request.postDataJSON(),
        e = state.row.data.implantation.entries.find(
          (x) => x.id === args.p_entry,
        ),
        r = e.responsibles.find((x) => x.id === args.p_responsible);
      for (const i of state.invites)
        if (i.responsible_id === r.id) i.revoked_at = new Date().toISOString();
      data = {
        id: `22222222-2222-4222-8222-${String(++state.inviteNumber).padStart(12, "0")}`,
        project_id: args.p_project,
        entry_id: e.id,
        responsible_id: r.id,
        name: r.name,
        job_title: r.role,
        email: r.email,
        expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
        revoked_at: null,
      };
      state.invites.unshift(data);
    } else if (path.endsWith("/rpc/implanta_customer_invite_action")) {
      const args = request.postDataJSON(),
        i = state.invites.find((x) => x.id === args.p_invite);
      i[args.p_action === "revoke" ? "revoked_at" : "last_requested_at"] =
        new Date().toISOString();
      data = null;
    } else if (path === "/auth/v1/user") data = user;
    else if (path.endsWith("/rpc/implanta_access"))
      data = {
        id: userId,
        name: "Consultor autenticado",
        email: user.email,
        active: true,
        admin: master,
        rolesVersion: 1,
        master,
        projectRoles: [
          { id: state.row.id, ownerId: viewer ? "other-owner" : userId },
        ],
      };
    else if (path.endsWith("/rpc/implanta_read_v2")) {
      if (normalized) data = snapshot();
      else {
        status = 404;
        data = { code: "PGRST202", message: "Legacy storage" };
      }
    } else if (path.endsWith("/rpc/implanta_implantation_capabilities")) {
      data = schema
        ? { version: 1, workflowVersion: 3 }
        : { code: "PGRST202", message: "Pending migration" };
      if (!schema) status = 404;
    } else if (path.endsWith("/rpc/implanta_implantation_templates"))
      data = state.catalog;
    else if (path.endsWith("/rpc/implanta_save_implantation_template")) {
      const args = request.postDataJSON();
      if (!master) {
        status = 403;
        data = { code: "42501", message: "Somente Master" };
      } else {
        state.catalog = state.catalog.map((m) =>
          m.module === args.p_module
            ? {
                ...m,
                questions: args.p_questions,
                version: args.p_version,
                revision: m.revision + 1,
              }
            : m,
        );
        data = state.catalog;
      }
    } else if (path.endsWith("/implanta_projects"))
      data = url.searchParams.has("id") ? state.row : [state.row];
    else if (path.endsWith("/implanta_members"))
      data = [
        {
          project_id: state.row.id,
          user_id: userId,
          role: viewer ? "viewer" : "editor",
        },
      ];
    else if (path.endsWith("/implanta_preferences"))
      data = { data: state.preferences };
    else if (path.endsWith("/rpc/implanta_commit_v2")) {
      const args = request.postDataJSON();
      state.changes.push(...args.p_changes);
      for (const change of args.p_changes) {
        const old = state.records.find(
          (r) => recordKey(r) === recordKey(change),
        );
        const next = { ...change, revision: (old?.revision || 0) + 1 };
        state.records = state.records
          .filter((r) => recordKey(r) !== recordKey(change))
          .concat(next);
      }
      for (const removed of args.p_removed)
        state.records = state.records.filter(
          (r) => recordKey(r) !== recordKey(removed),
        );
      state.row.data = canonical(assembleRecords(state.records)[0]);
      state.row.version++;
      const before = state.records;
      state.records = projectRecords(state.row.data).map((r) => ({
        ...r,
        revision:
          before.find((p) => recordKey(p) === recordKey(r))?.revision || 1,
      }));
      if (args.p_preferences) state.preferences = args.p_preferences;
      state.writes++;
      data = snapshot();
    } else if (/\/rpc\/implanta_commit(?:_implantation)?$/.test(path)) {
      const args = request.postDataJSON();
      if (state.hold) {
        state.hold = false;
        state.held = true;
        await new Promise((resolve) => {
          state.release = resolve;
        });
      }
      if (state.fail) {
        status = 503;
        data = { message: "network temporarily unavailable" };
      } else {
        for (const change of args.p_changes) {
          state.row = {
            id: change.id,
            data: canonical(change.data),
            version: state.row.version + 1,
          };
          state.writes++;
        }
        if (args.p_preferences) state.preferences = args.p_preferences;
        data = path.endsWith("_implantation") ? [state.row] : null;
      }
    } else throw new Error(`Unexpected acceptance UI request: ${path}`);
    await route.fulfill({
      status,
      contentType: "application/json",
      body: JSON.stringify(data),
      headers: { "x-supabase-api-version": "2024-01-01" },
    });
  });
  return state;
}
async function open(page, entity = "Prefeitura") {
  await page.goto("/");
  await page.locator(".municipality-card").click();
  await page
    .getByRole("navigation", { name: "Navegação do projeto" })
    .getByRole("button", { name: "Aceite da implantação", exact: true })
    .click();
  if (entity) await entityTab(page, entity).click();
}
const entityTab = (page, name) =>
  page
    .getByRole("tablist", { name: "Entidades da homologação", exact: true })
    .getByRole("tab", { name: new RegExp("^" + name) });
const point = (page, n) =>
  page.getByRole("article", { name: `Ponto ${n}`, exact: true });
const respond = async (page, number, value) => {
  await point(page, number)
    .getByRole("checkbox", {
      name:
        value === "yes"
          ? "Aceite técnico: Sim"
          : value === "no"
            ? "Não"
            : "Não se aplica",
      exact: true,
    })
    .check();
};
const saved = (page) =>
  expect(page.locator(".acceptance-save-status")).toContainText(
    "Respostas confirmadas no banco",
  );
test("respostas e OKs usam registros separados após a migração, sem regravar o município", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    normalized: true,
  });
  await open(page);
  await respond(page, 1, "yes");
  await respond(page, 2, "yes");
  await saved(page);
  await point(page, 1)
    .getByRole("checkbox", { name: "Aceite técnico: Sim", exact: true })
    .check();
  await saved(page);
  await expect
    .poll(
      () =>
        state.row.data.implantation.entries[0].questions[0].technical?.source,
    )
    .toBe("server");
  expect(state.row.data.implantation.entries[0].questions[1].answer).toBe(
    "yes",
  );
  expect(
    state.changes.some((r) => r.kind === "implantation_question"),
  ).toBeTruthy();
  expect(state.changes.some((r) => r.kind === "municipality")).toBeFalsy();
  expect(
    state.changes.every((r) =>
      ["implantation_question", "history"].includes(r.kind),
    ),
  ).toBeTruthy();
  await open(page);
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
  ).toBeChecked();
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
  ).toBeChecked();
});
for (const width of [390, 1440])
  test(`preenchimento direto registra dois clientes e emite documento por módulo em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await setup(page, { project: preparedImplantation() });
    await open(page);
    for (let i = 1; i <= 11; i++) {
      await respond(page, i, i === 11 ? "no" : "yes");
      if (i === 11) continue;
      await point(page, i)
        .getByRole("checkbox", { name: /^Aceite técnico/ })
        .check();
      await point(page, i)
        .getByRole("checkbox", { name: "Aceite do cliente", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toBeVisible();
      await page
        .getByRole("dialog")
        .getByRole("checkbox", { name: /Ana/ })
        .check();
      await page
        .getByRole("dialog")
        .getByRole("checkbox", { name: /Bruno/ })
        .check();
      await page
        .getByRole("button", { name: "Registrar aceite dos selecionados" })
        .click();
    }
    await saved(page);
    await expect(
      page.getByRole("button", { name: "Gerar termo do módulo" }),
    ).toBeEnabled();
    await page.getByRole("button", { name: "Gerar termo do módulo" }).click();
    await page.getByRole("button", { name: "Confirmar emissão" }).click();
    await expect(
      page.getByRole("button", { name: "Baixar documento", exact: true }),
    ).toBeVisible();
    const promise = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Baixar documento", exact: true })
      .click();
    const file = await promise;
    const html = await readFile(await file.path(), "utf8");
    expect(html).toContain("Diretora de Frota");
    expect(html).toContain("Coordenador");
    expect(html).toContain("data:image/png;base64,");
    expect(html).not.toContain("123.456.789-00");
    expect(state.row.data.implantation.terms[0].module).toBe("Frota");
    expect(state.row.data.implantation.terms[0].snapshot.entries).toHaveLength(
      1,
    );
    await mkdir(".local", { recursive: true });
    await writeFile(`.local/implantation-term-${width}.html`, html);
    const doc = await page.context().newPage();
    await doc.setContent(html);
    await doc.pdf({
      path: `.local/implantation-term-${width}.pdf`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    await doc.close();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/acceptance-tabs-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
  });
test("quinze entidades, módulos e recolhimento são locais e voltam à última aba sem gravações", async ({
  page,
}) => {
  let p = preparedImplantation();
  p.entities = [
    "Prefeitura",
    ...Array.from({ length: 14 }, (_, i) => `Entidade ${i + 2}`),
  ];
  p = configureImplantation(
    p,
    [
      { entity: "Prefeitura", module: "Frota" },
      { entity: "Entidade 15", module: "Almoxarifado" },
    ],
    technicalActor,
  );
  const state = await setup(page, { project: p });
  await open(page, "");
  await expect(
    page
      .getByRole("region", {
        name: "Visão geral das homologações por entidade",
      })
      .locator("tbody tr"),
  ).toHaveCount(15);
  const writes = state.writes;
  await entityTab(page, "Entidade 15").click();
  await page
    .getByRole("button", { name: "Recolher módulos", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Recolher entidades", exact: true })
    .click();
  await page.reload();
  await page.locator(".municipality-card").click();
  await page
    .getByRole("navigation", { name: "Navegação do projeto" })
    .getByRole("button", { name: "Aceite da implantação" })
    .click();
  await expect(
    page.getByRole("region", {
      name: "Relatório de Almoxarifado — Entidade 15",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expandir módulos", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Expandir entidades", exact: true }),
  ).toBeVisible();
  expect(state.writes).toBe(writes);
});
test("sem responsáveis avisa; um cliente é selecionado automaticamente e Não pode justificar dispensa", async ({
  page,
}) => {
  const p = preparedImplantation();
  p.implantation.entries[0].responsibles = [];
  const state = await setup(page, { project: p });
  await open(page);
  await respond(page, 1, "yes");
  await point(page, 1)
    .getByRole("checkbox", { name: "Aceite do cliente", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Cadastre um responsável" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Responsáveis", exact: true }).click();
  await page.getByRole("button", { name: "Adicionar responsável" }).click();
  await page.getByLabel("Nome do responsável", { exact: true }).fill("Ana");
  await page
    .getByLabel("Cargo do responsável", { exact: true })
    .fill("Diretora");
  await page.getByRole("button", { name: "Salvar responsáveis" }).click();
  await expect
    .poll(() => state.row.data.implantation.entries[0].responsibles.length)
    .toBe(1);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await point(page, 1)
    .getByRole("checkbox", { name: "Aceite do cliente", exact: true })
    .check();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await saved(page);
  await expect(point(page, 1)).toContainText("Ponto validado");
  expect(
    state.row.data.implantation.entries[0].questions[0].clients,
  ).toHaveLength(1);
});
test("respostas rápidas são serializadas; falha conserva texto entre abas e impede sair antes de resolver", async ({
  page,
}) => {
  const state = await setup(page, { project: preparedImplantation() });
  await open(page);
  state.hold = true;
  await respond(page, 1, "yes");
  await expect.poll(() => state.held).toBe(true);
  await respond(page, 2, "yes");
  await point(page, 2).locator(".acceptance-observations > summary").click();
  await page
    .getByLabel("Observações do ponto 2", { exact: true })
    .fill("Último texto digitado");
  state.release();
  await saved(page);
  expect(state.row.data.implantation.entries[0].questions[0].answer).toBe(
    "yes",
  );
  expect(state.row.data.implantation.entries[0].questions[1].notes).toBe(
    "Último texto digitado",
  );
  await point(page, 1).locator(".acceptance-observations > summary").click();
  const notes = page.getByLabel("Observações do ponto 1", { exact: true });
  await notes.fill("Texto com ");
  await expect
    .poll(() => state.row.data.implantation.entries[0].questions[0].notes)
    .toBe("Texto com");
  await expect(notes).toHaveValue("Texto com ");
  await notes.pressSequentially("espaço");
  await notes.blur();
  await saved(page);
  expect(state.row.data.implantation.entries[0].questions[0].notes).toBe(
    "Texto com espaço",
  );
  state.fail = true;
  await page
    .getByLabel("Observações do ponto 1", { exact: true })
    .fill("Preservar o rascunho em falha.");
  await page.getByLabel("Observações do ponto 1", { exact: true }).blur();
  await expect(
    page.getByRole("button", { name: "Tentar salvar novamente" }),
  ).toBeVisible();
  await entityTab(page, "Fundo de Saúde").click();
  await entityTab(page, "Prefeitura").click();
  await expect(
    page.getByLabel("Observações do ponto 1", { exact: true }),
  ).toHaveValue("Preservar o rascunho em falha.");
  await page
    .locator(".sidebar")
    .getByRole("button", { name: "Início", exact: true })
    .click();
  await expect(page.locator(".acceptance-report")).toBeVisible();
  state.fail = false;
  await page.getByRole("button", { name: "Tentar salvar novamente" }).click();
  await saved(page);
  expect(state.row.data.implantation.entries[0].questions[0].notes).toBe(
    "Preservar o rascunho em falha.",
  );
});
test("somente Master gerencia modelos globais e relatórios existentes não mudam ao salvar o padrão", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    master: true,
  });
  await open(page);
  const old = state.row.data.implantation.entries[0].questions[0].text;
  await page
    .getByRole("button", { name: "Gerenciar modelos", exact: true })
    .click();
  await page
    .getByRole("tablist", { name: "Modelos globais por módulo" })
    .getByRole("tab", { name: /^Frota/ })
    .click();
  await page
    .getByLabel("Texto da pergunta 1", { exact: true })
    .fill("Novo padrão global de frota?");
  await page
    .getByRole("button", { name: "Salvar perguntas", exact: true })
    .click();
  await expect
    .poll(() => state.catalog.find((m) => m.module === "Frota").revision)
    .toBe(2);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(state.row.data.implantation.entries[0].questions[0].text).toBe(old);
  await page
    .getByRole("button", { name: "Aplicar modelo atual", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Aplicar modelo global ao relatório" })
    .click();
  await expect(page.locator(".acceptance-report")).toContainText(
    "Novo padrão global de frota?",
  );
});
test("sem modelo não há checkbox; marcar todos inclui só os módulos disponíveis e excluir relatório exige alerta", async ({
  page,
}) => {
  const state = await setup(page, { project: preparedImplantation() });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Gerenciar modelos", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Módulos contratados", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Elicita — Prefeitura", exact: true }),
  ).toHaveCount(0);
  await page
    .getByRole("button", { name: "Marcar todos os módulos", exact: true })
    .click();
  await expect(
    page.getByRole("checkbox", { name: "Frota — Prefeitura", exact: true }),
  ).toBeChecked();
  await page
    .getByRole("button", { name: "Salvar escopo da implantação" })
    .click();
  await expect
    .poll(
      () =>
        state.row.data.implantation.entries.filter((e) => e.included).length,
    )
    .toBe(8);
  await page
    .getByRole("tablist", { name: "Módulos da entidade" })
    .getByRole("tab", { name: /^Frota/ })
    .click();
  await page
    .getByRole("button", { name: "Excluir relatório", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("Módulos contratados");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(
    state.row.data.implantation.entries.find(
      (e) => e.module === "Frota" && e.entity === "Prefeitura",
    ).included,
  ).toBe(true);
  await page
    .getByRole("button", { name: "Excluir relatório", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Apagar respostas e desativar" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const removed = state.row.data.implantation.entries.find(
    (e) => e.module === "Frota" && e.entity === "Prefeitura",
  );
  expect(removed.included).toBe(false);
  expect(removed.questions).toHaveLength(0);
});
test("responsáveis têm abas próprias e botão de excluir com confirmação", async ({
  page,
}) => {
  const state = await setup(page, { project: preparedImplantation() });
  await open(page);
  await page.getByRole("button", { name: "Responsáveis", exact: true }).click();
  await page
    .getByRole("tablist", { name: "Responsáveis do módulo" })
    .getByRole("tab", { name: "Bruno", exact: true })
    .click();
  await expect(
    page.getByLabel("Nome do responsável", { exact: true }),
  ).toHaveValue("Bruno");
  await page
    .getByRole("button", { name: "Excluir responsável", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Confirmar exclusão do responsável" })
    .click();
  await expect
    .poll(() => state.row.data.implantation.entries[0].responsibles.length)
    .toBe(1);
  expect(state.row.data.implantation.entries[0].responsibles[0].name).toBe(
    "Ana",
  );
});
test("visualizador consulta relatório e ausência do complemento bloqueia gravações", async ({
  page,
}) => {
  await setup(page, { project: preparedImplantation(), viewer: true });
  await open(page);
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Excluir relatório", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Gerenciar modelos", exact: true }),
  ).toHaveCount(0);
});
test("SQL anterior mantém os registros e orienta ativação do complemento", async ({
  page,
}) => {
  await setup(page, { project: preparedImplantation(), schema: false });
  await open(page);
  await expect(
    page.getByRole("status").filter({ hasText: "Ative o complemento" }),
  ).toBeVisible();
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
  ).toBeDisabled();
});
test("documento preserva observações longas e trata os dados dos participantes como texto", async ({
  page,
}) => {
  const p = issueImplantationTerm(
    completeImplantation(),
    "Prefeitura",
    technicalActor,
  );
  const term = p.implantation.terms[0];
  term.snapshot.entries[0].responsibles[0].name =
    '<script>alert("participante")</script>';
  term.snapshot.entries[0].questions[0].notes =
    "Observação de conferência com evidência preservada. ".repeat(500) +
    "FIM-DA-OBSERVACAO-LONGA";
  await page.goto("/");
  const html = await page.evaluate(async (record) => {
    const { termDocument } = await import("/src/implantation-print.js");
    return termDocument(record);
  }, term);
  await page.setContent(html);
  await expect(page.locator("script")).toHaveCount(0);
  await expect(page.locator("body")).toContainText(
    '<script>alert("participante")</script>',
  );
  await expect(page.locator("body")).toContainText("FIM-DA-OBSERVACAO-LONGA");
  await page.pdf({
    path: ".local/implantation-term-long.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
});

test("relatório parcial identifica a dispensa e não imprime a declaração de termo final", async ({
  page,
}) => {
  const p = preparedImplantation();
  p.implantation.entries[0].questions[0] = {
    ...p.implantation.entries[0].questions[0],
    answer: "no",
    notUsed: true,
    notes: "A entidade não utilizará esta rotina.",
  };
  p.implantation.entries[0].questions[1].technical = {
    ...technicalActor,
    actorId: technicalActor.id,
    by: "Segundo consultor",
    at: new Date().toISOString(),
    source: "server",
  };
  const term = {
    id: "relatorio-parcial",
    draft: true,
    actorName: "Consultor",
    at: new Date().toISOString(),
    snapshot: (await import("../src/implantation.js")).implantationSnapshot(
      p,
      "Prefeitura",
      "Frota",
    ),
  };
  await page.goto("/");
  const html = await page.evaluate(
    async (record) =>
      (await import("/src/implantation-print.js")).termDocument(record),
    term,
  );
  await page.setContent(html);
  await expect(page.locator("body")).toContainText("não constitui termo final");
  await expect(page.locator("body")).toContainText(
    "Dispensa justificada: este ponto não será utilizado e não foi apresentado.",
  );
  await expect(page.locator("body")).toContainText(
    "A entidade não utilizará esta rotina.",
  );
  await expect(page.locator(".report-signing")).toHaveCount(1);
  await expect(page.locator(".report-signing")).toContainText("Ana");
  await expect(page.locator(".report-signing")).toContainText("Bruno");
  await expect(page.locator(".report-signing")).toContainText("Consultor");
  await expect(page.locator(".technical-signature")).toHaveCount(2);
  await expect(page.locator(".client-signature")).toHaveCount(2);
  await expect(page.locator(".report-signing")).toContainText(
    "Segundo consultor",
  );
  await expect(page.locator(".report-signing")).toContainText(
    "Diretora de Frota",
  );
  await expect(page.locator(".report-signing")).toContainText(
    "ana@example.invalid",
  );
  await expect(page.locator("svg.letterhead-footer")).toHaveCount(1);
  await expect(page.locator("img.letterhead-footer")).toHaveCount(0);
  await expect(page.locator("svg.letterhead-header image")).toHaveCount(1);
  await expect(page.locator("svg.letterhead-footer image")).toHaveCount(1);
  await expect(
    page.getByRole("heading", {
      name: "Termo de Homologação da Implantação",
      exact: true,
    }),
  ).toHaveCount(0);
  await page.pdf({
    path: ".local/implantation-partial-exemption.pdf",
    printBackground: true,
    preferCSSPageSize: true,
  });
});

test("Master pode criar modelo de módulo antes indisponível e novo relatório usa o padrão global", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    master: true,
  });
  await open(page);
  await page
    .getByRole("button", { name: "Gerenciar modelos", exact: true })
    .click();
  await page
    .getByRole("tablist", { name: "Modelos globais por módulo" })
    .getByRole("tab", { name: /^Elicita/ })
    .click();
  await page
    .getByRole("button", { name: "Adicionar pergunta", exact: true })
    .click();
  await page
    .getByLabel("Texto da pergunta 1", { exact: true })
    .fill("O portal foi apresentado?");
  await page
    .getByRole("button", { name: "Salvar perguntas", exact: true })
    .click();
  await expect
    .poll(
      () => state.catalog.find((m) => m.module === "Elicita").questions.length,
    )
    .toBe(1);
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page
    .getByRole("button", { name: "Módulos contratados", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Elicita — Prefeitura", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar escopo da implantação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .getByRole("tablist", { name: "Módulos da entidade" })
    .getByRole("tab", { name: /^Elicita/ })
    .click();
  await expect(page.locator(".acceptance-report")).toContainText(
    "O portal foi apresentado?",
  );
});
test("desmarcar no escopo confirma perda das respostas e reativar começa novo preenchimento", async ({
  page,
}) => {
  const state = await setup(page, { project: completeImplantation() });
  await open(page);
  await page
    .getByRole("button", { name: "Módulos contratados", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Frota — Prefeitura", exact: true })
    .uncheck();
  await page
    .getByRole("button", { name: "Salvar escopo da implantação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Serão apagadas as respostas",
  );
  await page
    .getByRole("button", { name: "Apagar respostas e salvar escopo" })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.row.data.implantation.entries[0].questions).toHaveLength(0);
  await page
    .getByRole("button", { name: "Módulos contratados", exact: true })
    .click();
  await page
    .getByRole("checkbox", { name: "Frota — Prefeitura", exact: true })
    .check();
  await page
    .getByRole("button", { name: "Salvar escopo da implantação", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
  ).toBeChecked({ checked: false });
});

for (const width of [390, 1440])
  test(`aceites compactos sem dropdown, justificativa e observações recolhidas em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const p = preparedImplantation();
    p.implantation.entries[0].responsibles.splice(1);
    const state = await setup(page, { project: p, normalized: true });
    await open(page);
    const item = point(page, 1);
    await expect(item.locator("select")).toHaveCount(0);
    await expect(
      item.getByLabel("Observações do ponto 1", { exact: true }),
    ).not.toBeVisible();
    await respond(page, 1, "yes");
    await item
      .getByRole("checkbox", { name: "Aceite do cliente", exact: true })
      .click();
    await saved(page);
    let q = state.row.data.implantation.entries[0].questions[0];
    expect(q.answer).toBe("yes");
    expect(q.technical.source).toBe("server");
    expect(q.clients[0].clientName).toBe("Ana");
    await expect(page.getByRole("dialog")).toHaveCount(0);
    const tech = item.getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    });
    const client = item.getByRole("checkbox", {
      name: "Aceite do cliente",
      exact: true,
    });
    await expect(tech).toBeDisabled();
    await expect(
      item.getByRole("checkbox", { name: "Não", exact: true }),
    ).toBeDisabled();
    await expect(
      item.getByRole("checkbox", { name: "Não se aplica", exact: true }),
    ).toBeDisabled();
    await client.uncheck();
    await expect(tech).toBeEnabled();
    await tech.uncheck();
    await respond(page, 1, "no");
    await expect(tech).toBeDisabled();
    await expect(client).toBeDisabled();
    await expect(
      item.getByRole("checkbox", { name: "Não se aplica", exact: true }),
    ).toBeDisabled();
    await item
      .getByLabel("Justificativa obrigatória do ponto 1", { exact: true })
      .fill("Rotina não utilizada nesta entidade.");
    await item.getByRole("checkbox", { name: "Não", exact: true }).uncheck();
    await respond(page, 1, "na");
    await saved(page);
    q = state.row.data.implantation.entries[0].questions[0];
    expect(q.answer).toBe("na");
    expect(q.technical).toBeNull();
    expect(q.clients).toHaveLength(0);
    await expect(
      item.getByRole("checkbox", { name: "Não", exact: true }),
    ).toBeDisabled();
    await item
      .getByRole("checkbox", { name: "Não se aplica", exact: true })
      .uncheck();
    await expect(
      item.getByLabel("Observações do ponto 1", { exact: true }),
    ).not.toBeVisible();
    await respond(page, 1, "yes");
    await item.locator(".acceptance-observations > summary").click();
    await item
      .getByLabel("Observações do ponto 1", { exact: true })
      .fill("Observação adicional preservada no relatório.");
    await item.getByLabel("Observações do ponto 1", { exact: true }).blur();
    await saved(page);
    expect(state.row.data.implantation.entries[0].questions[0].notes).toBe(
      "Observação adicional preservada no relatório.",
    );
    await page.screenshot({
      path: `.local/acceptance-compact-${width}.png`,
      fullPage: true,
    });
  });

test("Sim com impedimento continua exigindo justificativa e bloqueando o termo", async ({
  page,
}) => {
  const state = await setup(page, { project: preparedImplantation() });
  await open(page);
  const item = point(page, 11);
  await item
    .getByRole("checkbox", { name: "Aceite técnico: Sim", exact: true })
    .click();
  const technical = item.getByRole("checkbox", {
    name: "Aceite técnico: Sim",
    exact: true,
  });
  await expect(technical).not.toBeChecked();
  await expect(technical).toBeDisabled();
  await expect(item.locator(".implantation-warning")).toContainText(
    "impede o termo",
  );
  await expect(
    item.getByRole("checkbox", { name: /Este ponto não será utilizado/ }),
  ).toHaveCount(0);
  await item
    .getByLabel("Justificativa obrigatória do ponto 11", { exact: true })
    .fill("Divergência a corrigir antes de liberar o módulo.");
  await technical.check();
  await saved(page);
  expect(state.row.data.implantation.entries[0].questions[10].answer).toBe(
    "yes",
  );
  expect(
    state.row.data.implantation.entries[0].questions[10].technical.source,
  ).toBe("server");
  await expect(
    page.getByRole("button", { name: "Gerar termo do módulo", exact: true }),
  ).toBeDisabled();
});

test("filtros são locais e limpar relatório exige confirmação, limpa o banco e mantém outro módulo e termos", async ({
  page,
}) => {
  let p = completeImplantation();
  p = issueImplantationTerm(p, "Prefeitura", technicalActor);
  p = configureImplantation(
    p,
    [
      { entity: "Prefeitura", module: "Frota" },
      { entity: "Prefeitura", module: "Patrimônio" },
    ],
    technicalActor,
  );
  p.implantation.entries[0].questions[0].clients = [];
  p.implantation.entries[0].questions[1].clients = [];
  p.implantation.entries[0].questions[1].technical = null;
  const state = await setup(page, {
    project: p,
    master: true,
    normalized: true,
  });
  await open(page);
  const filters = page.getByRole("group", {
    name: "Filtrar pontos do relatório",
  });
  const writes = state.writes;
  await filters
    .getByRole("button", { name: "Aceite do técnico", exact: true })
    .click();
  await expect(point(page, 1)).toBeVisible();
  await expect(point(page, 2)).toHaveCount(0);
  await filters
    .getByRole("button", { name: "Aceite do cliente e técnico", exact: true })
    .click();
  await expect(point(page, 1)).toHaveCount(0);
  await expect(point(page, 3)).toBeVisible();
  await filters.getByRole("button", { name: "Em aberto", exact: true }).click();
  await expect(point(page, 1)).toBeVisible();
  await expect(point(page, 2)).toBeVisible();
  await expect(point(page, 3)).toHaveCount(0);
  expect(state.writes).toBe(writes);
  await open(page);
  await expect(
    filters.getByRole("button", { name: "Em aberto", exact: true }),
  ).toHaveAttribute("aria-pressed", "true");
  await filters.getByRole("button", { name: "Todos", exact: true }).click();
  const toolbar = page.getByRole("group", { name: "Gerenciar relatório" });
  const tops = await toolbar
    .getByRole("button")
    .evaluateAll((nodes) =>
      nodes.map((n) => Math.round(n.getBoundingClientRect().top)),
    );
  expect(new Set(tops).size).toBe(1);
  const before = structuredClone(state.row.data);
  await toolbar
    .getByRole("button", { name: "Limpar relatório", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText("limpa no banco");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  expect(state.row.data).toEqual(before);
  await toolbar
    .getByRole("button", { name: "Limpar relatório", exact: true })
    .click();
  await page
    .getByRole("button", {
      name: "Confirmar limpeza do relatório",
      exact: true,
    })
    .click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  const cleared = state.row.data.implantation.entries.find(
    (e) => e.module === "Frota",
  );
  expect(cleared.included).toBe(true);
  expect(cleared.questions).toHaveLength(11);
  expect(cleared.responsibles).toHaveLength(0);
  expect(
    cleared.questions.every(
      (q) =>
        q.answer === "" &&
        q.notes === "" &&
        !q.technical &&
        !q.clients.length &&
        !q.responsibleIds.length,
    ),
  ).toBe(true);
  expect(state.row.data.implantation.terms).toEqual(before.implantation.terms);
  expect(
    state.row.data.implantation.entries.find((e) => e.module === "Patrimônio"),
  ).toEqual(before.implantation.entries.find((e) => e.module === "Patrimônio"));
});

test("técnico só destrava depois que a retirada do cliente é confirmada no banco", async ({
  page,
}) => {
  const state = await setup(page, { project: completeImplantation() });
  await open(page);
  const item = point(page, 1),
    tech = item.getByRole("checkbox", {
      name: "Aceite técnico: Sim",
      exact: true,
    }),
    client = item.getByRole("checkbox", {
      name: "Aceite do cliente",
      exact: true,
    });
  state.hold = true;
  await client.uncheck();
  await expect.poll(() => state.held).toBe(true);
  await expect(tech).toBeDisabled();
  expect(
    state.row.data.implantation.entries[0].questions[0].clients.length,
  ).toBeGreaterThan(0);
  state.release();
  await saved(page);
  await expect(tech).toBeEnabled();
  await tech.uncheck();
  await item.getByRole("checkbox", { name: "Não", exact: true }).check();
  await saved(page);
  const q = state.row.data.implantation.entries[0].questions[0];
  expect(q.answer).toBe("no");
  expect(q.technical).toBeNull();
  expect(q.clients).toHaveLength(0);
  expect(q.responsibleIds).toHaveLength(0);
});

test("atribuir responsáveis ao ponto não inventa aceite do cliente", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    normalized: true,
  });
  await open(page);
  await point(page, 1)
    .getByRole("checkbox", { name: /^Aceite técnico/ })
    .check();
  await saved(page);
  await point(page, 1)
    .getByRole("button", { name: /Responsáveis do ponto/ })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("checkbox", { name: /Ana/ }).check();
  await dialog
    .getByRole("button", { name: "Salvar responsáveis do ponto", exact: true })
    .click();
  await saved(page);
  const q = state.row.data.implantation.entries[0].questions[0];
  expect(q.responsibleIds).toEqual(["ana"]);
  expect(q.clients).toEqual([]);
  expect(q.technical.by).toBe("Consultor autenticado");
  await expect(
    point(page, 1).getByRole("checkbox", {
      name: "Aceite do cliente",
      exact: true,
    }),
  ).not.toBeChecked();
});
test("convite usa SMTP pelo Auth separado; falha permite reenvio, renovação e revogação", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    normalized: true,
  });
  await open(page);
  const stored = await page.evaluate(() =>
    localStorage.getItem("sb-acceptance-auth-token"),
  );
  await page.getByRole("button", { name: "Responsáveis", exact: true }).click();
  await page
    .getByRole("button", { name: "Acesso externo do cliente", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Acesso externo do cliente",
  );
  state.smtpFail = true;
  await page
    .getByRole("button", { name: "Gerar acesso e enviar e-mail", exact: true })
    .click();
  await expect(page.getByRole("alert")).toContainText("SMTP indisponível");
  expect(state.invites.length).toBe(1);
  expect(state.invites[0].last_requested_at).toBeUndefined();
  await expect(
    page.getByLabel("Link do formulário", { exact: true }),
  ).toHaveValue(/\?aceite=/);
  expect(state.otp[0].body).toMatchObject({
    email: "ana@example.invalid",
    create_user: true,
    data: { display_name: "Ana", account_type: "customer_portal" },
  });
  expect(state.otp[0].authorization).toBe(
    "Bearer " +
      (await page.evaluate(
        () =>
          JSON.parse(localStorage.getItem("implanta.team.connection.v1")).key,
      )),
  );
  expect(new URL(state.otp[0].url).searchParams.get("redirect_to")).toBe(
    "http://127.0.0.1:5173/?aceite=" + state.invites[0].id,
  );
  expect(
    await page.evaluate(() => localStorage.getItem("sb-acceptance-auth-token")),
  ).toBe(stored);
  state.smtpFail = false;
  await page
    .getByRole("button", { name: "Reenviar e-mail", exact: true })
    .click();
  await expect(
    page
      .getByRole("status")
      .filter({ hasText: "Envio solicitado ao Supabase" }),
  ).toBeVisible();
  expect(state.invites.length).toBe(1);
  expect(state.invites[0].last_requested_at).toBeTruthy();
  await page
    .getByRole("button", { name: "Renovar por 7 dias e enviar", exact: true })
    .click();
  await expect.poll(() => state.invites.length).toBe(2);
  expect(state.invites[1].revoked_at).toBeTruthy();
  await page
    .getByRole("button", { name: "Revogar acesso", exact: true })
    .click();
  await expect(page.getByRole("dialog")).toContainText(
    "Os aceites já registrados serão preservados",
  );
  await page
    .getByRole("button", { name: "Confirmar revogação", exact: true })
    .click();
  await expect(
    page.getByRole("status").filter({ hasText: "Acesso revogado." }),
  ).toBeVisible();
  await expect(
    page.getByLabel("Link do formulário", { exact: true }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => localStorage.getItem("sb-acceptance-auth-token")),
  ).toBe(stored);
});

test("alterar o cadastro do cliente exige novo convite e não oferece reenvio ao e-mail antigo", async ({
  page,
}) => {
  const state = await setup(page, {
    project: preparedImplantation(),
    normalized: true,
  });
  state.invites = [
    {
      id: "22222222-2222-4222-8222-000000000099",
      responsible_id: "ana",
      name: "Ana",
      job_title: "Diretora de Frota",
      email: "old@example.invalid",
      expires_at: new Date(Date.now() + 7 * 86400000).toISOString(),
      revoked_at: null,
    },
  ];
  await open(page);
  await page.getByRole("button", { name: "Responsáveis", exact: true }).click();
  await page
    .getByRole("button", { name: "Acesso externo do cliente", exact: true })
    .click();
  await expect(
    page.getByRole("button", {
      name: "Gerar acesso e enviar e-mail",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Reenviar e-mail", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByLabel("Link do formulário", { exact: true }),
  ).toHaveCount(0);
  expect(state.otp).toEqual([]);
});
