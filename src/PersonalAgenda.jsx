import React, { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  List,
  Plus,
  MapPin,
  Plane,
  Flag,
  Building2,
  Clock3,
} from "lucide-react";
import { uid, localDate } from "./domain";
import {
  PERSONAL_KINDS,
  validatePersonalEvent,
  personalEventOccursOn,
  personalEventUpcoming,
  personalEventRange,
} from "./personal-agenda";
import "./personal-agenda.css";
const icons = {
  project: Building2,
  travel: Plane,
  holiday: Flag,
  personal: Clock3,
};
export function PersonalAgenda({ events = [], saving, onAdd, onEdit }) {
  const [view, setView] = useState("list");
  const [month, setMonth] = useState(() => localDate().slice(0, 7));
  const [kind, setKind] = useState("");
  const [query, setQuery] = useState("");
  const [range, setRange] = useState("upcoming");
  const today = localDate();
  const matching = events
    .filter(
      (event) =>
        (!kind || event.kind === kind) &&
        `${event.title} ${event.place} ${event.notes}`
          .normalize("NFD")
          .replace(/[\u0300-\u036f]/g, "")
          .toLowerCase()
          .includes(
            query
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .toLowerCase(),
          ),
    )
    .sort(
      (a, b) =>
        (a.date + a.time).localeCompare(b.date + b.time) ||
        a.title.localeCompare(b.title),
    );
  const list = matching.filter(
    (event) => range === "all" || personalEventUpcoming(event, today),
  );
  const start = new Date(`${month}-01T12:00:00`);
  const first = new Date(start);
  first.setDate(1 - ((first.getDay() + 6) % 7));
  const days = Array.from({ length: 42 }, (_, index) => {
    const day = new Date(first);
    day.setDate(first.getDate() + index);
    return day;
  });
  const step = (amount) => {
    const date = new Date(start);
    date.setMonth(date.getMonth() + amount);
    setMonth(localDate(date).slice(0, 7));
  };
  return (
    <section className="personal-agenda">
      <div className="page-heading">
        <div>
          <div className="eyebrow">ORGANIZAÇÃO PESSOAL</div>
          <h1>Agenda geral</h1>
          <p>
            Planeje novos projetos, viagens e feriados. Seus registros são
            pessoais e não alteram os municípios.
          </p>
        </div>
        <button
          className="button primary"
          disabled={saving}
          onClick={() => onAdd(today)}
        >
          <Plus size={17} /> Novo compromisso
        </button>
      </div>
      <div className="personal-agenda-tools">
        <div
          className="segmented"
          role="group"
          aria-label="Visualização da agenda geral"
        >
          <button
            aria-pressed={view === "list"}
            className={view === "list" ? "active" : ""}
            onClick={() => setView("list")}
          >
            <List size={16} /> Lista
          </button>
          <button
            aria-pressed={view === "calendar"}
            className={view === "calendar" ? "active" : ""}
            onClick={() => setView("calendar")}
          >
            <CalendarDays size={16} /> Calendário
          </button>
        </div>
        <input
          className="personal-agenda-search"
          aria-label="Buscar na agenda geral"
          placeholder="Buscar compromisso ou local..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        <select
          aria-label="Tipo de compromisso na agenda geral"
          value={kind}
          onChange={(event) => setKind(event.target.value)}
        >
          <option value="">Todos os tipos</option>
          {Object.entries(PERSONAL_KINDS).map(([id, label]) => (
            <option key={id} value={id}>
              {label}
            </option>
          ))}
        </select>
        {view === "list" && (
          <select
            aria-label="Período da lista"
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            <option value="upcoming">Próximos e em andamento</option>
            <option value="all">Todas as datas</option>
          </select>
        )}
      </div>
      {view === "calendar" ? (
        <section
          className="calendar-panel personal-calendar"
          aria-label="Calendário pessoal"
        >
          <header className="calendar-toolbar">
            <div>
              <CalendarDays size={20} />
              <h2>
                {start.toLocaleDateString("pt-BR", {
                  month: "long",
                  year: "numeric",
                })}
              </h2>
            </div>
            <section>
              <input
                type="month"
                aria-label="Mês da agenda geral"
                min="1900-01"
                max="9999-12"
                value={month}
                onChange={(event) => {
                  if (/^\d{4}-\d{2}$/.test(event.target.value))
                    setMonth(event.target.value);
                }}
              />
              <button
                className="button secondary"
                onClick={() => setMonth(today.slice(0, 7))}
              >
                Hoje
              </button>
              <button
                className="icon-button"
                aria-label="Mês anterior da agenda geral"
                onClick={() => step(-1)}
              >
                <ArrowLeft size={17} />
              </button>
              <button
                className="icon-button"
                aria-label="Próximo mês da agenda geral"
                onClick={() => step(1)}
              >
                <ArrowRight size={17} />
              </button>
            </section>
          </header>
          <div className="calendar-scroll">
            <div className="calendar-week">
              {["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"].map(
                (label) => (
                  <span key={label}>{label}</span>
                ),
              )}
            </div>
            <div className="calendar-grid">
              {days.map((day) => {
                const iso = localDate(day);
                return (
                  <div
                    key={iso}
                    data-date={iso}
                    className={`calendar-day ${day.getMonth() !== start.getMonth() ? "outside-month" : ""} ${iso === today ? "calendar-today" : ""}`}
                  >
                    <header>
                      <time dateTime={iso}>{day.getDate()}</time>
                      <button
                        disabled={saving}
                        aria-label={`Adicionar compromisso pessoal em ${iso}`}
                        onClick={() => onAdd(iso)}
                      >
                        <Plus size={13} />
                      </button>
                    </header>
                    {matching
                      .filter((event) => personalEventOccursOn(event, iso))
                      .map((event) => {
                        const Icon = icons[event.kind];
                        return (
                          <button
                            key={event.id}
                            data-personal-event-id={event.id}
                            className={`calendar-event personal-event personal-${event.kind}`}
                            title={`${event.title} · ${personalEventRange(event)}${event.place ? ` · ${event.place}` : ""}`}
                            onClick={() => onEdit(event)}
                          >
                            <Icon size={13} />
                            <span>
                              <small>
                                {event.tentative
                                  ? "Previsto"
                                  : PERSONAL_KINDS[event.kind]}
                                {!event.allDay && event.date === iso
                                  ? ` · ${event.time}`
                                  : ""}
                              </small>
                              {event.title}
                            </span>
                          </button>
                        );
                      })}
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      ) : (
        <div className="personal-agenda-list">
          {list.map((event) => {
            const Icon = icons[event.kind];
            return (
              <button
                key={event.id}
                className="personal-agenda-row"
                onClick={() => onEdit(event)}
              >
                <span className={`personal-event-icon personal-${event.kind}`}>
                  <Icon size={20} />
                </span>
                <span className="personal-event-content">
                  <small>
                    {PERSONAL_KINDS[event.kind]} ·{" "}
                    {event.tentative ? "Previsto" : "Confirmado"}
                  </small>
                  <strong>{event.title}</strong>
                  <span>{personalEventRange(event)}</span>
                  {event.place && (
                    <span>
                      <MapPin size={13} /> {event.place}
                    </span>
                  )}
                </span>
                <ArrowRight size={17} />
              </button>
            );
          })}
          {!list.length && (
            <p className="personal-empty">
              Nenhum compromisso para este filtro. Use Novo compromisso para
              planejar suas próximas datas.
            </p>
          )}
        </div>
      )}
      {!events.length && view === "calendar" && (
        <p className="personal-empty">
          Sua agenda pessoal está vazia. Adicione uma data pelo calendário ou em
          Novo compromisso.
        </p>
      )}
    </section>
  );
}
export function PersonalEventModal({
  Modal,
  event,
  date,
  onClose,
  onSave,
  onDelete,
  saving,
}) {
  const [draft, setDraft] = useState(() =>
    event
      ? structuredClone(event)
      : {
          id: uid(),
          title: "",
          kind: "personal",
          date: date || localDate(),
          endDate: date || localDate(),
          allDay: true,
          time: "",
          endTime: "",
          tentative: false,
          place: "",
          notes: "",
        },
  );
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(false);
  const patch = (key, value) =>
    setDraft((current) => ({ ...current, [key]: value }));
  return (
    <Modal
      title={event ? "Editar compromisso pessoal" : "Novo compromisso pessoal"}
      subtitle="Somente na sua agenda geral. Sem vínculo com projetos."
      onClose={onClose}
    >
      <form
        onSubmit={(submit) => {
          submit.preventDefault();
          setError("");
          try {
            validatePersonalEvent(draft);
            onSave({
              ...draft,
              title: draft.title.trim(),
              place: draft.place.trim(),
              ...(draft.allDay ? { time: "", endTime: "" } : {}),
            });
          } catch (validation) {
            setError(validation.message);
          }
        }}
      >
        <fieldset
          disabled={saving}
          className="readonly-fields personal-event-form"
        >
          <label className="full-field">
            Título do compromisso
            <input
              required
              maxLength={160}
              value={draft.title}
              onChange={(change) => patch("title", change.target.value)}
              placeholder="Ex.: Viagem para visita técnica"
            />
          </label>
          <label>
            Tipo
            <select
              value={draft.kind}
              onChange={(change) =>
                setDraft((current) => ({
                  ...current,
                  kind: change.target.value,
                  tentative:
                    change.target.value === "project"
                      ? true
                      : current.tentative,
                }))
              }
            >
              {Object.entries(PERSONAL_KINDS).map(([id, label]) => (
                <option key={id} value={id}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label>
            Situação
            <select
              value={draft.tentative ? "tentative" : "confirmed"}
              onChange={(change) =>
                patch("tentative", change.target.value === "tentative")
              }
            >
              <option value="confirmed">Confirmado</option>
              <option value="tentative">Previsto</option>
            </select>
          </label>
          <label>
            Data de início
            <input
              required
              type="date"
              value={draft.date}
              onChange={(change) =>
                setDraft((current) => ({
                  ...current,
                  date: change.target.value,
                  endDate:
                    current.endDate === current.date
                      ? change.target.value
                      : current.endDate,
                }))
              }
            />
          </label>
          <label>
            Data de término
            <input
              required
              type="date"
              value={draft.endDate}
              onChange={(change) => patch("endDate", change.target.value)}
            />
          </label>
          <label className="personal-all-day full-field">
            <input
              type="checkbox"
              checked={draft.allDay}
              onChange={(change) => patch("allDay", change.target.checked)}
            />{" "}
            Dia inteiro
          </label>
          {!draft.allDay && (
            <>
              <label>
                Horário de início
                <input
                  required
                  type="time"
                  value={draft.time}
                  onChange={(change) => patch("time", change.target.value)}
                />
              </label>
              <label>
                Horário de término
                <input
                  required
                  type="time"
                  value={draft.endTime}
                  onChange={(change) => patch("endTime", change.target.value)}
                />
              </label>
            </>
          )}
          <label className="full-field">
            Local / município (opcional)
            <input
              maxLength={160}
              value={draft.place}
              onChange={(change) => patch("place", change.target.value)}
              placeholder="Informe o local, sem vincular a um projeto"
            />
          </label>
          <label className="full-field">
            Observações
            <textarea
              rows={3}
              maxLength={12000}
              value={draft.notes}
              onChange={(change) => patch("notes", change.target.value)}
            />
          </label>
          {error && (
            <p className="team-error full-field" role="alert">
              {error}
            </p>
          )}
          {deleting && (
            <div className="personal-delete-confirm full-field">
              <p>Excluir este compromisso da sua agenda geral?</p>
              <button
                type="button"
                className="button danger"
                onClick={() => onDelete(event.id)}
              >
                Confirmar exclusão do compromisso
              </button>
              <button
                type="button"
                className="button secondary"
                onClick={() => setDeleting(false)}
              >
                Manter compromisso
              </button>
            </div>
          )}
          <div className="modal-actions full-field">
            {event && !deleting && (
              <button
                type="button"
                className="button secondary text-danger"
                onClick={() => setDeleting(true)}
              >
                Excluir
              </button>
            )}
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancelar
            </button>
            <button type="submit" className="button primary">
              Salvar compromisso
            </button>
          </div>
        </fieldset>
      </form>
    </Modal>
  );
}
