import React, { useEffect, useState } from "react";
import {
  CheckCheck,
  FileCheck2,
  Plus,
  Settings2,
  AlertCircle,
  ArrowUpRight,
  X,
} from "lucide-react";
import {
  MODULES,
  HOMOLOGATION_STATUS,
  homologationMatrix,
  homologationProgress,
  configureHomologation,
  saveHomologationEntry,
  releaseHomologation,
  uid,
} from "./domain";

const dateTime = (value) =>
  new Date(value).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
export function Homologation({
  readOnly = false,
  project,
  onUpdate,
  onEditing,
  onError,
  onTask,
  onEditProject,
  Modal,
  Field,
}) {
  const [dialog, setDialog] = useState(null);
  useEffect(() => {
    onEditing(!!dialog);
    return () => onEditing(false);
  }, [dialog, onEditing]);
  const matrix = homologationMatrix(project);
  const progress = homologationProgress(project);
  const entities = [...new Set(project.entities)];
  const perform = async (action) => {
    try {
      if (!readOnly && (await onUpdate(action))) {
        setDialog(null);
        return true;
      }
    } catch (e) {
      onError(e.message);
    }
    return false;
  };
  return (
    <section className="homologation-page">
      <div className="homologation-intro">
        <div>
          <span className="eyebrow">CONFERÊNCIA DA MIGRAÇÃO</span>
          <h2>Do sistema anterior para o novo</h2>
          <p>
            Defina o que migra. Compare os dados por módulo e entidade. Registre
            os OKs para liberar.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={readOnly}
          onClick={() => setDialog({ type: "scope" })}
        >
          <Settings2 size={16} />
          Configurar migração
        </button>
      </div>
      <div className="homologation-summary">
        <div>
          <strong>
            {progress.done}/{progress.total}
          </strong>
          <span>conferências com OK</span>
        </div>
        <div>
          <strong>{progress.issues}</strong>
          <span>divergências</span>
        </div>
        <div className="homologation-release-state">
          <FileCheck2 size={22} />
          <strong>
            {progress.released
              ? "Homologação liberada"
              : progress.ready
                ? "Pronto para liberar"
                : "Aguardando conferência"}
          </strong>
          <span>
            {progress.released
              ? `${project.homologation.release.by} · ${dateTime(project.homologation.release.at)}`
              : progress.total
                ? "Somente o escopo previsto conta para a liberação."
                : "Selecione os módulos e entidades que recebem dados migrados."}
          </span>
        </div>
      </div>
      <div className="progress-track homologation-progress">
        <i style={{ width: `${progress.percent}%` }} />
      </div>
      {!entities.length ? (
        <div className="homologation-empty">
          <FileCheck2 size={32} />
          <h3>Cadastre as entidades do projeto</h3>
          <p>
            Prefeitura, fundos, câmara ou outras entidades que receberão os
            dados.
          </p>
          <button
            className="button primary"
            disabled={readOnly}
            onClick={onEditProject}
          >
            Cadastrar entidades
          </button>
        </div>
      ) : (
        <>
          {!progress.total && (
            <div className="info-box">
              <FileCheck2 size={20} />
              <p>
                Nenhum módulo foi marcado como migrado. Use{" "}
                <strong>Configurar migração</strong> para selecionar o escopo
                real deste município.
              </p>
            </div>
          )}
          <div
            className="homologation-table-scroll"
            tabIndex={0}
            role="region"
            aria-label="Conferência de módulos por entidade"
          >
            <table className="homologation-table">
              <caption>OKs da migração · {project.name}</caption>
              <thead>
                <tr>
                  <th scope="col">Módulo</th>
                  {entities.map((entity) => (
                    <th scope="col" key={entity}>
                      {entity}
                    </th>
                  ))}
                  <th scope="col">Liberação do módulo</th>
                </tr>
              </thead>
              <tbody>
                {MODULES.map((module) => {
                  const entries = matrix.filter(
                    (e) => e.module === module && e.included,
                  );
                  const done = entries.filter((e) => e.status === "ok").length;
                  return (
                    <tr key={module}>
                      <th scope="row">{module}</th>
                      {entities.map((entity) => {
                        const entry = matrix.find(
                          (e) => e.module === module && e.entity === entity,
                        );
                        return (
                          <td key={entity}>
                            {entry.included ? (
                              <button
                                className={`homologation-cell status-${entry.status}`}
                                aria-label={`Conferir ${module} — ${entity}`}
                                onClick={() =>
                                  setDialog({ type: "entry", entry })
                                }
                              >
                                <span>
                                  {entry.status === "ok" ? (
                                    <CheckCheck size={15} />
                                  ) : entry.status === "issue" ? (
                                    <AlertCircle size={15} />
                                  ) : (
                                    <FileCheck2 size={15} />
                                  )}{" "}
                                  {HOMOLOGATION_STATUS[entry.status]}
                                </span>
                                {entry.status === "ok" && (
                                  <small>
                                    {entry.validatedBy} ·{" "}
                                    {new Date(
                                      entry.validatedAt,
                                    ).toLocaleDateString("pt-BR")}
                                  </small>
                                )}
                              </button>
                            ) : (
                              <span className="homologation-na">Não migra</span>
                            )}
                          </td>
                        );
                      })}
                      <td>
                        <span
                          className={`module-release ${entries.length && done === entries.length ? "ready" : ""}`}
                        >
                          {!entries.length
                            ? "Fora do escopo"
                            : done === entries.length
                              ? "Liberado · todos OK"
                              : `${done}/${entries.length} OK`}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="homologation-bottom">
            <p>
              “Não migra” não exige OK. A homologação acompanha os dados
              migrados; atividades e chamados continuam no quadro.
            </p>
            <button
              className="button primary"
              disabled={readOnly || !progress.ready || progress.released}
              onClick={() => setDialog({ type: "release" })}
            >
              <CheckCheck size={16} />
              {progress.released
                ? "Homologação liberada"
                : "Liberar homologação"}
            </button>
          </div>
        </>
      )}
      {dialog?.type === "scope" && (
        <ScopeModal
          project={project}
          Modal={Modal}
          onClose={() => setDialog(null)}
          onSave={(ids) => perform((p) => configureHomologation(p, ids))}
        />
      )}
      {dialog?.type === "entry" && (
        <EntryModal
          readOnly={readOnly}
          entry={dialog.entry}
          project={project}
          Modal={Modal}
          Field={Field}
          onClose={() => setDialog(null)}
          onSave={(entry, issue) =>
            perform((p) => saveHomologationEntry(p, entry, issue))
          }
          onTask={(id) => {
            setDialog(null);
            onTask(id);
          }}
        />
      )}
      {dialog?.type === "release" && (
        <ReleaseModal
          Modal={Modal}
          Field={Field}
          count={progress.total}
          onClose={() => setDialog(null)}
          onSave={(by) => perform((p) => releaseHomologation(p, by))}
        />
      )}
    </section>
  );
}
function ScopeModal({ project, Modal, onClose, onSave }) {
  const matrix = homologationMatrix(project);
  const [selection, setSelection] = useState(() =>
    matrix.filter((e) => e.included).map((e) => e.id),
  );
  const entities = [...new Set(project.entities)];
  const toggle = (ids, on) =>
    setSelection((previous) =>
      on
        ? [...new Set([...previous, ...ids])]
        : previous.filter((id) => !ids.includes(id)),
    );
  return (
    <Modal
      title="O que migra neste projeto?"
      subtitle="Selecione somente as combinações de módulo e entidade que recebem dados do sistema anterior."
      onClose={onClose}
      wide
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(selection);
        }}
      >
        <div className="scope-grid">
          {MODULES.map((module) => {
            const pairs = matrix.filter((e) => e.module === module);
            return (
              <section className="scope-module" key={module}>
                <label className="scope-module-title">
                  <input
                    type="checkbox"
                    disabled={!pairs.length}
                    checked={
                      pairs.length > 0 &&
                      pairs.every((e) => selection.includes(e.id))
                    }
                    onChange={(e) =>
                      toggle(
                        pairs.map((p) => p.id),
                        e.target.checked,
                      )
                    }
                  />
                  <strong>{module}</strong>
                  <small>Todas as entidades</small>
                </label>
                <div>
                  {entities.map((entity) => {
                    const pair = pairs.find((e) => e.entity === entity);
                    return (
                      <label key={entity}>
                        <input
                          type="checkbox"
                          checked={selection.includes(pair.id)}
                          onChange={(e) => toggle([pair.id], e.target.checked)}
                        />
                        {entity}
                      </label>
                    );
                  })}
                </div>
              </section>
            );
          })}
        </div>
        <p className="muted modal-note">
          Alterar o escopo reabre a liberação. O histórico de validações é
          preservado; os OKs das combinações mantidas continuam registrados.
        </p>
        <div className="modal-actions">
          <button className="button secondary" type="button" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            Salvar escopo
          </button>
        </div>
      </form>
    </Modal>
  );
}
function EntryModal({
  readOnly = false,
  entry,
  project,
  Modal,
  Field,
  onClose,
  onSave,
  onTask,
}) {
  const [draft, setDraft] = useState(() => structuredClone(entry));
  const [newCheck, setNewCheck] = useState("");
  const [issue, setIssue] = useState(false);
  const patch = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  const linked = project.tasks.find((t) => t.id === entry.taskId);
  const add = () => {
    if (newCheck.trim()) {
      patch("checks", [
        ...draft.checks,
        { id: uid(), text: newCheck.trim(), done: false },
      ]);
      setNewCheck("");
    }
  };
  return (
    <Modal
      title="Conferir dados migrados"
      subtitle={`${entry.module} · ${entry.entity}`}
      onClose={onClose}
      wide
    >
      <fieldset disabled={readOnly} className="readonly-fields">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onSave(draft, issue);
          }}
        >
          <div className="migration-checks">
            <h3>Rotina de conferência</h3>
            <p className="muted">
              Compare com o sistema anterior. Ajuste a lista ao que foi migrado
              neste projeto.
            </p>
            {draft.checks.map((check) => (
              <div className="migration-check" key={check.id}>
                <label>
                  <input
                    type="checkbox"
                    checked={check.done}
                    onChange={(e) =>
                      patch(
                        "checks",
                        draft.checks.map((c) =>
                          c.id === check.id
                            ? { ...c, done: e.target.checked }
                            : c,
                        ),
                      )
                    }
                  />
                  {check.text}
                </label>
                <button
                  type="button"
                  aria-label={`Remover conferência: ${check.text}`}
                  onClick={() =>
                    patch(
                      "checks",
                      draft.checks.filter((c) => c.id !== check.id),
                    )
                  }
                >
                  <X size={15} />
                </button>
              </div>
            ))}
            <div className="checklist-add">
              <input
                aria-label="Nova conferência"
                placeholder="Adicionar uma conferência específica..."
                value={newCheck}
                onChange={(e) => setNewCheck(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    add();
                  }
                }}
              />
              <button type="button" className="button secondary" onClick={add}>
                <Plus size={15} />
                Adicionar
              </button>
            </div>
          </div>
          <div className="form-grid">
            <Field label="Resultado da conferência">
              <select
                value={draft.status}
                onChange={(e) => patch("status", e.target.value)}
              >
                {Object.entries(HOMOLOGATION_STATUS).map(([id, label]) => (
                  <option key={id} value={id}>
                    {label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Validado por" hint="Obrigatório para registrar o OK.">
              <input
                value={draft.validatedBy}
                required={draft.status === "ok"}
                onChange={(e) => patch("validatedBy", e.target.value)}
                placeholder="Quem conferiu os dados"
              />
            </Field>
            <Field
              label="Referência / evidência da conferência"
              full
              hint="Ex.: relatórios comparados, saldos conferidos ou link da evidência."
            >
              <textarea
                rows={2}
                value={draft.evidence}
                required={draft.status === "ok"}
                onChange={(e) => patch("evidence", e.target.value)}
              />
            </Field>
            <Field label="Observações / divergências" full>
              <textarea
                rows={3}
                value={draft.notes}
                onChange={(e) => patch("notes", e.target.value)}
                placeholder="O que foi conferido ou o que precisa ser corrigido"
              />
            </Field>
          </div>
          {entry.validatedAt && (
            <p className="muted">
              Último OK: {entry.validatedBy} · {dateTime(entry.validatedAt)}.
              Uma nova conferência reabre a liberação.
            </p>
          )}
          {draft.status === "issue" &&
            (linked ? (
              <button
                type="button"
                className="button secondary"
                onClick={() => onTask(linked.id)}
              >
                Abrir pendência vinculada <ArrowUpRight size={15} />
              </button>
            ) : (
              <label className="create-migration-issue">
                <input
                  type="checkbox"
                  checked={issue}
                  onChange={(e) => setIssue(e.target.checked)}
                />
                Criar pendência no quadro para esta divergência
              </label>
            ))}
          <div className="modal-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button type="submit" className="button primary">
              {draft.status === "ok" ? "Registrar OK" : "Salvar conferência"}
            </button>
          </div>
        </form>
      </fieldset>
    </Modal>
  );
}
function ReleaseModal({ Modal, Field, count, onClose, onSave }) {
  const [by, setBy] = useState("");
  return (
    <Modal
      title="Liberar homologação"
      subtitle={`${count} conferência(s) previstas com OK.`}
      onClose={onClose}
    >
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onSave(by);
        }}
      >
        <Field label="Liberado por">
          <input
            required
            value={by}
            onChange={(e) => setBy(e.target.value)}
            placeholder="Responsável pela liberação"
          />
        </Field>
        <p className="muted modal-note">
          A data e as referências de cada módulo e entidade ficam registradas no
          histórico. Reabrir uma conferência ou alterar o escopo exige uma nova
          liberação.
        </p>
        <div className="modal-actions">
          <button type="button" className="button secondary" onClick={onClose}>
            Cancelar
          </button>
          <button className="button primary" type="submit">
            Confirmar liberação
          </button>
        </div>
      </form>
    </Modal>
  );
}
