import PostalMime from "postal-mime";
import DOMPurify from "dompurify";
import { base64, unbase64, safeFileName } from "../supabase/functions/mail/mime.js";
export { base64, unbase64, safeFileName };
export function htmlAsText(html) {
  const sanitized = DOMPurify.sanitize(String(html).replace(/<br\s*\/?\s*>|<\/(?:p|div|tr|li|h[1-6])\s*>/gi, "\n"), {
    ALLOWED_TAGS: [], ALLOWED_ATTR: [], FORBID_TAGS: ["script", "style", "iframe", "object"],
  });
  const textarea = document.createElement("textarea"); textarea.innerHTML = sanitized;
  return textarea.value;
}
const formatAddresses = (list) => (list || []).map((a) => a.address || "").filter(Boolean).join(", ");
export async function parseMail(bytes) {
  if (bytes.byteLength > 16 * 1024 * 1024) throw new Error("Use arquivos .eml de até 16 MB.");
  const result = await PostalMime.parse(bytes, { attachmentEncoding: "arraybuffer" });
  return {
    subject: result.subject || "(Sem assunto)", from: result.from ? `${result.from.name || ""} <${result.from.address || ""}>` : "",
    to: formatAddresses(result.to), cc: formatAddresses(result.cc), bcc: formatAddresses(result.bcc), draft: result.headers.some((h) => h.key === "x-unsent" && h.value === "1"), date: result.date || "", body: result.text || htmlAsText(result.html || ""),
    attachments: (result.attachments || []).map((a) => ({ name: safeFileName(a.filename || "anexo"), type: a.mimeType, content: base64(new Uint8Array(a.content)), size: a.content.byteLength })),
  };
}
export function downloadBytes(bytes, name, type = "application/octet-stream") {
  const url = URL.createObjectURL(new Blob([bytes], { type }));
  const link = document.createElement("a"); link.href = url; link.download = safeFileName(name); link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
export async function saveMailLocally(bytes, name, directory) {
  if (!directory) return downloadBytes(bytes, name, "message/rfc822");
  // Unique names preserve previous copies; nothing is overwritten silently.
  const unique = `${safeFileName(name).replace(/\.eml$/i, "").slice(0, 90)}-${crypto.randomUUID().slice(0, 8)}.eml`;
  const file = await directory.getFileHandle(unique, { create: true });
  const writer = await file.createWritable();
  try { await writer.write(bytes); await writer.close(); } catch (error) { await writer.abort().catch(() => {}); throw error; }
}
export function senderAddress(from) {
  return String(from || "").match(/<([^<>\s]+@[^<>\s]+)>/)?.[1] || String(from || "").trim();
}
