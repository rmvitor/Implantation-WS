import { credentials, createActiveSync, MailError, readLimited } from "./activesync.js";
const actions = new Set(["folders", "sync", "message", "raw", "attachment", "markRead", "move", "createFolder", "renameFolder", "deleteFolder", "send"]);
export function createMailHandler({ authenticate, fetcher = fetch, allowedOrigins = ["https://rmvitor.github.io"] }) {
  return async function handler(request) {
    const origin = request.headers.get("Origin");
    const cors = { "Vary": "Origin", "Cache-Control": "no-store", "X-Content-Type-Options": "nosniff",
      "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info", "Access-Control-Allow-Methods": "POST, OPTIONS" };
    if (origin && !allowedOrigins.includes(origin)) return new Response(null, { status: 403, headers: cors });
    if (origin) cors["Access-Control-Allow-Origin"] = origin;
    const reply = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { ...cors, "Content-Type": "application/json; charset=utf-8" } });
    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });
    if (request.method !== "POST") return reply({ code: "METHOD", message: "Método não permitido." }, 405);
    try {
      const token = request.headers.get("Authorization")?.match(/^Bearer (.+)$/i)?.[1];
      if (!token) throw new MailError("APP_AUTH", "Entre no Implanta para usar o e-mail.", 401);
      const active = await authenticate(token);
      if (!active) throw new MailError("APP_AUTH", "Sua conta precisa estar ativa e liberada pelo administrador.", 403);
      const bytes = await readLimited(request.body, 8 * 1024 * 1024);
      let input;
      try { input = JSON.parse(new TextDecoder().decode(bytes)); } catch { throw new MailError("INVALID", "Requisição inválida."); }
      if (!actions.has(input?.action)) throw new MailError("INVALID", "Operação não permitida.");
      const account = credentials(input.credentials);
      const service = createActiveSync(account, { fetcher });
      let result;
      switch (input.action) {
        case "folders": result = await service.folders(); break;
        case "sync": result = await service.sync(input.folderId, input.syncKey, String(input.range ?? "5")); break;
        case "message": result = await service.fetchItem(input.folderId, input.id); break;
        case "raw": result = await service.fetchItem(input.folderId, input.id, true); break;
        case "attachment": result = await service.attachment(input.reference); break;
        case "markRead": result = await service.markRead(input.folderId, input.id, input.syncKey, input.read); break;
        case "move": result = await service.move(input.folderId, input.id, input.destination); break;
        case "send": result = await service.send(input); break;
        default: result = await service.folder(input.action, input);
      }
      return reply(result);
    } catch (error) {
      // Do not log request bodies, MIME, credentials, URLs with usernames or
      // upstream errors. Only known, fixed application messages cross the API.
      if (error instanceof MailError) return reply({ code: error.code, message: error.message }, error.status);
      return reply({ code: "MAIL_FAILED", message: "Não foi possível concluir a operação de e-mail. Confira os dados e a conexão." }, 502);
    }
  };
}
