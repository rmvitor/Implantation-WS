import React, { useState } from "react";
import { Plus } from "lucide-react";
import { defaultQuestions, implantationTemplate } from "./implantation.js";
export function QuestionModelEditor({ entry, Field, pending, onSave }) {
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
          Modelo global de <strong>{entry.module}</strong>. As alterações serão
          usadas nos novos relatórios. Relatórios existentes só mudam quando o
          Master aplica explicitamente o modelo atualizado.
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

export function ResponsibleEditor({ entry, Field, pending, onSave, onInvite }) {
  const [people, setPeople] = useState(() =>
    structuredClone(entry.responsibles),
  );
  const [active, setActive] = useState(entry.responsibles[0]?.id || "");
  const [removing, setRemoving] = useState(false);
  const [message, setMessage] = useState("");
  const current = people.find((r) => r.id === active);
  const update = (key, value) =>
    setPeople((list) =>
      list.map((r) => (r.id === active ? { ...r, [key]: value } : r)),
    );
  const save = async (list = people) => {
    const invalid = list.find((r) => !r.name.trim() || !r.role.trim());
    if (invalid) {
      setActive(invalid.id);
      setMessage("Preencha nome e cargo antes de salvar os responsáveis.");
      return false;
    }
    setMessage("");
    if (await onSave(list)) {
      setPeople(list);
      return true;
    }
    return false;
  };
  if (removing && current)
    return (
      <>
        <p>
          Excluir <strong>{current.name || "este responsável"}</strong> retira
          os aceites dessa pessoa dos pontos do módulo. Os termos anteriores
          permanecem no histórico.
        </p>
        <div className="implantation-editor-actions">
          <button
            className="button secondary"
            disabled={pending}
            onClick={() => setRemoving(false)}
          >
            Cancelar
          </button>
          <button
            className="button primary"
            disabled={pending}
            onClick={async () => {
              const next = people.filter((r) => r.id !== active);
              if (await save(next)) {
                setActive(next[0]?.id || "");
                setRemoving(false);
              }
            }}
          >
            Confirmar exclusão do responsável
          </button>
        </div>
      </>
    );
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        save();
      }}
    >
      <p>
        Use uma aba para cada responsável. O nome e o cargo vão para o relatório
        e para o termo.
      </p>
      {message && (
        <p role="alert" className="team-error">
          {message}
        </p>
      )}
      <div
        className="acceptance-tabs"
        role="tablist"
        aria-label="Responsáveis do módulo"
      >
        {people.map((r, i) => (
          <button
            type="button"
            role="tab"
            aria-selected={r.id === active}
            className={r.id === active ? "active" : ""}
            key={r.id}
            onClick={() => {
              setActive(r.id);
              setMessage("");
            }}
          >
            {r.name || `Novo responsável ${i + 1}`}
          </button>
        ))}
      </div>
      {current ? (
        <fieldset className="implantation-person" disabled={pending}>
          <legend>Dados do responsável</legend>
          <Field label="Nome do responsável">
            <input
              value={current.name}
              required
              onChange={(e) => update("name", e.target.value)}
            />
          </Field>
          <Field label="Cargo do responsável">
            <input
              value={current.role}
              required
              onChange={(e) => update("role", e.target.value)}
            />
          </Field>
          <Field label="E-mail do responsável (opcional)">
            <input
              type="email"
              value={current.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </Field>
          {onInvite && (
            <button
              type="button"
              className="button secondary"
              disabled={pending}
              onClick={async () => {
                if (!current.email.trim()) {
                  setMessage(
                    "Preencha o e-mail do responsável para enviar o acesso externo.",
                  );
                  return;
                }
                if (await save()) onInvite(current.id);
              }}
            >
              Acesso externo do cliente
            </button>
          )}
          <button
            type="button"
            className="button secondary danger-button"
            onClick={() => setRemoving(true)}
          >
            Excluir responsável
          </button>
        </fieldset>
      ) : (
        <p className="muted">Nenhum responsável cadastrado neste módulo.</p>
      )}
      <div className="implantation-editor-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pending}
          onClick={() => {
            const next = {
              id: crypto.randomUUID(),
              name: "",
              role: "",
              email: "",
            };
            setPeople((v) => [...v, next]);
            setActive(next.id);
            setMessage("");
          }}
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
export function ModelManager({ catalog, Field, pending, onSave }) {
  const [module, setModule] = useState(
    catalog[0]?.module || "Compras e Contratos",
  );
  const model = catalog.find((m) => m.module === module);
  const [version, setVersion] = useState(model?.version || "2026-3");
  return (
    <>
      <p>
        Somente o Master altera os modelos globais. Relatórios já preenchidos
        continuam com sua cópia das perguntas até uma atualização explícita.
      </p>
      <div
        className="acceptance-tabs"
        role="tablist"
        aria-label="Modelos globais por módulo"
      >
        {catalog.map((m) => (
          <button
            type="button"
            role="tab"
            aria-selected={m.module === module}
            className={m.module === module ? "active" : ""}
            disabled={pending}
            key={m.module}
            onClick={() => {
              setModule(m.module);
              setVersion(m.version);
            }}
          >
            {m.module}
            <small>{m.questions.length} perguntas</small>
          </button>
        ))}
      </div>
      {model && (
        <>
          <Field label="Versão do modelo global">
            <input
              value={version}
              disabled={pending}
              onChange={(e) => setVersion(e.target.value)}
            />
          </Field>
          <p className="muted">
            Revisão {model.revision}. Um modelo sem perguntas fica indisponível
            para novas contratações.
          </p>
          <QuestionModelEditor
            key={`${model.module}:${model.revision}`}
            entry={{
              ...model,
              entity: "Modelo global",
              questions: model.questions,
            }}
            Field={Field}
            pending={pending}
            onSave={(questions) => onSave(model, questions, version)}
          />
        </>
      )}
    </>
  );
}
