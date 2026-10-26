import React, { useEffect, useRef, useState } from "react";
import {
  CheckCheck,
  FileCheck2,
  Printer,
  Download,
  Settings2,
  Users,
  Pencil,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { useTeam } from "./Team.jsx";
import { CustomerInvitePanel } from "./CustomerInvitePanel.jsx";
import { homologationProgress } from "./domain.js";
import {
  ANSWERS,
  IMPLANTATION_MODULES,
  implantationId,
  implantationCatalog,
  implantationEntries,
  implantationProgress,
  implantationSnapshot,
  questionReady,
  questionAnswered,
  questionBlocker,
  configureImplantation,
  saveImplantationResponsibles,
  saveImplantationModel,
  saveImplantationQuestion,
  resetImplantationReport,
  matchesAcceptanceFilter,
  currentImplantationTerm,
  issueImplantationTerm,
} from "./implantation.js";
import {
  downloadImplantationTerm,
  printImplantationTerm,
} from "./implantation-print.js";
import { createAcceptanceQueue } from "./implantation-queue.js";
import {
  implantationNavigationKey,
  readAcceptanceNavigation,
} from "./implantation-navigation.js";
import {
  QuestionModelEditor,
  ResponsibleEditor,
  ModelManager,
} from "./ImplantationEditors.jsx";

const when = (at) =>
  new Date(at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
const keyFor = (entry, q) => JSON.stringify([entry.id, q.id]);
const draftFor = (q) => ({
  answer: q.answer,
  notes: q.notes,
  notUsed: q.notUsed === true,
  responsibleIds: [...q.responsibleIds],
  technical: !!q.technical && q.technical.source !== "imported-unverified",
  clientIds: q.clients
    .filter((c) => c.source !== "imported-unverified")
    .map((c) => c.id),
});
const blankStatus = { running: false, failed: false, pending: 0, keys: [] };
export function ImplantationAcceptance({
  project,
  readOnly,
  onUpdate,
  onEditing,
  onUnsaved = () => {},
  onError,
  onEditProject,
  Modal,
  Field,
}) {
  const team = useTeam();
  const storageKey = implantationNavigationKey(team.actor?.id, project.id);
  const [nav, setNav] = useState(() =>
    readAcceptanceNavigation(localStorage, storageKey),
  );
  const [catalog, setCatalog] = useState(implantationCatalog);
  const [schema, setSchema] = useState(team.online ? "loading" : "local");
  const [retry, setRetry] = useState(0);
  const [dialog, setDialog] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [focused, setFocused] = useState("");
  const [queueState, setQueueState] = useState(blankStatus);
  const draftsRef = useRef({});
  const [drafts, setDrafts] = useState({});
  const live = useRef({});
  live.current = { onUpdate, onUnsaved, actor: team.actor, onError };
  const [queue] = useState(() =>
    createAcceptanceQueue({
      save: async (action) => {
        try {
          return await live.current.onUpdate(action, { implantation: true });
        } catch (e) {
          live.current.onError(e.message);
          throw e;
        }
      },
      onState: (state) => {
        live.current.onUnsaved(state.pending > 0);
        setQueueState(state);
      },
    }),
  );
  // A receipt may precede React's render of the canonical project. Keep the
  // accepted draft until that render catches up, so the next click cannot read
  // the old answer while the queue is already processing a newer action.
  useEffect(() => {
    const next = { ...draftsRef.current };
    let changed = false;
    for (const [key, draft] of Object.entries(next)) {
      if (queueState.keys.includes(key) || focused === key) continue;
      const [entryId, questionId] = JSON.parse(key);
      const e = project.implantation?.entries.find((e) => e.id === entryId);
      const q = e?.questions.find((q) => q.id === questionId);
      if (!q) continue;
      const confirmed = draftFor(q);
      if (
        confirmed.answer === draft.answer &&
        confirmed.notes === draft.notes.trim() &&
        confirmed.notUsed === draft.notUsed &&
        confirmed.technical === draft.technical &&
        JSON.stringify(confirmed.responsibleIds) ===
          JSON.stringify(draft.responsibleIds) &&
        JSON.stringify(confirmed.clientIds) === JSON.stringify(draft.clientIds)
      ) {
        delete next[key];
        changed = true;
      }
    }
    if (changed) {
      draftsRef.current = next;
      setDrafts(next);
    }
  }, [project, queueState.keys, focused]);
  useEffect(
    () => () => {
      queue.dispose();
      live.current.onUnsaved(false);
    },
    [queue],
  );
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(nav));
    } catch {
      /* Display choices remain usable in memory. */
    }
  }, [nav, storageKey]);
  useEffect(() => {
    let active = true;
    if (!team.online) {
      setSchema("local");
      return;
    }
    setSchema("loading");
    (async () => {
      try {
        const { data, error } = await team.client.rpc(
          "implanta_implantation_capabilities",
        );
        if (!active) return;
        if (error || data?.workflowVersion !== 3) {
          setSchema(
            error && !["PGRST202", "42883"].includes(error.code)
              ? "error"
              : "pending",
          );
          return;
        }
        const models = await team.client.rpc("implanta_implantation_templates");
        if (!active) return;
        if (models.error || !Array.isArray(models.data)) {
          setSchema("error");
          return;
        }
        setCatalog(models.data);
        setSchema("ready");
      } catch {
        if (active) setSchema("error");
      }
    })();
    return () => {
      active = false;
    };
  }, [team.client, retry]);
  const dirty = queueState.pending > 0;
  useEffect(() => {
    onEditing(!!dialog || pending || dirty || !!focused);
    return () => onEditing(false);
  }, [dialog, pending, dirty, focused, onEditing]);
  useEffect(() => {
    if (!dirty) return;
    const warn = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
  const editable = !readOnly && ["ready", "local"].includes(schema);
  const canConfirm = editable && !!team.actor;
  const entity = project.entities.includes(nav.entity) ? nav.entity : "";
  const entries = implantationEntries(project, entity || undefined);
  const entityEntries = entity ? implantationEntries(project, entity) : [];
  const entry =
    entityEntries.find((e) => e.module === nav.modules[entity]) ||
    entityEntries[0];
  const navigate = (selectedEntity, module) =>
    setNav((old) => ({
      ...old,
      entity: selectedEntity,
      modules: module
        ? { ...old.modules, [selectedEntity]: module }
        : old.modules,
    }));
  const open = async (value) => {
    setError("");
    if (
      ["scope", "models"].includes(value.type) &&
      team.online &&
      schema === "ready"
    ) {
      setPending(true);
      try {
        const result = await team.client.rpc("implanta_implantation_templates");
        if (result.error || !Array.isArray(result.data))
          throw (
            result.error || new Error("Não foi possível carregar os modelos.")
          );
        setCatalog(result.data);
      } catch (e) {
        onError(e.message);
        return;
      } finally {
        setPending(false);
      }
    }
    setDialog(value);
  };
  const perform = async (action, { close = true } = {}) => {
    if (!editable || pending || dirty) return false;
    setPending(true);
    setError("");
    try {
      if (await onUpdate(action, { implantation: true })) {
        if (close) setDialog(null);
        return true;
      }
    } catch (e) {
      setError(e.message);
      onError(e.message);
    } finally {
      setPending(false);
    }
    return false;
  };
  const updatePoint = (e, q, changes, { content = false, delay = 0 } = {}) => {
    if (!editable) return;
    const key = keyFor(e, q);
    const next = {
      ...(draftsRef.current[key] || draftFor(q)),
      ...(content ? { technical: false, clientIds: [] } : {}),
      ...changes,
    };
    if (next.answer !== "no") next.notUsed = false;
    draftsRef.current = { ...draftsRef.current, [key]: next };
    setDrafts(draftsRef.current);
    queue.enqueue(
      key,
      (p) => saveImplantationQuestion(p, e.id, q.id, next, live.current.actor),
      { delay },
    );
  };
  const acceptClient = (e, q) => {
    if (!e.responsibles.length) {
      onError(
        "Cadastre um responsável do cliente neste módulo antes de registrar o aceite.",
      );
      return;
    }
    const draft = draftsRef.current[keyFor(e, q)] || draftFor(q);
    if (!draft.technical || draft.answer !== "yes") {
      onError(
        "Registre primeiro o aceite do técnico. Não e Não se aplica não permitem aceites.",
      );
      return;
    }
    if (!questionAnswered({ ...q, ...draft })) {
      onError(
        "Responda e preencha a justificativa antes do aceite do cliente.",
      );
      return;
    }
    if (e.responsibles.length === 1) {
      const id = e.responsibles[0].id;
      updatePoint(e, q, {
        responsibleIds: [id],
        clientIds: draft.clientIds.includes(id) ? [] : [id],
      });
    } else open({ type: "clients", entryId: e.id, questionId: q.id });
  };
  const output = async (fn, record) => {
    setPending(true);
    try {
      await fn(record);
    } catch (e) {
      onError(e.message || "Não foi possível gerar o documento.");
    } finally {
      setPending(false);
    }
  };
  const printReport = (e) => {
    if (dirty) {
      onError(
        "Aguarde a confirmação das respostas no banco antes de imprimir.",
      );
      return;
    }
    output(printImplantationTerm, {
      id: `relatorio-${project.id}-${e.module}`,
      entity: e.entity,
      module: e.module,
      at: new Date().toISOString(),
      actorId: team.actor?.id || "",
      actorName: team.actor?.name || "",
      draft: true,
      snapshot: implantationSnapshot(project, e.entity, e.module),
    });
  };
  const currentEntry =
    dialog?.entryId &&
    project.implantation?.entries.find((e) => e.id === dialog.entryId);
  const currentQuestion = currentEntry?.questions.find(
    (q) => q.id === dialog?.questionId,
  );
  const progress = implantationProgress(project);
  const terms = (project.implantation?.terms || []).filter(
    (t) =>
      !entity ||
      (t.entity === entity && (!entry || (t.module || "") === entry.module)),
  );
  const moduleProgress =
    entry &&
    implantationProgress(
      { ...project, implantation: { entries: [entry] } },
      entity,
    );
  const moduleTerm =
    entry && currentImplantationTerm(project, entity, entry.module);
  return (
    <section className="implantation-page acceptance-workflow">
      <div className="implantation-heading">
        <div>
          <span className="eyebrow">CHECKLIST FINAL COM O CLIENTE</span>
          <h2>Homologação da implantação</h2>
          <p>
            Preencha o relatório e registre os aceites. As respostas são salvas
            automaticamente.
          </p>
        </div>
        <div className="implantation-document-actions">
          <button
            className="button secondary"
            disabled={!editable || pending || dirty || !project.entities.length}
            onClick={() => open({ type: "scope" })}
          >
            <Settings2 size={16} />
            Módulos contratados
          </button>
          {team.isMaster && (
            <button
              className="button secondary"
              disabled={schema !== "ready" || pending || dirty}
              onClick={() => open({ type: "models" })}
            >
              <Pencil size={16} />
              Gerenciar modelos
            </button>
          )}
        </div>
      </div>
      {team.online && schema !== "ready" && (
        <div className="info-box implantation-activation" role="status">
          <AlertCircle size={22} />
          <div>
            <strong>
              {schema === "loading"
                ? "Verificando modelos e permissões…"
                : schema === "error"
                  ? "Não foi possível verificar a conexão."
                  : "Ative o complemento dos aceites no Supabase."}
            </strong>
            <p>
              As abas e o preenchimento direto usam modelos globais e novas
              regras de dispensa. O SQL anterior continua válido; aplique o
              arquivo complementar do guia.
            </p>
            <a
              href="https://github.com/rmvitor/Implantation-WS/blob/main/docs/homologacao-implantacao.md"
              target="_blank"
              rel="noreferrer"
            >
              Abrir guia e SQL complementar
            </a>
            <button
              className="button secondary"
              onClick={() => setRetry((n) => n + 1)}
            >
              Verificar novamente
            </button>
          </div>
        </div>
      )}
      {error && !dialog && (
        <p className="team-error" role="alert">
          {error}
        </p>
      )}
      <div
        className={`acceptance-save-status ${queueState.failed ? "has-error" : ""}`}
        role="status"
        aria-live="polite"
      >
        {queueState.failed ? (
          <>
            <AlertCircle size={16} />
            <span>
              Há respostas não salvas. Seus textos foram mantidos nesta tela.
            </span>
            <button className="button secondary" onClick={() => queue.retry()}>
              Tentar salvar novamente
            </button>
            <button
              className="button secondary"
              onClick={() => open({ type: "discard" })}
            >
              Descartar rascunhos não salvos
            </button>
          </>
        ) : dirty ? (
          <>Salvando {queueState.pending} ponto(s)…</>
        ) : team.online ? (
          <>Respostas confirmadas no banco</>
        ) : (
          <>
            Rascunho neste aparelho · entre com sua conta para registrar os OKs
          </>
        )}
      </div>
      {!project.entities.length ? (
        <div className="homologation-empty">
          <h3>Cadastre as entidades do projeto</h3>
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
          <div className="acceptance-tab-heading">
            <strong>Entidades</strong>
            <button
              className="button secondary"
              aria-expanded={!nav.entitiesCollapsed}
              onClick={() =>
                setNav((v) => ({
                  ...v,
                  entitiesCollapsed: !v.entitiesCollapsed,
                }))
              }
            >
              {nav.entitiesCollapsed ? (
                <ChevronDown size={15} />
              ) : (
                <ChevronUp size={15} />
              )}
              {nav.entitiesCollapsed
                ? "Expandir entidades"
                : "Recolher entidades"}
            </button>
          </div>
          {!nav.entitiesCollapsed && (
            <div
              className="acceptance-tabs entity-tabs"
              role="tablist"
              aria-label="Entidades da homologação"
            >
              <Tab active={!entity} onClick={() => navigate("")}>
                Visão geral
              </Tab>
              {project.entities.map((e) => {
                const p = implantationProgress(project, e);
                return (
                  <Tab
                    key={e}
                    active={entity === e}
                    onClick={() => navigate(e)}
                  >
                    {e}
                    <small>
                      {p.done}/{p.total}
                    </small>
                  </Tab>
                );
              })}
            </div>
          )}
          {nav.entitiesCollapsed && (
            <p className="muted">{entity || "Visão geral"}</p>
          )}
          {!entity ? (
            <AcceptanceOverview
              project={project}
              catalog={catalog}
              onNavigate={navigate}
              onPrint={(term) => output(printImplantationTerm, term)}
              blocked={pending || dirty}
              onIssue={(selected) => open({ type: "issue", entity: selected })}
              canConfirm={canConfirm && !dirty}
            />
          ) : (
            <>
              <div className="acceptance-tab-heading">
                <div>
                  <h3>{entity}</h3>
                  <small>
                    {implantationProgress(project, entity).done}/
                    {implantationProgress(project, entity).total} pontos com os
                    dois OKs
                  </small>
                </div>
                <button
                  className="button secondary"
                  aria-expanded={!nav.modulesCollapsed}
                  onClick={() =>
                    setNav((v) => ({
                      ...v,
                      modulesCollapsed: !v.modulesCollapsed,
                    }))
                  }
                >
                  {nav.modulesCollapsed
                    ? "Expandir módulos"
                    : "Recolher módulos"}
                </button>
              </div>
              {!nav.modulesCollapsed && (
                <div
                  className="acceptance-tabs module-tabs"
                  role="tablist"
                  aria-label="Módulos da entidade"
                >
                  {entityEntries.map((e) => (
                    <Tab
                      key={e.id}
                      active={entry?.id === e.id}
                      onClick={() => navigate(entity, e.module)}
                    >
                      {e.module}
                      <small>
                        {e.questions.filter((q) => questionReady(e, q)).length}/
                        {e.questions.length}
                      </small>
                    </Tab>
                  ))}
                </div>
              )}
              {!entry ? (
                <div className="homologation-empty">
                  <h3>Nenhum relatório ativo nesta entidade</h3>
                  <p>
                    Selecione os módulos que têm modelo de perguntas em Módulos
                    contratados.
                  </p>
                </div>
              ) : (
                <section
                  className="acceptance-report"
                  aria-label={`Relatório de ${entry.module} — ${entity}`}
                >
                  <header className="acceptance-report-header">
                    <div>
                      <span className="eyebrow">
                        RELATÓRIO DE HOMOLOGAÇÃO DA IMPLANTAÇÃO
                      </span>
                      <h3>{entry.module}</h3>
                      <p>
                        {project.name} · {entity}
                      </p>
                      <small>
                        Modelo {entry.modelVersion} ·{" "}
                        {
                          entry.questions.filter((q) => questionReady(entry, q))
                            .length
                        }
                        /{entry.questions.length} pontos validados
                      </small>
                    </div>
                    <div
                      className="implantation-module-actions acceptance-management-actions"
                      role="group"
                      aria-label="Gerenciar relatório"
                    >
                      <button
                        className="button secondary"
                        disabled={!editable || dirty || pending}
                        onClick={() =>
                          open({ type: "people", entryId: entry.id })
                        }
                      >
                        <Users size={15} />
                        Responsáveis
                      </button>
                      <button
                        className="button secondary"
                        disabled={dirty || pending}
                        onClick={() => printReport(entry)}
                      >
                        <Printer size={15} />
                        Imprimir relatório
                      </button>
                      <button
                        className="button secondary"
                        disabled={!editable || dirty || pending}
                        onClick={() =>
                          open({ type: "reset", entryId: entry.id })
                        }
                      >
                        Limpar relatório
                      </button>
                      <button
                        className="button secondary danger-button"
                        disabled={!editable || dirty || pending}
                        onClick={() =>
                          open({ type: "deactivate", entryId: entry.id })
                        }
                      >
                        Excluir relatório
                      </button>
                      {team.isMaster &&
                        catalog.find((m) => m.module === entry.module)
                          ?.questions.length > 0 && (
                          <button
                            className="button secondary"
                            disabled={!editable || dirty || pending}
                            onClick={() =>
                              open({ type: "applyModel", entryId: entry.id })
                            }
                          >
                            Aplicar modelo atual
                          </button>
                        )}
                    </div>
                  </header>
                  {!entry.responsibles.length && (
                    <div className="info-box">
                      <p>
                        Cadastre os responsáveis do cliente em{" "}
                        <strong>Responsáveis</strong>. Um único responsável será
                        selecionado automaticamente; com vários, você escolhe
                        quem deu o OK em cada ponto.
                      </p>
                    </div>
                  )}
                  <div
                    className="acceptance-report-filters"
                    role="group"
                    aria-label="Filtrar pontos do relatório"
                  >
                    {[
                      ["all", "Todos"],
                      ["technical", "Aceite do técnico"],
                      ["both", "Aceite do cliente e técnico"],
                      ["open", "Em aberto"],
                    ].map(([value, label]) => (
                      <button
                        className="button secondary"
                        key={value}
                        aria-pressed={nav.filter === value}
                        onClick={() =>
                          setNav((old) => ({ ...old, filter: value }))
                        }
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {!entry.questions.some((q) =>
                    matchesAcceptanceFilter(entry, q, nav.filter),
                  ) && (
                    <p className="acceptance-filter-empty" role="status">
                      Nenhum ponto neste filtro.
                    </p>
                  )}
                  {entry.questions.map(
                    (q, i) =>
                      matchesAcceptanceFilter(entry, q, nav.filter) && (
                        <InlineQuestion
                          key={q.id}
                          entry={entry}
                          question={q}
                          number={i + 1}
                          draft={drafts[keyFor(entry, q)] || draftFor(q)}
                          editable={editable}
                          canConfirm={canConfirm}
                          actor={team.actor}
                          pending={queueState.keys.includes(keyFor(entry, q))}
                          Field={Field}
                          onChange={(changes, options) =>
                            updatePoint(entry, q, changes, options)
                          }
                          onClient={() => acceptClient(entry, q)}
                          onAssign={() =>
                            open({
                              type: "assign",
                              entryId: entry.id,
                              questionId: q.id,
                            })
                          }
                          onFocus={() => setFocused(keyFor(entry, q))}
                          onBlur={() => {
                            queue.flush(keyFor(entry, q));
                            setFocused("");
                          }}
                        />
                      ),
                  )}
                  <div className="implantation-term-panel">
                    <div>
                      <h3>
                        {moduleTerm
                          ? "Termo do módulo disponível"
                          : "Termo deste módulo"}
                      </h3>
                      <p>
                        {moduleTerm
                          ? `${moduleTerm.actorName} · ${when(moduleTerm.at)}`
                          : "Pontos apresentados exigem os dois aceites. Não se aplica exige justificativa; perguntas de impedimento respeitam o sentido do modelo."}
                      </p>
                    </div>
                    <div className="implantation-document-actions">
                      {moduleTerm ? (
                        <>
                          <button
                            className="button primary"
                            disabled={dirty || pending}
                            onClick={() =>
                              output(printImplantationTerm, moduleTerm)
                            }
                          >
                            Imprimir / salvar PDF
                          </button>
                          <button
                            className="button secondary"
                            disabled={dirty || pending}
                            onClick={() =>
                              output(downloadImplantationTerm, moduleTerm)
                            }
                          >
                            Baixar documento
                          </button>
                        </>
                      ) : (
                        <button
                          className="button primary"
                          disabled={
                            !canConfirm ||
                            dirty ||
                            pending ||
                            !moduleProgress.ready
                          }
                          onClick={() =>
                            open({
                              type: "issue",
                              entity,
                              module: entry.module,
                            })
                          }
                        >
                          Gerar termo do módulo
                        </button>
                      )}
                    </div>
                  </div>
                </section>
              )}
            </>
          )}
          {!!terms.length && (
            <details className="implantation-archive">
              <summary>Termos emitidos · {terms.length}</summary>
              {terms.map((t) => (
                <div className="implantation-archive-row" key={t.id}>
                  <div>
                    <strong>
                      {t.entity} · {t.module || "Todos os módulos"}
                    </strong>
                    <small>
                      {when(t.at)} · {t.actorName}
                    </small>
                  </div>
                  <button
                    className="button secondary"
                    disabled={dirty || pending}
                    onClick={() => output(printImplantationTerm, t)}
                  >
                    Imprimir / PDF
                  </button>
                  <button
                    className="button secondary"
                    disabled={dirty || pending}
                    onClick={() => output(downloadImplantationTerm, t)}
                  >
                    Baixar
                  </button>
                </div>
              ))}
            </details>
          )}
        </>
      )}
      {dialog && (
        <Modal
          wide={["scope", "models"].includes(dialog.type)}
          title={
            dialog.type === "scope"
              ? "Módulos contratados por entidade"
              : dialog.type === "models"
                ? "Modelos globais de perguntas"
                : dialog.type === "people"
                  ? `Responsáveis · ${currentEntry?.module}`
                  : dialog.type === "assign"
                    ? "Responsáveis deste ponto"
                    : dialog.type === "clients"
                      ? "Quem confirmou este ponto?"
                      : dialog.type === "invite"
                        ? "Acesso externo do cliente"
                        : dialog.type === "reset"
                          ? "Limpar relatório para começar novamente?"
                          : dialog.type === "deactivate"
                            ? "Excluir relatório de preenchimento?"
                            : dialog.type === "applyModel"
                              ? "Atualizar as perguntas deste relatório?"
                              : dialog.type === "discard"
                                ? "Descartar respostas não salvas?"
                                : "Gerar termo de homologação"
          }
          subtitle={currentEntry?.entity || dialog.entity || ""}
          onClose={() => {
            if (pending) return false;
            setDialog(null);
          }}
        >
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          {dialog.type === "scope" && (
            <ScopeEditor
              project={project}
              catalog={catalog}
              pending={pending}
              onSave={(pairs) =>
                perform((p) =>
                  configureImplantation(p, pairs, team.actor, catalog),
                )
              }
            />
          )}
          {dialog.type === "models" && team.isMaster && (
            <ModelManager
              catalog={catalog}
              Field={Field}
              pending={pending}
              onSave={async (model, questions, version) => {
                setPending(true);
                setError("");
                try {
                  const result = await team.client.rpc(
                    "implanta_save_implantation_template",
                    {
                      p_module: model.module,
                      p_questions: questions,
                      p_revision: model.revision,
                      p_version: version,
                    },
                  );
                  if (result.error) throw result.error;
                  setCatalog(result.data);
                  return true;
                } catch (e) {
                  setError(e.message);
                  return false;
                } finally {
                  setPending(false);
                }
              }}
            />
          )}
          {dialog.type === "invite" &&
            currentEntry &&
            currentEntry.responsibles.some(
              (r) => r.id === dialog.responsibleId,
            ) && (
              <CustomerInvitePanel
                client={team.client}
                projectId={project.id}
                entryId={currentEntry.id}
                responsible={currentEntry.responsibles.find(
                  (r) => r.id === dialog.responsibleId,
                )}
              />
            )}
          {dialog.type === "people" && currentEntry && (
            <ResponsibleEditor
              entry={currentEntry}
              onInvite={
                team.online && !readOnly
                  ? (responsibleId) =>
                      setDialog({
                        type: "invite",
                        entryId: currentEntry.id,
                        responsibleId,
                      })
                  : undefined
              }
              Field={Field}
              pending={pending}
              onSave={(people) =>
                perform(
                  (p) =>
                    saveImplantationResponsibles(
                      p,
                      currentEntry.id,
                      people,
                      team.actor,
                    ),
                  { close: false },
                )
              }
            />
          )}
          {dialog.type === "assign" && currentEntry && currentQuestion && (
            <ClientSelector
              assignmentOnly
              entry={currentEntry}
              draft={
                drafts[keyFor(currentEntry, currentQuestion)] ||
                draftFor(currentQuestion)
              }
              onSave={(ids) => {
                const draft =
                  draftsRef.current[keyFor(currentEntry, currentQuestion)] ||
                  draftFor(currentQuestion);
                updatePoint(currentEntry, currentQuestion, {
                  responsibleIds: ids,
                  clientIds: draft.clientIds.filter((id) => ids.includes(id)),
                });
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "clients" && currentEntry && currentQuestion && (
            <ClientSelector
              entry={currentEntry}
              draft={
                drafts[keyFor(currentEntry, currentQuestion)] ||
                draftFor(currentQuestion)
              }
              onSave={(ids) => {
                updatePoint(currentEntry, currentQuestion, {
                  responsibleIds: ids,
                  clientIds: ids,
                });
                setDialog(null);
              }}
              onClear={() => {
                updatePoint(currentEntry, currentQuestion, { clientIds: [] });
                setDialog(null);
              }}
            />
          )}
          {dialog.type === "reset" && currentEntry && (
            <>
              <p>
                <strong>
                  Limpar {currentEntry.module} · {currentEntry.entity}?
                </strong>
              </p>
              <p>
                Esta ação limpa no banco as respostas, justificativas,
                observações, aceites e responsáveis deste relatório para começar
                o preenchimento novamente. Não é uma limpeza de cache.
              </p>
              <p>
                O módulo continua ativo, com as perguntas do modelo. Os outros
                relatórios, o histórico e os termos já emitidos são preservados.
              </p>
              <button
                className="button primary full-button"
                disabled={pending}
                onClick={() =>
                  perform((p) =>
                    resetImplantationReport(p, currentEntry.id, team.actor),
                  )
                }
              >
                Confirmar limpeza do relatório
              </button>
            </>
          )}
          {dialog.type === "deactivate" && currentEntry && (
            <>
              <p>
                Serão apagadas as respostas, justificativas e os OKs de{" "}
                <strong>
                  {currentEntry.module} · {currentEntry.entity}
                </strong>
                . O histórico de execução e os termos já emitidos são
                preservados.
              </p>
              <p>
                Para preencher novamente, ative o módulo em{" "}
                <strong>Módulos contratados</strong>.
              </p>
              <button
                className="button primary full-button"
                disabled={pending}
                onClick={() =>
                  perform((p) =>
                    configureImplantation(
                      p,
                      implantationEntries(p)
                        .filter((e) => e.id !== currentEntry.id)
                        .map(({ module, entity }) => ({ module, entity })),
                      team.actor,
                      catalog,
                    ),
                  )
                }
              >
                Apagar respostas e desativar
              </button>
            </>
          )}
          {dialog.type === "applyModel" && currentEntry && (
            <>
              <p>
                O modelo global atual será aplicado apenas a este relatório.
                Perguntas alteradas perdem as respostas e os OKs. Os pontos que
                continuam iguais são preservados.
              </p>
              <button
                className="button primary full-button"
                disabled={pending}
                onClick={() =>
                  perform((p) => {
                    const model = catalog.find(
                      (m) => m.module === currentEntry.module,
                    );
                    return saveImplantationModel(
                      p,
                      currentEntry.id,
                      model.questions,
                      team.actor,
                      { master: team.isMaster, model },
                    );
                  })
                }
              >
                Aplicar modelo global ao relatório
              </button>
            </>
          )}
          {dialog.type === "discard" && (
            <>
              <p>
                Isso descarta somente os rascunhos que ainda não foram
                confirmados pelo banco.
              </p>
              <button
                className="button primary full-button"
                disabled={queueState.running}
                onClick={() => {
                  if (queue.discard()) {
                    draftsRef.current = {};
                    setDrafts({});
                    setDialog(null);
                  }
                }}
              >
                Descartar rascunhos
              </button>
            </>
          )}
          {dialog.type === "issue" && (
            <>
              <p>
                O documento de{" "}
                <strong>
                  {dialog.entity}
                  {dialog.module
                    ? ` · ${dialog.module}`
                    : " · todos os módulos"}
                </strong>{" "}
                guardará uma cópia das perguntas, respostas, dispensas e
                nomes/cargos dos responsáveis para assinatura.
              </p>
              <button
                className="button primary full-button"
                disabled={pending || dirty}
                onClick={() =>
                  perform((p) =>
                    issueImplantationTerm(
                      p,
                      dialog.entity,
                      team.actor,
                      new Date().toISOString(),
                      dialog.module || "",
                    ),
                  )
                }
              >
                Confirmar emissão
              </button>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
function Tab({ active, children, ...props }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      className={active ? "active" : ""}
      {...props}
    >
      {children}
    </button>
  );
}
function AcceptanceOverview({
  project,
  catalog,
  onNavigate,
  canConfirm,
  onIssue,
  onPrint,
  blocked,
}) {
  const migration = homologationProgress(project),
    overall = implantationProgress(project);
  return (
    <div className="acceptance-general">
      <div className="implantation-overview">
        <div className="implantation-metric">
          <strong>
            {overall.done}/{overall.total}
          </strong>
          <span>Pontos da implantação</span>
        </div>
        <div className="implantation-metric">
          <strong>{overall.blockers}</strong>
          <span>Impedimentos</span>
        </div>
        <div className="implantation-metric">
          <strong>
            {migration.done}/{migration.total}
          </strong>
          <span>Conferências da migração</span>
        </div>
      </div>
      <div
        className="acceptance-matrix-scroll"
        role="region"
        aria-label="Visão geral das homologações por entidade"
      >
        <table className="acceptance-matrix">
          <thead>
            <tr>
              <th>Entidade</th>
              {IMPLANTATION_MODULES.map((module) => (
                <th key={module}>{module}</th>
              ))}
              <th>Termo da entidade</th>
            </tr>
          </thead>
          <tbody>
            {project.entities.map((entity) => {
              const p = implantationProgress(project, entity);
              const current = currentImplantationTerm(project, entity);
              return (
                <tr key={entity}>
                  <th>{entity}</th>
                  {IMPLANTATION_MODULES.map((module) => {
                    const e = implantationEntries(project, entity).find(
                      (e) => e.module === module,
                    );
                    return (
                      <td key={module}>
                        {e ? (
                          <button
                            className="button secondary"
                            onClick={() => onNavigate(entity, module)}
                          >
                            {
                              e.questions.filter((q) => questionReady(e, q))
                                .length
                            }
                            /{e.questions.length} OK
                          </button>
                        ) : (
                          <span className="muted">
                            {catalog.find((m) => m.module === module)?.questions
                              .length
                              ? "Não contratado"
                              : "Sem modelo"}
                          </span>
                        )}
                      </td>
                    );
                  })}
                  <td>
                    <button
                      className="button secondary"
                      disabled={
                        blocked || (!current && (!canConfirm || !p.ready))
                      }
                      onClick={() =>
                        current ? onPrint(current) : onIssue(entity)
                      }
                    >
                      {current
                        ? "Imprimir termo da entidade"
                        : "Gerar termo da entidade"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
function InlineQuestion({
  entry,
  question: q,
  number,
  draft,
  editable,
  canConfirm,
  actor,
  pending,
  Field,
  onChange,
  onClient,
  onAssign,
  onFocus,
  onBlur,
}) {
  const answered = questionAnswered({ ...q, ...draft });
  const required = draft.answer === "na" || draft.answer === q.justifyWhen;
  const justification = required || draft.answer === "no";
  const notesField = (
    <Field
      label={`${justification ? (required ? "Justificativa obrigatória" : "Justificativa") : "Observações"} do ponto ${number}`}
    >
      <textarea
        rows={2}
        value={draft.notes}
        disabled={!editable || draft.clientIds.length > 0}
        onFocus={onFocus}
        onBlur={onBlur}
        onChange={(e) =>
          onChange({ notes: e.target.value }, { content: true, delay: 350 })
        }
      />
    </Field>
  );
  return (
    <article
      className="acceptance-inline-question"
      aria-label={`Ponto ${number}`}
    >
      <h4>
        <span>{number}.</span> {q.text}
      </h4>
      {q.help && <p className="muted">{q.help}</p>}
      {q.condition && <p className="muted">{q.condition}</p>}
      <div
        className="acceptance-inline-approvals"
        role="group"
        aria-label={`Resposta e aceites do ponto ${number}`}
      >
        <label>
          <input
            type="checkbox"
            checked={draft.technical}
            disabled={
              !canConfirm ||
              draft.clientIds.length > 0 ||
              (pending &&
                q.clients.some((c) => c.source !== "imported-unverified")) ||
              ["no", "na"].includes(draft.answer) ||
              (!!draft.answer && !answered)
            }
            onChange={(e) => {
              const answer = draft.answer || "yes";
              onChange(
                {
                  answer,
                  responsibleIds: draft.responsibleIds.length
                    ? draft.responsibleIds
                    : entry.responsibles.length === 1
                      ? [entry.responsibles[0].id]
                      : [],
                  technical:
                    e.target.checked &&
                    questionAnswered({ ...q, ...draft, answer }),
                },
                { content: answer !== draft.answer },
              );
            }}
          />
          Aceite técnico: Sim
        </label>
        <label>
          <input
            type="checkbox"
            checked={draft.clientIds.length > 0}
            disabled={
              !canConfirm ||
              !draft.technical ||
              draft.answer !== "yes" ||
              !answered
            }
            onChange={(event) =>
              event.target.checked ? onClient() : onChange({ clientIds: [] })
            }
          />
          Aceite do cliente
        </label>
        {draft.clientIds.length > 0 && entry.responsibles.length > 1 && (
          <button
            className="button secondary acceptance-client-review"
            disabled={!canConfirm}
            onClick={onClient}
          >
            Alterar responsáveis do aceite
          </button>
        )}
        {[
          ["no", "Não"],
          ["na", "Não se aplica"],
        ].map(([value, label]) => (
          <label key={value}>
            <input
              type="checkbox"
              checked={draft.answer === value}
              disabled={
                !editable ||
                draft.technical ||
                draft.clientIds.length > 0 ||
                (["no", "na"].includes(draft.answer) && draft.answer !== value)
              }
              onChange={(e) =>
                onChange(
                  { answer: e.target.checked ? value : "", responsibleIds: [] },
                  { content: true },
                )
              }
            />
            {label}
          </label>
        ))}
      </div>
      {entry.responsibles.length > 1 && (
        <button
          className="button secondary acceptance-point-assignment"
          disabled={
            !canConfirm || !draft.technical || draft.answer !== "yes" || pending
          }
          onClick={onAssign}
        >
          Responsáveis do ponto ({draft.responsibleIds.length})
        </button>
      )}
      {justification ? (
        <div className="acceptance-inline-fields">
          {notesField}
          {required && !answered && (
            <small className="muted">
              Preencha a justificativa para registrar os aceites.
            </small>
          )}
        </div>
      ) : (
        <details className="acceptance-observations">
          <summary>
            Observações{draft.notes.trim() ? " · preenchidas" : ""}
          </summary>
          {notesField}
        </details>
      )}
      {draft.clientIds.length > 0 && (
        <p className="acceptance-lock-hint">
          Remova o aceite do cliente antes de alterar o técnico, a resposta ou
          as observações.
        </p>
      )}
      <div className="acceptance-point-status">
        <small>
          {pending
            ? "Salvando…"
            : questionReady(entry, q)
              ? "Ponto validado"
              : draft.answer
                ? `Resposta: ${ANSWERS[draft.answer]} · Aguardando validações`
                : "Ainda não respondido"}
        </small>
      </div>
      {draft.responsibleIds.length > 0 && (
        <p className="acceptance-point-clients">
          Cliente:{" "}
          {entry.responsibles
            .filter((r) => draft.responsibleIds.includes(r.id))
            .map((r) => `${r.name} (${r.role})`)
            .join(", ")}
        </p>
      )}
      {q.clients
        .filter(
          (c) =>
            c.origin === "customer-portal" && draft.clientIds.includes(c.id),
        )
        .map((c) => (
          <p key={c.id} className="acceptance-point-clients">
            Confirmado pelo cliente no portal: {c.clientName} · {when(c.at)}
          </p>
        ))}
      {q.technical && !pending && draft.technical && (
        <small className="muted">
          Registro técnico: {q.technical.by} · {when(q.technical.at)}
        </small>
      )}
      {questionBlocker({ ...q, ...draft }) && (
        <p className="implantation-warning">
          Esta resposta impede o termo. Resolva a pendência ou use Não se aplica
          com justificativa quando o ponto não for utilizado.
        </p>
      )}
      {!actor && (
        <small className="muted">
          Entre com sua conta para registrar os OKs.
        </small>
      )}
    </article>
  );
}
function ClientSelector({
  entry,
  draft,
  onSave,
  onClear,
  assignmentOnly = false,
}) {
  const [selected, setSelected] = useState(draft.responsibleIds);
  return (
    <>
      <p>
        {assignmentOnly
          ? "Selecione quem deve validar este ponto no portal. Esta seleção não registra aceites. Retirar um responsável também retira seu aceite deste ponto; o histórico é preservado."
          : "Selecione quem confirmou este ponto durante a reunião. Cada pessoa selecionada terá seu aceite registrado com sua conta."}
      </p>
      <div className="acceptance-client-selector">
        {entry.responsibles.map((r) => (
          <label key={r.id}>
            <input
              type="checkbox"
              checked={selected.includes(r.id)}
              onChange={(e) =>
                setSelected((v) =>
                  e.target.checked
                    ? [...v, r.id]
                    : v.filter((id) => id !== r.id),
                )
              }
            />
            <span>
              {r.name}
              <small>{r.role}</small>
            </span>
          </label>
        ))}
      </div>
      <div className="implantation-editor-actions">
        <button
          className="button primary"
          disabled={!assignmentOnly && !selected.length}
          onClick={() => onSave(selected)}
        >
          {assignmentOnly
            ? "Salvar responsáveis do ponto"
            : "Registrar aceite dos selecionados"}
        </button>
        {!assignmentOnly && (
          <button className="button secondary" onClick={onClear}>
            Retirar aceites deste ponto
          </button>
        )}
      </div>
    </>
  );
}
function ScopeEditor({ project, catalog, pending, onSave }) {
  const [selected, setSelected] = useState(
    implantationEntries(project).map((e) => e.id),
  );
  const [entity, setEntity] = useState(project.entities[0]);
  const [confirm, setConfirm] = useState(false);
  const available = IMPLANTATION_MODULES.filter(
    (module) => catalog.find((m) => m.module === module)?.questions.length,
  );
  const pairs = project.entities.flatMap((entity) =>
    IMPLANTATION_MODULES.filter((module) =>
      selected.includes(implantationId(module, entity)),
    ).map((module) => ({ module, entity })),
  );
  const removed = implantationEntries(project).filter(
    (e) => !selected.includes(e.id),
  );
  if (confirm)
    return (
      <>
        <p role="alert">
          Serão apagadas as respostas e os OKs dos relatórios desmarcados:
        </p>
        <ul>
          {removed.map((e) => (
            <li key={e.id}>
              {e.entity} · {e.module}
            </li>
          ))}
        </ul>
        <p>
          O histórico de execução e os termos emitidos são preservados. Para
          preencher novamente será necessário reativar os módulos.
        </p>
        <div className="implantation-editor-actions">
          <button
            className="button secondary"
            onClick={() => setConfirm(false)}
          >
            Voltar à seleção
          </button>
          <button
            className="button primary"
            disabled={pending}
            onClick={() => onSave(pairs)}
          >
            Apagar respostas e salvar escopo
          </button>
        </div>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (removed.length) setConfirm(true);
        else onSave(pairs);
      }}
    >
      <p>
        Selecione os módulos por entidade. Módulos sem modelo ficam
        indisponíveis até o Master cadastrar as perguntas.
      </p>
      <p className="muted">
        “Marcar todos os módulos” seleciona os módulos disponíveis em todas as
        entidades do projeto.
      </p>
      <div
        className="acceptance-tabs"
        role="tablist"
        aria-label="Entidades dos módulos contratados"
      >
        {project.entities.map((e) => (
          <Tab key={e} active={entity === e} onClick={() => setEntity(e)}>
            {e}
          </Tab>
        ))}
      </div>
      <div className="implantation-editor-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() =>
            setSelected((v) => [
              ...new Set([
                ...v,
                ...available.map((m) => implantationId(m, entity)),
              ]),
            ])
          }
        >
          Marcar todos desta entidade
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() =>
            setSelected((v) => [
              ...new Set([
                ...v,
                ...project.entities.flatMap((e) =>
                  available.map((m) => implantationId(m, e)),
                ),
              ]),
            ])
          }
        >
          Marcar todos os módulos
        </button>
      </div>
      <div className="implantation-scope">
        <fieldset>
          <legend>{entity}</legend>
          {IMPLANTATION_MODULES.map((module) => {
            const id = implantationId(module, entity),
              model = catalog.find((m) => m.module === module);
            return model?.questions.length ? (
              <label key={module}>
                <input
                  type="checkbox"
                  disabled={pending}
                  checked={selected.includes(id)}
                  onChange={(e) =>
                    setSelected((v) =>
                      e.target.checked
                        ? [...v, id]
                        : v.filter((key) => key !== id),
                    )
                  }
                  aria-label={`${module} — ${entity}`}
                />
                <span>
                  {module}
                  <small>
                    {model.questions.length} perguntas · {model.version}
                  </small>
                </span>
              </label>
            ) : (
              <p className="muted" key={module}>
                {module}
                <small>
                  {selected.includes(id)
                    ? "Relatório anterior ativo · desative pelo botão Excluir relatório"
                    : "Sem modelo de perguntas · indisponível"}
                </small>
              </p>
            );
          })}
        </fieldset>
      </div>
      <button className="button primary full-button" disabled={pending}>
        Salvar escopo da implantação
      </button>
    </form>
  );
}
