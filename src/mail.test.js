import test from "node:test";
import assert from "node:assert/strict";
import PostalMime from "postal-mime";
import { encode, decode, node as n, child, value, data, children } from "../supabase/functions/mail/wbxml.js";
import { makeMime, base64, addresses } from "../supabase/functions/mail/mime.js";
import { createActiveSync, MailError, credentials } from "../supabase/functions/mail/activesync.js";
import { createMailHandler } from "../supabase/functions/mail/handler.js";
const account = { email: "colega@ipm.com.br", password: "senha-ficticia-de-teste", deviceId: "1234567890abcdef1234567890abcdef" };
const recipient = "destinatario@example.invalid";
const requestId = "00000000-0000-4000-8000-000000000001";
const binary = (root, status = 200) => new Response(encode(root), { status, headers: { "Content-Type": "application/vnd.ms-sync.wbxml" } });
const folderResponse = () => n("FolderHierarchy:FolderSync", n("FolderHierarchy:Status", "1"), n("FolderHierarchy:SyncKey", "folders-1"), n("FolderHierarchy:Changes", [
  ["inbox", "Caixa de entrada", "2"], ["sent", "Enviados", "5"], ["trash", "Lixeira", "4"], ["custom", "Contratos", "12"],
].map(([id, name, type]) => n("FolderHierarchy:Add", n("FolderHierarchy:ServerId", id), n("FolderHierarchy:ParentId", "0"), n("FolderHierarchy:DisplayName", name), n("FolderHierarchy:Type", type)))));

test("WBXML preserva páginas, UTF-8 e binários e rejeita documentos malformados", () => {
  const original = n("ItemOperations:ItemOperations", n("Email:Subject", "Confirmação de migração"), n("ItemOperations:Data", new Uint8Array([0, 255, 254, 3])), n("Email:Read", "1"));
  const restored = decode(encode(original));
  assert.equal(value(restored, "Email:Subject"), "Confirmação de migração");
  assert.deepEqual(data(child(restored, "ItemOperations:Data")), new Uint8Array([0, 255, 254, 3]));
  assert.throws(() => decode(encode(original).slice(0, -1)));
  assert.throws(() => decode(new Uint8Array([3, 1, 106, 0, 195, 127])));
});
test("MIME pode ser lido por parser independente com destinatários, texto, acentos, Cco e anexos íntegros", async () => {
  const raw = makeMime({ to: recipient, cc: "copia@example.invalid", bcc: "oculta@example.invalid", subject: "Relatório — homologação".repeat(8), body: "Olá, colega.\nOs saldos estão conferidos.", attachments: [{ name: "relatório.pdf", type: "application/pdf", content: base64(new Uint8Array([0, 255, 12, 3])) }] }, account.email, { id: requestId, draft: true });
  const result = await PostalMime.parse(raw);
  assert.equal(result.from.address, account.email); assert.equal(result.to[0].address, recipient);
  assert.equal(result.bcc[0].address, "oculta@example.invalid"); assert.equal(result.subject, "Relatório — homologação".repeat(8));
  assert.match(result.text, /Os saldos estão conferidos/); assert.equal(result.attachments[0].filename, "relatório.pdf");
  assert.deepEqual(new Uint8Array(result.attachments[0].content), new Uint8Array([0, 255, 12, 3]));
  assert.ok(result.headers.some((header) => header.key === "x-unsent" && header.value === "1"));
  const plain = await PostalMime.parse(makeMime({ to: recipient, subject: "Teste", body: "Mensagem sem anexos" }, account.email));
  assert.match(plain.text, /Mensagem sem anexos/);
});
test("endereços, cabeçalhos e credenciais rejeitam injeção e anexos acima do limite", () => {
  assert.throws(() => addresses("colega@example.invalid\r\nBcc: outro@example.invalid"));
  assert.throws(() => makeMime({ to: recipient, subject: "oi\r\nBcc: outro@example.invalid" }, account.email));
  assert.throws(() => credentials({ ...account, email: "alguem@outro-servidor.invalid" }));
  assert.throws(() => credentials({ ...account, password: "senha\r\n" }));
  assert.throws(() => makeMime({ to: recipient, attachments: [{ name: "grande", content: base64(new Uint8Array(5 * 1024 * 1024 + 1)) }] }, account.email));
});
test("ponte exige usuário ativo antes de tocar no Mailcow e rejeita origens e ações desconhecidas", async () => {
  let calls = 0;
  const handler = createMailHandler({ authenticate: async (token) => token === "ativo", fetcher: async () => { calls++; return folderResponse(); } });
  const invoke = (token, action, origin = "https://rmvitor.github.io") => handler(new Request("https://functions.example.invalid/mail", { method: "POST", headers: { Origin: origin, Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, credentials: account }) }));
  assert.equal((await invoke("pendente", "folders")).status, 403);
  assert.equal((await invoke("ativo", "folders", "https://intruso.invalid")).status, 403);
  assert.equal((await invoke("ativo", "comando-arbitrario")).status, 400);
  assert.equal(calls, 0);
});
test("ActiveSync usa servidor fixo, TLS, Basic separado do JWT, sem redirecionar credenciais; pastas retornam reais", async () => {
  let fetched;
  const service = createActiveSync(account, { fetcher: async (url, options) => { fetched = { url, options }; return binary(folderResponse()); } });
  const result = await service.folders();
  assert.equal(result.folders[0].id, "inbox"); assert.equal(fetched.url.origin, "https://mail.ipm.com.br");
  assert.equal(fetched.options.redirect, "error"); assert.equal(fetched.options.headers["MS-ASProtocolVersion"], "14.1");
  assert.equal(fetched.options.headers.Authorization, `Basic ${btoa(`${account.email}:${account.password}`)}`);
  assert.equal(decode(fetched.options.body).name, "FolderHierarchy:FolderSync");
});
test("sincronização distingue inclusões, mudanças e exclusões e pagina usando SyncKey confirmado", async () => {
  const keys = [];
  const service = createActiveSync(account, { fetcher: async (_url, options) => {
    const collection = child(child(decode(options.body), "AirSync:Collections"), "AirSync:Collection");
    const key = value(collection, "AirSync:SyncKey"); keys.push(key);
    return binary(n("AirSync:Sync", n("AirSync:Collections", n("AirSync:Collection", n("AirSync:Status", "1"), n("AirSync:SyncKey", key === "0" ? "ready" : "next"), ...(key === "0" ? [] : [n("AirSync:MoreAvailable"), n("AirSync:Commands", n("AirSync:Add", n("AirSync:ServerId", "mail-1"), n("AirSync:ApplicationData", n("Email:Subject", "Saldo"), n("Email:Read", "0"))), n("AirSync:Change", n("AirSync:ServerId", "mail-2"), n("AirSync:ApplicationData", n("Email:Read", "1"))), n("AirSync:Delete", n("AirSync:ServerId", "mail-3")))])))));
  } });
  const result = await service.sync("inbox", "0", "5");
  assert.deepEqual(keys, ["0", "ready"]); assert.equal(result.syncKey, "next"); assert.equal(result.more, true);
  assert.equal(result.added[0].read, false); assert.deepEqual(result.changed[0], { id: "mail-2", read: true }); assert.deepEqual(result.deleted, ["mail-3"]);
});
test("envio usa ClientId estável e MIME validado; timeout não gera reenvio automático", async () => {
  let calls = 0;
  const service = createActiveSync(account, { fetcher: async (_url, options) => {
    calls++; const request = decode(options.body);
    assert.equal(request.name, "ComposeMail:SendMail"); assert.equal(value(request, "ComposeMail:ClientId"), requestId);
    const mime = await PostalMime.parse(data(child(request, "ComposeMail:MIME"))); assert.equal(mime.to[0].address, recipient);
    throw new Error("Timeout with sensitive upstream info");
  } });
  await assert.rejects(() => service.send({ requestId, to: recipient, subject: "Teste", body: "Conteúdo" }), (error) => error instanceof MailError && error.code === "SEND_UNKNOWN" && !error.message.includes("sensitive"));
  assert.equal(calls, 1);
});
test("não exclui pasta padrão nem aceita confirmação diferente; mover exige status 3", async () => {
  const calls = [];
  const service = createActiveSync(account, { fetcher: async (url) => { calls.push(url.searchParams.get("Cmd")); return binary(folderResponse()); } });
  await assert.rejects(() => service.folder("deleteFolder", { id: "inbox", confirmation: "Caixa de entrada" }));
  await assert.rejects(() => service.folder("deleteFolder", { id: "custom", confirmation: "outro nome" }));
  assert.deepEqual(calls, ["FolderSync", "FolderSync"]);
  const moving = createActiveSync(account, { fetcher: async () => binary(n("Move:MoveItems", n("Move:Response", n("Move:Status", "3")))) });
  assert.deepEqual(await moving.move("inbox", "message", "custom"), { moved: true });
});

test("rascunho sem destinatário pode ser salvo; envio exige algum destinatário e permite Cco sem Para", async () => {
  const draft = await PostalMime.parse(makeMime({ subject:"Rascunho", body:"Continuar depois" }, account.email, { draft:true }));
  assert.match(draft.text, /Continuar depois/);
  assert.throws(() => makeMime({ subject:"Sem destino" }, account.email));
  const bcc = await PostalMime.parse(makeMime({ bcc:recipient, subject:"Cópia oculta" }, account.email));
  assert.equal(bcc.bcc[0].address, recipient);
});

test("WBXML limita a expansão de referências de tabela para evitar consumo desproporcional de memória", () => {
  const table = new TextEncoder().encode("a".repeat(2048) + "\0");
  const bytes = new Uint8Array(5 + table.length + 3 + 17000 * 2 + 1);
  bytes.set([3,1,106,144,1]); bytes.set(table, 5);
  let offset = 5 + table.length;
  bytes.set([0,2,84], offset); offset += 3;
  for (let i = 0; i < 17000; i++) { bytes[offset++] = 131; bytes[offset++] = 0; }
  bytes[offset] = 1;
  assert.throws(() => decode(bytes), /WBXML text too large/);
});
