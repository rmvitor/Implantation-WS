import React, { useEffect, useState } from "react";
import { assignActivity } from "./activity-responsibility.js";
import "./activity-responsibility.css";

export function ActivityResponsible({
  id,
  "aria-describedby": describedBy,
  team,
  projectId,
  draft,
  onChange,
  onReady,
  readOnly,
}) {
  const [users, setUsers] = useState([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    onReady(false);
    (async () => {
      try {
        const result = await team.client.rpc("implanta_activity_assignees", {
          p_project: projectId,
        });
        if (result.error) throw result.error;
        if (result.data?.version !== 1 || !Array.isArray(result.data.users))
          throw new Error("A lista de responsáveis não pôde ser validada.");
        if (active) {
          setUsers(result.data.users);
          onReady(true);
        }
      } catch (e) {
        if (active)
          setError(
            e.code === "PGRST202"
              ? "Ative o SQL dos responsáveis para selecionar usuários com edição neste projeto."
              : "Não foi possível consultar os responsáveis. Confira a conexão e tente novamente.",
          );
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [team.client, projectId, retry]);
  const eligible = users.some((person) => person.id === draft.ownerId);
  return (
    <div className="activity-responsible">
      <select
        id={id}
        aria-describedby={describedBy}
        aria-label="Responsável"
        required
        value={eligible ? draft.ownerId : ""}
        disabled={loading || !!error || readOnly}
        onChange={(event) => {
          const person = users.find((p) => p.id === event.target.value);
          if (person) onChange((current) => assignActivity(current, person));
        }}
      >
        <option value="">
          {loading ? "Carregando responsáveis…" : "Selecione um responsável"}
        </option>
        {users.map((person) => (
          <option key={person.id} value={person.id}>
            {person.name} · {person.email}
          </option>
        ))}
      </select>
      {!loading && !error && !eligible && (
        <small>
          Responsável anterior: {draft.owner || "não informado"}. Selecione uma
          conta com edição no projeto.
        </small>
      )}
      {error && (
        <>
          <small role="alert">{error}</small>
          <button
            type="button"
            className="button secondary"
            onClick={() => setRetry((n) => n + 1)}
          >
            Consultar novamente
          </button>
          <a
            href="https://github.com/rmvitor/Implantation-WS/blob/main/docs/responsaveis-atividades.md"
            target="_blank"
            rel="noreferrer"
          >
            Guia de ativação
          </a>
        </>
      )}
    </div>
  );
}
