import { node as n, encode, decode, children, child, text, value, data } from "./wbxml.js";
import { base64, makeMime } from "./mime.js";
export const SERVER = "https://mail.ipm.com.br/Microsoft-Server-ActiveSync";
export class MailError extends Error {
  constructor(code, message, status = 400) { super(message); this.code = code; this.status = status; }
}
const fail = (message = "O servidor não concluiu a operação. Atualize a pasta antes de tentar novamente.") => { throw new MailError("EAS_STATUS", message, 502); };
const identifier = (str) => { if (typeof str !== "string" || !str.length || str.length > 2048 || /[\x00-\x1f]/.test(str)) throw new MailError("INVALID", "Identificador de mensagem ou pasta inválido."); return str; };
const status = (tree, tag, expected = "1") => {
  const code = value(tree, tag);
  if (["142", "143", "144"].includes(code)) throw new MailError("MAIL_POLICY", "O servidor exige uma política de dispositivo. Solicite ao TI uma configuração compatível com o leitor; não é aplicado gerenciamento remoto do aparelho.", 409);
  if (code !== expected) fail();
};
export async function readLimited(stream, limit) {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader(), chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value: bytes } = await reader.read();
      if (done) break;
      size += bytes.length;
      if (size > limit) throw new MailError("TOO_LARGE", `O conteúdo excede o limite de ${Math.floor(limit / (1024 * 1024))} MB desta operação. Use o webmail para mensagens maiores.`, 413);
      chunks.push(bytes);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const output = new Uint8Array(size); let offset = 0;
  for (const bytes of chunks) { output.set(bytes, offset); offset += bytes.length; }
  return output;
}
export function credentials(input) {
  if (!input || typeof input.email !== "string" || !/^[^\s@]+@ipm\.com\.br$/i.test(input.email) || input.email.length > 254 ||
    typeof input.password !== "string" || !input.password.length || input.password.length > 1024 || /[\r\n\x00]/.test(input.password) ||
    !/^[a-z0-9]{16,40}$/i.test(input.deviceId || ""))
    throw new MailError("INVALID_ACCOUNT", "Informe sua conta @ipm.com.br e a senha de aplicativo autorizada para ActiveSync.");
  return { email: input.email.toLowerCase(), password: input.password, deviceId: input.deviceId };
}
export function createActiveSync(account, { fetcher = fetch } = {}) {
  async function command(name, root, { empty = false, sending = false } = {}) {
    const url = new URL(SERVER);
    url.search = new URLSearchParams({ Cmd: name, User: account.email, DeviceId: account.deviceId, DeviceType: "Implanta" }).toString();
    let response;
    try {
      response = await fetcher(url, {
        method: "POST", redirect: "error", signal: AbortSignal.timeout(25000),
        headers: { Authorization: `Basic ${base64(new TextEncoder().encode(`${account.email}:${account.password}`))}`,
          "MS-ASProtocolVersion": "14.1", "Content-Type": "application/vnd.ms-sync.wbxml", "User-Agent": "Implanta-Mail/1.0", "X-MS-PolicyKey": "0" },
        body: encode(root),
      });
    } catch {
      throw new MailError(sending ? "SEND_UNKNOWN" : "NETWORK", sending
        ? "O envio ficou sem confirmação. Confira a pasta Enviados antes de tentar novamente; não houve reenvio automático."
        : "Não foi possível acessar o ActiveSync. Confira a conexão e a liberação do servidor com o TI.", 502);
    }
    if (response.status === 401) throw new MailError("MAIL_AUTH", "O servidor recusou a conta ou senha. Confira a senha de aplicativo e a liberação de ActiveSync.", 401);
    if (response.status === 403) throw new MailError("MAIL_FORBIDDEN", "O servidor não autorizou o acesso ActiveSync. Verifique a liberação com o TI.", 403);
    if ([449, 451].includes(response.status)) throw new MailError("MAIL_POLICY", "O servidor exige provisionamento ou outro endereço. O TI precisa confirmar a configuração; o app não aceita políticas de gerenciamento remoto do aparelho.", 409);
    if (!response.ok) throw new MailError(sending ? "SEND_UNKNOWN" : "MAIL_SERVER", sending
      ? "O envio não foi confirmado. Confira Enviados antes de tentar novamente."
      : "O servidor de e-mail está indisponível ou recusou esta operação.", 502);
    const bytes = await readLimited(response.body, 16 * 1024 * 1024);
    if (!bytes.length && empty) return null;
    try { return decode(bytes); } catch { throw new MailError(sending ? "SEND_UNKNOWN" : "MAIL_PROTOCOL", sending
      ? "O servidor respondeu sem confirmação válida do envio. Confira Enviados antes de tentar novamente."
      : "A resposta não é compatível com o ActiveSync 14.1 deste leitor. O TI precisa conferir o serviço.", 502); }
  }
  async function folders() {
    const result = await command("FolderSync", n("FolderHierarchy:FolderSync", n("FolderHierarchy:SyncKey", "0")));
    status(result, "FolderHierarchy:Status");
    return { syncKey: value(result, "FolderHierarchy:SyncKey"), folders: children(child(result, "FolderHierarchy:Changes"), "FolderHierarchy:Add")
      .map((folder) => ({ id: value(folder, "FolderHierarchy:ServerId"), parentId: value(folder, "FolderHierarchy:ParentId"), name: value(folder, "FolderHierarchy:DisplayName"), type: Number(value(folder, "FolderHierarchy:Type")) }))
      .filter((folder) => [1,2,3,4,5,6,12].includes(folder.type)) };
  }
  function message(id, app, previous = {}) {
    const body = child(app, "AirSyncBase:Body");
    const record = { ...previous, id };
    for (const [field, tag] of Object.entries({ subject:"Subject", from:"From", to:"To", cc:"Cc", date:"DateReceived" }))
      if (child(app, `Email:${tag}`)) record[field] = value(app, `Email:${tag}`);
    if (child(app, "Email:Read")) record.read = value(app, "Email:Read") === "1";
    if (body) { record.body = value(body, "AirSyncBase:Data"); record.truncated = value(body, "AirSyncBase:Truncated") === "1"; }
    if (child(app, "AirSyncBase:Attachments")) record.attachments = children(child(app, "AirSyncBase:Attachments"), "AirSyncBase:Attachment").map((a) => ({
      name: value(a, "AirSyncBase:DisplayName"), reference: value(a, "AirSyncBase:FileReference"), size: Number(value(a, "AirSyncBase:EstimatedDataSize") || 0),
    }));
    return record;
  }
  async function sync(folderId, key, range) {
    identifier(folderId);
    if (!["1", "3", "5", "0"].includes(String(range))) throw new MailError("INVALID", "Período inválido.");
    const collection = (syncKey, initial = false) => n("AirSync:Sync", n("AirSync:Collections", n("AirSync:Collection",
      n("AirSync:SyncKey", syncKey), n("AirSync:CollectionId", folderId),
      ...(initial ? [] : [n("AirSync:GetChanges", "1"), n("AirSync:WindowSize", "50"), n("AirSync:Options", n("AirSync:FilterType", range),
        n("AirSyncBase:BodyPreference", n("AirSyncBase:Type", "1"), n("AirSyncBase:TruncationSize", "2048")))]) )));
    let syncKey = key || "0";
    if (syncKey === "0") {
      const result = await command("Sync", collection("0", true));
      const c = child(child(result, "AirSync:Collections"), "AirSync:Collection");
      status(c, "AirSync:Status"); syncKey = value(c, "AirSync:SyncKey");
    }
    identifier(syncKey);
    const result = await command("Sync", collection(syncKey));
    const c = child(child(result, "AirSync:Collections"), "AirSync:Collection");
    if (value(c, "AirSync:Status") === "3") throw new MailError("SYNC_RESET", "A sincronização expirou. Atualize a pasta para recarregá-la.", 409);
    status(c, "AirSync:Status");
    const commands = child(c, "AirSync:Commands");
    return {
      syncKey: value(c, "AirSync:SyncKey"), more: !!child(c, "AirSync:MoreAvailable"),
      added: children(commands, "AirSync:Add").map((a) => message(value(a, "AirSync:ServerId"), child(a, "AirSync:ApplicationData"))),
      changed: children(commands, "AirSync:Change").map((a) => message(value(a, "AirSync:ServerId"), child(a, "AirSync:ApplicationData"))),
      deleted: [...children(commands, "AirSync:Delete"), ...children(commands, "AirSync:SoftDelete")].map((a) => value(a, "AirSync:ServerId")),
    };
  }
  async function fetchItem(folderId, id, raw = false) {
    identifier(folderId); identifier(id);
    const options = n("ItemOperations:Options",
      ...(raw ? [n("AirSync:MIMESupport", "2")] : []),
      n("AirSyncBase:BodyPreference", n("AirSyncBase:Type", raw ? "4" : "1"), n("AirSyncBase:TruncationSize", raw ? "16777216" : "200000")));
    const request = n("ItemOperations:ItemOperations", n("ItemOperations:Fetch", n("ItemOperations:Store", "Mailbox"),
      n("AirSync:CollectionId", folderId), n("AirSync:ServerId", id), options));
    const result = await command("ItemOperations", request);
    status(result, "ItemOperations:Status");
    const fetched = child(child(result, "ItemOperations:Response"), "ItemOperations:Fetch");
    status(fetched, "ItemOperations:Status");
    const properties = child(fetched, "ItemOperations:Properties"), body = child(properties, "AirSyncBase:Body");
    if (raw) {
      if (value(body, "AirSyncBase:Type") !== "4" || value(body, "AirSyncBase:Truncated") === "1") fail("O servidor não disponibilizou o e-mail MIME completo. Não foi criado um arquivo parcial.");
      if (!child(body, "AirSyncBase:Data") || !data(child(body, "AirSyncBase:Data")).length) fail("O servidor não retornou o conteúdo MIME original.");
      return { content: base64(data(child(body, "AirSyncBase:Data"))) };
    }
    return message(id, properties);
  }
  return {
    folders, sync, fetchItem,
    async attachment(reference) {
      identifier(reference);
      const result = await command("ItemOperations", n("ItemOperations:ItemOperations", n("ItemOperations:Fetch", n("ItemOperations:Store", "Mailbox"), n("AirSyncBase:FileReference", reference))));
      status(result, "ItemOperations:Status");
      const fetched = child(child(result, "ItemOperations:Response"), "ItemOperations:Fetch"); status(fetched, "ItemOperations:Status");
      const properties = child(fetched, "ItemOperations:Properties");
      if (!child(properties, "ItemOperations:Data")) fail("O servidor não retornou o conteúdo do anexo.");
      return { content: base64(data(child(properties, "ItemOperations:Data"))), type: value(properties, "AirSyncBase:ContentType") || "application/octet-stream" };
    },
    async markRead(folderId, id, key, read) {
      identifier(folderId); identifier(id); identifier(key);
      if (typeof read !== "boolean") throw new MailError("INVALID", "Situação de leitura inválida.");
      const result = await command("Sync", n("AirSync:Sync", n("AirSync:Collections", n("AirSync:Collection", n("AirSync:SyncKey", key), n("AirSync:CollectionId", folderId),
        n("AirSync:GetChanges", "0"), n("AirSync:Commands", n("AirSync:Change", n("AirSync:ServerId", id), n("AirSync:ApplicationData", n("Email:Read", read ? "1" : "0"))))))));
      const c = child(child(result, "AirSync:Collections"), "AirSync:Collection"); status(c, "AirSync:Status");
      const changed = child(child(c, "AirSync:Responses"), "AirSync:Change"); status(changed, "AirSync:Status");
      return { syncKey: value(c, "AirSync:SyncKey"), read };
    },
    async move(folderId, id, destination) {
      identifier(folderId); identifier(id); identifier(destination);
      if (folderId === destination) throw new MailError("INVALID", "Escolha outra pasta.");
      const result = await command("MoveItems", n("Move:MoveItems", n("Move:Move", n("Move:SrcMsgId", id), n("Move:SrcFldId", folderId), n("Move:DstFldId", destination))));
      status(child(result, "Move:Response"), "Move:Status", "3");
      return { moved: true };
    },
    async folder(action, input) {
      const listing = await folders();
      const existing = listing.folders.find((folder) => folder.id === input.id);
      if (action !== "createFolder" && (!existing || existing.type !== 12 && existing.type !== 1)) throw new MailError("INVALID", "As pastas padrão da caixa são preservadas.");
      const name = typeof input.name === "string" ? input.name.trim() : "";
      if (action !== "deleteFolder" && (!name || name.length > 100 || /[\x00-\x1f\\/]/.test(name))) throw new MailError("INVALID", "Informe um nome de pasta de até 100 caracteres, sem barras.");
      if (action === "deleteFolder" && input.confirmation !== existing.name) throw new MailError("INVALID", "Confirme o nome exato da pasta para excluir.");
      const cmd = action === "createFolder" ? "FolderCreate" : action === "renameFolder" ? "FolderUpdate" : "FolderDelete";
      const parentId = action === "createFolder" ? input.parentId || "0" : existing.parentId;
      if (parentId !== "0" && !listing.folders.some((p) => p.id === parentId)) throw new MailError("INVALID", "Pasta de destino inválida.");
      const result = await command(cmd, n(`FolderHierarchy:${cmd}`, n("FolderHierarchy:SyncKey", listing.syncKey),
        ...(action === "createFolder" ? [] : [n("FolderHierarchy:ServerId", existing.id)]),
        ...(action === "deleteFolder" ? [] : [n("FolderHierarchy:ParentId", parentId), n("FolderHierarchy:DisplayName", name)]),
        ...(action === "createFolder" ? [n("FolderHierarchy:Type", "12")] : [])));
      status(result, "FolderHierarchy:Status");
      return folders();
    },
    async send(input) {
      if (!/^[a-f0-9-]{36}$/i.test(input.requestId || "")) throw new MailError("INVALID", "Identificador de envio inválido.");
      const source = input.source;
      if (source && !["reply", "forward"].includes(source.kind)) throw new MailError("INVALID", "Tipo de resposta inválido.");
      const cmd = source ? source.kind === "reply" ? "SmartReply" : "SmartForward" : "SendMail";
      let mime;
      try { mime = makeMime(input, account.email, { id: input.requestId }); }
      catch (error) { throw new MailError("INVALID_MESSAGE", error.message); }
      const result = await command(cmd, n(`ComposeMail:${cmd}`, n("ComposeMail:ClientId", input.requestId), n("ComposeMail:SaveInSentItems"),
        ...(source ? [n("ComposeMail:ReplaceMime"), n("ComposeMail:Source", n("ComposeMail:FolderId", identifier(source.folderId)), n("ComposeMail:ItemId", identifier(source.id)))] : []),
        n("ComposeMail:MIME", mime)), { empty: true, sending: true });
      if (result) status(result, "ComposeMail:Status");
      return { sent: true };
    },
  };
}
