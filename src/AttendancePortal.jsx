import React, { useEffect, useState, useRef } from "react";
import { createClient } from "@supabase/supabase-js";
import { readTeamConnection } from "./Team.jsx";
import {
  attendanceTokenValid,
  attendanceDate,
  attendanceError,
  attendanceRequiredFields,
} from "./attendance.js";
import { ParticipantFields } from "./Attendance.jsx";
import { version } from "../package.json";
import "./attendance.css";
export function AttendancePortal({ token }) {
  const [client] = useState(() => {
    const c = readTeamConnection();
    return c
      ? createClient(c.url, c.key, {
          auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false,
            storageKey: "implanta.attendance.public",
          },
        })
      : null;
  });
  const [event, setEvent] = useState(null),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [sent, setSent] = useState(false);
  const [draft, setDraft] = useState({
    name: "",
    cpf: "",
    sector: "",
    email: "",
    confirmed: false,
  });
  const request = useRef(crypto.randomUUID()),
    sending = useRef(false);
  const load = async () => {
    if (!client || !attendanceTokenValid(token)) {
      setError(
        "Link de presença inválido ou indisponível. Solicite um novo link ao instrutor.",
      );
      setLoading(false);
      return;
    }
    setLoading(true);
    setError("");
    const r = await client.rpc("implanta_attendance_public_read", {
      p_token: token,
    });
    setLoading(false);
    if (r.error) {
      setEvent(null);
      setError(attendanceError(r.error));
    } else setEvent(r.data);
  };
  useEffect(() => {
    document.title = "Lista de presença · Implanta";
    const tags = [
      ["name", "referrer", "no-referrer"],
      ["name", "robots", "noindex,nofollow"],
    ].map(([key, value, content]) => {
      const m = document.createElement("meta");
      m.setAttribute(key, value);
      m.content = content;
      document.head.append(m);
      return m;
    });
    load();
    return () => {
      tags.forEach((t) => t.remove());
      client?.removeAllChannels();
    };
  }, [client, token]);
  const submit = async (e) => {
    e.preventDefault();
    if (sending.current || !draft.confirmed) return;
    sending.current = true;
    setBusy(true);
    setError("");
    try {
      const r = await client.rpc("implanta_attendance_register", {
        p_token: token,
        p_request: request.current,
        p_data: draft,
      });
      if (r.error) throw r.error;
      if (!r.data?.registered)
        throw new Error(
          "O banco não confirmou sua participação. Tente novamente.",
        );
      setSent(true);
      setDraft({ name: "", cpf: "", sector: "", email: "", confirmed: false });
    } catch (e) {
      setError(attendanceError(e));
      if (e.code === "23514") {
        const latest = await client.rpc("implanta_attendance_public_read", {
          p_token: token,
        });
        if (!latest.error) setEvent(latest.data);
      }
    } finally {
      sending.current = false;
      setBusy(false);
    }
  };
  return (
    <main className="attendance-public">
      <article>
        <p>Implanta · Lista de presença</p>
        <h1>{event?.title || "Participação em treinamento"}</h1>
        {loading && <p role="status">Carregando formulário…</p>}
        {event && (
          <p>
            <strong>{event.entity}</strong> · {event.city} / {event.state}
            <br />
            {attendanceDate(event.date)} · {event.module}
            {event.submodules && ` · ${event.submodules}`}
            <br />
            Instrutor: {event.instructor}{" "}
            {event.hours && `· Carga horária: ${event.hours}`}
          </p>
        )}
        {error && (
          <p role="alert" className="team-error">
            {error}
          </p>
        )}
        {!event && !loading && (
          <button className="button secondary" onClick={load}>
            Tentar novamente
          </button>
        )}
        {sent ? (
          <div role="status">
            <h2>Participação registrada</h2>
            <p>
              Seus dados foram enviados para a lista do instrutor. A assinatura
              será feita no relatório impresso, quando solicitada.
            </p>
            <p>
              Se o e-mail já estava na lista, o registro anterior foi
              preservado. Para corrigir dados, procure o instrutor.
            </p>
            <button
              className="button secondary"
              onClick={() => {
                request.current = crypto.randomUUID();
                setSent(false);
              }}
            >
              Registrar outra pessoa
            </button>
          </div>
        ) : (
          event && (
            <form className="attendance-form" onSubmit={submit}>
              <fieldset disabled={busy} className="readonly-fields">
                <div className="attendance-form">
                  <ParticipantFields
                    draft={draft}
                    requiredFields={event.requiredFields}
                    onChange={(key, value) =>
                      setDraft((d) => ({ ...d, [key]: value }))
                    }
                  />
                  <p>
                    Seus dados serão usados pela equipe para registrar a
                    participação neste treinamento e emitir a lista de presença.
                    {attendanceRequiredFields(event.requiredFields).cpf
                      ? "O CPF é obrigatório neste município. "
                      : "O CPF é opcional neste município. "}
                    Os participantes não têm acesso aos dados uns dos outros.
                    Para corrigir ou remover seus dados, procure o instrutor
                    identificado acima.
                  </p>
                  <label className="attendance-check">
                    <input
                      type="checkbox"
                      required
                      checked={draft.confirmed}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, confirmed: e.target.checked }))
                      }
                    />
                    Confirmo que participei deste treinamento e que os dados
                    informados são meus ou foram preenchidos com autorização do
                    participante.
                  </label>
                </div>
              </fieldset>
              <p className="attendance-status">
                Esta confirmação registra data e hora do envio. Ela não equivale
                a uma assinatura digital.
              </p>
              <button
                className="button primary"
                disabled={busy || !draft.confirmed}
              >
                {busy ? "Enviando…" : "Confirmar participação"}
              </button>
            </form>
          )
        )}
        <p className="attendance-status">Implanta · v{version}</p>
      </article>
    </main>
  );
}
