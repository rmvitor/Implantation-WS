import React, { useEffect, useRef, useState } from "react";
import { Mail, Plus, RefreshCw, FolderPlus, Download, Paperclip, ArrowLeft, LogOut, FolderOpen, Send, Search, X } from "lucide-react";
import { useMail } from "./mail-service.jsx";
import { useTeam } from "./Team";
import { useBackLayer } from "./Navigation.jsx";
import { parseMail, base64, unbase64, safeFileName, saveMailLocally, downloadBytes, senderAddress } from "./mail-files.js";
import { makeMime, MAX_ATTACHMENTS } from "../supabase/functions/mail/mime.js";
import "./mail.css";
const date = (value) => value && !Number.isNaN(Date.parse(value)) ? new Date(value).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "";
const messageName = (message) => `email-${safeFileName(message.subject || "sem-assunto").slice(0, 70)}.eml`;
const folderLabel = (folder, folders) => {
  const names = [folder.name], seen = new Set([folder.id]);
  let parent = folders.find((f) => f.id === folder.parentId);
  while (parent && !seen.has(parent.id) && seen.size < 20) { seen.add(parent.id); names.unshift(parent.name); parent = folders.find((f) => f.id === parent.parentId); }
  return names.join(" / ");
};

export function MailScreen({ Modal, onEditing }) {
  const mail = useMail(), team = useTeam();
  const [error, setError] = useState(""), [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false), [selected, setSelected] = useState(null), [composer, setComposer] = useState(null);
  const [folderDialog, setFolderDialog] = useState(null), [query, setQuery] = useState(""), [unread, setUnread] = useState(false);
  const [local, setLocal] = useState(false);
  const { directory, setDirectory } = mail;
  const importInput = useRef(), alive = useRef(true), generation = useRef(0), operation = useRef(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; generation.current++; }; }, []);
  useEffect(() => { onEditing(!!composer || !!folderDialog || mail.writing || busy); return () => onEditing(false); }, [composer, folderDialog, mail.writing, busy, onEditing]);
  useBackLayer(!!selected, () => { if (mail.writing) return false; generation.current++; setSelected(null); });
  async function act(fn) {
    if (operation.current) return;
    operation.current = true; setBusy(true); setError(""); setNotice("");
    try { return await fn(); } catch (err) { if (alive.current) setError(err.message); }
    finally { operation.current = false; if (alive.current) setBusy(false); }
  }
  useEffect(() => {
    if (mail.account && mail.folderId && !local) act(() => mail.sync(mail.folderId));
  }, [mail.account, mail.folderId, mail.range, local]);
  const folder = mail.folders.find((f) => f.id === mail.folderId);
  const snapshot = mail.cache[mail.folderId];
  const messages = local ? mail.localFiles.map((file, i) => ({ id: `local-${i}`, subject: file.name, date: new Date(file.lastModified).toISOString(), file, read: true })) : snapshot?.messages || [];
  const filtered = messages.filter((m) => (!unread || !m.read) && `${m.subject || ""} ${m.from || ""} ${m.to || ""}`.toLocaleLowerCase("pt-BR").includes(query.toLocaleLowerCase("pt-BR")));
  async function open(message) {
    const current = ++generation.current;
    setSelected({ ...message, loading: true });
    await act(async () => {
      try {
      const detail = local ? await parseMail(await message.file.arrayBuffer()) : await mail.request("message", { folderId: mail.folderId, id: message.id });
      if (current === generation.current && alive.current) setSelected({ ...message, ...detail, loading: false });
      } catch (err) { if (current === generation.current) setSelected(null); throw err; }
    });
  }
  function selectFolder(id, isLocal = false) { generation.current++; setSelected(null); setQuery(""); setUnread(false); setLocal(isLocal); if (!isLocal) mail.setFolderId(id); }
  async function raw(message = selected) {
    if (message.file) return new Uint8Array(await message.file.arrayBuffer());
    const result = await mail.request("raw", { folderId: mail.folderId, id: message.id });
    return unbase64(result.content);
  }
  async function startComposer(kind = "new") {
    await act(async () => {
      if (kind === "new") { setComposer({ kind }); return; }
      let source = selected, attachments = [];
      if (kind === "forward") { source = await parseMail(await raw()); attachments = source.attachments; }
      setComposer({
        kind, to: kind === "reply" ? senderAddress(source.from) : "", subject: `${kind === "reply" ? "Re" : "Enc"}: ${source.subject || ""}`,
        body: `\n\nEm ${date(source.date)}, ${source.from || ""} escreveu:\n${(source.body || "").split("\n").map((line) => `> ${line}`).join("\n")}`,
        attachments, source: selected.file ? undefined : { kind, folderId: mail.folderId, id: selected.id },
      });
    });
  }
  async function importFiles(files) {
    const eml = [...files].filter((file) => /\.eml$/i.test(file.name));
    if (eml.some((file) => file.size > 16 * 1024 * 1024)) throw new Error("Cada arquivo .eml pode ter até 16 MB.");
    mail.setLocalFiles((current) => [...current, ...eml]); selectFolder("", true);
    if (!eml.length) throw new Error("Selecione arquivos .eml.");
  }
  return <section className="mail-page">
    <div className="mail-heading"><div><h1>E-mails</h1><p>{mail.account?.email || "Sua caixa de e-mail e arquivos locais, independente dos projetos."}</p></div>
      <div className="mail-actions">
        {mail.account && <><button className="button primary" disabled={busy} onClick={() => startComposer()}><Plus size={16} /> Escrever</button><button className="button secondary" disabled={busy || mail.writing} onClick={() => { setSelected(null); mail.disconnect(); }}><LogOut size={16} /> Desconectar</button></>}
        <button className="button secondary" onClick={() => importInput.current.click()}><FolderOpen size={16} /> Abrir .eml</button>
        {"showDirectoryPicker" in window && <button className="button secondary" onClick={() => act(async () => {
          try { const handle = await window.showDirectoryPicker({ mode: "readwrite" }); setDirectory(handle); setNotice(`Novas cópias serão salvas em ${handle.name}.`); }
          catch (err) { if (err.name !== "AbortError") throw err; }
        })}>Pasta para salvar</button>}
      </div>
    </div>
    <input hidden ref={importInput} type="file" accept=".eml,message/rfc822" multiple onChange={(e) => { const files = [...e.target.files]; e.target.value = ""; act(() => importFiles(files)); }} />
    {(error || mail.notice) && <p role="alert" className="mail-error">{error || mail.notice}</p>}
    {notice && <p role="status" className="mail-notice">{notice}</p>}
    {!mail.account && !local && <ConnectMail onConnect={mail.connect} online={mail.online} email={team.profile?.email || ""} />}
    {(mail.account || local) && <div className={`mail-workspace ${selected ? "reading" : ""}`}>
      <aside className="mail-folders" aria-label="Pastas de e-mail">
        {mail.account && <><strong>No servidor</strong><button className="button secondary" disabled={busy} onClick={() => setFolderDialog({ action: "createFolder" })}><FolderPlus size={14} /> Nova pasta</button>
          {mail.folders.map((f) => <button key={f.id} className={f.id === mail.folderId && !local ? "active" : ""} aria-pressed={f.id === mail.folderId && !local} disabled={busy} onClick={() => selectFolder(f.id)}><Mail size={14} /><span title={folderLabel(f, mail.folders)}>{folderLabel(f, mail.folders)}</span></button>)}
        </>}
        <strong>Neste aparelho</strong><button className={local ? "active" : ""} aria-pressed={local} onClick={() => selectFolder("", true)}><FolderOpen size={14} /> Arquivos abertos ({mail.localFiles.length})</button>
        <small>Arquivos abertos ficam nesta sessão. As cópias salvas ficam na pasta escolhida ou em Downloads.</small>
      </aside>
      <div className="mail-list">
        <header><strong>{local ? "Arquivos locais" : folder?.name || "Pasta"}</strong>
          {!local && <div className="mail-actions"><button className="icon-button" aria-label="Atualizar e-mails" disabled={busy} onClick={() => act(() => mail.sync(mail.folderId, true))}><RefreshCw size={16} className={busy ? "spin" : ""} /></button>
            {[1,12].includes(folder?.type) && <><button className="button secondary" disabled={busy} onClick={() => setFolderDialog({ action: "renameFolder", ...folder })}>Renomear</button><button className="button secondary" disabled={busy} onClick={() => setFolderDialog({ action: "deleteFolder", ...folder })}>Excluir pasta</button></>}
          </div>}
        </header>
        <label className="mail-search"><Search size={15} /><input aria-label="Buscar nas mensagens carregadas" placeholder="Buscar nas mensagens carregadas" value={query} onChange={(e) => setQuery(e.target.value)} /></label>
        {!local && <div className="mail-list-filters"><label>Período<select aria-label="Período dos e-mails" value={mail.range} disabled={busy} onChange={(e) => { setSelected(null); mail.setRange(e.target.value); }}><option value="1">Último dia</option><option value="3">Últimos 7 dias</option><option value="5">Últimos 30 dias</option><option value="0">Todas as datas</option></select></label>
          <label><input type="checkbox" checked={unread} onChange={(e) => setUnread(e.target.checked)} /> Não lidas</label></div>}
        <div className="mail-message-list" aria-busy={busy}>
          {filtered.map((m) => <button className={`mail-message ${!m.read ? "unread" : ""} ${selected?.id === m.id ? "selected" : ""}`} key={m.id} disabled={busy} onClick={() => open(m)}>
            <span>{m.from || (m.file ? "Arquivo local" : "Remetente não informado")}</span><strong>{m.subject || "(Sem assunto)"}</strong><small>{date(m.date)}{m.attachments?.length ? ` · ${m.attachments.length} anexo(s)` : ""}</small></button>)}
          {!filtered.length && <p className="mail-empty">{busy ? "Carregando mensagens…" : local ? "Abra arquivos .eml para consultar suas cópias locais." : "Nenhuma mensagem carregada neste período. Você pode alterar o período ou atualizar a pasta."}</p>}
          {!local && snapshot?.more && <button className="button secondary" disabled={busy} onClick={() => act(() => mail.sync())}>Carregar mais mensagens</button>}
        </div>
      </div>
      <article className="mail-reader">
        {!selected ? <div className="mail-empty"><Mail size={28} /><p>Selecione uma mensagem para ler.</p></div> : <>
          <div className="mail-actions"><button className="button secondary" onClick={() => { generation.current++; setSelected(null); }}><ArrowLeft size={15} /> Mensagens</button>
            <button className="button secondary" title={directory ? `Salvar em ${directory.name}` : "Salvar em Downloads"} disabled={busy || selected.loading} onClick={() => act(async () => { await saveMailLocally(await raw(), messageName(selected), directory); setNotice("Cópia .eml salva. O original permanece na caixa de e-mail."); })}><Download size={15} /> Salvar .eml</button>
            {mail.account && <>{selected.file && selected.draft && <button className="button secondary" disabled={busy || selected.loading} onClick={() => setComposer({ kind: "new", ...selected })}>Continuar rascunho</button>}<button className="button secondary" disabled={busy || selected.loading} onClick={() => startComposer("reply")}>Responder</button><button className="button secondary" disabled={busy || selected.loading} onClick={() => startComposer("forward")}>Encaminhar</button></>}
          </div>
          {!local && <div className="mail-actions"><button className="button secondary" disabled={busy || selected.loading} onClick={() => act(async () => { await mail.markRead(selected.id, !selected.read); setSelected((m) => ({ ...m, read: !m.read })); })}>{selected.read ? "Marcar como não lida" : "Marcar como lida"}</button>
            <select aria-label="Mover mensagem para pasta" value="" disabled={busy || selected.loading} onChange={(e) => { const destination = e.target.value; act(async () => { await mail.move(selected.id, destination); setSelected(null); setNotice("Mensagem movida."); }); }}><option value="">Mover para…</option>{mail.folders.filter((f) => f.id !== mail.folderId).map((f) => <option key={f.id} value={f.id}>{folderLabel(f, mail.folders)}</option>)}</select>
            {mail.folders.some((f) => f.type === 4 && f.id !== mail.folderId) && <button className="button secondary" disabled={busy || selected.loading} onClick={() => act(async () => { await mail.move(selected.id, mail.folders.find((f) => f.type === 4).id); setSelected(null); setNotice("Mensagem movida para a lixeira."); })}>Lixeira</button>}
          </div>}
          <h2>{selected.subject || "(Sem assunto)"}</h2><dl className="mail-envelope"><dt>De</dt><dd>{selected.from}</dd><dt>Para</dt><dd>{selected.to}</dd>{selected.cc && <><dt>Cc</dt><dd>{selected.cc}</dd></>}<dt>Data</dt><dd>{date(selected.date)}</dd></dl>
          {selected.loading ? <p role="status">Carregando mensagem…</p> : <pre className="mail-body">{selected.body || "(Sem texto)"}</pre>}
          {selected.truncated && <p className="mail-notice">Mensagem longa. Salve o .eml para consultar o conteúdo integral.</p>}
          {!!selected.attachments?.length && <section className="mail-attachments" aria-label="Anexos da mensagem"><strong>Anexos</strong>{selected.attachments.map((a, i) => <button key={a.reference || i} className="button secondary" disabled={busy} onClick={() => act(async () => {
            const file = a.content ? a : await mail.request("attachment", { reference: a.reference }); downloadBytes(unbase64(file.content), a.name, file.type); setNotice("Download do anexo solicitado.");
          })}><Paperclip size={14} />{a.name}</button>)}</section>}
        </>}
      </article>
    </div>}
    {composer && <ComposeMail Modal={Modal} initial={composer} email={mail.account.email} onClose={() => setComposer(null)} request={mail.request} onSent={() => { setComposer(null); setNotice("E-mail enviado e solicitado o salvamento em Enviados."); }} />}
    {folderDialog && <FolderDialog Modal={Modal} initial={folderDialog} folders={mail.folders} onClose={() => setFolderDialog(null)} onSave={async (input) => { await mail.folder(folderDialog.action, input); setFolderDialog(null); setSelected(null); setNotice("Pastas atualizadas."); }} />}
  </section>;
}

function ConnectMail({ onConnect, online, email: initialEmail }) {
  const [email, setEmail] = useState(initialEmail), [password, setPassword] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const lock = useRef(false);
  useBackLayer(busy, () => false);
  return <section className="mail-connect"><h2>Conectar sua caixa</h2><p>ActiveSync · mail.ipm.com.br · HTTPS 443</p>
    <p>A conexão é pessoal e continua ativa ao trocar de município. A senha fica apenas na memória desta sessão; ao recarregar ou fechar o app, conecte novamente.</p>
    {!online ? <p>Entre no banco da equipe para conectar uma caixa. Você pode abrir cópias .eml neste aparelho.</p> : <form onSubmit={async (e) => {
      e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
      try { await onConnect(email, password); setPassword(""); } catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
    }}><fieldset disabled={busy}><label>E-mail da caixa<input type="email" required autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} /></label><label>Senha de aplicativo ActiveSync<input type="password" required autoComplete="off" value={password} onChange={(e) => setPassword(e.target.value)} /></label><button className="button primary" type="submit">{busy ? "Conectando…" : "Conectar e-mail"}</button></fieldset></form>}
    {error && <p role="alert" className="mail-error">{error}</p>}
    <a href="https://mail.ipm.com.br/SOGo/" target="_blank" rel="noopener noreferrer" className="mail-webmail">Abrir webmail em outra janela</a>
  </section>;
}

function ComposeMail({ Modal, initial, email, onClose, onSent, request }) {
  const [draft, setDraft] = useState({ to: initial.to || "", cc: initial.cc || "", bcc: initial.bcc || "", subject: initial.subject || "", body: initial.body || "", attachments: initial.attachments || [] });
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [notice, setNotice] = useState("");
  const lock = useRef(false), requestId = useRef(crypto.randomUUID());
  const [uncertain, setUncertain] = useState(false);
  const patch = (key, value) => { setDraft((d) => ({ ...d, [key]: value })); if (!uncertain) requestId.current = crypto.randomUUID(); };
  return <Modal title={initial.kind === "reply" ? "Responder e-mail" : initial.kind === "forward" ? "Encaminhar e-mail" : "Novo e-mail"} subtitle={`Remetente: ${email}`} wide onClose={() => { if (busy) return false; onClose(); }}>
    <form className="mail-compose" onSubmit={async (e) => { e.preventDefault(); if (lock.current || uncertain) return; lock.current = true; setBusy(true); setError("");
      try { await request("send", { ...draft, source: initial.source, requestId: requestId.current }); onSent(); }
      catch (err) { if (err.code === "SEND_UNKNOWN") setUncertain(true); setError(err.message); }
      finally { lock.current = false; setBusy(false); }
    }}><fieldset disabled={busy}>
      <label>Para<input value={draft.to} onChange={(e) => patch("to", e.target.value)} placeholder="nome@exemplo.com, outro@exemplo.com" autoComplete="off" /></label>
      <div className="mail-two"><label>Cc<input value={draft.cc} onChange={(e) => patch("cc", e.target.value)} autoComplete="off" /></label><label>Cco<input value={draft.bcc} onChange={(e) => patch("bcc", e.target.value)} autoComplete="off" /></label></div>
      <label>Assunto<input value={draft.subject} maxLength={500} spellCheck lang="pt-BR" onChange={(e) => patch("subject", e.target.value)} /></label>
      <label>Mensagem<textarea aria-label="Mensagem" rows={12} value={draft.body} maxLength={200000} spellCheck lang="pt-BR" autoCorrect="on" autoCapitalize="sentences" onChange={(e) => patch("body", e.target.value)} /></label>
      <small>A correção ortográfica usa o idioma e o dicionário do teclado ou navegador.</small>
      <label className="mail-file-input">Anexar arquivos · até 5 MB no total<input type="file" multiple onChange={async (e) => {
        const files = [...e.target.files]; e.target.value = ""; setError("");
        try {
          if (draft.attachments.length + files.length > 20 || draft.attachments.reduce((total, a) => total + (a.size || unbase64(a.content).length), 0) + files.reduce((total, f) => total + f.size, 0) > MAX_ATTACHMENTS) throw new Error("Use até 20 anexos, somando no máximo 5 MB.");
          setBusy(true);
          const attachments = await Promise.all(files.map(async (f) => ({ name: safeFileName(f.name), type: f.type || "application/octet-stream", size: f.size, content: base64(new Uint8Array(await f.arrayBuffer())) })));
          patch("attachments", [...draft.attachments, ...attachments]);
        } catch (err) { setError(err.message); } finally { setBusy(false); }
      }} /></label>
      {draft.attachments.map((a, i) => <div className="mail-compose-attachment" key={i}><span>{a.name}</span><button className="icon-button" type="button" aria-label={`Remover anexo ${a.name}`} onClick={() => patch("attachments", draft.attachments.filter((_, index) => index !== i))}><X size={15} /></button></div>)}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className="button secondary" type="button" onClick={() => {
        try { downloadBytes(makeMime(draft, email, { draft: true }), messageName(draft), "message/rfc822"); setNotice("Rascunho .eml salvo neste aparelho."); } catch (err) { setError(err.message); }
      }}>Salvar rascunho .eml</button><button className="button primary" type="submit" disabled={uncertain}><Send size={15} /> {busy ? "Enviando…" : "Enviar e-mail"}</button></div>
    </fieldset>{error && <p role="alert" className="mail-error">{error}</p>}{uncertain && <button className="button secondary" type="button" onClick={() => { requestId.current = crypto.randomUUID(); setUncertain(false); setError(""); }}>Conferi Enviados: permitir novo envio</button>}{notice && <p role="status">{notice}</p>}</form>
  </Modal>;
}
function FolderDialog({ Modal, initial, folders, onClose, onSave }) {
  const [name, setName] = useState(initial.name || ""), [parentId, setParentId] = useState("0"), [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false), [error, setError] = useState(""); const lock = useRef(false);
  const deleting = initial.action === "deleteFolder";
  return <Modal title={deleting ? "Excluir pasta de e-mail" : initial.action === "createFolder" ? "Nova pasta de e-mail" : "Renomear pasta de e-mail"} onClose={() => { if (busy) return false; onClose(); }}>
    <form className="mail-compose" onSubmit={async (e) => { e.preventDefault(); if (lock.current) return; lock.current = true; setBusy(true); setError("");
      try { await onSave({ id: initial.id, name, parentId, confirmation }); } catch (err) { setError(err.message); } finally { lock.current = false; setBusy(false); }
    }}><fieldset disabled={busy}>{deleting ? <><p>A pasta “{initial.name}” e suas mensagens serão excluídas no servidor. Esta ação afeta os outros leitores conectados à mesma caixa.</p><label>Digite o nome da pasta para confirmar<input required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label></> : <label>Nome da pasta<input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} /></label>}
      {initial.action === "createFolder" && <label>Criar dentro de<select value={parentId} onChange={(e) => setParentId(e.target.value)}><option value="0">Raiz da caixa</option>{folders.map((f) => <option value={f.id} key={f.id}>{folderLabel(f, folders)}</option>)}</select></label>}
      <div className="modal-actions"><button className="button secondary" type="button" onClick={onClose}>Cancelar</button><button className={`button ${deleting ? "danger" : "primary"}`} type="submit" disabled={deleting && confirmation !== initial.name}>{busy ? "Aguarde…" : deleting ? "Excluir pasta" : "Salvar pasta"}</button></div>
    </fieldset>{error && <p role="alert" className="mail-error">{error}</p>}</form>
  </Modal>;
}
