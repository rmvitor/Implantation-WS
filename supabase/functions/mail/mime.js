export const MAX_ATTACHMENTS = 5 * 1024 * 1024;
export function base64(bytes) {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
export function unbase64(value) {
  if (typeof value !== "string" || value.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("Arquivo codificado inválido.");
  return Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
}
const addressPattern = /^[a-z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i;
export function addresses(input, required = false) {
  if (typeof input !== "string" || /[\r\n]/.test(input)) throw new Error("Destinatário inválido.");
  const list = input.split(/[,;]/).map((s) => s.trim()).filter(Boolean);
  if (required && !list.length || list.length > 50 || list.some((a) => !addressPattern.test(a))) throw new Error("Informe endereços válidos, separados por vírgula.");
  return [...new Set(list)];
}
export function safeFileName(input) {
  return String(input || "arquivo").replace(/[\x00-\x1f\x7f\\/:*?"<>|]/g, "_").replace(/^\.+/, "_").slice(0, 130) || "arquivo";
}
export function validateDraft(input, { sending = true } = {}) {
  if (!input || typeof input !== "object") throw new Error("Mensagem inválida.");
  const draft = {
    to: addresses(input.to || ""), cc: addresses(input.cc || ""), bcc: addresses(input.bcc || ""),
    subject: String(input.subject || ""), body: String(input.body || ""), attachments: input.attachments || [],
  };
  if (sending && !draft.to.length && !draft.cc.length && !draft.bcc.length) throw new Error("Informe pelo menos um destinatário.");
  if (/[\r\n\x00]/.test(draft.subject) || draft.subject.length > 500 || draft.body.length > 200000) throw new Error("Assunto ou texto excede o limite permitido.");
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
const fold = (str) => str.match(/.{1,76}/g)?.join("\r\n") || "";
function encodedWords(input) {
  const words = []; let current = "";
  for (const point of input) {
    if (new TextEncoder().encode(current + point).length > 42) { words.push(current); current = ""; }
    current += point;
  }
  if (current) words.push(current);
  return words.map((word) => `=?UTF-8?B?${base64(new TextEncoder().encode(word))}?=`).join("\r\n ");
}
export function makeMime(input, sender, { draft = false, id = crypto.randomUUID(), at = new Date() } = {}) {
  const message = validateDraft(input, { sending: !draft });
  const from = addresses(sender, true);
  if (from.length !== 1) throw new Error("Remetente inválido.");
  const boundary = `implanta_${id.replace(/[^a-z0-9]/gi, "")}`;
  const headers = [
    `From: ${from[0]}`, ...(message.to.length ? [`To: ${message.to.join(", ")}`] : []),
    ...(message.cc.length ? [`Cc: ${message.cc.join(", ")}`] : []),
    // EAS accepts MIME recipients including Bcc. The mail server strips Bcc
    // on delivery; it must be present in the submitted MIME for routing.
    ...(message.bcc.length ? [`Bcc: ${message.bcc.join(", ")}`] : []),
    `Subject: ${encodedWords(message.subject)}`, `Date: ${at.toUTCString()}`,
    `Message-ID: <${id.replace(/[^a-z0-9-]/gi, "")}@${from[0].split("@")[1]}>`, "MIME-Version: 1.0",
    ...(draft ? ["X-Unsent: 1"] : []),
  ];
  const body = ["Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", fold(base64(new TextEncoder().encode(message.body)))].join("\r\n");
  if (!message.attachments.length) return new TextEncoder().encode([...headers, body].join("\r\n"));
  const parts = message.attachments.map((a) => [
    `Content-Type: ${a.type}`, "Content-Transfer-Encoding: base64",
    `Content-Disposition: attachment; filename*=UTF-8''${encodeURIComponent(a.name).replace(/'/g, "%27")}`, "", fold(base64(a.bytes)),
  ].join("\r\n"));
  return new TextEncoder().encode([...headers, `Content-Type: multipart/mixed; boundary="${boundary}"`, "", `--${boundary}`, body,
    ...parts.flatMap((part) => [`--${boundary}`, part]), `--${boundary}--`, ""].join("\r\n"));
}
