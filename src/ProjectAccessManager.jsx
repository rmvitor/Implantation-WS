import React, { useEffect, useRef, useState } from "react";
import { friendlyTeamError } from "./team-service.js";

const labels = { master: "Master · acesso total", owner: "Gestor do projeto", editor: "Edição", viewer: "Leitura" };

export function AccessAudit({ team, projectId = null }) {
  const [items, setItems] = useState([]), [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const sequence = useRef(0);
  useEffect(() => { sequence.current++; setItems([]); setError(""); setBusy(false); }, [projectId]);
  useEffect(() => () => { sequence.current++; }, []);
  async function load() {
    const request = ++sequence.current; setBusy(true); setError("");
    try {
      let query = team.client.from("implanta_access_audit").select("id,actor_name,target_name,action,at,after_data,project_id").order("at", { ascending: false }).limit(50);
      if (projectId) query = query.eq("project_id", projectId);
      const result = await query;
      if (request !== sequence.current) return;
      if (result.error) throw result.error;
      setItems(result.data || []);
    } catch (e) { if (request === sequence.current) setError(friendlyTeamError(e)); }
    finally { if (request === sequence.current) setBusy(false); }
  }
  return <details className="own-accesses access-audit"><summary>Histórico de acessos</summary>
    <button className="button secondary" type="button" disabled={busy} onClick={load}>{busy ? "Consultando…" : "Consultar alterações"}</button>
    <p className="team-note">Últimas 50 alterações de contas, permissões e gestores {projectId ? "deste projeto" : "da plataforma"}, registradas pelo servidor.</p>
    {error && <p role="alert" className="team-error">{error}</p>}
    {items.map((item) => <div key={item.id}><span><strong>{item.action}</strong> · {item.target_name || "Conta"}<br />{item.actor_name} · {new Date(item.at).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}{item.project_id && <small> · {team.workspace?.projects.find((p) => p.id === item.project_id)?.name || item.project_id}</small>}</span><strong>{labels[item.after_data?.role] || (item.after_data?.role === null ? "Sem acesso" : item.after_data?.active === false ? "Conta inativa" : "")}</strong></div>)}
  </details>;
}

export function ProjectAccessManager({ team, projects, disabled, onBusyChange }) {
  const [selected, setSelected] = useState(projects[0]?.id || ""), [people, setPeople] = useState([]);
  const [email, setEmail] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState(""), [message, setMessage] = useState("");
  const lock = useRef(false), lifecycle = useRef(0), scope = useRef("");
  const notify = useRef(onBusyChange); notify.current = onBusyChange;
  const ids = projects.map((p) => p.id).join("\n");
  scope.current = projects.some((p) => p.id === selected) ? selected : "";
  useEffect(() => {
    if (!projects.some((p) => p.id === selected)) { setSelected(projects[0]?.id || ""); setPeople([]); }
  }, [ids, selected]);
  useEffect(() => () => { lifecycle.current++; }, []);
  async function act(fn) {
    if (lock.current || disabled || !scope.current) return;
    const project = scope.current, generation = lifecycle.current;
    lock.current = true; setBusy(true); notify.current(true); setError(""); setMessage("");
    try {
      const result = await fn(project);
      if (result?.error) throw result.error;
      if (generation === lifecycle.current && scope.current === project) return result?.data;
    } catch (e) { if (generation === lifecycle.current && scope.current === project) setError(friendlyTeamError(e)); }
    finally { lock.current = false; notify.current(false); if (generation === lifecycle.current) setBusy(false); }
  }
  async function load(project, search = null) {
    const result = await team.client.rpc("implanta_project_people", { p_project: project, p_email: search });
    if (result.error) throw result.error;
    if (!Array.isArray(result.data)) throw new Error("Não foi possível conferir os acessos.");
    if (scope.current === project) setPeople(result.data);
    return result;
  }
  useEffect(() => { setPeople([]); setEmail(""); setMessage(""); if (scope.current) act((p) => load(p)); }, [selected]);
  return <section className="project-access-manager" aria-label="Gestão dos meus projetos">
    <h3>Gestão dos meus projetos</h3>
    {!projects.length ? <p className="team-note">Você poderá gerenciar acessos aos projetos que criar. Nos projetos compartilhados, seu acesso segue a permissão recebida.</p> : <>
      <label className="team-project-select">Projeto sob minha gestão<select disabled={busy || disabled} value={selected} onChange={(e) => setSelected(e.target.value)}>{projects.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <form className="project-access-search" onSubmit={async (event) => {
        event.preventDefault(); const query = email.trim().toLowerCase();
        const result = await act((p) => load(p, query));
        if (result && !result.some((u) => u.email.toLowerCase() === query)) setMessage("Conta não encontrada ou ainda sem liberação do Master. O colega precisa se cadastrar e receber a aprovação inicial.");
      }}><label>E-mail do colega<input type="email" required value={email} disabled={busy || disabled} onChange={(e) => setEmail(e.target.value)} autoComplete="off" /></label><button className="button secondary" disabled={busy || disabled}>Buscar colega</button></form>
      <p className="team-note">Busque pelo e-mail exato de uma conta já liberada. Você administra somente os projetos desta lista.</p>
      {people.map((user) => <div key={user.id} className="team-project-member"><div><strong>{user.name}</strong><small>{user.email}{!user.active && " · conta inativa"}</small></div>{["master", "owner"].includes(user.role) ? <span className="team-status">{labels[user.role]}</span> : <select aria-label={`Acesso de ${user.name}`} disabled={busy || disabled} value={user.role || ""} onChange={(e) => {
        const role = e.target.value;
        act(async (project) => { const result = await team.client.rpc("implanta_grant_project", { p_project: project, p_user: user.id, p_role: role || null }); if (result.error) throw result.error; await load(project, email.trim() || null); team.refresh(); setMessage("Acesso ao projeto atualizado."); });
      }}><option value="">Sem acesso</option><option value="viewer" disabled={!user.active}>Leitura</option><option value="editor" disabled={!user.active}>Edição</option></select>}</div>)}
      {selected && <AccessAudit key={selected} team={team} projectId={selected} />}
    </>}
    {error && <p role="alert" className="team-error">{error}</p>}
    {message && <p role="status" className="team-message">{message}</p>}
  </section>;
}
