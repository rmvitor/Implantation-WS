import React, { useEffect, useRef, useState } from "react";
import { Plus, FileDown, Printer, MapPin, RefreshCw } from "lucide-react";
import { useTeam } from "./Team.jsx";
import {
  PUNCH_FIELDS,
  TIME_JUSTIFICATIONS,
  newTimeAdjustment,
  cleanTimeAdjustment,
  validateTimeAdjustment,
  timeAdjustmentDate,
  timeAdjustmentError,
  currentTimeAdjustmentCity,
  localTimeFields,
} from "./time-adjustments.js";
import {
  readLocalTimeAdjustments,
  saveLocalTimeAdjustments,
  deleteLocalTimeAdjustment,
  timeAdjustmentStorageKey,
} from "./time-adjustment-store.js";
import {
  downloadTimeAdjustmentPdf,
  printTimeAdjustment,
} from "./time-adjustment-print.js";
import "./time-adjustments.css";
const guide =
  "https://github.com/rmvitor/Implantation-WS/blob/main/docs/ajuste-ponto.md";
const rpc = async (client, name, args) => {
  const r = await client.rpc(name, args);
  if (r.error) throw r.error;
  return r.data;
};
export function TimeAdjustments({ Modal, onPending, projects = [] }) {
  const team = useTeam(),
    key = timeAdjustmentStorageKey(team.actor?.id);
  const [rows, setRows] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [modal, setModal] = useState(null),
    [search, setSearch] = useState("");
  const epoch = useRef(0),
    working = useRef(false),
    mounted = useRef(true);
  const load = async () => {
    const ticket = ++epoch.current;
    try {
      const value = team.online
        ? await rpc(team.client, "implanta_time_adjustments")
        : readLocalTimeAdjustments(localStorage, key);
      if (mounted.current && ticket === epoch.current) {
        setRows(value);
        setError("");
      }
    } catch (e) {
      if (mounted.current && ticket === epoch.current) {
        setError(timeAdjustmentError(e));
        if (e.code === "42501") setRows([]);
      }
    } finally {
      if (mounted.current && ticket === epoch.current) setLoading(false);
    }
  };
  useEffect(() => {
    mounted.current = true;
    load();
    const refresh = () => {
      if (!working.current && document.visibilityState !== "hidden") load();
    };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh);
    window.addEventListener("storage", refresh);
    return () => {
      mounted.current = false;
      ++epoch.current;
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      window.removeEventListener("storage", refresh);
      onPending?.(false);
    };
  }, [team.client, key]);
  useEffect(() => {
    if (!busy) return;
    const prevent = (e) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", prevent);
    return () => window.removeEventListener("beforeunload", prevent);
  }, [busy]);
  const act = async (fn) => {
    if (working.current) return false;
    working.current = true;
    ++epoch.current;
    setBusy(true);
    onPending?.(true);
    try {
      await fn();
      return true;
    } finally {
      working.current = false;
      onPending?.(false);
      if (mounted.current) setBusy(false);
    }
  };
  const save = async (items) =>
    act(async () => {
      let saved;
      if (!team.online)
        saved = saveLocalTimeAdjustments(localStorage, key, items);
      else if (items.length === 1) {
        const item = items[0];
        saved = [
          await rpc(team.client, "implanta_time_adjustment_save", {
            p_id: item.id,
            p_revision: item.revision,
            p_data: item.data,
          }),
        ];
      } else {
        try {
          saved = await rpc(
            team.client,
            "implanta_time_adjustment_batch_save",
            { p_items: items },
          );
        } catch (e) {
          if (["PGRST202", "42883"].includes(e.code))
            throw new Error(
              "Para salvar várias datas juntas, aplique o SQL 202611040002_time_adjustment_batches.sql do guia de ativação. O preenchimento foi preservado e você pode baixar o PDF sem salvar.",
            );
          throw e;
        }
      }
      const ids = new Set(saved.map((r) => r.id));
      setRows((current) => [
        ...saved,
        ...current.filter((r) => !ids.has(r.id)),
      ]);
      setModal(null);
      setError("");
    });
  const emit = (data, print = false) =>
    act(() =>
      print ? printTimeAdjustment(data) : downloadTimeAdjustmentPdf(data),
    );
  const matches = rows.filter((r) =>
    `${r.data.employeeName} ${r.data.place} ${r.data.justification} ${r.data.occurrenceDate}`
      .toLocaleLowerCase("pt-BR")
      .includes(search.toLocaleLowerCase("pt-BR")),
  );
  return (
    <section className="time-adjustments">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZAÇÃO PESSOAL</div>
          <h1>Ajuste de ponto</h1>
          <p>
            Prepare sua justificativa e emita o documento para assinatura,
            independente de município.
          </p>
        </div>
        <button
          className="button primary"
          disabled={busy}
          onClick={() =>
            setModal({
              type: "edit",
              row: { id: crypto.randomUUID(), revision: 0 },
              data: newTimeAdjustment(team.actor),
            })
          }
        >
          <Plus size={17} />
          Novo ajuste
        </button>
      </div>
      {error && (
        <div className="time-adjustment-note" role="alert">
          {error}{" "}
          <a href={guide} target="_blank" rel="noreferrer">
            Guia de ativação
          </a>
          <p>
            Você pode preencher e emitir o documento sem salvar no histórico.
          </p>
        </div>
      )}
      <div className="time-adjustment-toolbar">
        <label className="search-input">
          <input
            aria-label="Buscar ajuste de ponto"
            placeholder="Buscar data, local ou justificativa…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </label>
        <button className="button secondary" disabled={busy} onClick={load}>
          <RefreshCw size={15} />
          Atualizar
        </button>
      </div>
      <p className="muted">
        {team.online
          ? "Seus ajustes ficam na sua conta, sem acesso de outros colegas."
          : "Histórico salvo somente neste aparelho."}{" "}
        Baixe o PDF para encaminhá-lo à assinatura.
      </p>
      {loading && <p role="status">Carregando ajustes…</p>}
      {!loading && !matches.length && (
        <div className="empty-state">
          <h3>Nenhum ajuste encontrado</h3>
          <p>
            Crie um ajuste para preencher os horários conforme o boletim e gerar
            o documento.
          </p>
        </div>
      )}
      <div className="time-adjustment-grid">
        {matches.map((row) => (
          <article className="time-adjustment-card" key={row.id}>
            <h2>{timeAdjustmentDate(row.data.occurrenceDate)}</h2>
            <strong>{row.data.employeeName}</strong>
            <p>{row.data.place}</p>
            <div className="time-adjustment-tags">
              {Object.entries(PUNCH_FIELDS)
                .filter(([k]) => row.data.punches[k].selected)
                .map(([k, label]) => (
                  <span key={k}>
                    {label} · {row.data.punches[k].time}
                  </span>
                ))}
            </div>
            <p className="time-adjustment-summary">{row.data.justification}</p>
            <div className="time-adjustment-actions">
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  setModal({
                    type: "edit",
                    row,
                    data: structuredClone(row.data),
                  })
                }
              >
                Editar
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  emit(row.data).catch((e) => setError(timeAdjustmentError(e)))
                }
              >
                <FileDown size={15} />
                Baixar PDF
              </button>
              <button
                className="button secondary"
                disabled={busy}
                onClick={() =>
                  emit(row.data, true).catch((e) =>
                    setError(timeAdjustmentError(e)),
                  )
                }
              >
                <Printer size={15} />
                Imprimir
              </button>
              <button
                className="button secondary danger-text"
                disabled={busy}
                onClick={() => setModal({ type: "delete", row })}
              >
                Excluir
              </button>
            </div>
          </article>
        ))}
      </div>
      {modal?.type === "edit" && (
        <TimeAdjustmentEditor
          Modal={Modal}
          initial={modal.data}
          row={modal.row}
          projects={projects}
          busy={busy}
          onClose={() => {
            if (working.current) return false;
            setModal(null);
          }}
          onSave={save}
          onEmit={emit}
        />
      )}
      {modal?.type === "delete" && (
        <Modal
          title="Excluir ajuste de ponto?"
          onClose={() => {
            if (!working.current) setModal(null);
            else return false;
          }}
        >
          <p>
            O ajuste de {timeAdjustmentDate(modal.row.data.occurrenceDate)} será
            removido do seu histórico. Os PDFs já baixados permanecem com você.
            Esta ação não pode ser desfeita.
          </p>
          <div className="time-adjustment-actions">
            <button
              className="button secondary"
              disabled={busy}
              onClick={() => setModal(null)}
            >
              Cancelar
            </button>
            <button
              className="button primary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  if (team.online)
                    await rpc(team.client, "implanta_time_adjustment_delete", {
                      p_id: modal.row.id,
                      p_revision: modal.row.revision,
                    });
                  else
                    deleteLocalTimeAdjustment(
                      localStorage,
                      key,
                      modal.row.id,
                      modal.row.revision,
                    );
                  setRows((r) => r.filter((x) => x.id !== modal.row.id));
                  setModal(null);
                }).catch((e) => {
                  setError(timeAdjustmentError(e));
                  setModal(null);
                })
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
function TimeAdjustmentEditor({
  Modal,
  initial,
  row,
  projects,
  busy,
  onClose,
  onSave,
  onEmit,
}) {
  const [dates, setDates] = useState([
      { id: row.id, revision: row.revision || 0, date: initial.occurrenceDate },
    ]),
    [selectedProject, setSelectedProject] = useState(""),
    [draft, setDraft] = useState(initial),
    [error, setError] = useState(""),
    [suggestion, setSuggestion] = useState("delay"),
    [locating, setLocating] = useState(false),
    [locationNote, setLocationNote] = useState("");
  const mounted = useRef(true),
    locationRequest = useRef(0),
    placeInput = useRef("");
  useEffect(
    () => () => {
      mounted.current = false;
      ++locationRequest.current;
    },
    [],
  );
  const patch = (key, value) => {
    setError("");
    if (key === "place") {
      ++locationRequest.current;
      setLocating(false);
    }
    setDraft((d) => ({ ...d, [key]: value }));
  };
  const perform = async (type) => {
    setError("");
    try {
      const unique = new Set(dates.map((d) => d.date));
      if (unique.size !== dates.length)
        throw new Error(
          "Há datas repetidas. Informe cada data apenas uma vez.",
        );
      const items = dates.map((d) => ({
        id: d.id,
        revision: d.revision,
        data: validateTimeAdjustment(
          cleanTimeAdjustment({ ...draft, occurrenceDate: d.date }),
        ),
      }));
      if (type === "save") await onSave(items);
      else
        await onEmit(
          items.map((d) => d.data),
          type === "print",
        );
    } catch (e) {
      setError(timeAdjustmentError(e));
    }
  };
  const close = () => {
    if (busy) return false;
    const dirty =
      JSON.stringify(draft) !== JSON.stringify(initial) ||
      dates.length !== 1 ||
      dates[0].date !== initial.occurrenceDate;
    if (
      dirty &&
      !window.confirm("Descartar as alterações não salvas deste ajuste?")
    )
      return false;
    return onClose();
  };
  return (
    <Modal
      className="time-adjustment-modal"
      title="Justificativa de ajuste de ponto"
      subtitle="Preencha os horários conforme o boletim. Somente as marcações selecionadas serão informadas."
      onClose={close}
    >
      <form
        className="time-adjustment-form"
        onSubmit={(e) => {
          e.preventDefault();
          perform("save");
        }}
      >
        <div className="time-adjustment-actions">
          <button type="submit" className="button primary" disabled={busy}>
            {busy ? "Aguarde…" : "Salvar ajuste"}
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => perform("pdf")}
          >
            <FileDown size={15} />
            Baixar PDF
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => perform("print")}
          >
            <Printer size={15} />
            Imprimir / Salvar PDF
          </button>
        </div>
        <p className="muted">
          Você pode emitir o documento sem salvar. Use Salvar ajuste para
          mantê-lo no histórico. Cada data gera uma folha e um registro próprio,
          com os mesmos horários e justificativa.
        </p>
        {error && (
          <p className="team-error" role="alert">
            {error}
          </p>
        )}
        <fieldset className="readonly-fields" disabled={busy}>
          <div className="time-adjustment-form">
            <div className="time-adjustment-fields">
              <label>
                Nome do funcionário *
                <input
                  required
                  maxLength={160}
                  value={draft.employeeName}
                  onChange={(e) => patch("employeeName", e.target.value)}
                />
              </label>
              <label>
                Cargo *
                <input
                  required
                  maxLength={160}
                  value={draft.jobTitle}
                  onChange={(e) => patch("jobTitle", e.target.value)}
                />
              </label>
            </div>
            <fieldset className="time-adjustment-dates">
              <legend>Datas das ocorrências *</legend>
              <div className="time-adjustment-date-list">
                {dates.map((d, i) => (
                  <div key={d.id} className="time-adjustment-date-row">
                    <label>
                      Data da ocorrência {i + 1} *
                      <input
                        type="date"
                        required
                        value={d.date}
                        onChange={(e) => {
                          setError("");
                          setDates((current) =>
                            current.map((item) =>
                              item.id === d.id
                                ? { ...item, date: e.target.value }
                                : item,
                            ),
                          );
                        }}
                      />
                    </label>
                    {i > 0 && (
                      <button
                        type="button"
                        className="button secondary"
                        aria-label={`Remover data ${i + 1}`}
                        onClick={() =>
                          setDates((current) =>
                            current.filter((item) => item.id !== d.id),
                          )
                        }
                      >
                        Remover
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  setDates((current) => [
                    ...current,
                    { id: crypto.randomUUID(), revision: 0, date: "" },
                  ])
                }
              >
                <Plus size={15} />
                Adicionar data
              </button>
            </fieldset>
            <fieldset className="time-adjustment-punches">
              <legend>Marcações que precisam de ajuste *</legend>
              {Object.entries(PUNCH_FIELDS).map(([key, label]) => (
                <div key={key} className="time-adjustment-punch">
                  <label className="time-adjustment-check">
                    <input
                      type="checkbox"
                      checked={draft.punches[key].selected}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          punches: {
                            ...d.punches,
                            [key]: {
                              ...d.punches[key],
                              selected: e.target.checked,
                            },
                          },
                        }))
                      }
                    />
                    {label}
                  </label>
                  {draft.punches[key].selected && (
                    <label>
                      Horário de {label.toLowerCase()} *
                      <input
                        type="time"
                        required
                        value={draft.punches[key].time}
                        onChange={(e) =>
                          setDraft((d) => ({
                            ...d,
                            punches: {
                              ...d.punches,
                              [key]: {
                                ...d.punches[key],
                                time: e.target.value,
                              },
                            },
                          }))
                        }
                      />
                    </label>
                  )}
                </div>
              ))}
            </fieldset>
            <div className="time-adjustment-suggestion">
              <label>
                Justificativa sugerida
                <select
                  value={suggestion}
                  onChange={(e) => setSuggestion(e.target.value)}
                >
                  <option value="delay">Ajuste devido a atraso</option>
                  <option value="travel">Ajuste devido a deslocamento</option>
                  <option value="forgotten">
                    Ajuste devido a esquecimento de batida
                  </option>
                </select>
              </label>
              <button
                type="button"
                className="button secondary"
                onClick={() =>
                  patch(
                    "justification",
                    [draft.justification, TIME_JUSTIFICATIONS[suggestion]]
                      .filter(Boolean)
                      .join("\n\n"),
                  )
                }
              >
                Inserir sugestão
              </button>
            </div>
            <label>
              Justificativa *
              <textarea
                required
                rows={5}
                maxLength={3000}
                value={draft.justification}
                onChange={(e) => patch("justification", e.target.value)}
              />
            </label>
            <label>
              Preencher a partir do projeto (opcional)
              <select
                value={selectedProject}
                onChange={(e) => {
                  const id = e.target.value;
                  setSelectedProject(id);
                  const project = projects.find((p) => p.id === id);
                  if (project) {
                    setError("");
                    setDraft((d) => ({
                      ...d,
                      entity: project.name || "",
                      contractManager: project.fiscal || "",
                    }));
                  }
                }}
              >
                <option value="">Preenchimento manual</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                    {p.status === "closed" ? " (encerrado)" : ""}
                  </option>
                ))}
              </select>
            </label>
            <p className="muted">
              Copia o nome do projeto e o fiscal para os campos abaixo, que
              continuam editáveis.
            </p>
            <div className="time-adjustment-fields">
              <label>
                Entidade contratante
                <input
                  maxLength={240}
                  value={draft.entity}
                  onChange={(e) => patch("entity", e.target.value)}
                />
              </label>
              <label>
                Gerente do contrato
                <input
                  maxLength={200}
                  value={draft.contractManager}
                  onChange={(e) => patch("contractManager", e.target.value)}
                />
              </label>
            </div>
            <div className="time-adjustment-location">
              <label>
                Local *
                <input
                  ref={placeInput}
                  required
                  maxLength={200}
                  value={draft.place}
                  onChange={(e) => patch("place", e.target.value)}
                />
              </label>
              <button
                type="button"
                className="button secondary"
                disabled={locating}
                onClick={async () => {
                  const request = ++locationRequest.current;
                  setLocating(true);
                  setLocationNote("");
                  try {
                    const city = await currentTimeAdjustmentCity();
                    if (
                      mounted.current &&
                      request === locationRequest.current
                    ) {
                      setDraft((d) => ({ ...d, place: city }));
                      setLocationNote(
                        "Cidade sugerida. Confira o local antes de emitir.",
                      );
                    }
                  } catch (e) {
                    if (mounted.current && request === locationRequest.current)
                      setLocationNote(
                        e.message ||
                          "Não foi possível consultar a cidade. Digite o local manualmente.",
                      );
                  } finally {
                    if (mounted.current && request === locationRequest.current)
                      setLocating(false);
                  }
                }}
              >
                <MapPin size={15} />
                {locating ? "Consultando cidade…" : "Usar cidade atual"}
              </button>
            </div>
            <p className="muted">
              Ao usar a localização, o navegador solicita sua permissão e
              consulta o OpenStreetMap com coordenadas aproximadas. As
              coordenadas não são salvas.
            </p>
            {locationNote && <p role="status">{locationNote}</p>}
            <div className="time-adjustment-fields">
              <label>
                Data de emissão *
                <input
                  type="date"
                  required
                  value={draft.issuedDate}
                  onChange={(e) => patch("issuedDate", e.target.value)}
                />
              </label>
              <label>
                Hora de emissão *
                <input
                  type="time"
                  required
                  value={draft.issuedTime}
                  onChange={(e) => patch("issuedTime", e.target.value)}
                />
              </label>
            </div>
            <button
              type="button"
              className="button secondary"
              onClick={() => {
                const now = localTimeFields();
                setDraft((d) => ({
                  ...d,
                  issuedDate: now.date,
                  issuedTime: now.time,
                }));
              }}
            >
              Usar data e hora atuais
            </button>
            <details className="time-adjustment-signature">
              <summary>Responsável pela assinatura (opcional)</summary>
              <p>
                Coordenador, gerente ou responsável no projeto. Se deixar em
                branco, os campos ficam disponíveis para preenchimento no
                documento.
              </p>
              <div className="time-adjustment-fields">
                <label>
                  Nome de quem assina
                  <input
                    maxLength={160}
                    value={draft.signerName}
                    onChange={(e) => patch("signerName", e.target.value)}
                  />
                </label>
                <label>
                  Registro funcional de quem assina
                  <input
                    maxLength={100}
                    value={draft.signerRegistration}
                    onChange={(e) =>
                      patch("signerRegistration", e.target.value)
                    }
                  />
                </label>
              </div>
            </details>
          </div>
        </fieldset>
        <div className="time-adjustment-actions">
          <button className="button primary" disabled={busy}>
            Salvar ajuste
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={close}
          >
            Cancelar
          </button>
        </div>
      </form>
    </Modal>
  );
}
