import React, { useEffect, useRef, useState } from "react";
import QRCode from "qrcode";
import { Plus, RefreshCw, Printer, Link as LinkIcon } from "lucide-react";
import { useTeam } from "./Team.jsx";
import {
  attendanceUrl,
  attendanceDate,
  newAttendance,
  attendanceError,
  attendanceGuide,
} from "./attendance.js";
import { printAttendance } from "./attendance-print.js";
import { appointmentDuration } from "./appointments.js";
import "./attendance.css";

const rpc = async (client, name, params) => {
  const r = await client.rpc(name, params);
  if (r.error) throw r.error;
  return r.data;
};
const localInstant = (date) =>
  new Date(date.getTime() - date.getTimezoneOffset() * 60000)
    .toISOString()
    .slice(0, 16);
const when = (s) => (s ? new Date(s).toLocaleString("pt-BR") : "");
export function Attendance({ project, readOnly, Modal, onPending }) {
  const team = useTeam();
  const [lists, setLists] = useState([]),
    [selected, setSelected] = useState(""),
    [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [conflict, setConflict] = useState(false);
  const [dialog, setDialog] = useState(null),
    [share, setShare] = useState(null),
    [search, setSearch] = useState("");
  const epoch = useRef(0),
    working = useRef(false),
    mounted = useRef(true),
    selectedRef = useRef("");
  selectedRef.current = selected;
  const editable = !readOnly && project.status !== "closed";
  const load = async (id = selectedRef.current) => {
    const ticket = ++epoch.current;
    try {
      const rows = await rpc(team.client, "implanta_attendance_lists", {
        p_project: project.id,
      });
      const next = rows.some((l) => l.id === id) ? id : rows[0]?.id || "";
      const value = next
        ? await rpc(team.client, "implanta_attendance_read", { p_id: next })
        : null;
      if (!mounted.current || ticket !== epoch.current) return;
      setLists(rows);
      setSelected(next);
      selectedRef.current = next;
      setDetail(value);
      setLoadError("");
    } catch (e) {
      if (!mounted.current || ticket !== epoch.current) return;
      setLoadError(attendanceError(e));
      if (e.code === "42501") {
        setLists([]);
        setDetail(null);
      }
    } finally {
      if (mounted.current && ticket === epoch.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    if (!team.online) {
      setLoading(false);
      return;
    }
    load();
    const refresh = () => {
      if (!working.current && document.visibilityState !== "hidden") load();
    };
    const timer = setInterval(refresh, 5000);
    window.addEventListener("focus", refresh);
    return () => {
      mounted.current = false;
      onPending?.(false);
      ++epoch.current;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
    };
  }, [team.client, project.id]);
  useEffect(() => {
    if (!busy) return;
    const prevent = (event) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  const action = async (fn, nextId = selected, close = true) => {
    if (working.current) return false;
    working.current = true;
    onPending?.(true);
    ++epoch.current;
    setBusy(true);
    setError("");
    setConflict(false);
    try {
      await fn();
      await load(nextId);
      if (close) setDialog(null);
      return true;
    } catch (e) {
      setError(attendanceError(e));
      setConflict(e.code === "40001");
      return false;
    } finally {
      working.current = false;
      onPending?.(false);
      if (mounted.current) setBusy(false);
    }
  };
  const close = () => {
    if (working.current) return false;
    setDialog(null);
    setError("");
    setConflict(false);
  };
  const print = async ({ blank = false, full = false } = {}) =>
    action(
      async () => {
        const fresh = await rpc(team.client, "implanta_attendance_read", {
          p_id: selected,
          p_full_cpf: full,
        });
        await printAttendance(fresh.list, fresh.people, { blank });
      },
      selected,
      false,
    );
  const reloadDraft = () =>
    action(
      async () => {
        const fresh = await rpc(team.client, "implanta_attendance_read", {
          p_id: selected,
        });
        if (dialog?.type === "list")
          setDialog((d) => ({
            ...d,
            entry: fresh.list,
            initial: fresh.list.data,
            generation: (d.generation || 0) + 1,
          }));
        if (dialog?.type === "person") {
          const person = fresh.people.find((p) => p.id === dialog.person?.id);
          if (!person)
            throw new Error(
              "Este participante foi removido. Feche a edição e confira a lista.",
            );
          setDialog((d) => ({
            ...d,
            person,
            initial: { ...person, cpf: "" },
            generation: (d.generation || 0) + 1,
          }));
        }
      },
      selected,
      false,
    );
  if (!team.online)
    return (
      <section className="attendance-panel">
        <h2>Listas de presença</h2>
        <p>
          Conecte ao banco da equipe para cadastrar listas e receber as
          participações por link ou QR code.
        </p>
      </section>
    );
  const current = detail?.list;
  const people = (detail?.people || []).filter((p) =>
    [p.name, p.sector, p.email].some((s) =>
      s.toLocaleLowerCase("pt-BR").includes(search.toLocaleLowerCase("pt-BR")),
    ),
  );
  const failure = (error || loadError) && (
    <div className="team-error" role="alert">
      <p>
        {error || loadError}{" "}
        <a href={attendanceGuide} target="_blank" rel="noreferrer">
          Guia de ativação
        </a>
      </p>
      {conflict &&
        ["list", "person"].includes(dialog?.type) &&
        (dialog.entry || dialog.person) && (
          <details>
            <summary>Recarregar a edição</summary>
            <p>Isso descarta o rascunho e carrega os dados atuais do banco.</p>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={reloadDraft}
            >
              Descartar rascunho e recarregar
            </button>
          </details>
        )}
    </div>
  );
  return (
    <section className="attendance-area" aria-label="Listas de presença">
      <div className="attendance-heading">
        <div>
          <h2>Listas de presença</h2>
          <p>
            Treinamentos presenciais ou online, com vínculo opcional à
            capacitação.
          </p>
        </div>
        <div className="attendance-actions">
          <button
            className="button secondary"
            disabled={busy}
            onClick={() => load()}
          >
            <RefreshCw size={15} /> Atualizar
          </button>
          <button
            className="button primary"
            disabled={!editable || busy}
            onClick={() => {
              setError("");
              setDialog({
                type: "list",
                initial: newAttendance(project, team.actor),
              });
            }}
          >
            <Plus size={15} /> Nova lista
          </button>
        </div>
      </div>
      {!dialog && failure}
      {loading && <p role="status">Carregando listas…</p>}
      {!loading && !lists.length && !error && !loadError && (
        <p className="attendance-empty">
          Nenhuma lista de presença. Crie uma lista para começar ou imprimir uma
          folha em branco.
        </p>
      )}
      {!!lists.length && (
        <div className="attendance-layout">
          <nav className="attendance-list-nav" aria-label="Listas do município">
            {lists.map((l) => (
              <button
                key={l.id}
                aria-current={selected === l.id ? "true" : undefined}
                disabled={busy}
                onClick={() => {
                  selectedRef.current = l.id;
                  setSelected(l.id);
                  setDetail(null);
                  setLoading(true);
                  setSearch("");
                  setError("");
                  load(l.id);
                }}
              >
                <strong>{l.data.title}</strong>
                <span>
                  {l.data.entity} · {attendanceDate(l.data.date)}
                </span>
                <small>
                  {l.count} participante(s) ·{" "}
                  {l.signup_open && new Date(l.expires_at) > new Date()
                    ? "Recebendo presenças"
                    : "Link encerrado"}
                </small>
              </button>
            ))}
          </nav>
          {current && (
            <article className="attendance-panel">
              <h3>{current.data.title}</h3>
              <p>
                {current.data.entity} · {attendanceDate(current.data.date)}
                <br />
                {current.data.module}{" "}
                {current.data.submodules && `· ${current.data.submodules}`}
                <br />
                Instrutor: {current.data.instructor} · Carga horária:{" "}
                {current.data.hours || "Não informada"}
              </p>
              {current.data.trainingId && (
                <p className="attendance-status">
                  Vinculada a:{" "}
                  {project.trainings.find(
                    (t) => t.id === current.data.trainingId,
                  )?.title || "treinamento removido (lista preservada)"}
                </p>
              )}
              <div className="attendance-actions">
                <button
                  className="button primary"
                  disabled={!editable || busy}
                  onClick={() => {
                    setError("");
                    setDialog({
                      type: "person",
                      initial: {
                        name: "",
                        cpf: "",
                        sector: "",
                        email: "",
                        confirmed: false,
                      },
                    });
                  }}
                >
                  <Plus size={15} /> Participante
                </button>
                <button
                  className="button secondary"
                  disabled={!editable || busy}
                  onClick={() => {
                    setError("");
                    setDialog({ type: "share" });
                  }}
                >
                  <LinkIcon size={15} /> Link e QR code
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => print()}
                >
                  <Printer size={15} /> Imprimir lista
                </button>
                <button
                  className="button secondary"
                  disabled={busy}
                  onClick={() => print({ blank: true })}
                >
                  Folha em branco
                </button>
                <button
                  className="button secondary"
                  disabled={!editable || busy}
                  onClick={() => {
                    setError("");
                    setDialog({
                      type: "list",
                      entry: current,
                      initial: current.data,
                    });
                  }}
                >
                  Editar dados
                </button>
                <button
                  className="button secondary danger-text"
                  disabled={!editable || busy}
                  onClick={() => {
                    setError("");
                    setDialog({ type: "deleteList" });
                  }}
                >
                  Excluir lista
                </button>
              </div>
              {team.isMaster && (
                <details className="attendance-audit">
                  <summary>Impressão restrita</summary>
                  <p>
                    Inclui CPF completo. Guarde o documento em local protegido e
                    compartilhe somente com quem precisa desses dados.
                  </p>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => print({ full: true })}
                  >
                    Imprimir com CPF completo
                  </button>
                </details>
              )}
              <p className="attendance-status" role="status">
                {detail.people.length} participante(s) · Atualização automática
                a cada 5 segundos. CPF opcional e mascarado.
              </p>
              <label className="search-input">
                <input
                  aria-label="Buscar participante"
                  placeholder="Buscar nome, setor ou e-mail…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="attendance-table-wrap">
                <table className="attendance-table">
                  <thead>
                    <tr>
                      <th>Participante</th>
                      <th>Setor / e-mail</th>
                      <th>Presença</th>
                      <th>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {people.map((p) => (
                      <tr key={p.id}>
                        <td data-label="Participante">
                          <strong>{p.name}</strong>
                          <small>{p.cpf || "CPF não informado"}</small>
                        </td>
                        <td data-label="Setor / e-mail">
                          {p.sector || "—"}
                          <small>{p.email}</small>
                        </td>
                        <td data-label="Presença">
                          {p.confirmed ? "Confirmada" : "A confirmar"}
                          <small>
                            {p.origin === "public"
                              ? "Autodeclaração por formulário"
                              : "Registro manual da equipe"}
                            {p.confirmed_at && ` · ${when(p.confirmed_at)}`}
                          </small>
                        </td>
                        <td data-label="Ações">
                          <div className="attendance-actions">
                            <button
                              className="button secondary"
                              disabled={!editable || busy}
                              onClick={() => {
                                setError("");
                                setDialog({
                                  type: "person",
                                  person: p,
                                  initial: { ...p, cpf: "" },
                                });
                              }}
                            >
                              Editar
                            </button>
                            <button
                              className="button secondary danger-text"
                              disabled={!editable || busy}
                              onClick={() => {
                                setError("");
                                setDialog({ type: "deletePerson", person: p });
                              }}
                            >
                              Excluir
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!people.length && <p>Nenhum participante encontrado.</p>}
              <details className="attendance-audit">
                <summary>Histórico da lista</summary>
                <ul>
                  {detail.audit.map((a, i) => (
                    <li key={i}>
                      {when(a.at)} · {a.actor_name || "Participante externo"}{" "}
                      {a.participant_name && `· ${a.participant_name}`} ·{" "}
                      {{
                        list_created: "Lista criada",
                        list_updated: "Dados da lista alterados",
                        link_generate: "Link gerado ou renovado",
                        link_close: "Link encerrado",
                        participant_created:
                          "Participante incluído manualmente",
                        participant_updated: "Participante alterado",
                        participant_deleted: "Participante excluído",
                        participant_self_registered:
                          "Participação enviada pelo formulário",
                        full_cpf_report:
                          "Relatório com CPF completo consultado pelo Master",
                      }[a.action] || a.action}
                    </li>
                  ))}
                </ul>
                <p className="attendance-status">
                  Últimos 100 registros. Datas e autoria são gravadas pelo
                  banco.
                </p>
              </details>
            </article>
          )}
        </div>
      )}
      {dialog?.type === "list" && (
        <ListEditor
          key={`${dialog.entry?.id || "new"}:${dialog.generation || 0}`}
          Modal={Modal}
          project={project}
          initial={dialog.initial}
          busy={busy}
          failure={failure}
          onClose={close}
          onSave={(data) => {
            const id = dialog.entry?.id || crypto.randomUUID();
            return action(
              () =>
                rpc(team.client, "implanta_attendance_save", {
                  p_project: project.id,
                  p_id: id,
                  p_revision: dialog.entry?.revision || 0,
                  p_data: data,
                }),
              id,
            );
          }}
        />
      )}
      {dialog?.type === "person" && (
        <PersonEditor
          key={`${dialog.person?.id || "new"}:${dialog.generation || 0}`}
          Modal={Modal}
          initial={dialog.initial}
          person={dialog.person}
          busy={busy}
          failure={failure}
          onClose={close}
          onSave={(data, clear) =>
            action(() =>
              rpc(team.client, "implanta_attendance_person_save", {
                p_list: selected,
                p_id: dialog.person?.id || crypto.randomUUID(),
                p_revision: dialog.person?.revision || 0,
                p_data: data,
                p_clear_cpf: clear,
              }),
            )
          }
        />
      )}
      {dialog?.type === "share" && current && (
        <ShareEditor
          Modal={Modal}
          entry={current}
          share={share?.id === selected ? share : null}
          busy={busy}
          failure={failure}
          onClose={close}
          onGenerate={(expires) =>
            action(
              async () => {
                const data = await rpc(
                  team.client,
                  "implanta_attendance_link",
                  { p_id: selected, p_action: "generate", p_expires: expires },
                );
                setShare({ id: selected, url: attendanceUrl(data.token) });
              },
              selected,
              false,
            )
          }
          onStop={() =>
            action(
              async () => {
                await rpc(team.client, "implanta_attendance_link", {
                  p_id: selected,
                  p_action: "close",
                });
                setShare(null);
              },
              selected,
              false,
            )
          }
        />
      )}
      {["deletePerson", "deleteList"].includes(dialog?.type) && (
        <Modal
          title={
            dialog.type === "deleteList"
              ? "Excluir lista de presença?"
              : "Excluir participante?"
          }
          onClose={close}
        >
          <p>
            {dialog.type === "deleteList"
              ? "Isso exclui a lista, todas as participações e seu histórico do banco, e invalida o link e o QR code. Essa ação não pode ser desfeita."
              : `O registro de ${dialog.person.name} será excluído da lista. Essa ação não pode ser desfeita.`}
          </p>
          {failure}
          <div className="attendance-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={close}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                action(() =>
                  rpc(team.client, "implanta_attendance_delete", {
                    p_list: selected,
                    p_person: dialog.person?.id || null,
                    p_revision: dialog.person?.revision || current.revision,
                  }),
                )
              }
            >
              {busy ? "Excluindo…" : "Excluir"}
            </button>
          </div>
        </Modal>
      )}
    </section>
  );
}
function ListEditor({
  Modal,
  project,
  initial,
  busy,
  failure,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(initial);
  const patch = (key, value) => setDraft((d) => ({ ...d, [key]: value }));
  return (
    <Modal
      title={
        initial.title ? "Dados da lista de presença" : "Nova lista de presença"
      }
      onClose={onClose}
    >
      <form
        className="attendance-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft);
        }}
      >
        <fieldset className="readonly-fields" disabled={busy}>
          <div className="attendance-form">
            <label>
              Vincular a um treinamento (opcional)
              <select
                value={draft.trainingId || ""}
                onChange={(e) => {
                  const t = project.trainings.find(
                    (t) => t.id === e.target.value,
                  );
                  setDraft((d) =>
                    t
                      ? {
                          ...d,
                          trainingId: t.id,
                          title: t.title,
                          entity: t.entity || d.entity,
                          date: t.date,
                          instructor: t.owner || d.instructor,
                          hours: appointmentDuration(t),
                        }
                      : { ...d, trainingId: "" },
                  );
                }}
              >
                <option value="">
                  Sem vínculo — presencial ou independente
                </option>
                {draft.trainingId &&
                  !project.trainings.some((t) => t.id === draft.trainingId) && (
                    <option value={draft.trainingId}>
                      Treinamento removido — desvincule para salvar
                    </option>
                  )}
                {project.trainings.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.title} · {attendanceDate(t.date)}
                  </option>
                ))}
              </select>
            </label>
            <div className="attendance-fields">
              {[
                ["title", "Título do treinamento *"],
                ["entity", "Entidade *"],
                ["city", "Cidade"],
                ["state", "UF"],
                ["system", "Sistema"],
                ["module", "Módulo"],
                ["submodules", "Submódulos"],
                ["instructor", "Instrutor *"],
                ["hours", "Carga horária"],
                ["date", "Data *"],
              ].map(([key, label]) => (
                <label key={key}>
                  {label}
                  <input
                    type={key === "date" ? "date" : "text"}
                    required={[
                      "title",
                      "entity",
                      "instructor",
                      "date",
                    ].includes(key)}
                    maxLength={key === "state" ? 2 : 500}
                    value={draft[key]}
                    onChange={(e) => patch(key, e.target.value)}
                    list={key === "entity" ? "attendance-entities" : undefined}
                  />
                </label>
              ))}
            </div>
            <datalist id="attendance-entities">
              {project.entities.map((entity) => (
                <option key={entity} value={entity} />
              ))}
            </datalist>
            <p>
              Os dados da lista são independentes: vincular um treinamento
              preenche os campos, sem alterar o agendamento original.
            </p>
          </div>
        </fieldset>
        {failure}
        <div className="attendance-actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar lista"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
export function ParticipantFields({ draft, onChange, editing = false }) {
  return (
    <>
      {[
        ["name", "Nome completo *", "text"],
        [
          "cpf",
          editing
            ? "Novo CPF (opcional; vazio mantém o atual)"
            : "CPF (opcional)",
          "text",
        ],
        ["sector", "Setor (opcional)", "text"],
        ["email", "E-mail (opcional)", "email"],
      ].map(([key, label, type]) => (
        <label key={key}>
          {label}
          <input
            type={type}
            name={key}
            required={key === "name"}
            minLength={key === "name" ? 2 : undefined}
            maxLength={key === "cpf" ? 14 : key === "email" ? 254 : 200}
            autoComplete={
              key === "name" ? "name" : key === "email" ? "email" : "off"
            }
            inputMode={key === "cpf" ? "numeric" : undefined}
            value={draft[key]}
            onChange={(e) => onChange(key, e.target.value)}
          />
        </label>
      ))}
    </>
  );
}
function PersonEditor({
  Modal,
  initial,
  person,
  busy,
  failure,
  onClose,
  onSave,
}) {
  const [draft, setDraft] = useState(initial),
    [clear, setClear] = useState(false);
  return (
    <Modal
      title={person ? "Editar participante" : "Adicionar participante"}
      onClose={onClose}
    >
      <form
        className="attendance-form"
        onSubmit={(e) => {
          e.preventDefault();
          onSave(draft, clear);
        }}
      >
        <fieldset disabled={busy} className="readonly-fields">
          <div className="attendance-form">
            <ParticipantFields
              draft={draft}
              onChange={(key, value) =>
                setDraft((d) => ({ ...d, [key]: value }))
              }
              editing={!!person}
            />
            {person?.hasCpf && (
              <label className="attendance-check">
                <input
                  type="checkbox"
                  checked={clear}
                  onChange={(e) => setClear(e.target.checked)}
                />
                Remover CPF existente ({person.cpf})
              </label>
            )}
            <label className="attendance-check">
              <input
                type="checkbox"
                checked={draft.confirmed}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, confirmed: e.target.checked }))
                }
              />
              Confirmar participação informada à equipe
            </label>
            <p>
              Este registro será identificado como inclusão manual pelo seu
              usuário. A assinatura fica no relatório impresso.
            </p>
          </div>
        </fieldset>
        {failure}
        <div className="attendance-actions">
          <button className="button primary" disabled={busy}>
            {busy ? "Salvando…" : "Salvar participante"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={onClose}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
function ShareEditor({
  Modal,
  entry,
  share,
  busy,
  failure,
  onClose,
  onGenerate,
  onStop,
}) {
  const [expires, setExpires] = useState(() =>
      localInstant(new Date(Date.now() + 7 * 86400000)),
    ),
    [qr, setQr] = useState(""),
    [message, setMessage] = useState("");
  useEffect(() => {
    let active = true;
    setQr("");
    if (share?.url)
      QRCode.toDataURL(share.url, {
        width: 660,
        margin: 4,
        errorCorrectionLevel: "M",
      }).then(
        (url) => {
          if (active) setQr(url);
        },
        () => {
          if (active)
            setMessage("Não foi possível gerar o QR code. Use o link.");
        },
      );
    return () => {
      active = false;
    };
  }, [share?.url]);
  return (
    <Modal title="Link e QR code de presença" onClose={onClose}>
      <div className="attendance-form">
        <p>
          Quem tiver o link poderá enviar sua própria presença, sem ver os
          demais participantes. Compartilhe apenas com a turma. A confirmação
          não verifica identidade nem equivale a assinatura digital.
        </p>
        <p>
          {entry.signup_open
            ? new Date(entry.expires_at) > new Date()
              ? `Recebimento liberado até ${when(entry.expires_at)}.`
              : `O link expirou em ${when(entry.expires_at)}.`
            : "Recebimento encerrado."}
        </p>
        <label>
          Validade do novo link
          <input
            type="datetime-local"
            required
            value={expires}
            onChange={(e) => setExpires(e.target.value)}
          />
        </label>
        <p className="attendance-status">
          Gerar ou renovar invalida o link e o QR code anteriores. Ao recarregar
          o app ou sair desta área, gere outro link se precisar compartilhá-lo
          novamente.
        </p>
        <div className="attendance-actions">
          <button
            className="button primary"
            disabled={
              busy ||
              !expires ||
              !Number.isFinite(new Date(expires).getTime()) ||
              new Date(expires) <= new Date()
            }
            onClick={() => onGenerate(new Date(expires).toISOString())}
          >
            {busy
              ? "Salvando…"
              : entry.signup_open
                ? "Renovar link e QR code"
                : "Gerar link e QR code"}
          </button>
          {entry.signup_open && (
            <button
              className="button secondary"
              disabled={busy}
              onClick={onStop}
            >
              Encerrar recebimento
            </button>
          )}
        </div>
        {failure}
        {share && (
          <div className="attendance-share">
            <label>
              Link do participante
              <input
                readOnly
                value={share.url}
                onFocus={(e) => e.target.select()}
              />
            </label>
            <div className="attendance-actions">
              <button
                className="button secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(share.url);
                    setMessage("Link copiado.");
                  } catch {
                    setMessage("Selecione e copie o link acima.");
                  }
                }}
              >
                Copiar link
              </button>
              <a
                className="button secondary"
                href={share.url}
                target="_blank"
                rel="noreferrer"
              >
                Abrir formulário
              </a>
            </div>
            {qr && (
              <>
                <img src={qr} alt="QR code para registrar presença" />
                <a
                  className="button secondary"
                  download="qr-lista-presenca.png"
                  href={qr}
                >
                  Baixar QR code
                </a>
              </>
            )}
          </div>
        )}
        {message && <p role="status">{message}</p>}
      </div>
    </Modal>
  );
}
