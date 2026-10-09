import React, { useEffect, useState } from "react";
import { useTeam } from "./Team.jsx";
import { friendlyTeamError } from "./team-service.js";

const kinds = {
  municipality: "Município",
  activity: "Atividade",
  context: "Contexto da atividade",
  ticket: "Chamado",
  handover: "Passagem de trabalho",
  training: "Capacitação e suporte",
  history: "Histórico",
  homologation: "Liberação",
  conference: "Conferência da migração",
  personal: "Dados restritos",
};
export function AuditHistory({ project }) {
  const team = useTeam();
  const [visible, setVisible] = useState(false),
    [rows, setRows] = useState([]),
    [limit, setLimit] = useState(50),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(false);
  useEffect(() => {
    if (!visible || !team.online) return;
    let active = true;
    setLoading(true);
    setError("");
    team.client
      .from(team.normalized ? "implanta_record_audit" : "implanta_audit")
      .select("*")
      .eq("project_id", project.id)
      .order("at", { ascending: false })
      .range(0, limit - 1)
      .then(({ data, error: e }) => {
        if (!active) return;
        if (e) setError(friendlyTeamError(e));
        else setRows(data || []);
        setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [visible, project.id, limit, team.online, team.normalized, team.client]);
  if (!team.online) return null;
  return (
    <div className="audit-history">
      <button
        className="button secondary"
        aria-expanded={visible}
        onClick={() => setVisible((v) => !v)}
      >
        {visible ? "Ocultar alterações do banco" : "Alterações do banco"}
      </button>
      {visible && (
        <>
          <p className="muted">
            Autor e horário registrados pelo servidor.
            {!team.normalized &&
              " O detalhamento por registro estará disponível após a migração."}
          </p>
          {loading && <p role="status">Carregando alterações…</p>}
          {error && <p role="alert">{error}</p>}
          {rows.map((r) => (
            <article className="operations-row" key={r.id}>
              <strong>
                {kinds[r.kind] || project.name} · {r.action}
              </strong>
              <span>
                {r.actor_name} · {new Date(r.at).toLocaleString("pt-BR")}
              </span>
              {r.record_id && (
                <small>
                  Registro:{" "}
                  {project.tasks.find((t) => t.id === r.record_id)?.title ||
                    r.record_id}
                </small>
              )}
              {r.changed_fields?.length > 0 && (
                <small>Campos: {r.changed_fields.join(", ")}</small>
              )}
            </article>
          ))}
          {!loading && !rows.length && !error && (
            <p>Nenhuma alteração registrada no banco.</p>
          )}
          {rows.length === limit && (
            <button
              className="button secondary"
              disabled={loading}
              onClick={() => setLimit((v) => v + 50)}
            >
              Carregar mais alterações
            </button>
          )}
        </>
      )}
    </div>
  );
}
