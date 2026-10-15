import React, { createContext, useContext, useEffect, useRef, useState } from "react";
import { useTeam } from "./Team";
const MailContext = createContext(null);
export const useMail = () => useContext(MailContext);
export function MailHost({ children }) {
  const team = useTeam();
  const credentials = useRef(null), pending = useRef(new Set()), locks = useRef(new Set());
  const writes = useRef(0);
  const [writing, setWriting] = useState(false);
  const [account, setAccount] = useState(null), [folders, setFolders] = useState([]), [cache, setCache] = useState({});
  const cacheRef = useRef({});
  const [folderId, setFolderId] = useState("");
  const [range, setRange] = useState("5"), [notice, setNotice] = useState("");
  const [localFiles, setLocalFiles] = useState([]);
  const [directory, setDirectory] = useState(null);
  function disconnect() {
    credentials.current = null;
    pending.current.forEach((controller) => controller.abort()); pending.current.clear();
    locks.current.clear(); cacheRef.current = {}; setCache({}); setFolders([]); setAccount(null); setFolderId(""); setNotice("");
  }
  useEffect(() => () => { credentials.current = null; pending.current.forEach((c) => c.abort()); }, []);
  const update = (id, next) => { cacheRef.current = { ...cacheRef.current, [id]: next }; setCache(cacheRef.current); };
  async function request(action, params = {}, candidate) {
    const connection = candidate || credentials.current;
    if (!team.online || !connection) throw new Error("Conecte sua conta de e-mail para continuar.");
    if (!navigator.onLine) throw new Error("Sem conexão. Salve um rascunho .eml e envie quando estiver online.");
    const controller = new AbortController(); pending.current.add(controller);
    const write = ["send", "move", "markRead", "createFolder", "renameFolder", "deleteFolder"].includes(action);
    if (write) { writes.current++; setWriting(true); }
    try {
      const result = await team.client.functions.invoke("mail", { body: { action, ...params, credentials: connection }, signal: controller.signal });
      if (result.error) {
        let response;
        try { response = await result.error.context?.json(); } catch {}
        if (response?.code === "MAIL_AUTH") disconnect();
        const unknownSend = action === "send" && (!response?.code || ["MAIL_FAILED", "NETWORK"].includes(response.code));
        const missing = result.error.context?.status === 404 || response?.code === "NOT_FOUND";
        const unreachable = ["FunctionsFetchError", "FunctionsRelayError"].includes(result.error.name);
        const error = new Error(unknownSend ? "O envio ficou sem confirmação. Confira Enviados antes de iniciar outro envio; não houve reenvio automático."
          : missing
          ? "A conexão de e-mail ainda não está disponível neste sistema. Solicite a ativação ao administrador."
          : unreachable ? "Não foi possível acessar a integração de e-mail. Solicite ao administrador a conferência da publicação da função mail no Supabase e da permissão de acesso deste site. A senha ainda não pôde ser validada."
          : response?.message || "O serviço de e-mail está indisponível. Confira a conexão ou solicite ajuda ao administrador.");
        error.code = unknownSend ? "SEND_UNKNOWN" : missing || unreachable ? "MAIL_UNAVAILABLE" : response?.code; throw error;
      }
      if (!candidate && credentials.current !== connection) throw new Error("A conexão de e-mail foi encerrada.");
      const reply = result.data;
      const invalid = !reply || typeof reply !== "object" || Array.isArray(reply) ||
        (["folders", "createFolder", "renameFolder", "deleteFolder"].includes(action) && !Array.isArray(reply.folders)) ||
        (action === "sync" && (!reply.syncKey || !Array.isArray(reply.added) || !Array.isArray(reply.changed) || !Array.isArray(reply.deleted))) ||
        (action === "send" && reply.sent !== true);
      if (invalid) {
        const error = new Error(action === "send" ? "O envio ficou sem confirmação válida. Confira Enviados antes de iniciar outro envio." : "O serviço retornou uma resposta inesperada. Solicite a conferência da integração ao administrador.");
        error.code = action === "send" ? "SEND_UNKNOWN" : "API_CONTRACT"; throw error;
      }
      return reply;
    } finally { pending.current.delete(controller); if (write) { writes.current--; setWriting(writes.current > 0); } }
  }
  async function connect(email, password) {
    let deviceId;
    const key = `implanta.mail.device.v1:${team.actor.id}`;
    try { deviceId = localStorage.getItem(key); } catch {}
    if (!/^[a-z0-9]{32}$/i.test(deviceId || "")) {
      deviceId = crypto.randomUUID().replaceAll("-", "");
      try { localStorage.setItem(key, deviceId); } catch {}
    }
    const candidate = { email: email.trim().toLowerCase(), password, deviceId };
    const result = await request("folders", {}, candidate);
    credentials.current = candidate;
    cacheRef.current = {}; setCache({}); setFolders(result.folders); setAccount({ email: candidate.email });
    setFolderId(result.folders.find((f) => f.type === 2)?.id || result.folders[0]?.id || "");
  }
  async function sync(id = folderId, reset = false) {
    if (!credentials.current || !id || locks.current.has(id)) return;
    locks.current.add(id);
    const connection = credentials.current;
    try {
      const previous = !reset && cacheRef.current[id]?.range === range ? cacheRef.current[id] : null;
      const result = await request("sync", { folderId: id, syncKey: previous?.syncKey || "0", range });
      if (credentials.current !== connection) return;
      const messages = new Map((previous?.messages || []).map((m) => [m.id, m]));
      for (const id of result.deleted) messages.delete(id);
      for (const item of [...result.added, ...result.changed]) messages.set(item.id, { ...messages.get(item.id), ...item });
      update(id, { syncKey: result.syncKey, more: result.more, range, messages: [...messages.values()].sort((a, b) => (b.date || "").localeCompare(a.date || "")) });
    } finally { locks.current.delete(id); }
  }
  useEffect(() => {
    if (!account) return;
    const refresh = () => {
      const inbox = folders.find((f) => f.type === 2);
      if (inbox && document.visibilityState === "visible" && navigator.onLine) sync(inbox.id).catch((error) => setNotice(error.message));
    };
    const timer = setInterval(refresh, 60000);
    window.addEventListener("online", refresh);
    return () => { clearInterval(timer); window.removeEventListener("online", refresh); };
  }, [account, folders, range]);
  const mail = {
    online: team.online, writing, isWriting: () => writes.current > 0, account, folders, cache, folderId, setFolderId, range, setRange, notice, setNotice,
    localFiles, setLocalFiles, directory, setDirectory, connect, disconnect, request, sync,
    async markRead(id, read, sourceFolder = folderId) {
      if (locks.current.has(sourceFolder)) throw new Error("Aguarde a sincronização da pasta.");
      const previous = cacheRef.current[sourceFolder];
      if (!previous?.syncKey) throw new Error("Atualize a pasta antes de marcar a leitura.");
      locks.current.add(sourceFolder);
      try {
        const result = await request("markRead", { folderId: sourceFolder, id, read, syncKey: previous.syncKey });
        update(sourceFolder, { ...previous, syncKey: result.syncKey, messages: previous.messages.map((m) => m.id === id ? { ...m, read } : m) });
      } finally { locks.current.delete(sourceFolder); }
    },
    async move(id, destination) {
      if (locks.current.has(folderId)) throw new Error("Aguarde a sincronização da pasta.");
      locks.current.add(folderId);
      try {
        const result = await request("move", { folderId, id, destination });
        const previous = cacheRef.current[folderId];
        if (previous) update(folderId, { ...previous, messages: previous.messages.filter((m) => m.id !== id) });
        return result;
      } finally { locks.current.delete(folderId); }
    },
    async folder(action, input) { const result = await request(action, input); setFolders(result.folders); if (action === "deleteFolder" && input.id === folderId) setFolderId(result.folders.find((f) => f.type === 2)?.id || ""); },
  };
  return <MailContext.Provider value={mail}>{children}</MailContext.Provider>;
}
