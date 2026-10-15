import { createDemo } from "./workspace.js";
import { createMailHandler } from "../../supabase/functions/mail/handler.js";
import { decode, encode, node as n, child, children, value, data } from "../../supabase/functions/mail/wbxml.js";
import { makeMime, base64 } from "../../supabase/functions/mail/mime.js";
import PostalMime from "postal-mime";
const uid = "00000000-0000-4000-8000-000000000001";
const jwt = (role) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: uid, role, exp: Math.floor(Date.now()/1000)+3600 })).toString("base64url")}.test`;
const source = { id: "m1", subject: "Agenda de atendimento", from: "Colega <colega@example.invalid>", to: "caixa@ipm.com.br", date: "2026-10-15T12:00:00Z", body: "Atendimento agendado.\nConteúdo privado do e-mail.", read: false };
export async function setupMail(page, { empty = false } = {}) {
  const demo = createDemo(); if (empty) { demo.projects = []; demo.selectedId = ""; }
  const user = { id: uid, email: "caixa@ipm.com.br", aud: "authenticated", role: "authenticated", user_metadata: {}, app_metadata: {}, created_at: "2026-10-15T00:00:00Z" };
  const session = { user, access_token: jwt("authenticated"), refresh_token: "fake-refresh", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+3600 };
  const state = { sends: [], calls: [], commits: [], unavailable: false, rejected: false, unknown: false, sequence: 0, folders: [
    { id: "inbox", name: "Caixa de entrada", parentId: "0", type: 2 }, { id: "sent", name: "Enviados", parentId: "0", type: 5 },
    { id: "trash", name: "Lixeira", parentId: "0", type: 4 }, { id: "custom", name: "Contratos", parentId: "0", type: 12 },
  ], messages: { inbox: [structuredClone(source)], sent: [], trash: [], custom: [] } };
  await page.addInitScript(({ demo, session, key }) => {
    localStorage.setItem("implanta.team.connection.v1", JSON.stringify({ url: "https://mail-test.supabase.co", key }));
    localStorage.setItem("implanta.workspace.v1", JSON.stringify(demo));
    localStorage.setItem("sb-mail-test-auth-token", JSON.stringify(session));
  }, { demo, session, key: jwt("anon") });
  const binary = (root) => new Response(encode(root), { headers: { "Content-Type": "application/vnd.ms-sync.wbxml" } });
  const fields = (m, full = false) => [n("Email:Subject", m.subject), n("Email:From", m.from), n("Email:To", m.to), n("Email:DateReceived", m.date), n("Email:Read", m.read ? "1" : "0"),
    n("AirSyncBase:Body", n("AirSyncBase:Type", "1"), n("AirSyncBase:Data", full ? m.body : m.body.slice(0, 20))),
    n("AirSyncBase:Attachments", n("AirSyncBase:Attachment", n("AirSyncBase:DisplayName", "relatorio.pdf"), n("AirSyncBase:FileReference", "file-reference"), n("AirSyncBase:EstimatedDataSize", "4")))];
  const backend = createMailHandler({ allowedOrigins: ["http://127.0.0.1:5173"], authenticate: async (token) => token === session.access_token,
    fetcher: async (url, options) => {
      const cmd = url.searchParams.get("Cmd"), root = decode(options.body); state.calls.push(cmd);
      if (state.rejected) return new Response(null, { status: 401 });
      if (cmd === "FolderSync") return binary(n("FolderHierarchy:FolderSync", n("FolderHierarchy:Status", "1"), n("FolderHierarchy:SyncKey", "folders"), n("FolderHierarchy:Changes", state.folders.map((f) => n("FolderHierarchy:Add", n("FolderHierarchy:ServerId", f.id), n("FolderHierarchy:ParentId", f.parentId), n("FolderHierarchy:DisplayName", f.name), n("FolderHierarchy:Type", f.type))))));
      if (cmd === "Sync") {
        const collection = child(child(root, "AirSync:Collections"), "AirSync:Collection"), folder = value(collection, "AirSync:CollectionId"), key = value(collection, "AirSync:SyncKey");
        const change = child(child(collection, "AirSync:Commands"), "AirSync:Change");
        const m = change && state.messages[folder]?.find((m) => m.id === value(change, "AirSync:ServerId"));
        if (m) m.read = value(child(change, "AirSync:ApplicationData"), "Email:Read") === "1";
        return binary(n("AirSync:Sync", n("AirSync:Collections", n("AirSync:Collection", n("AirSync:Status", "1"), n("AirSync:SyncKey", `key-${++state.sequence}`),
          ...(change ? [n("AirSync:Responses", n("AirSync:Change", n("AirSync:Status", "1")))] : key === "0" ? [] : [n("AirSync:Commands", (state.messages[folder] || []).map((m) => n("AirSync:Add", n("AirSync:ServerId", m.id), n("AirSync:ApplicationData", fields(m)))))])))));
      }
      if (cmd === "ItemOperations") {
        const fetch = child(root, "ItemOperations:Fetch"), folder = value(fetch, "AirSync:CollectionId"), id = value(fetch, "AirSync:ServerId");
        const m = state.messages[folder]?.find((m) => m.id === id) || source;
        const raw = value(child(child(fetch, "ItemOperations:Options"), "AirSyncBase:BodyPreference"), "AirSyncBase:Type") === "4";
        const attachment = child(fetch, "AirSyncBase:FileReference");
        const properties = attachment ? [n("ItemOperations:Data", new Uint8Array([0,255,12,3])), n("AirSyncBase:ContentType", "application/pdf")] : raw
          ? [n("AirSyncBase:Body", n("AirSyncBase:Type", "4"), n("AirSyncBase:Data", makeMime({ to: m.to, subject: m.subject, body: m.body, attachments: [{ name:"relatorio.pdf", type:"application/pdf", content:base64(new Uint8Array([0,255,12,3])) }] }, "colega@example.invalid")))] : fields(m, true);
        return binary(n("ItemOperations:ItemOperations", n("ItemOperations:Status", "1"), n("ItemOperations:Response", n("ItemOperations:Fetch", n("ItemOperations:Status", "1"), n("ItemOperations:Properties", properties)))));
      }
      if (["SendMail", "SmartReply", "SmartForward"].includes(cmd)) {
        state.sends.push({ command: cmd, clientId: value(root, "ComposeMail:ClientId"), parsed: await PostalMime.parse(data(child(root, "ComposeMail:MIME"))) });
        if (state.hold) { state.held = true; await new Promise((resolve) => { state.release = resolve; }); }
        if (state.unknown) throw new Error("Fictitious connection lost");
        return new Response(null, { status: 200 });
      }
      if (cmd === "MoveItems") {
        const move = child(root, "Move:Move"), from = value(move, "Move:SrcFldId"), to = value(move, "Move:DstFldId"), id = value(move, "Move:SrcMsgId");
        const m = state.messages[from].find((m) => m.id === id); state.messages[from] = state.messages[from].filter((m) => m.id !== id); state.messages[to].push(m);
        return binary(n("Move:MoveItems", n("Move:Response", n("Move:Status", "3"))));
      }
      if (["FolderCreate", "FolderUpdate", "FolderDelete"].includes(cmd)) {
        const id = value(root, "FolderHierarchy:ServerId"), name = value(root, "FolderHierarchy:DisplayName");
        if (cmd === "FolderCreate") { const f = { id: `new-${++state.sequence}`, name, parentId: value(root, "FolderHierarchy:ParentId"), type: 12 }; state.folders.push(f); state.messages[f.id] = []; }
        if (cmd === "FolderUpdate") state.folders.find((f) => f.id === id).name = name;
        if (cmd === "FolderDelete") state.folders = state.folders.filter((f) => f.id !== id);
        return binary(n(`FolderHierarchy:${cmd}`, n("FolderHierarchy:Status", "1")));
      }
      throw new Error(`Unexpected mocked EAS command ${cmd}`);
    } });
  await page.route("https://mail-test.supabase.co/**", async (route) => {
    const request = route.request(), url = new URL(request.url()), path = url.pathname;
    let data, status = 200, headers = { "Content-Type": "application/json" };
    if (path.endsWith("/functions/v1/mail")) {
      if (state.networkFailure) return route.abort("failed");
      if (state.unavailable) { data = { code: "NOT_FOUND", message: "Missing function" }; status = 404; }
      else {
        const response = await backend(new Request(request.url(), { method: request.method(), headers: request.headers(), body: request.postData() }));
        return route.fulfill({ status: response.status, headers: Object.fromEntries(response.headers), body: await response.text() });
      }
    } else if (path === "/auth/v1/user") data = user;
    else if (path === "/auth/v1/token") data = session;
    else if (path.endsWith("/rpc/implanta_read_v2")) { status = 404; data = { code: "PGRST202", message: "Not applied" }; }
    else if (path.endsWith("/rpc/implanta_access")) data = { id: uid, email: user.email, name: "Colega de teste", admin: true, active: true };
    else if (path.endsWith("/implanta_projects")) data = demo.projects.map((p) => ({ id:p.id, version:1, data:p }));
    else if (path.endsWith("/implanta_members")) data = [];
    else if (path.endsWith("/implanta_preferences")) data = { data: {} };
    else if (path.endsWith("/rpc/implanta_commit")) { state.commits.push(request.postDataJSON()); data = null; }
    else throw new Error(`Unexpected mocked Supabase request ${path}`);
    await route.fulfill({ status, headers, body: JSON.stringify(data) });
  });
  return state;
}
