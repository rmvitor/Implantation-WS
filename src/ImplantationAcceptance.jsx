import React, { useEffect, useState } from "react";
import {
  CheckCheck,
  FileCheck2,
  Plus,
  Printer,
  Download,
  Settings2,
  Users,
  Pencil,
  AlertCircle,
} from "lucide-react";
import { useTeam } from "./Team.jsx";
import {
  ANSWERS,
  IMPLANTATION_MODULES,
  implantationId,
  implantationTemplate,
  implantationEntries,
  implantationProgress,
  questionReady,
  questionBlocker,
  configureImplantation,
  saveImplantationResponsibles,
  saveImplantationModel,
  saveImplantationQuestion,
  defaultQuestions,
  currentImplantationTerm,
  issueImplantationTerm,
} from "./implantation.js";
import {
  downloadImplantationTerm,
  printImplantationTerm,
} from "./implantation-print.js";

const when = (at) =>
  new Date(at).toLocaleString("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  });
export function ImplantationAcceptance({
  project,
  readOnly,
  onUpdate,
  onEditing,
  onError,
  onEditProject,
  Modal,
  Field,
}) {
  const team = useTeam();
  const [entity, setEntity] = useState(project.entities[0] || "");
  const [dialog, setDialog] = useState(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [schema, setSchema] = useState(team.online ? "loading" : "local");
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    let live = true;
    if (!team.online) {
      setSchema("local");
      return;
    }
    setSchema("loading");
    team.client.rpc("implanta_implantation_capabilities").then(
      ({ data, error }) => {
        if (live)
          setSchema(
            !error && data?.version === 1
              ? "ready"
              : error && !["PGRST202", "42883"].includes(error.code)
                ? "error"
                : "pending",
          );
      },
      () => {
        if (live) setSchema("error");
      },
    );
    return () => {
      live = false;
    };
  }, [team.client, retry]);
  useEffect(() => {
    onEditing(!!dialog || pending);
    return () => onEditing(false);
  }, [dialog, pending, onEditing]);
  const selectedEntity = project.entities.includes(entity)
    ? entity
    : project.entities[0] || "";
  const editable = !readOnly && ["ready", "local"].includes(schema);
  const canConfirm = editable && !!team.actor;
  const entries = implantationEntries(project, selectedEntity);
  const progress = implantationProgress(project, selectedEntity);
  const term = currentImplantationTerm(project, selectedEntity);
  const terms = (project.implantation?.terms || []).filter(
    (t) => t.entity === selectedEntity,
  );
  const open = (value) => {
    setError("");
    setDialog(value);
  };
  const perform = async (action) => {
    if (!editable || pending) return false;
    setPending(true);
    setError("");
    try {
      if (await onUpdate(action, { implantation: true })) {
        setDialog(null);
        return true;
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setPending(false);
    }
    return false;
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
  return (
    <section className="implantation-page">
      <div className="implantation-heading">
        <div>
          <span className="eyebrow">CHECKLIST FINAL COM O CLIENTE</span>
          <h2>Homologação da implantação</h2>
          <p>
            Registre o que foi apresentado e o aceite dos responsáveis de cada
            entidade.
          </p>
        </div>
        <button
          className="button secondary"
          disabled={!editable || pending || !project.entities.length}
          onClick={() => open({ type: "scope" })}
        >
          <Settings2 size={16} />
          Definir módulos contratados
        </button>
      </div>
      {team.online && schema !== "ready" && (
        <div className="info-box implantation-activation" role="status">
          <AlertCircle size={22} />
          <div>
            <strong>
              {schema === "loading"
                ? "Verificando a rotina no banco…"
                : schema === "error"
                  ? "Não foi possível verificar a conexão."
                  : "Ative a nova rotina no Supabase."}
            </strong>
            <p>
              {schema === "error"
                ? "Confira a conexão e tente novamente. Os registros existentes foram preservados."
                : "A nova estrutura registra os OKs com usuário e horário do servidor, sem alterar a homologação da migração."}
            </p>
            {schema !== "loading" && (
              <>
                <a
                  href="https://github.com/rmvitor/Implantation-WS/blob/main/docs/homologacao-implantacao.md"
                  target="_blank"
                  rel="noreferrer"
                >
                  Abrir guia e SQL de ativação
                </a>
                <button
                  className="button secondary"
                  onClick={() => setRetry((n) => n + 1)}
                >
                  Verificar novamente
                </button>
              </>
            )}
          </div>
        </div>
      )}
      {!team.online && (
        <p className="muted">
          No modo local, prepare o escopo e as respostas. Entre com sua conta no
          banco da equipe para registrar os OKs e emitir o termo.
        </p>
      )}
      {!project.entities.length ? (
        <div className="homologation-empty">
          <FileCheck2 size={32} />
          <h3>Cadastre as entidades do projeto</h3>
          <p>
            O escopo e os responsáveis são definidos separadamente para cada
            entidade.
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
          <div className="implantation-overview">
            <Field label="Entidade da implantação">
              <select
                value={selectedEntity}
                onChange={(e) => setEntity(e.target.value)}
              >
                {project.entities.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </Field>
            <div className="implantation-metric">
              <strong>
                {progress.done}/{progress.total}
              </strong>
              <span>pontos com os dois OKs</span>
            </div>
            <div className="implantation-metric">
              <strong>{progress.blockers}</strong>
              <span>impedimentos para o termo</span>
            </div>
          </div>
          {!entries.length && (
            <div className="homologation-empty">
              <CheckCheck size={32} />
              <h3>Selecione os módulos desta entidade</h3>
              <p>
                Os modelos 2026-3 contêm 94 perguntas de Compras e Contratos,
                Almoxarifado, Patrimônio e Frota. Para os demais módulos, você
                pode montar as perguntas.
              </p>
              <button
                className="button primary"
                disabled={!editable}
                onClick={() => open({ type: "scope" })}
              >
                Definir módulos contratados
              </button>
            </div>
          )}
          {entries.map((entry) => {
            const done = entry.questions.filter((q) =>
              questionReady(entry, q),
            ).length;
            return (
              <details className="implantation-module" key={entry.id} open>
                <summary>
                  <span>
                    <strong>{entry.module}</strong>
                    <small>
                      Modelo {entry.modelVersion} · {entry.responsibles.length}{" "}
                      responsável(eis)
                    </small>
                  </span>
                  <span className="implantation-count">
                    {done}/{entry.questions.length} OK
                  </span>
                </summary>
                <div className="implantation-module-actions">
                  <button
                    className="button secondary"
                    disabled={!editable || pending}
                    onClick={() => open({ type: "people", entry })}
                  >
                    <Users size={15} />
                    Responsáveis
                  </button>
                  <button
                    className="button secondary"
                    disabled={!editable || pending}
                    onClick={() => open({ type: "model", entry })}
                  >
                    <Pencil size={15} />
                    Editar perguntas
                  </button>
                </div>
                {!entry.responsibles.length && (
                  <p className="implantation-hint">
                    Cadastre nome e cargo dos responsáveis do cliente. Cada
                    ponto pode ter um ou vários responsáveis.
                  </p>
                )}
                {!entry.questions.length && (
                  <p className="implantation-hint">
                    Não foi fornecido um modelo deste módulo. Use “Editar
                    perguntas” para cadastrar o checklist contratado.
                  </p>
                )}
                <ol className="implantation-questions">
                  {entry.questions.map((q, i) => (
                    <li key={q.id}>
                      <button
                        className="implantation-question"
                        onClick={() =>
                          open({
                            type: "question",
                            entry,
                            question: q,
                            number: i + 1,
                          })
                        }
                      >
                        <span className="implantation-question-title">
                          <span className="implantation-question-number">
                            {i + 1}
                          </span>
                          <strong>{q.text}</strong>
                        </span>
                        <span className="implantation-badges">
                          <span>{ANSWERS[q.answer] || "Sem resposta"}</span>
                          <span>
                            {q.technical &&
                            q.technical.source !== "imported-unverified"
                              ? "Técnico OK"
                              : "Técnico pendente"}
                          </span>
                          <span>
                            Cliente{" "}
                            {
                              q.clients.filter(
                                (c) => c.source !== "imported-unverified",
                              ).length
                            }
                            /{q.responsibleIds.length || "—"}
                          </span>
                          {questionBlocker(q) && (
                            <span className="implantation-blocked">
                              Impede o termo
                            </span>
                          )}
                          {questionReady(entry, q) && (
                            <CheckCheck
                              size={17}
                              aria-label="Ponto homologado"
                            />
                          )}
                        </span>
                      </button>
                    </li>
                  ))}
                </ol>
              </details>
            );
          })}
          {!!entries.length && (
            <div className="implantation-term-panel">
              <div>
                <h3>
                  {term
                    ? "Termo atualizado disponível"
                    : progress.ready
                      ? "Tudo conferido para emitir o termo"
                      : "Termo aguardando os OKs"}
                </h3>
                <p>
                  {term
                    ? `Emitido por ${term.actorName} em ${when(term.at)}.`
                    : "É necessário responder todos os pontos, resolver os impedimentos e registrar o OK técnico e de todos os responsáveis selecionados."}
                </p>
                <small>
                  O aceite informado pelo cliente é registrado pela equipe. A
                  assinatura é feita no documento.
                </small>
              </div>
              <div className="implantation-document-actions">
                {term ? (
                  <>
                    <button
                      className="button primary"
                      disabled={pending}
                      onClick={() => output(printImplantationTerm, term)}
                    >
                      <Printer size={16} />
                      Imprimir / salvar PDF
                    </button>
                    <button
                      className="button secondary"
                      disabled={pending}
                      onClick={() => output(downloadImplantationTerm, term)}
                    >
                      <Download size={16} />
                      Baixar documento
                    </button>
                  </>
                ) : (
                  <button
                    className="button primary"
                    disabled={!canConfirm || !progress.ready || pending}
                    onClick={() => open({ type: "issue" })}
                  >
                    <FileCheck2 size={17} />
                    Gerar termo da entidade
                  </button>
                )}
              </div>
            </div>
          )}
          {!!terms.length && (
            <details className="implantation-archive">
              <summary>Termos emitidos · {terms.length}</summary>
              <p className="muted">
                Os documentos anteriores mantêm as perguntas, os nomes e os
                cargos da emissão.
              </p>
              {terms.map((t) => (
                <div className="implantation-archive-row" key={t.id}>
                  <div>
                    <strong>{when(t.at)}</strong>
                    <small>
                      {t.source === "imported-unverified"
                        ? "Importado · requer conferência"
                        : t.id === term?.id
                          ? "Versão atual"
                          : "Versão anterior"}{" "}
                      · {t.actorName} · {t.id.slice(0, 8)}
                    </small>
                  </div>
                  <button
                    className="button secondary"
                    disabled={pending}
                    onClick={() => output(printImplantationTerm, t)}
                  >
                    Imprimir / PDF
                  </button>
                  <button
                    className="button secondary"
                    disabled={pending}
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
          title={
            dialog.type === "scope"
              ? "Módulos contratados por entidade"
              : dialog.type === "people"
                ? `Responsáveis · ${dialog.entry.module}`
                : dialog.type === "model"
                  ? `Perguntas · ${dialog.entry.module}`
                  : dialog.type === "issue"
                    ? "Gerar termo de homologação"
                    : `Ponto ${dialog.number} · ${dialog.entry.module}`
          }
          subtitle={dialog.entry?.entity || selectedEntity}
          wide={dialog.type === "model" || dialog.type === "scope"}
          onClose={() => {
            if (pending) return false;
            setDialog(null);
          }}
          headerAction={
            dialog.type === "question" && editable ? (
              <button
                type="submit"
                form="implantation-question-form"
                className="button primary"
                disabled={pending}
                aria-label="Salvar no topo"
              >
                Salvar
              </button>
            ) : undefined
          }
        >
          {error && (
            <p role="alert" className="team-error">
              {error}
            </p>
          )}
          {dialog.type === "scope" && (
            <ScopeEditor
              project={project}
              pending={pending}
              onSave={(pairs) =>
                perform((p) => configureImplantation(p, pairs, team.actor))
              }
            />
          )}
          {dialog.type === "people" && (
            <PeopleEditor
              entry={dialog.entry}
              Field={Field}
              pending={pending}
              onSave={(people) =>
                perform((p) =>
                  saveImplantationResponsibles(
                    p,
                    dialog.entry.id,
                    people,
                    team.actor,
                  ),
                )
              }
            />
          )}
          {dialog.type === "model" && (
            <ModelEditor
              entry={dialog.entry}
              Field={Field}
              pending={pending}
              onSave={(questions) =>
                perform((p) =>
                  saveImplantationModel(
                    p,
                    dialog.entry.id,
                    questions,
                    team.actor,
                  ),
                )
              }
            />
          )}
          {dialog.type === "question" && (
            <QuestionEditor
              entry={dialog.entry}
              question={dialog.question}
              Field={Field}
              editable={editable}
              canConfirm={canConfirm}
              actor={team.actor}
              pending={pending}
              onSave={(draft) =>
                perform((p) =>
                  saveImplantationQuestion(
                    p,
                    dialog.entry.id,
                    dialog.question.id,
                    draft,
                    team.actor,
                  ),
                )
              }
            />
          )}
          {dialog.type === "issue" && (
            <>
              <p>
                O termo de <strong>{selectedEntity}</strong> incluirá os módulos
                contratados, todas as perguntas e respostas, os OKs e os nomes e
                cargos dos responsáveis para assinatura. Nenhuma assinatura é
                feita automaticamente.
              </p>
              <p>
                Alterações posteriores exigirão nova conferência e poderão gerar
                uma nova versão do termo.
              </p>
              <button
                className="button primary full-button"
                disabled={pending}
                onClick={() =>
                  perform((p) =>
                    issueImplantationTerm(p, selectedEntity, team.actor),
                  )
                }
              >
                {pending ? "Gerando…" : "Confirmar emissão"}
              </button>
            </>
          )}
        </Modal>
      )}
    </section>
  );
}
function ScopeEditor({ project, pending, onSave }) {
  const [selected, setSelected] = useState(
    (project.implantation?.entries || [])
      .filter((e) => e.included)
      .map((e) => e.id),
  );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(
          project.entities.flatMap((entity) =>
            IMPLANTATION_MODULES.filter((module) =>
              selected.includes(implantationId(module, entity)),
            ).map((module) => ({ module, entity })),
          ),
        );
      }}
    >
      <p>
        Marque apenas o que foi contratado. Desmarcar um módulo retira-o do
        termo e preserva suas respostas para uma retomada.
      </p>
      <div className="implantation-scope">
        {project.entities.map((entity) => (
          <fieldset key={entity}>
            <legend>{entity}</legend>
            {IMPLANTATION_MODULES.map((module) => {
              const id = implantationId(module, entity);
              return (
                <label key={module}>
                  <input
                    type="checkbox"
                    checked={selected.includes(id)}
                    disabled={pending}
                    onChange={(e) =>
                      setSelected((old) =>
                        e.target.checked
                          ? [...old, id]
                          : old.filter((v) => v !== id),
                      )
                    }
                    aria-label={`${module} — ${entity}`}
                  />
                  <span>
                    {module}
                    {!implantationTemplate(module) && (
                      <small>
                        Sem modelo enviado · perguntas personalizadas
                      </small>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
        ))}
      </div>
      <button className="button primary full-button" disabled={pending}>
        Salvar escopo da implantação
      </button>
    </form>
  );
}
function PeopleEditor({ entry, Field, pending, onSave }) {
  const [people, setPeople] = useState(structuredClone(entry.responsibles));
  const update = (id, key, value) =>
    setPeople((list) =>
      list.map((p) => (p.id === id ? { ...p, [key]: value } : p)),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(people);
      }}
    >
      <p>
        Cadastre todos os responsáveis que participarão dos pontos deste módulo.
        Alterar nome, cargo ou e-mail retira os aceites anteriores da pessoa.
      </p>
      {people.map((r, i) => (
        <fieldset className="implantation-person" key={r.id} disabled={pending}>
          <legend>Responsável {i + 1}</legend>
          <Field label={`Nome do responsável ${i + 1}`}>
            <input
              required
              value={r.name}
              onChange={(e) => update(r.id, "name", e.target.value)}
            />
          </Field>
          <Field label={`Cargo do responsável ${i + 1}`}>
            <input
              required
              value={r.role}
              onChange={(e) => update(r.id, "role", e.target.value)}
            />
          </Field>
          <Field label={`E-mail do responsável ${i + 1} (opcional)`}>
            <input
              type="email"
              value={r.email}
              onChange={(e) => update(r.id, "email", e.target.value)}
            />
          </Field>
          <button
            type="button"
            className="text-danger"
            onClick={() =>
              setPeople((list) => list.filter((p) => p.id !== r.id))
            }
          >
            Excluir responsável {i + 1}
          </button>
        </fieldset>
      ))}
      <div className="implantation-editor-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() =>
            setPeople((list) => [
              ...list,
              { id: crypto.randomUUID(), name: "", role: "", email: "" },
            ])
          }
        >
          <Plus size={16} />
          Adicionar responsável
        </button>
        <button className="button primary" disabled={pending}>
          Salvar responsáveis
        </button>
      </div>
    </form>
  );
}
function ModelEditor({ entry, Field, pending, onSave }) {
  const [questions, setQuestions] = useState(structuredClone(entry.questions));
  const update = (id, values) =>
    setQuestions((list) =>
      list.map((q) => (q.id === id ? { ...q, ...values } : q)),
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        onSave(questions);
      }}
    >
      <div className="info-box">
        <p>
          O padrão fica preservado no sistema. Esta edição vale somente para{" "}
          <strong>
            {entry.module} · {entry.entity}
          </strong>
          . Perguntas alteradas perdem suas respostas e os dois OKs. Escolhas do
          cliente permitem Sim ou Não com justificativa; falta de capacitação e
          impedimentos bloqueiam o termo.
        </p>
      </div>
      {questions.map((q, i) => (
        <fieldset
          className="implantation-model-question"
          key={q.id}
          disabled={pending}
        >
          <legend>Pergunta {i + 1}</legend>
          <Field label={`Texto da pergunta ${i + 1}`}>
            <textarea
              required
              rows={3}
              value={q.text}
              onChange={(e) => update(q.id, { text: e.target.value })}
            />
          </Field>
          <Field label={`Orientação da pergunta ${i + 1}`}>
            <input
              value={q.help || ""}
              onChange={(e) => update(q.id, { help: e.target.value })}
            />
          </Field>
          <Field label={`Tipo da pergunta ${i + 1}`}>
            <select
              value={q.kind}
              onChange={(e) =>
                update(q.id, {
                  kind: e.target.value,
                  justifyWhen: e.target.value === "blocking" ? "yes" : "no",
                })
              }
            >
              <option value="capability">
                Capacitação / apresentação — “Não” bloqueia o termo
              </option>
              <option value="choice">
                Escolha do cliente — Sim ou Não são válidos
              </option>
              <option value="blocking">
                Existência de impedimento — “Sim” bloqueia o termo
              </option>
            </select>
          </Field>
          <Field label={`Exigir justificativa na pergunta ${i + 1}`}>
            <select
              value={q.justifyWhen}
              onChange={(e) => update(q.id, { justifyWhen: e.target.value })}
            >
              <option value="no">Quando responder Não</option>
              <option value="yes">Quando responder Sim</option>
            </select>
          </Field>
          <div className="implantation-editor-actions">
            <button
              type="button"
              className="button secondary"
              disabled={i === 0}
              onClick={() =>
                setQuestions((list) => {
                  const next = [...list];
                  [next[i - 1], next[i]] = [next[i], next[i - 1]];
                  return next;
                })
              }
            >
              Mover acima
            </button>
            <button
              type="button"
              className="text-danger"
              onClick={() =>
                setQuestions((list) => list.filter((p) => p.id !== q.id))
              }
            >
              Excluir pergunta {i + 1}
            </button>
          </div>
        </fieldset>
      ))}
      <div className="implantation-editor-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() =>
            setQuestions((list) => [
              ...list,
              {
                id: crypto.randomUUID(),
                text: "",
                help: "",
                kind: "capability",
                justifyWhen: "no",
              },
            ])
          }
        >
          <Plus size={16} />
          Adicionar pergunta
        </button>
        {implantationTemplate(entry.module) && (
          <button
            type="button"
            className="button secondary"
            disabled={pending}
            onClick={() => setQuestions(defaultQuestions(entry.module))}
          >
            Carregar perguntas padrão
          </button>
        )}
        <button className="button primary" disabled={pending}>
          Salvar perguntas
        </button>
      </div>
    </form>
  );
}
function QuestionEditor({
  entry,
  question: q,
  Field,
  editable,
  canConfirm,
  actor,
  pending,
  onSave,
}) {
  const [draft, setDraft] = useState({
    answer: q.answer,
    notes: q.notes,
    responsibleIds: [...q.responsibleIds],
    technical: !!q.technical && q.technical.source !== "imported-unverified",
    clientIds: q.clients
      .filter((c) => c.source !== "imported-unverified")
      .map((c) => c.id),
  });
  const change = (values) =>
    setDraft((d) => ({ ...d, ...values, technical: false, clientIds: [] }));
  const needsJustification =
    draft.answer === "na" || draft.answer === q.justifyWhen;
  return (
    <form
      id="implantation-question-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <p className="implantation-question-text">{q.text}</p>
      {q.help && <p className="muted">{q.help}</p>}
      {q.condition && <p className="muted">{q.condition}</p>}
      <fieldset
        className="implantation-response"
        disabled={!editable || pending}
      >
        <Field label="Resposta do checklist">
          <select
            value={draft.answer}
            onChange={(e) => change({ answer: e.target.value })}
          >
            <option value="">Ainda não respondido</option>
            {Object.entries(ANSWERS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Field>
        <Field
          label={
            needsJustification
              ? "Justificativa (obrigatória)"
              : "Observações / evidências"
          }
        >
          <textarea
            required={needsJustification}
            rows={4}
            value={draft.notes}
            onChange={(e) => change({ notes: e.target.value })}
          />
        </Field>
        <fieldset className="implantation-point-people">
          <legend>Responsáveis do cliente neste ponto</legend>
          {entry.responsibles.length ? (
            entry.responsibles.map((r) => (
              <label key={r.id}>
                <input
                  type="checkbox"
                  checked={draft.responsibleIds.includes(r.id)}
                  onChange={(e) =>
                    change({
                      responsibleIds: e.target.checked
                        ? [...draft.responsibleIds, r.id]
                        : draft.responsibleIds.filter((id) => id !== r.id),
                    })
                  }
                />
                <span>
                  {r.name}
                  <small>{r.role}</small>
                </span>
              </label>
            ))
          ) : (
            <p>
              Cadastre os responsáveis do módulo antes de registrar o aceite do
              cliente.
            </p>
          )}
        </fieldset>
      </fieldset>
      <div className="implantation-approval">
        <h3>1. Apresentação pelo técnico</h3>
        <label>
          <input
            type="checkbox"
            disabled={
              !canConfirm ||
              pending ||
              !draft.answer ||
              (needsJustification && !draft.notes.trim())
            }
            checked={draft.technical}
            onChange={(e) =>
              setDraft((d) => ({ ...d, technical: e.target.checked }))
            }
          />
          <span>Confirmo que apresentei este ponto ao cliente</span>
        </label>
        <small>
          {q.technical && draft.technical
            ? `${q.technical.by} · ${when(q.technical.at)}`
            : actor
              ? `O OK será registrado com sua conta: ${actor.name}.`
              : "Entre com sua conta para registrar o OK técnico."}
        </small>
      </div>
      <div className="implantation-approval">
        <h3>2. Aceite informado pelo cliente</h3>
        <p>
          Marque somente após o responsável confirmar durante a reunião. O
          registro fica associado à sua conta; a assinatura será feita no termo.
        </p>
        {draft.responsibleIds.map((id) => {
          const r = entry.responsibles.find((person) => person.id === id);
          return (
            r && (
              <label key={id}>
                <input
                  type="checkbox"
                  disabled={
                    !canConfirm ||
                    pending ||
                    !draft.answer ||
                    (needsJustification && !draft.notes.trim())
                  }
                  checked={draft.clientIds.includes(id)}
                  onChange={(e) =>
                    setDraft((d) => ({
                      ...d,
                      clientIds: e.target.checked
                        ? [...d.clientIds, id]
                        : d.clientIds.filter((x) => x !== id),
                    }))
                  }
                />
                <span>
                  Registrar aceite de {r.name}
                  <small>{r.role}</small>
                </span>
              </label>
            )
          );
        })}
      </div>
      {questionBlocker({ ...q, answer: draft.answer }) && (
        <p className="implantation-warning" role="status">
          Esta resposta impede a emissão do termo. Registre a pendência e
          resolva antes de concluir a homologação.
        </p>
      )}
      {editable && (
        <button className="button primary full-button" disabled={pending}>
          {pending ? "Salvando…" : "Salvar ponto"}
        </button>
      )}
    </form>
  );
}
