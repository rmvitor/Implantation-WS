import React, { useEffect, useRef, useState } from "react";
import { useTeam } from "./Team.jsx";
import {
  HOMOLOGATION_BUCKET,
  homologationResourcesGuide,
  validateHomologationFile,
  homologationResourceError,
} from "./homologation-resources.js";
import "./homologation-resources.css";
const rpc = async (client, name, args) => {
  const r = await client.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
};
export function HomologationResources({
  projectId,
  kind,
  entryId,
  readOnly = false,
  onPending,
  onResponsibleChange,
  hideResponsible = false,
}) {
  const team = useTeam();
  const [value, setValue] = useState(null),
    [selected, setSelected] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [removing, setRemoving] = useState(null);
  const mounted = useRef(true),
    working = useRef(false),
    epoch = useRef(0),
    fileInput = useRef(),
    pendingRef = useRef(onPending),
    responsibleRef = useRef(onResponsibleChange);
  responsibleRef.current = onResponsibleChange;
  pendingRef.current = onPending;
  const args = { p_project: projectId, p_kind: kind, p_entry: entryId };
  const apply = (data, updateSelection = false) => {
    if (mounted.current) {
      setValue(data);
      if (updateSelection) {
        setSelected(data.responsibleId || "");
        responsibleRef.current?.(data);
      }
    }
  };
  const load = async (keepSelection = false) => {
    const ticket = ++epoch.current;
    try {
      const data = await rpc(
        team.client,
        "implanta_homologation_resources",
        args,
      );
      if (
        !Array.isArray(data?.users) ||
        !Array.isArray(data?.files) ||
        !Array.isArray(data?.audit) ||
        !Number.isInteger(data.revision)
      )
        throw new Error(
          "Não foi possível validar os dados de responsável e anexos.",
        );
      if (mounted.current && ticket === epoch.current) {
        setValue(data);
        if (!keepSelection) {
          setSelected(data.responsibleId || "");
          responsibleRef.current?.(data);
        }
        setError("");
      }
    } catch (e) {
      if (mounted.current && ticket === epoch.current)
        setError(homologationResourceError(e));
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (team.online) load();
    return () => {
      mounted.current = false;
      ++epoch.current;
      pendingRef.current?.(false);
    };
  }, [team.client, projectId, kind, entryId]);
  useEffect(() => {
    if (!busy) return;
    const stop = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", stop);
    return () => window.removeEventListener("beforeunload", stop);
  }, [busy]);
  const act = async (fn) => {
    if (working.current) return;
    working.current = true;
    ++epoch.current;
    setBusy(true);
    setError("");
    setNotice("");
    pendingRef.current?.(true);
    try {
      await fn();
    } catch (e) {
      if (mounted.current) setError(homologationResourceError(e));
    } finally {
      working.current = false;
      pendingRef.current?.(false);
      if (mounted.current) setBusy(false);
    }
  };
  if (!team.online)
    return (
      <section className="homologation-resources">
        <h3>
          {hideResponsible ? "Anexos da homologação" : "Responsável e anexos"}
        </h3>
        <p>
          Conecte à equipe para escolher um usuário do projeto e compartilhar
          anexos.
        </p>
      </section>
    );
  return (
    <section
      className="homologation-resources"
      aria-label="Responsável e anexos da homologação"
    >
      <div className="homologation-resource-heading">
        <h3>
          {hideResponsible ? "Anexos da homologação" : "Responsável e anexos"}
        </h3>
        <button
          type="button"
          className="button secondary"
          disabled={busy}
          onClick={() => load()}
        >
          Atualizar anexos e responsável
        </button>
      </div>
      <p className="muted">
        {kind === "migration"
          ? "O responsável é definido em Validado por ao salvar a conferência. Os arquivos são salvos separadamente."
          : "Salvos separadamente dos OKs. Escolher o responsável não altera quem registrou as validações."}
      </p>
      {error && (
        <p role="alert">
          {error}{" "}
          <a href={homologationResourcesGuide} target="_blank" rel="noreferrer">
            Guia de ativação
          </a>
        </p>
      )}
      {notice && <p role="status">{notice}</p>}
      {!value && !error && (
        <p role="status">Carregando responsável e anexos…</p>
      )}
      {value && (
        <>
          {!hideResponsible && (
            <div className="homologation-resource-owner">
              <label>
                Responsável pela homologação
                <select
                  aria-label="Responsável pela homologação"
                  value={selected}
                  disabled={readOnly || busy}
                  onChange={(e) => setSelected(e.target.value)}
                >
                  <option value="">Não definido</option>
                  {value.responsibleId &&
                    !value.users.some((u) => u.id === value.responsibleId) && (
                      <option value={value.responsibleId}>
                        {value.responsibleName} (sem acesso ativo)
                      </option>
                    )}
                  {value.users.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={
                  readOnly || busy || selected === (value.responsibleId || "")
                }
                onClick={() =>
                  act(async () => {
                    apply(
                      await rpc(
                        team.client,
                        "implanta_homologation_responsible",
                        {
                          ...args,
                          p_user: selected || null,
                          p_revision: value.revision,
                        },
                      ),
                      true,
                    );
                    setNotice("Responsável salvo.");
                  })
                }
              >
                Salvar responsável
              </button>
            </div>
          )}
          <label>
            Anexos (até 15 MB por arquivo)
            <input
              ref={fileInput}
              type="file"
              aria-label="Adicionar anexo à homologação"
              disabled={readOnly || busy}
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (!file) return;
                // Reject before reserving metadata or sending any bytes.
                try {
                  validateHomologationFile(file);
                } catch (e) {
                  setError(e.message);
                  event.target.value = "";
                  return;
                }
                event.target.value = "";
                act(async () => {
                  const id = crypto.randomUUID();
                  await rpc(team.client, "implanta_homologation_file_reserve", {
                    ...args,
                    p_id: id,
                    p_name: file.name,
                    p_size: file.size,
                  });
                  try {
                    const upload = await team.client.storage
                      .from(HOMOLOGATION_BUCKET)
                      .upload(id, file, {
                        upsert: false,
                        contentType: "application/octet-stream",
                        metadata: { projectId, kind, entryId },
                      });
                    if (upload.error) throw upload.error;
                    apply(
                      await rpc(
                        team.client,
                        "implanta_homologation_file_finish",
                        { p_id: id },
                      ),
                    );
                    setNotice("Anexo salvo.");
                  } catch (e) {
                    // A timeout may follow a successful commit. Keep the file and expose the pending receipt.
                    const receipt = await team.client.rpc(
                      "implanta_homologation_resources",
                      args,
                    );
                    if (!receipt.error && mounted.current)
                      setValue(receipt.data);
                    throw e;
                  } finally {
                    if (fileInput.current) fileInput.current.value = "";
                  }
                });
              }}
            />
          </label>
          <p className="muted">
            Arquivos privados deste módulo e entidade. O limite também é
            verificado pelo armazenamento.
          </p>
          <ul className="homologation-file-list">
            {value.files.map((f) => (
              <li key={f.id}>
                <div>
                  <strong>{f.file_name}</strong>
                  <small>
                    {(f.file_size / 1024 / 1024).toLocaleString("pt-BR", {
                      maximumFractionDigits: 2,
                    })}{" "}
                    MB · {f.uploaded_name} ·{" "}
                    {new Date(f.created_at).toLocaleString("pt-BR")}
                    {f.state === "pending"
                      ? " · Envio pendente de confirmação"
                      : f.state === "deleting"
                        ? " · Exclusão pendente"
                        : ""}
                  </small>
                </div>
                <div className="homologation-file-actions">
                  {f.state === "ready" ? (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() =>
                        act(async () => {
                          const r = await team.client.storage
                            .from(HOMOLOGATION_BUCKET)
                            .download(f.id);
                          if (r.error) throw r.error;
                          const url = URL.createObjectURL(r.data),
                            a = document.createElement("a");
                          a.href = url;
                          a.download = f.file_name;
                          a.click();
                          setTimeout(() => URL.revokeObjectURL(url), 1000);
                        })
                      }
                    >
                      Baixar
                    </button>
                  ) : (
                    !readOnly &&
                    f.state === "pending" && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={busy}
                        onClick={() =>
                          act(async () =>
                            apply(
                              await rpc(
                                team.client,
                                "implanta_homologation_file_finish",
                                { p_id: f.id },
                              ),
                            ),
                          )
                        }
                      >
                        Confirmar envio
                      </button>
                    )
                  )}
                  {!readOnly && (
                    <button
                      type="button"
                      className="button secondary"
                      disabled={busy}
                      onClick={() => setRemoving(f)}
                    >
                      Excluir anexo
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          {!value.files.length && (
            <p className="muted">Nenhum anexo nesta homologação.</p>
          )}
          {removing && (
            <div className="homologation-file-confirm" role="alert">
              <p>
                Excluir o anexo <strong>{removing.file_name}</strong>? O arquivo
                será removido do armazenamento. Esta ação não pode ser desfeita.
              </p>
              <button
                type="button"
                className="button secondary"
                disabled={busy}
                onClick={() => setRemoving(null)}
              >
                Cancelar exclusão
              </button>
              <button
                type="button"
                className="button secondary danger-text"
                disabled={busy}
                onClick={() =>
                  act(async () => {
                    apply(
                      await rpc(
                        team.client,
                        "implanta_homologation_file_delete_begin",
                        { p_id: removing.id },
                      ),
                    );
                    const r = await team.client.storage
                      .from(HOMOLOGATION_BUCKET)
                      .remove([removing.id]);
                    if (r.error) throw r.error;
                    apply(
                      await rpc(
                        team.client,
                        "implanta_homologation_file_forget",
                        { p_id: removing.id },
                      ),
                    );
                    setRemoving(null);
                    setNotice("Anexo excluído.");
                  })
                }
              >
                Confirmar exclusão do anexo
              </button>
            </div>
          )}
          {!!value.audit.length && (
            <details>
              <summary>Histórico de responsável e anexos</summary>
              <ul>
                {value.audit.map((a, i) => (
                  <li key={i}>
                    {
                      {
                        responsible_changed: "Responsável alterado",
                        file_added: "Anexo incluído",
                        file_removed: "Anexo excluído",
                      }[a.action]
                    }
                    {a.detail.name ? ` · ${a.detail.name}` : ""} ·{" "}
                    {a.actor_name} · {new Date(a.at).toLocaleString("pt-BR")}
                  </li>
                ))}
              </ul>
            </details>
          )}
        </>
      )}
    </section>
  );
}
