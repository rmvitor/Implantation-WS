import React, { useEffect, useRef, useState } from "react";
import { BrandLogo } from "./BrandLogo.jsx";
import { readTeamConnection } from "./Team.jsx";
import {
  customerAuthClient,
  customerError,
  customerPortalUrl,
  validCustomerInvite,
} from "./customer-access.js";
import {
  printImplantationTerm,
  downloadImplantationTerm,
} from "./implantation-print.js";
import { version } from "../package.json";
import "./customer-portal.css";

export function CustomerPortal({ inviteId }) {
  const [client] = useState(() => {
    const c = readTeamConnection();
    return c ? customerAuthClient(c, { inviteId }) : null;
  });
  const [session, setSession] = useState(null),
    [authLoading, setAuthLoading] = useState(!!client),
    [email, setEmail] = useState(""),
    [code, setCode] = useState("");
  const [data, setData] = useState(null),
    [term, setTerm] = useState(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [loadError, setLoadError] = useState(""),
    [message, setMessage] = useState(""),
    [online, setOnline] = useState(navigator.onLine);
  const generation = useRef(0),
    working = useRef(false),
    mounted = useRef(true),
    readSequence = useRef(0),
    viewRevision = useRef(""),
    emailInput = useRef(null);
  const refresh = async () => {
    if (
      !client ||
      working.current ||
      !navigator.onLine ||
      !validCustomerInvite(inviteId)
    )
      return;
    const current = generation.current;
    const sequence = ++readSequence.current;
    const r = await client.rpc("implanta_customer_read", {
      p_invite: inviteId,
    });
    if (
      !mounted.current ||
      working.current ||
      generation.current !== current ||
      sequence !== readSequence.current
    )
      return;
    if (r.error) {
      setLoadError(customerError(r.error));
      if (r.error.code === "42501") {
        setData(null);
        setTerm(null);
      }
      return;
    }
    const revision = JSON.stringify([
      r.data.ready,
      r.data.points.map((p) => [p.id, p.revision]),
    ]);
    if (viewRevision.current && viewRevision.current !== revision)
      setTerm(null);
    viewRevision.current = revision;
    setData(r.data);
    setLoadError("");
  };
  useEffect(() => {
    mounted.current = true;
    const network = () => setOnline(navigator.onLine);
    window.addEventListener("online", network);
    window.addEventListener("offline", network);
    return () => {
      mounted.current = false;
      window.removeEventListener("online", network);
      window.removeEventListener("offline", network);
    };
  }, []);
  useEffect(() => {
    if (!client) return;
    let active = true;
    (async () => {
      // getSession alone does not expose errors from a failed email callback.
      const initialized = await client.auth.initialize();
      const { data, error } = await client.auth.getSession();
      if (active) {
        setSession(data?.session || null);
        setAuthLoading(false);
        if (initialized.error || error)
          setError(customerError(initialized.error || error));
      }
    })();
    const { data } = client.auth.onAuthStateChange((_event, value) => {
      if (active) {
        setSession(value);
        if (!value) {
          setData(null);
          setTerm(null);
        }
      }
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, [client]);
  useEffect(() => {
    if (!session || !validCustomerInvite(inviteId)) return;
    refresh();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") refresh();
    }, 5000);
    const focus = () => refresh();
    window.addEventListener("focus", focus);
    window.addEventListener("online", focus);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", focus);
      window.removeEventListener("online", focus);
      generation.current++;
    };
  }, [session?.user?.id, inviteId]);
  const act = async (fn) => {
    if (working.current) return;
    working.current = true;
    generation.current++;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      return true;
    } catch (e) {
      setError(customerError(e));
      return false;
    } finally {
      working.current = false;
      generation.current++;
      setBusy(false);
    }
  };
  const accept = async (point, value) => {
    await act(async () => {
      const r = await client.rpc("implanta_customer_accept", {
        p_invite: inviteId,
        p_question: point.id,
        p_revision: point.revision,
        p_accept: value,
      });
      if (r.error) throw r.error;
      setData(r.data);
      setTerm(null);
      setMessage(
        value
          ? "Seu aceite foi confirmado no banco."
          : "Seu aceite externo foi retirado.",
      );
    });
    await refresh();
  };
  const valid = validCustomerInvite(inviteId);
  return (
    <main className="customer-shell">
      <div className="customer-page">
        <header className="customer-header">
          <BrandLogo />
          <div>
            <span className="eyebrow">PORTAL DO CLIENTE</span>
            <h1>Aceite da implantação</h1>
          </div>
          {session && (
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await client.auth.signOut({ scope: "local" });
                  if (r.error) throw r.error;
                  setSession(null);
                  setCode("");
                  setData(null);
                  setTerm(null);
                })
              }
            >
              Sair do portal
            </button>
          )}
        </header>
        {!valid ? (
          <p role="alert">
            Link inválido. Solicite o link completo à equipe de implantação.
          </p>
        ) : !client ? (
          <p role="alert">
            O portal não está conectado ao Supabase. Solicite ajuda à equipe.
          </p>
        ) : authLoading ? (
          <p role="status">Verificando acesso…</p>
        ) : !session ? (
          <section className="customer-login">
            <h2>Acesse com o e-mail do convite</h2>
            <p>
              Abra o link recebido no seu e-mail para entrar diretamente. Se
              precisar de outro, informe abaixo o e-mail cadastrado no convite.
              Este acesso é separado da área interna da equipe.
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                act(async () => {
                  const r = await client.auth.signInWithOtp({
                    email: email.trim().toLowerCase(),
                    options: {
                      emailRedirectTo: customerPortalUrl(inviteId),
                      shouldCreateUser: false,
                    },
                  });
                  if (r.error) throw r.error;
                  setMessage(
                    "Se este e-mail estiver cadastrado, o Supabase enviará um novo acesso. Abra o link mais recente recebido; se houver código no e-mail, você também pode usá-lo abaixo.",
                  );
                });
              }}
            >
              <label>
                E-mail do responsável
                <input
                  ref={emailInput}
                  type="email"
                  required
                  value={email}
                  autoComplete="email"
                  disabled={busy}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </label>
              <button className="button primary" disabled={busy || !online}>
                {busy ? "Enviando…" : "Enviar link de acesso"}
              </button>
            </form>
            <details className="customer-code-entry">
              <summary>Recebi um código por e-mail</summary>
              <p>
                Use esta opção somente se o e-mail mostrar um código. Informe o
                mesmo e-mail do convite no campo acima.
              </p>
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  if (!emailInput.current?.reportValidity()) return;
                  const ok = await act(async () => {
                    const r = await client.auth.verifyOtp({
                      email: email.trim().toLowerCase(),
                      token: code.trim(),
                      type: "email",
                    });
                    if (r.error) throw r.error;
                    setSession(r.data.session);
                    setCode("");
                  });
                  if (ok) await refresh();
                }}
              >
                <label>
                  Código recebido por e-mail
                  <input
                    type="text"
                    required
                    value={code}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,10}"
                    maxLength={10}
                    disabled={busy}
                    onChange={(e) =>
                      setCode(e.target.value.replace(/[^0-9]/g, ""))
                    }
                  />
                </label>
                <button
                  className="button secondary"
                  disabled={busy || !online || !email.trim()}
                >
                  {busy ? "Verificando…" : "Entrar no formulário"}
                </button>
              </form>
            </details>
          </section>
        ) : data ? (
          <>
            <section className="customer-summary">
              <h2>{data.projectName}</h2>
              <p>
                {data.entity} · {data.module}
              </p>
              <strong>{data.name}</strong>
              <p>
                {data.role} · {data.email}
              </p>
              <small>
                Acesso válido até{" "}
                {new Date(data.expiresAt).toLocaleString("pt-BR")}
              </small>
            </section>
            <p>
              Os pontos atribuídos a você aparecem conforme são apresentados e
              confirmados pelo técnico. Marque seu aceite depois de conferir
              cada apresentação.
            </p>
            <div className="customer-progress" role="status">
              {data.points.filter((p) => p.accepted).length} aceite(s) seu(s) ·{" "}
              {data.points.length} ponto(s) liberado(s) · {data.total} ponto(s)
              no relatório
            </div>
            {data.readOnly && (
              <p>
                O projeto está encerrado. As informações e o relatório ficam
                disponíveis para consulta.
              </p>
            )}
            {!data.points.length && (
              <p className="info-box">
                Aguardando os primeiros pontos apresentados e atribuídos a você
                pela equipe. Esta página se atualiza automaticamente.
              </p>
            )}
            <div className="customer-points">
              {data.points.map((point, index) => (
                <article
                  key={point.id}
                  className="customer-point"
                  aria-label={`Ponto ${point.id}`}
                >
                  <h3>
                    {index + 1}. {point.text}
                  </h3>
                  {point.help && <p>{point.help}</p>}
                  {point.notes && (
                    <details>
                      <summary>Observações da apresentação</summary>
                      <p>{point.notes}</p>
                    </details>
                  )}
                  <p className="customer-technical">
                    Apresentado por {point.technical.by} ·{" "}
                    {new Date(point.technical.at).toLocaleString("pt-BR")}
                  </p>
                  {point.recordedInternally && (
                    <small>
                      Um aceite foi informado à equipe. Você também pode
                      confirmar pessoalmente abaixo.
                    </small>
                  )}
                  <label>
                    <input
                      type="checkbox"
                      checked={point.accepted}
                      disabled={busy || data.readOnly || !online}
                      onChange={(e) => accept(point, e.target.checked)}
                    />
                    Meu aceite como responsável
                  </label>
                </article>
              ))}
            </div>
            <section className="customer-final">
              <h2>Relatório para assinatura</h2>
              <p>
                O relatório final usa o mesmo modelo da equipe e fica disponível
                quando todos os pontos estiverem resolvidos e os aceites
                necessários registrados.
              </p>
              <button
                className="button primary"
                disabled={!data.ready || busy || !online}
                onClick={() =>
                  act(async () => {
                    const r = await client.rpc("implanta_customer_report", {
                      p_invite: inviteId,
                    });
                    if (r.error) throw r.error;
                    setTerm(r.data);
                  })
                }
              >
                Gerar relatório final
              </button>
              {term && (
                <div className="customer-document">
                  <p>Documento gerado com os registros confirmados no banco.</p>
                  <button
                    className="button primary"
                    disabled={busy}
                    onClick={() => act(() => printImplantationTerm(term))}
                  >
                    Imprimir / salvar PDF
                  </button>
                  <button
                    className="button secondary"
                    disabled={busy}
                    onClick={() => act(() => downloadImplantationTerm(term))}
                  >
                    Baixar documento
                  </button>
                </div>
              )}
            </section>
          </>
        ) : session ? (
          <p role="status">
            {error || loadError
              ? "Confira o acesso abaixo ou saia para entrar com outro e-mail."
              : "Carregando o formulário…"}
          </p>
        ) : null}
        {!online && (
          <p role="alert">
            Sem conexão. Reconecte para consultar e registrar os aceites.
          </p>
        )}
        {(error || loadError) && (
          <p role="alert" className="team-error">
            {error || loadError}
          </p>
        )}
        {message && (
          <p role="status" className="customer-message">
            {message}
          </p>
        )}
        {session && (
          <button
            type="button"
            className="button secondary"
            disabled={busy || !online}
            onClick={refresh}
          >
            Atualizar pontos
          </button>
        )}
        <footer>
          Implanta · v{version} · Acesso exclusivo aos aceites deste convite
        </footer>
      </div>
    </main>
  );
}
