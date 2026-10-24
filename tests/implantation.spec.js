import { test, expect } from "@playwright/test";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import {
  implantationProject,
  preparedImplantation,
  completeImplantation,
  technicalActor,
} from "./fixtures/implantation.js";
import { issueImplantationTerm } from "../src/implantation.js";

const userId = technicalActor.id;
const jwt = (role) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: userId, role, exp: Math.floor(Date.now() / 1000) + 3600 })).toString("base64url")}.test`;
// UI contract double; scripts/test-implantation.mjs tests the real SQL separately.
async function setup(
  page,
  { project = implantationProject(), viewer = false, schema = true } = {},
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
  };
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
    if (path === "/auth/v1/user") data = user;
    else if (path.endsWith("/rpc/implanta_access"))
      data = {
        id: userId,
        name: "Consultor autenticado",
        email: user.email,
        active: true,
        admin: false,
        rolesVersion: 1,
        master: false,
        projectRoles: [
          { id: state.row.id, ownerId: viewer ? "other-owner" : userId },
        ],
      };
    else if (path.endsWith("/rpc/implanta_read_v2")) {
      status = 404;
      data = { code: "PGRST202", message: "Legacy storage" };
    } else if (path.endsWith("/rpc/implanta_implantation_capabilities")) {
      data = schema
        ? { version: 1 }
        : { code: "PGRST202", message: "Pending migration" };
      if (!schema) status = 404;
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
    else if (/\/rpc\/implanta_commit(?:_implantation)?$/.test(path)) {
      const args = request.postDataJSON();
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
async function open(page) {
  await page.goto("/");
  await page.locator(".municipality-card").click();
  await page
    .getByRole("navigation", { name: "Navegação do projeto" })
    .getByRole("button", { name: "Aceite da implantação", exact: true })
    .click();
}
for (const width of [390, 1440])
  test(`checklist final com dois responsáveis gera termo da entidade com timbre em ${width}px`, async ({
    page,
  }) => {
    await page.setViewportSize({ width, height: 1000 });
    const state = await setup(page);
    await open(page);
    await page
      .getByRole("button", { name: "Definir módulos contratados", exact: true })
      .first()
      .click();
    await page.getByLabel("Frota — Prefeitura", { exact: true }).check();
    await page
      .getByRole("button", { name: "Salvar escopo da implantação" })
      .click();
    await expect(page.locator(".implantation-overview")).toContainText("0/11");
    await page
      .getByRole("button", { name: "Responsáveis", exact: true })
      .click();
    for (const [i, name, role] of [
      [1, "Ana", "Diretora de Frota"],
      [2, "Bruno", "Coordenador de Frota"],
    ]) {
      await page
        .getByRole("button", { name: "Adicionar responsável", exact: true })
        .click();
      await page
        .getByLabel(`Nome do responsável ${i}`, { exact: true })
        .fill(name);
      await page
        .getByLabel(`Cargo do responsável ${i}`, { exact: true })
        .fill(role);
    }
    await page
      .getByRole("button", { name: "Salvar responsáveis", exact: true })
      .click();
    for (let i = 0; i < 11; i++) {
      await page.locator(".implantation-question").nth(i).click();
      await page
        .getByLabel("Resposta do checklist", { exact: true })
        .selectOption(i === 10 ? "no" : "yes");
      await page
        .locator(".implantation-point-people")
        .getByRole("checkbox")
        .nth(0)
        .check();
      await page
        .locator(".implantation-point-people")
        .getByRole("checkbox")
        .nth(1)
        .check();
      await page
        .getByLabel("Confirmo que apresentei este ponto ao cliente", {
          exact: true,
        })
        .check();
      await page.getByLabel(/Registrar aceite de Ana/).check();
      if (i !== 10) await page.getByLabel(/Registrar aceite de Bruno/).check();
      await page
        .getByRole("button", { name: "Salvar no topo", exact: true })
        .click();
      await expect(page.getByRole("dialog")).toHaveCount(0);
    }
    await expect(page.locator(".implantation-overview")).toContainText("10/11");
    await expect(
      page.getByRole("button", { name: "Gerar termo da entidade" }),
    ).toBeDisabled();
    await page.locator(".implantation-question").last().click();
    await page.getByLabel(/Registrar aceite de Bruno/).check();
    await page
      .getByRole("button", { name: "Salvar ponto", exact: true })
      .click();
    await expect(page.locator(".implantation-overview")).toContainText("11/11");
    await page.getByRole("button", { name: "Gerar termo da entidade" }).click();
    await page
      .getByRole("button", { name: "Confirmar emissão", exact: true })
      .click();
    await expect(page.locator(".implantation-term-panel")).toContainText(
      "Consultor autenticado",
    );
    expect(
      state.row.data.implantation.terms[0].snapshot.entries[0].responsibles[1]
        .role,
    ).toBe("Coordenador de Frota");
    const downloaded = page.waitForEvent("download");
    await page
      .getByRole("button", { name: "Baixar documento", exact: true })
      .click();
    const file = await downloaded;
    const html = await readFile(await file.path(), "utf8");
    expect(html).toContain("data:image/png;base64,");
    expect(html).toContain("Diretora de Frota");
    expect(html).toContain("Coordenador de Frota");
    expect(html).toContain("Consultor autenticado");
    expect(html).not.toContain("123.456.789-00");
    await page.evaluate(() => {
      const original = Object.getOwnPropertyDescriptor(
        HTMLIFrameElement.prototype,
        "srcdoc",
      );
      Object.defineProperty(HTMLIFrameElement.prototype, "srcdoc", {
        ...original,
        set(value) {
          this.addEventListener(
            "load",
            () => {
              this.contentWindow.print = () => {
                window.printedTerm = {
                  text: this.contentDocument.body.innerText,
                  sandbox: this.getAttribute("sandbox"),
                };
                this.contentWindow.dispatchEvent(new Event("afterprint"));
              };
            },
            { once: true },
          );
          original.set.call(this, value);
        },
      });
    });
    await page
      .getByRole("button", { name: "Imprimir / salvar PDF", exact: true })
      .click();
    await expect
      .poll(() => page.evaluate(() => window.printedTerm?.text))
      .toContain("Termo de Homologação da Implantação");
    expect(await page.evaluate(() => window.printedTerm.sandbox)).toContain(
      "allow-modals",
    );
    await mkdir(".local", { recursive: true });
    await writeFile(`.local/implantation-term-${width}.html`, html);
    const printPage = await page.context().newPage();
    await printPage.setContent(html);
    await printPage.pdf({
      path: `.local/implantation-term-${width}.pdf`,
      printBackground: true,
      preferCSSPageSize: true,
    });
    await printPage.close();
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
    await page.screenshot({
      path: `.local/implantation-${width}.png`,
      fullPage: true,
      animations: "disabled",
    });
    await page
      .getByLabel("Entidade da implantação", { exact: true })
      .selectOption("Fundo de Saúde");
    await expect(page.locator(".implantation-module")).toHaveCount(0);
    await expect(page.locator(".implantation-archive")).toHaveCount(0);
  });
test("pergunta alterada invalida aceites e termos anteriores permanecem disponíveis", async ({
  page,
}) => {
  const state = await setup(page, { project: completeImplantation() });
  await open(page);
  await page.getByRole("button", { name: "Gerar termo da entidade" }).click();
  await page.getByRole("button", { name: "Confirmar emissão" }).click();
  await page
    .getByRole("button", { name: "Editar perguntas", exact: true })
    .click();
  await page
    .getByLabel("Texto da pergunta 1", { exact: true })
    .fill("Novo ponto com o cliente?");
  await page
    .getByRole("button", { name: "Salvar perguntas", exact: true })
    .click();
  await expect(page.locator(".implantation-overview")).toContainText("10/11");
  await expect(
    page.getByRole("button", { name: "Gerar termo da entidade" }),
  ).toBeDisabled();
  await page.locator(".implantation-archive summary").click();
  await expect(page.locator(".implantation-archive")).toContainText(
    "Versão anterior",
  );
  expect(
    state.row.data.implantation.terms[0].snapshot.entries[0].questions[0].text,
  ).not.toBe("Novo ponto com o cliente?");
});
test("falha no banco mantém resposta e Voltar fecha o ponto antes de mudar de área", async ({
  page,
}) => {
  const state = await setup(page, { project: preparedImplantation() });
  await open(page);
  await page.locator(".implantation-question").first().click();
  await page
    .getByLabel("Resposta do checklist", { exact: true })
    .selectOption("no");
  await page
    .getByLabel("Justificativa (obrigatória)", { exact: true })
    .fill("Reforçar a apresentação com o responsável.");
  state.fail = true;
  await page.getByRole("button", { name: "Salvar ponto", exact: true }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(
    page.getByLabel("Justificativa (obrigatória)", { exact: true }),
  ).toHaveValue("Reforçar a apresentação com o responsável.");
  await expect(
    page.getByRole("button", { name: "Salvar ponto", exact: true }),
  ).toBeEnabled();
  expect(state.row.data.implantation.entries[0].questions[0].answer).toBe("");
  await page.evaluate(() => history.back());
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.locator(".implantation-page")).toBeVisible();
  await page.evaluate(() => history.back());
  await expect(page.locator(".implantation-page")).toHaveCount(0);
});
test("sem SQL a rotina informa a ativação e não permite gravar confirmações", async ({
  page,
}) => {
  await setup(page, { project: preparedImplantation(), schema: false });
  await open(page);
  await expect(page.getByRole("status")).toContainText(
    "Ative a nova rotina no Supabase",
  );
  await expect(
    page.getByRole("button", { name: "Responsáveis", exact: true }),
  ).toBeDisabled();
  await page.locator(".implantation-question").first().click();
  await expect(
    page.getByLabel("Resposta do checklist", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Confirmo que apresentei este ponto ao cliente", {
      exact: true,
    }),
  ).toBeDisabled();
});
test("visualizador consulta perguntas e não registra aceites nem altera modelos", async ({
  page,
}) => {
  await setup(page, { project: completeImplantation(), viewer: true });
  await open(page);
  await expect(
    page.getByRole("button", { name: "Editar perguntas", exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Gerar termo da entidade" }),
  ).toBeDisabled();
  await page.locator(".implantation-question").first().click();
  await expect(
    page.getByLabel("Resposta do checklist", { exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByLabel("Confirmo que apresentei este ponto ao cliente", {
      exact: true,
    }),
  ).toBeDisabled();
  await expect(
    page.getByRole("button", { name: "Salvar ponto", exact: true }),
  ).toHaveCount(0);
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
