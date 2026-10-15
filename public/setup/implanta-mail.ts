// @ts-nocheck
// JavaScript gerado pelo bundler; tipos do entrypoint original verificados separadamente.
// Implanta: funcao mail para o editor web do Supabase.
// Copie TODO este arquivo para index.ts. Nome da funcao: mail.
// Gerado por npm run build:mail-dashboard; edite os fontes em supabase/functions/mail/.
// A autenticacao e a liberacao do usuario sao obrigatorias dentro deste codigo.
// Guia: https://github.com/rmvitor/Implantation-WS/blob/main/docs/EMAIL.md

// supabase/functions/mail/index.ts
import { createClient } from "npm:@supabase/supabase-js@2.117.3";

// supabase/functions/mail/wbxml.js
var pages = {
  AirSync: [0, { Sync: 5, Responses: 6, Add: 7, Change: 8, Delete: 9, Fetch: 10, SyncKey: 11, ClientId: 12, ServerId: 13, Status: 14, Collection: 15, Class: 16, CollectionId: 18, GetChanges: 19, MoreAvailable: 20, WindowSize: 21, Commands: 22, Options: 23, FilterType: 24, Collections: 28, ApplicationData: 29, DeletesAsMoves: 30, SoftDelete: 33, MIMESupport: 34, MIMETruncation: 35 }],
  Email: [2, { Attachment: 5, Attachments: 6, AttName: 7, AttSize: 8, DisplayName: 16, DateReceived: 15, Importance: 18, MessageClass: 19, Subject: 20, Read: 21, To: 22, Cc: 23, From: 24, ReplyTo: 25 }],
  Move: [5, { MoveItems: 5, Move: 6, SrcMsgId: 7, SrcFldId: 8, DstFldId: 9, Response: 10, Status: 11, DstMsgId: 12 }],
  FolderHierarchy: [7, { Folders: 5, Folder: 6, DisplayName: 7, ServerId: 8, ParentId: 9, Type: 10, Status: 12, Changes: 14, Add: 15, Delete: 16, Update: 17, SyncKey: 18, FolderCreate: 19, FolderDelete: 20, FolderUpdate: 21, FolderSync: 22, Count: 23 }],
  AirSyncBase: [17, { BodyPreference: 5, Type: 6, TruncationSize: 7, AllOrNone: 8, Body: 10, Data: 11, EstimatedDataSize: 12, Truncated: 13, Attachments: 14, Attachment: 15, DisplayName: 16, FileReference: 17, Method: 18, ContentId: 19, ContentLocation: 20, IsInline: 21, NativeBodyType: 22, ContentType: 23, Preview: 24 }],
  ItemOperations: [20, { ItemOperations: 5, Fetch: 6, Store: 7, Options: 8, Properties: 11, Data: 12, Status: 13, Response: 14 }],
  ComposeMail: [21, { SendMail: 5, SmartForward: 6, SmartReply: 7, SaveInSentItems: 8, ReplaceMime: 9, Source: 11, FolderId: 12, ItemId: 13, MIME: 16, ClientId: 17, Status: 18 }]
};
var encoder = new TextEncoder();
var decoder = new TextDecoder();
var node = (name, ...children2) => ({ name, children: children2.flat().filter((c) => c !== null && c !== void 0) });
function integer(value2) {
  const bytes = [value2 & 127];
  while (value2 = Math.floor(value2 / 128)) bytes.unshift(value2 & 127 | 128);
  return bytes;
}
function encode(root) {
  const chunks = [new Uint8Array([3, 1, 106, 0])];
  let currentPage = 0;
  const add = (bytes) => chunks.push(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes));
  function visit(value2) {
    if (value2 instanceof Uint8Array) {
      add([195, ...integer(value2.length)]);
      add(value2);
      return;
    }
    if (typeof value2 !== "object") {
      add([3]);
      add(encoder.encode(String(value2)));
      add([0]);
      return;
    }
    const [ns, name] = value2.name.split(":"), definition = pages[ns];
    if (!definition || !definition[1][name]) throw new Error("Unknown ActiveSync tag");
    if (currentPage !== definition[0]) {
      add([0, definition[0]]);
      currentPage = definition[0];
    }
    const content = value2.children.length > 0;
    add([definition[1][name] | (content ? 64 : 0)]);
    if (content) {
      value2.children.forEach(visit);
      add([1]);
    }
  }
  visit(root);
  const output = new Uint8Array(chunks.reduce((total, c) => total + c.length, 0));
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.length;
  }
  return output;
}
function decode(input) {
  const bytes = new Uint8Array(input), roots = [], stack = [];
  let offset = 0, page = 0, count = 0, expanded = 0;
  const byte = () => {
    if (offset >= bytes.length) throw new Error("Truncated WBXML");
    return bytes[offset++];
  };
  const readInteger = () => {
    let n = 0;
    for (let i = 0; i < 5; i++) {
      const b = byte();
      n = n * 128 + (b & 127);
      if (!(b & 128)) return n;
    }
    throw new Error("Invalid WBXML integer");
  };
  const zeroString = (source, start) => {
    const end = source.indexOf(0, start);
    if (end < 0) throw new Error("Invalid WBXML string");
    expanded += end - start;
    if (expanded > 32 * 1024 * 1024) throw new Error("WBXML text too large");
    return { value: decoder.decode(source.subarray(start, end)), end: end + 1 };
  };
  if (byte() !== 3) throw new Error("Unsupported WBXML version");
  const publicId = readInteger();
  if (!publicId) readInteger();
  if (readInteger() !== 106) throw new Error("Unsupported WBXML charset");
  const tableLength = readInteger();
  if (offset + tableLength > bytes.length) throw new Error("Invalid WBXML table");
  const table = bytes.subarray(offset, offset += tableLength);
  const append = (value2) => {
    if (++count > 15e4) throw new Error("WBXML too complex");
    (stack.at(-1)?.children || roots).push(value2);
  };
  while (offset < bytes.length) {
    const token = byte();
    if (token === 0) {
      page = byte();
      continue;
    }
    if (token === 1) {
      if (!stack.length) throw new Error("Invalid WBXML end");
      stack.pop();
      continue;
    }
    if (token === 3) {
      const str = zeroString(bytes, offset);
      offset = str.end;
      append(str.value);
      continue;
    }
    if (token === 131) {
      append(zeroString(table, readInteger()).value);
      continue;
    }
    if (token === 2) {
      append(String.fromCodePoint(readInteger()));
      continue;
    }
    if (token === 195) {
      const length = readInteger();
      if (offset + length > bytes.length) throw new Error("Invalid WBXML opaque");
      append(bytes.slice(offset, offset += length));
      continue;
    }
    if (token & 128 || (token & 63) < 5) throw new Error("Unsupported WBXML token");
    const ns = Object.keys(pages).find((name) => pages[name][0] === page);
    const tag = ns && Object.keys(pages[ns][1]).find((name) => pages[ns][1][name] === (token & 63));
    const value2 = node(`${ns || page}:${tag || token & 63}`);
    append(value2);
    if (token & 64) {
      if (stack.length >= 64) throw new Error("WBXML too deep");
      stack.push(value2);
    }
  }
  if (stack.length || roots.length !== 1 || typeof roots[0] !== "object") throw new Error("Invalid WBXML document");
  return roots[0];
}
var children = (value2, name) => (value2?.children || []).filter((c) => c?.name === name);
var child = (value2, name) => children(value2, name)[0];
function text(value2) {
  return (value2?.children || []).map((c) => typeof c === "string" ? c : c instanceof Uint8Array ? decoder.decode(c) : "").join("");
}
var value = (parent, name) => text(child(parent, name));
function data(value2) {
  const chunks = (value2?.children || []).map((c) => c instanceof Uint8Array ? c : encoder.encode(typeof c === "string" ? c : ""));
  const output = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
  let offset = 0;
  for (const c of chunks) {
    output.set(c, offset);
    offset += c.length;
  }
  return output;
}

// supabase/functions/mail/mime.js
var MAX_ATTACHMENTS = 5 * 1024 * 1024;
function base64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function unbase64(value2) {
  if (typeof value2 !== "string" || value2.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value2)) throw new Error("Arquivo codificado inválido.");
  return Uint8Array.from(atob(value2), (c) => c.charCodeAt(0));
}
var addressPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
function addresses(input, required = false) {
  if (typeof input !== "string" || /[\r\n]/.test(input)) throw new Error("Destinatário inválido.");
  const list = input.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (required && !list.length || list.length > 50 || list.some((a) => !addressPattern.test(a))) throw new Error("Informe endereços válidos, separados por vírgula.");
  return [...new Set(list)];
}
function safeFileName(input) {
  return String(input || "arquivo").replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_").replace(/^\.+/, "_").slice(0, 130) || "arquivo";
}
function validateDraft(input, { sending = true } = {}) {
  if (!input || typeof input !== "object") throw new Error("Mensagem inválida.");
  const draft = {
    to: addresses(input.to || ""),
    cc: addresses(input.cc || ""),
    bcc: addresses(input.bcc || ""),
    subject: String(input.subject || ""),
    body: String(input.body || ""),
    attachments: input.attachments || []
  };
  if (sending && !draft.to.length && !draft.cc.length && !draft.bcc.length) throw new Error("Informe pelo menos um destinatário.");
  if (/[\r\n\x00]/.test(draft.subject) || draft.subject.length > 500 || draft.body.length > 2e5) throw new Error("Assunto ou texto excede o limite permitido.");
  if (!Array.isArray(draft.attachments) || draft.attachments.length > 20) throw new Error("Use até 20 anexos.");
  let size = 0;
  draft.attachments = draft.attachments.map((a) => {
    const bytes = unbase64(a.content);
    size += bytes.length;
    return { name: safeFileName(a.name), type: /^[a-z0-9.+-]+\/[a-z0-9.+-]+$/i.test(a.type) ? a.type : "application/octet-stream", bytes };
  });
  if (size > MAX_ATTACHMENTS) throw new Error("Os anexos devem somar até 5 MB.");
  return draft;
}
var fold = (str) => str.match(/.{1,76}/g)?.join("\r\n") || "";
function encodedWords(input) {
  const words = [];
  let current = "";
  for (const point of input) {
    if (new TextEncoder().encode(current + point).length > 42) {
      words.push(current);
      current = "";
    }
    current += point;
  }
  if (current) words.push(current);
  return words.map((word) => `=?UTF-8?B?${base64(new TextEncoder().encode(word))}?=`).join("\r\n ");
}
function makeMime(input, sender, { draft = false, id = crypto.randomUUID(), at = /* @__PURE__ */ new Date() } = {}) {
  const message = validateDraft(input, { sending: !draft });
  const from = addresses(sender, true);
  if (from.length !== 1) throw new Error("Remetente inválido.");
  const boundary = `implanta_${id.replace(/[^a-z0-9]/gi, "")}`;
  const headers = [
    `From: ${from[0]}`,
    ...message.to.length ? [`To: ${message.to.join(", ")}`] : [],
    ...message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : [],
    // EAS accepts MIME recipients including Bcc. The mail server strips Bcc
    // on delivery; it must be present in the submitted MIME for routing.
    ...message.bcc.length ? [`Bcc: ${message.bcc.join(", ")}`] : [],
    `Subject: ${encodedWords(message.subject)}`,
    `Date: ${at.toUTCString()}`,
    `Message-ID: <${id.replace(/[^a-z0-9-]/gi, "")}@${from[0].split("@")[1]}>`,
    "MIME-Version: 1.0",
    ...draft ? ["X-Unsent: 1"] : []
  ];
  const body = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", fold(base64(new TextEncoder().encode(message.body)))].join("\r\n");
  if (!message.attachments.length) return new TextEncoder().encode([...headers, body].join("\r\n"));
  const parts = message.attachments.map((a) => [
    `Content-Type: ${a.type}`,
    "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(a.name).replace(/'/g, "%27")}`,
    "",
    fold(base64(a.bytes))
  ].join("\r\n"));
  return new TextEncoder().encode([
    ...headers,
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    "",
    `--${boundary}`,
    body,
    ...parts.flatMap((part) => [`--${boundary}`, part]),
    `--${boundary}--`,
    ""
  ].join("\r\n"));
}

// supabase/functions/mail/activesync.js
var SERVER = "https://mail.ipm.com.br/Microsoft-Server-ActiveSync";
var MailError = class extends Error {
  constructor(code, message, status2 = 400) {
    super(message);
    this.code = code;
    this.status = status2;
  }
};
var fail = (message = "O servidor não concluiu a operação. Atualize a pasta antes de tentar novamente.") => {
  throw new MailError("EAS_STATUS", message, 502);
};
var identifier = (str) => {
  if (typeof str !== "string" || !str.length || str.length > 2048 || /[\x00-\x1f]/.test(str)) throw new MailError("INVALID", "Identificador de mensagem ou pasta inválido.");
  return str;
};
var status = (tree, tag, expected = "1") => {
  const code = value(tree, tag);
  if (["142", "143", "144"].includes(code)) throw new MailError("MAIL_POLICY", "O servidor exige uma política de dispositivo. Solicite ao TI uma configuração compatível com o leitor; não é aplicado gerenciamento remoto do aparelho.", 409);
  if (code !== expected) fail();
};
async function readLimited(stream, limit) {
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
  } finally {
    await reader.cancel().catch(() => {
    });
  }
  const output = new Uint8Array(size);
  let offset = 0;
  for (const bytes of chunks) {
    output.set(bytes, offset);
    offset += bytes.length;
  }
  return output;
}
function credentials(input) {
  if (!input || typeof input.email !== "string" || !/^[^\s@]+@ipm\.com\.br$/i.test(input.email) || input.email.length > 254 || typeof input.password !== "string" || !input.password.length || input.password.length > 1024 || /[\r\n\x00]/.test(input.password) || !/^[a-z0-9]{16,40}$/i.test(input.deviceId || ""))
    throw new MailError("INVALID_ACCOUNT", "Informe sua conta @ipm.com.br e a senha de aplicativo autorizada para ActiveSync.");
  return { email: input.email.toLowerCase(), password: input.password, deviceId: input.deviceId };
}
function createActiveSync(account, { fetcher = fetch } = {}) {
  async function command(name, root, { empty = false, sending = false } = {}) {
    const url = new URL(SERVER);
    url.search = new URLSearchParams({ Cmd: name, User: account.email, DeviceId: account.deviceId, DeviceType: "Implanta" }).toString();
    let response;
    try {
      response = await fetcher(url, {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(25e3),
        headers: {
          Authorization: `Basic ${base64(new TextEncoder().encode(`${account.email}:${account.password}`))}`,
          "MS-ASProtocolVersion": "14.1",
          "Content-Type": "application/vnd.ms-sync.wbxml",
          "User-Agent": "Implanta-Mail/1.0",
          "X-MS-PolicyKey": "0"
        },
        body: encode(root)
      });
    } catch {
      throw new MailError(sending ? "SEND_UNKNOWN" : "NETWORK", sending ? "O envio ficou sem confirmação. Confira a pasta Enviados antes de tentar novamente; não houve reenvio automático." : "Não foi possível acessar o ActiveSync. Confira a conexão e a liberação do servidor com o TI.", 502);
    }
    if (response.status === 401) throw new MailError("MAIL_AUTH", "O servidor recusou a conta ou senha. Confira a senha de aplicativo e a liberação de ActiveSync.", 401);
    if (response.status === 403) throw new MailError("MAIL_FORBIDDEN", "O servidor não autorizou o acesso ActiveSync. Verifique a liberação com o TI.", 403);
    if ([449, 451].includes(response.status)) throw new MailError("MAIL_POLICY", "O servidor exige provisionamento ou outro endereço. O TI precisa confirmar a configuração; o app não aceita políticas de gerenciamento remoto do aparelho.", 409);
    if (!response.ok) throw new MailError(sending ? "SEND_UNKNOWN" : "MAIL_SERVER", sending ? "O envio não foi confirmado. Confira Enviados antes de tentar novamente." : "O servidor de e-mail está indisponível ou recusou esta operação.", 502);
    const bytes = await readLimited(response.body, 16 * 1024 * 1024);
    if (!bytes.length && empty) return null;
    try {
      return decode(bytes);
    } catch {
      throw new MailError(sending ? "SEND_UNKNOWN" : "MAIL_PROTOCOL", sending ? "O servidor respondeu sem confirmação válida do envio. Confira Enviados antes de tentar novamente." : "A resposta não é compatível com o ActiveSync 14.1 deste leitor. O TI precisa conferir o serviço.", 502);
    }
  }
  async function folders() {
    const result = await command("FolderSync", node("FolderHierarchy:FolderSync", node("FolderHierarchy:SyncKey", "0")));
    status(result, "FolderHierarchy:Status");
    return { syncKey: value(result, "FolderHierarchy:SyncKey"), folders: children(child(result, "FolderHierarchy:Changes"), "FolderHierarchy:Add").map((folder) => ({ id: value(folder, "FolderHierarchy:ServerId"), parentId: value(folder, "FolderHierarchy:ParentId"), name: value(folder, "FolderHierarchy:DisplayName"), type: Number(value(folder, "FolderHierarchy:Type")) })).filter((folder) => [1, 2, 3, 4, 5, 6, 12].includes(folder.type)) };
  }
  function message(id, app, previous = {}) {
    const body = child(app, "AirSyncBase:Body");
    const record = { ...previous, id };
    for (const [field, tag] of Object.entries({ subject: "Subject", from: "From", to: "To", cc: "Cc", date: "DateReceived" }))
      if (child(app, `Email:${tag}`)) record[field] = value(app, `Email:${tag}`);
    if (child(app, "Email:Read")) record.read = value(app, "Email:Read") === "1";
    if (body) {
      record.body = value(body, "AirSyncBase:Data");
      record.truncated = value(body, "AirSyncBase:Truncated") === "1";
    }
    if (child(app, "AirSyncBase:Attachments")) record.attachments = children(child(app, "AirSyncBase:Attachments"), "AirSyncBase:Attachment").map((a) => ({
      name: value(a, "AirSyncBase:DisplayName"),
      reference: value(a, "AirSyncBase:FileReference"),
      size: Number(value(a, "AirSyncBase:EstimatedDataSize") || 0)
    }));
    return record;
  }
  async function sync(folderId, key, range) {
    identifier(folderId);
    if (!["1", "3", "5", "0"].includes(String(range))) throw new MailError("INVALID", "Período inválido.");
    const collection = (syncKey2, initial = false) => node("AirSync:Sync", node("AirSync:Collections", node(
      "AirSync:Collection",
      node("AirSync:SyncKey", syncKey2),
      node("AirSync:CollectionId", folderId),
      ...initial ? [] : [node("AirSync:GetChanges", "1"), node("AirSync:WindowSize", "50"), node(
        "AirSync:Options",
        node("AirSync:FilterType", range),
        node("AirSyncBase:BodyPreference", node("AirSyncBase:Type", "1"), node("AirSyncBase:TruncationSize", "2048"))
      )]
    )));
    let syncKey = key || "0";
    if (syncKey === "0") {
      const result2 = await command("Sync", collection("0", true));
      const c2 = child(child(result2, "AirSync:Collections"), "AirSync:Collection");
      status(c2, "AirSync:Status");
      syncKey = value(c2, "AirSync:SyncKey");
    }
    identifier(syncKey);
    const result = await command("Sync", collection(syncKey));
    const c = child(child(result, "AirSync:Collections"), "AirSync:Collection");
    if (value(c, "AirSync:Status") === "3") throw new MailError("SYNC_RESET", "A sincronização expirou. Atualize a pasta para recarregá-la.", 409);
    status(c, "AirSync:Status");
    const commands = child(c, "AirSync:Commands");
    return {
      syncKey: value(c, "AirSync:SyncKey"),
      more: !!child(c, "AirSync:MoreAvailable"),
      added: children(commands, "AirSync:Add").map((a) => message(value(a, "AirSync:ServerId"), child(a, "AirSync:ApplicationData"))),
      changed: children(commands, "AirSync:Change").map((a) => message(value(a, "AirSync:ServerId"), child(a, "AirSync:ApplicationData"))),
      deleted: [...children(commands, "AirSync:Delete"), ...children(commands, "AirSync:SoftDelete")].map((a) => value(a, "AirSync:ServerId"))
    };
  }
  async function fetchItem(folderId, id, raw = false) {
    identifier(folderId);
    identifier(id);
    const options = node(
      "ItemOperations:Options",
      ...raw ? [node("AirSync:MIMESupport", "2")] : [],
      node("AirSyncBase:BodyPreference", node("AirSyncBase:Type", raw ? "4" : "1"), node("AirSyncBase:TruncationSize", raw ? "16777216" : "200000"))
    );
    const request = node("ItemOperations:ItemOperations", node(
      "ItemOperations:Fetch",
      node("ItemOperations:Store", "Mailbox"),
      node("AirSync:CollectionId", folderId),
      node("AirSync:ServerId", id),
      options
    ));
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
    folders,
    sync,
    fetchItem,
    async attachment(reference) {
      identifier(reference);
      const result = await command("ItemOperations", node("ItemOperations:ItemOperations", node("ItemOperations:Fetch", node("ItemOperations:Store", "Mailbox"), node("AirSyncBase:FileReference", reference))));
      status(result, "ItemOperations:Status");
      const fetched = child(child(result, "ItemOperations:Response"), "ItemOperations:Fetch");
      status(fetched, "ItemOperations:Status");
      const properties = child(fetched, "ItemOperations:Properties");
      if (!child(properties, "ItemOperations:Data")) fail("O servidor não retornou o conteúdo do anexo.");
      return { content: base64(data(child(properties, "ItemOperations:Data"))), type: value(properties, "AirSyncBase:ContentType") || "application/octet-stream" };
    },
    async markRead(folderId, id, key, read) {
      identifier(folderId);
      identifier(id);
      identifier(key);
      if (typeof read !== "boolean") throw new MailError("INVALID", "Situação de leitura inválida.");
      const result = await command("Sync", node("AirSync:Sync", node("AirSync:Collections", node(
        "AirSync:Collection",
        node("AirSync:SyncKey", key),
        node("AirSync:CollectionId", folderId),
        node("AirSync:GetChanges", "0"),
        node("AirSync:Commands", node("AirSync:Change", node("AirSync:ServerId", id), node("AirSync:ApplicationData", node("Email:Read", read ? "1" : "0"))))
      ))));
      const c = child(child(result, "AirSync:Collections"), "AirSync:Collection");
      status(c, "AirSync:Status");
      const changed = child(child(c, "AirSync:Responses"), "AirSync:Change");
      status(changed, "AirSync:Status");
      return { syncKey: value(c, "AirSync:SyncKey"), read };
    },
    async move(folderId, id, destination) {
      identifier(folderId);
      identifier(id);
      identifier(destination);
      if (folderId === destination) throw new MailError("INVALID", "Escolha outra pasta.");
      const result = await command("MoveItems", node("Move:MoveItems", node("Move:Move", node("Move:SrcMsgId", id), node("Move:SrcFldId", folderId), node("Move:DstFldId", destination))));
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
      const result = await command(cmd, node(
        `FolderHierarchy:${cmd}`,
        node("FolderHierarchy:SyncKey", listing.syncKey),
        ...action === "createFolder" ? [] : [node("FolderHierarchy:ServerId", existing.id)],
        ...action === "deleteFolder" ? [] : [node("FolderHierarchy:ParentId", parentId), node("FolderHierarchy:DisplayName", name)],
        ...action === "createFolder" ? [node("FolderHierarchy:Type", "12")] : []
      ));
      status(result, "FolderHierarchy:Status");
      return folders();
    },
    async send(input) {
      if (!/^[a-f0-9-]{36}$/i.test(input.requestId || "")) throw new MailError("INVALID", "Identificador de envio inválido.");
      const source = input.source;
      if (source && !["reply", "forward"].includes(source.kind)) throw new MailError("INVALID", "Tipo de resposta inválido.");
      const cmd = source ? source.kind === "reply" ? "SmartReply" : "SmartForward" : "SendMail";
      let mime;
      try {
        mime = makeMime(input, account.email, { id: input.requestId });
      } catch (error) {
        throw new MailError("INVALID_MESSAGE", error.message);
      }
      const result = await command(cmd, node(
        `ComposeMail:${cmd}`,
        node("ComposeMail:ClientId", input.requestId),
        node("ComposeMail:SaveInSentItems"),
        ...source ? [node("ComposeMail:ReplaceMime"), node("ComposeMail:Source", node("ComposeMail:FolderId", identifier(source.folderId)), node("ComposeMail:ItemId", identifier(source.id)))] : [],
        node("ComposeMail:MIME", mime)
      ), { empty: true, sending: true });
      if (result) status(result, "ComposeMail:Status");
      return { sent: true };
    }
  };
}

// supabase/functions/mail/handler.js
var actions = /* @__PURE__ */ new Set(["folders", "sync", "message", "raw", "attachment", "markRead", "move", "createFolder", "renameFolder", "deleteFolder", "send"]);
function createMailHandler({ authenticate, fetcher = fetch, allowedOrigins = ["https://rmvitor.github.io"] }) {
  return async function handler2(request) {
    const origin = request.headers.get("Origin");
    const cors = {
      "Vary": "Origin",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info",
      "Access-Control-Allow-Methods": "POST, OPTIONS"
    };
    if (origin && !allowedOrigins.includes(origin)) return new Response(null, { status: 403, headers: cors });
    if (origin) cors["Access-Control-Allow-Origin"] = origin;
    const reply = (data2, status2 = 200) => new Response(JSON.stringify(data2), { status: status2, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ code: "METHOD", message: "Método não permitido." }, 405);
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) throw new MailError("APP_AUTH", "Entre no Implanta para usar o e-mail.", 401);
      const active = await authenticate(token);
      if (!active) throw new MailError("APP_AUTH", "Sua conta precisa estar ativa e liberada pelo administrador.", 403);
      const bytes = await readLimited(request.body, 8 * 1024 * 1024);
      let input;
      try {
        input = JSON.parse(new TextDecoder().decode(bytes));
      } catch {
        throw new MailError("INVALID", "Requisição inválida.");
      }
      if (!actions.has(input?.action)) throw new MailError("INVALID", "Operação não permitida.");
      const account = credentials(input.credentials);
      const service = createActiveSync(account, { fetcher });
      let result;
      switch (input.action) {
        case "folders":
          result = await service.folders();
          break;
        case "sync":
          result = await service.sync(input.folderId, input.syncKey, String(input.range ?? "5"));
          break;
        case "message":
          result = await service.fetchItem(input.folderId, input.id);
          break;
        case "raw":
          result = await service.fetchItem(input.folderId, input.id, true);
          break;
        case "attachment":
          result = await service.attachment(input.reference);
          break;
        case "markRead":
          result = await service.markRead(input.folderId, input.id, input.syncKey, input.read);
          break;
        case "move":
          result = await service.move(input.folderId, input.id, input.destination);
          break;
        case "send":
          result = await service.send(input);
          break;
        default:
          result = await service.folder(input.action, input);
      }
      return reply(result);
    } catch (error) {
      if (error instanceof MailError) return reply({ code: error.code, message: error.message }, error.status);
      return reply({ code: "MAIL_FAILED", message: "Não foi possível concluir a operação de e-mail. Confira os dados e a conexão." }, 502);
    }
  };
}

// supabase/functions/mail/index.ts
var handler = createMailHandler({
  allowedOrigins: (Deno.env.get("MAIL_ALLOWED_ORIGINS") || "https://rmvitor.github.io").split(",").map((s) => s.trim()).filter(Boolean),
  authenticate: async (token) => {
    const client = createClient(Deno.env.get("SUPABASE_URL"), Deno.env.get("SUPABASE_ANON_KEY"), {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } }
    });
    const user = await client.auth.getUser(token);
    if (user.error || !user.data.user) return false;
    const access = await client.rpc("implanta_access");
    return !access.error && access.data?.id === user.data.user.id && access.data?.active === true;
  }
});
Deno.serve(handler);
