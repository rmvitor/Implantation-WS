import { test, expect } from "@playwright/test";
import { setupMail } from "./fixtures/mail-server.js";
import { readFile } from "node:fs/promises";
import PostalMime from "postal-mime";
async function openMail(page, mobile = false) {
  if (mobile) await page.getByRole("button", { name: "Abrir menu", exact: true }).click();
  await page.getByRole("button", { name: "E-mails", exact: true }).click();
  await expect(page.getByRole("heading", { name: "E-mails", exact: true })).toBeVisible();
}
async function connect(page) {
  await page.getByLabel("E-mail da caixa").fill("caixa@ipm.com.br");
  await page.getByLabel("Senha de aplicativo ActiveSync").fill("senha-ficticia-mail-123");
  await page.getByRole("button", { name: "Conectar e-mail", exact: true }).click();
  await expect(page.locator(".mail-message").filter({ hasText: "Agenda de atendimento" })).toBeVisible();
}
for (const width of [390, 1440]) {
  test(`e-mail geral funciona sem projetos, lê mensagens/anexos e volta à lista em ${width}px`, async ({ page }) => {
    const state = await setupMail(page, { empty: true });
    await page.setViewportSize({ width, height: 1000 });
    await page.goto("/"); await openMail(page, width === 390); await connect(page);
    await page.locator(".mail-message").click();
    await expect(page.locator(".mail-body")).toContainText("Conteúdo privado do e-mail.");
    await page.getByRole("button", { name: "Marcar como lida", exact: true }).click();
    await expect(page.getByRole("button", { name: "Marcar como não lida", exact: true })).toBeVisible();
    expect(state.messages.inbox[0].read).toBe(true);
    const download = page.waitForEvent("download");
    await page.locator(".mail-attachments").getByRole("button", { name: "relatorio.pdf", exact: true }).click();
    const file = await download;
    expect(new Uint8Array(await readFile(await file.path()))).toEqual(new Uint8Array([0,255,12,3]));
    const emlDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Salvar .eml", exact: true }).click();
    const eml = await emlDownload;
    const parsed = await PostalMime.parse(await readFile(await eml.path()));
    expect(parsed.subject).toBe("Agenda de atendimento"); expect(parsed.attachments[0].filename).toBe("relatorio.pdf");
    await page.evaluate(() => history.back());
    await expect(page.locator(".mail-workspace")).not.toHaveClass(/reading/);
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("senha-ficticia-mail-123");
    expect(await page.evaluate(() => JSON.stringify(localStorage))).not.toContain("Conteúdo privado do e-mail.");
    expect(state.commits).toHaveLength(0);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.locator(".mail-page").screenshot({ path: `/tmp/implanta-mail-${width}.png` });
  });
}
test("pastas têm CRUD confirmado e mensagens são movidas para lixeira sem excluir projetos", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.getByRole("button", { name: "Nova pasta", exact: true }).click();
  await page.getByLabel("Nome da pasta", { exact: true }).fill("Atendimentos");
  await page.getByRole("button", { name: "Salvar pasta", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.locator(".mail-folders").getByRole("button", { name: "Atendimentos", exact: true }).click();
  await page.getByRole("button", { name: "Renomear", exact: true }).click();
  await page.getByLabel("Nome da pasta", { exact: true }).fill("Atendimentos remotos");
  await page.getByRole("button", { name: "Salvar pasta", exact: true }).click();
  await page.getByRole("button", { name: "Excluir pasta", exact: true }).click();
  await expect(page.getByRole("dialog").getByRole("button", { name: "Excluir pasta", exact: true })).toBeDisabled();
  await page.getByLabel("Digite o nome da pasta para confirmar").fill("Atendimentos remotos");
  await page.getByRole("dialog").getByRole("button", { name: "Excluir pasta", exact: true }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(state.folders.some((f) => f.name === "Atendimentos remotos")).toBe(false);
  await page.locator(".mail-folders").getByRole("button", { name: "Caixa de entrada", exact: true }).click();
  await page.locator(".mail-message").click();
  await page.locator(".mail-reader").getByRole("button", { name: "Lixeira", exact: true }).click();
  await expect(page.locator(".mail-workspace")).not.toHaveClass(/reading/);
  expect(state.messages.inbox).toHaveLength(0); expect(state.messages.trash).toHaveLength(1);
  expect(state.commits).toHaveLength(0);
});
test("envia MIME com Cc, Cco, anexo e ortografia nativa; rascunho é um .eml local", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.getByRole("button", { name: "Escrever", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Para", { exact: true }).fill("destinatario@example.invalid");
  await dialog.getByLabel("Cc", { exact: true }).fill("copia@example.invalid");
  await dialog.getByLabel("Cco", { exact: true }).fill("oculta@example.invalid");
  await dialog.getByLabel("Assunto", { exact: true }).fill("Boletim de implantação");
  await dialog.getByLabel("Mensagem", { exact: true }).fill("As atividades estão concluídas.");
  await expect(dialog.getByLabel("Mensagem", { exact: true })).toHaveAttribute("spellcheck", "true");
  await expect(dialog.getByLabel("Mensagem", { exact: true })).toHaveAttribute("lang", "pt-BR");
  await dialog.locator('input[type="file"]').setInputFiles({ name:"teste.txt", mimeType:"text/plain", buffer:Buffer.from("anexo de teste") });
  await expect(dialog.getByRole("button", { name: "Remover anexo teste.txt" })).toBeVisible();
  const download = page.waitForEvent("download");
  await dialog.getByRole("button", { name: "Salvar rascunho .eml", exact: true }).click();
  const draft = await download, parsed = await PostalMime.parse(await readFile(await draft.path()));
  expect(parsed.subject).toBe("Boletim de implantação"); expect(parsed.attachments[0].filename).toBe("teste.txt");
  await dialog.getByRole("button", { name: "Enviar e-mail", exact: true }).click();
  await expect(dialog).toHaveCount(0); expect(state.sends).toHaveLength(1);
  expect(state.sends[0].parsed.to[0].address).toBe("destinatario@example.invalid"); expect(state.sends[0].parsed.bcc[0].address).toBe("oculta@example.invalid");
  expect(state.sends[0].parsed.attachments[0].filename).toBe("teste.txt");
  expect(state.commits).toHaveLength(0);
});
test("envio pendente bloqueia Voltar; perda de confirmação preserva texto e impede reenvio automático", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.getByRole("button", { name: "Escrever", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Para", { exact: true }).fill("destinatario@example.invalid");
  await dialog.getByLabel("Mensagem", { exact: true }).fill("Rascunho preservado");
  state.hold = true; state.unknown = true;
  await dialog.getByRole("button", { name: "Enviar e-mail", exact: true }).click();
  await expect.poll(() => state.held).toBe(true);
  try {
    await page.evaluate(() => new Promise((resolve) => { addEventListener("popstate", () => setTimeout(resolve, 0), { once:true }); history.back(); }));
    await expect(dialog).toBeVisible(); await expect(dialog.getByLabel("Mensagem", { exact:true })).toHaveValue("Rascunho preservado");
  } finally { state.release(); }
  await expect(dialog.getByRole("alert")).toContainText("sem confirmação");
  await expect(dialog.getByRole("button", { name: "Enviar e-mail", exact: true })).toBeDisabled();
  expect(state.sends).toHaveLength(1);
  await dialog.getByLabel("Mensagem", { exact: true }).fill("Rascunho alterado após erro");
  await expect(dialog.getByRole("button", { name: "Enviar e-mail", exact: true })).toBeDisabled();
  expect(state.sends).toHaveLength(1);
});
test("serviço não ativado e senha recusada não apresentam caixas fictícias nem repetem login", async ({ page }) => {
  const state = await setupMail(page); state.unavailable = true;
  await page.goto("/"); await openMail(page);
  await page.getByLabel("E-mail da caixa").fill("caixa@ipm.com.br"); await page.getByLabel("Senha de aplicativo ActiveSync").fill("senha-ficticia-mail-123");
  await page.getByRole("button", { name: "Conectar e-mail", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Solicite a ativação ao administrador");
  await expect(page.getByRole("link", { name: "Guia para ativar a integração no Supabase" })).toBeVisible();
  expect(state.calls).toHaveLength(0); await expect(page.locator(".mail-message")).toHaveCount(0);
  state.unavailable = false; state.networkFailure = true;
  await page.getByRole("button", { name: "Conectar e-mail", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("publicação da função mail no Supabase");
  await expect(page.getByRole("alert")).toContainText("A senha ainda não pôde ser validada");
  await expect(page.getByRole("link", { name: "Guia para ativar a integração no Supabase" })).toHaveAttribute("href", /docs\/EMAIL\.md/);
  await expect(page.getByRole("button", { name: "Conectar e-mail", exact: true })).toBeEnabled();
  expect(state.calls).toHaveLength(0);
  state.networkFailure = false; state.rejected = true;
  await page.getByRole("button", { name: "Conectar e-mail", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("recusou a conta ou senha");
  await expect(page.getByRole("link", { name: "Guia para ativar a integração no Supabase" })).toHaveCount(0);
  expect(state.calls).toEqual(["FolderSync"]); await expect(page.locator(".mail-folders")).toHaveCount(0);
});
test("conexão permanece entre áreas, mas não grava senha ou conteúdo em armazenamento, histórico ou backup", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.getByRole("button", { name: "Agenda geral", exact: true }).click();
  await openMail(page);
  await expect(page.getByRole("heading", { name: "E-mails", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Escrever", exact: true })).toBeVisible();
  await expect(page.getByLabel("Senha de aplicativo ActiveSync")).toHaveCount(0);
  expect(await page.evaluate(() => JSON.stringify([localStorage, sessionStorage, history.state]))).not.toContain("senha-ficticia-mail-123");
  await page.reload(); await openMail(page);
  await expect(page.getByLabel("Senha de aplicativo ActiveSync")).toHaveValue("");
  expect(state.commits).toHaveLength(0);
});
test("arquivo local HTML é convertido a texto sem scripts, imagens remotas ou envio ao servidor", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page);
  let trackers = 0;
  await page.route("https://tracker.invalid/**", async (route) => { trackers++; await route.abort(); });
  const raw = "From: Teste <a@example.invalid>\r\nTo: b@example.invalid\r\nSubject: Arquivo local de teste\r\nContent-Type: text/html; charset=UTF-8\r\n\r\n<p>Olá, leitor.</p><script>window.__mailScript=1</script><img src=\"https://tracker.invalid/pixel\"><a href=\"javascript:window.__mailScript=2\">Texto</a>";
  await page.locator('.mail-page > input[type="file"]').setInputFiles({ name:"arquivo.eml", mimeType:"message/rfc822", buffer:Buffer.from(raw) });
  await page.locator(".mail-message").click();
  await expect(page.locator(".mail-body")).toContainText("Olá, leitor.");
  await expect(page.locator(".mail-body")).not.toContainText("window.__mailScript");
  expect(await page.evaluate(() => window.__mailScript)).toBeUndefined(); expect(trackers).toBe(0); expect(state.calls).toHaveLength(0);
});

test("responder e encaminhar usam comandos ActiveSync e mantêm anexo do original", async ({ page }) => {
  const state = await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.locator(".mail-message").click();
  await page.getByRole("button", { name: "Responder", exact:true }).click();
  let dialog = page.getByRole("dialog");
  await expect(dialog.getByLabel("Para", { exact:true })).toHaveValue("colega@example.invalid");
  await dialog.getByRole("button", { name:"Enviar e-mail", exact:true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.sends[0].command).toBe("SmartReply");
  await page.getByRole("button", { name:"Encaminhar", exact:true }).click();
  dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("button", { name:"Remover anexo relatorio.pdf" })).toBeVisible();
  await dialog.getByLabel("Para", { exact:true }).fill("outro@example.invalid");
  await dialog.getByRole("button", { name:"Enviar e-mail", exact:true }).click();
  await expect(dialog).toHaveCount(0);
  expect(state.sends[1].command).toBe("SmartForward");
  expect(state.sends[1].parsed.attachments[0].filename).toBe("relatorio.pdf");
});

test("pasta de exportação é escolhida pelo usuário e grava cópia única sem sobrescrever", async ({ page }) => {
  await page.addInitScript(() => {
    window.__mailFiles = [];
    window.showDirectoryPicker = async () => ({ name:"Cópias escolhidas", getFileHandle:async (name) => ({ createWritable:async () => ({
      write:async (bytes) => window.__mailFiles.push({ name, bytes:Array.from(bytes) }), close:async () => {}, abort:async () => {},
    }) }) });
  });
  await setupMail(page); await page.goto("/"); await openMail(page); await connect(page);
  await page.getByRole("button", { name:"Pasta para salvar", exact:true }).click();
  await expect(page.getByRole("status")).toContainText("Cópias escolhidas");
  await page.locator(".mail-message").click();
  await page.getByRole("button", { name:"Salvar .eml", exact:true }).click();
  await expect.poll(() => page.evaluate(() => window.__mailFiles.length)).toBe(1);
  await page.getByRole("button", { name:"Salvar .eml", exact:true }).click();
  await expect.poll(() => page.evaluate(() => window.__mailFiles.length)).toBe(2);
  const files = await page.evaluate(() => window.__mailFiles);
  expect(files[0].name).not.toBe(files[1].name);
  const parsed = await PostalMime.parse(new Uint8Array(files[0].bytes));
  expect(parsed.subject).toBe("Agenda de atendimento");
});
