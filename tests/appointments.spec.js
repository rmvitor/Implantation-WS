import { test, expect } from "./fixtures/test.js";

async function openProject(page) {
  await page.goto("/");
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
}
const menu = (page, name) =>
  page
    .locator("nav")
    .getByRole("button", { name: new RegExp(`^${name}(?: \\d+)?$`) });
const save = (page) =>
  page.getByRole("button", {
    name: "Salvar treinamento/atendimento",
    exact: true,
  });
const stored = (page) =>
  page.evaluate(() =>
    JSON.parse(localStorage.getItem("implanta.workspace.v1")),
  );

test("sala remota por período permanece na agenda, conta hoje e ocupa todos os dias do calendário", async ({
  page,
}) => {
  await page.clock.install({ time: new Date("2026-10-09T12:00:00-03:00") });
  await openProject(page);
  await menu(page, "Capacitação e suporte").click();
  await page
    .getByRole("button", { name: "Novo treinamento/atendimento", exact: true })
    .click();
  await page
    .getByLabel("Tipo de encontro", { exact: true })
    .selectOption("atendimento");
  await page
    .getByLabel("Tema / módulo *", { exact: true })
    .fill("Sala de atendimento de Suprimentos");
  await page.getByLabel("Data de início *", { exact: true }).fill("2026-10-08");
  await page.getByLabel("Horário de início *", { exact: true }).fill("09:00");
  await page
    .getByLabel("Data de término *", { exact: true })
    .fill("2026-10-11");
  await page.getByLabel("Horário de término *", { exact: true }).fill("18:00");
  await page
    .getByLabel("Link da sala / reunião", { exact: true })
    .fill("https://teams.microsoft.com/l/meetup-join/sala-teste");
  await save(page).click();
  const room = (await stored(page)).projects[0].trainings.find(
    (t) => t.type === "atendimento",
  );
  expect(room.endDate).toBe("2026-10-11");
  await expect(
    page.locator(".training-card").filter({ hasText: room.title }),
  ).toContainText("Atendimento remoto");
  await expect(
    page.locator(".training-card").filter({ hasText: room.title }),
  ).toContainText("11/10/2026");
  await menu(page, "Minha agenda").click();
  await expect(
    page.locator(".agenda-row").filter({ hasText: room.title }),
  ).toHaveCount(1);
  await page.getByRole("button", { name: "Hoje", exact: true }).click();
  await expect(
    page.locator(".agenda-row").filter({ hasText: room.title }),
  ).toContainText("Em período");
  await page.locator(".agenda-row").filter({ hasText: room.title }).click();
  await expect(
    page.getByRole("link", { name: "Abrir sala", exact: true }),
  ).toHaveAttribute("href", room.meetingUrl);
  await page.getByRole("button", { name: "Cancelar", exact: true }).click();
  await menu(page, "Quadro do município").click();
  await expect(page.locator(".training-banner")).toContainText(room.title);
  await expect(page.locator(".stats-grid")).toContainText(
    "Há encontros em andamento",
  );
  await page.getByRole("button", { name: "Calendário", exact: true }).click();
  for (const date of ["2026-10-08", "2026-10-09", "2026-10-10", "2026-10-11"])
    await expect(
      page.locator(
        `.calendar-day[data-date="${date}"] [data-appointment-id="${room.id}"]`,
      ),
    ).toHaveCount(1);
  await expect(
    page.locator(
      `.calendar-day[data-date="2026-10-12"] [data-appointment-id="${room.id}"]`,
    ),
  ).toHaveCount(0);
  await page
    .locator(
      `.calendar-day[data-date="2026-10-10"] [data-appointment-id="${room.id}"]`,
    )
    .click();
  await expect(
    page.getByLabel("Data de início *", { exact: true }),
  ).toHaveValue("2026-10-08");
  await expect(
    page.getByLabel("Data de término *", { exact: true }),
  ).toHaveValue("2026-10-11");
});

test("período invertido mantém o formulário; atendimento salvo preserva intervalo e versões no backup e histórico", async ({
  page,
}) => {
  await openProject(page);
  await menu(page, "Capacitação e suporte").click();
  await page
    .getByRole("button", { name: "Novo treinamento/atendimento", exact: true })
    .click();
  await page
    .getByLabel("Tema / módulo *", { exact: true })
    .fill("Conferência remota");
  await page
    .getByLabel("Tipo de encontro", { exact: true })
    .selectOption("atendimento");
  await page.getByLabel("Horário de início *", { exact: true }).fill("09:00");
  await page.getByLabel("Horário de término *", { exact: true }).fill("08:00");
  await save(page).click();
  await expect(page.getByRole("alert")).toContainText("posterior ao início");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.getByLabel("Horário de término *", { exact: true }).fill("18:00");
  await save(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page
    .locator(".training-card")
    .filter({ hasText: "Conferência remota" })
    .click();
  await page.getByLabel("Horário de término *", { exact: true }).fill("19:00");
  await save(page).click();
  const current = (await stored(page)).projects[0];
  expect(current.logs[0].appointment.endTime).toBe("19:00");
  expect(current.logs[1].appointment.endTime).toBe("18:00");
  await page
    .getByRole("button", { name: "Dados e backup", exact: true })
    .click();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: /Exportar backup/ }).click();
  const stream = await (await download).createReadStream();
  let text = "";
  for await (const chunk of stream) text += chunk;
  const backup = JSON.parse(text);
  expect(
    backup.projects[0].trainings.find((t) => t.title === "Conferência remota")
      .endTime,
  ).toBe("19:00");
  await page.getByRole("button", { name: "Fechar", exact: true }).click();
  await page.reload();
  await page
    .locator(".municipality-card")
    .filter({ hasText: "Quatro Barras" })
    .click();
  await menu(page, "Capacitação e suporte").click();
  await page
    .locator(".training-card")
    .filter({ hasText: "Conferência remota" })
    .click();
  await expect(
    page.getByLabel("Tipo de encontro", { exact: true }),
  ).toHaveValue("atendimento");
  await expect(
    page.getByLabel("Horário de término *", { exact: true }),
  ).toHaveValue("19:00");
});

test("celular edita treinamento antigo sem perder notas e infere término a partir da duração conhecida", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openProject(page);
  await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await menu(page, "Capacitação e suporte").click();
  await page
    .locator(".training-card")
    .filter({ hasText: "Compras e contratos" })
    .click();
  await expect(
    page.getByLabel("Tipo de encontro", { exact: true }),
  ).toHaveValue("treinamento");
  await expect(
    page.getByLabel("Horário de término *", { exact: true }),
  ).toHaveValue("11:00");
  await page
    .getByLabel("Notas / link da reunião", { exact: true })
    .fill("Agenda recebida por e-mail, manter referência.");
  await save(page).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  ).toBe(true);
  await page.screenshot({
    path: ".local/appointments-mobile.png",
    fullPage: true,
  });
  expect((await stored(page)).projects[0].trainings[0].notes).toContain(
    "manter referência",
  );
});
