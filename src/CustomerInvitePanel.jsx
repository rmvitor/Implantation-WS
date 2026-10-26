import React, { useEffect, useMemo, useState } from "react";
import {
  customerAuthClient,
  customerPortalUrl,
  requestCustomerCode,
  customerError,
} from "./customer-access.js";
import { readTeamConnection } from "./Team.jsx";
export function CustomerInvitePanel({
  client,
  projectId,
  entryId,
  responsible,
}) {
  const [rows, setRows] = useState([]),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [revoke, setRevoke] = useState(false);
  const mailer = useMemo(() => {
    const c = readTeamConnection();
    return c ? customerAuthClient(c, { issuer: true }) : null;
  }, []);
  const current = rows.find(
    (r) =>
      r.responsible_id === responsible.id &&
      r.email === responsible.email.trim().toLowerCase() &&
      r.name === responsible.name &&
      r.job_title === responsible.role &&
      !r.revoked_at &&
      new Date(r.expires_at) > new Date(),
  );
  const load = async () => {
    const r = await client.rpc("implanta_customer_invites", {
      p_project: projectId,
      p_entry: entryId,
    });
    if (r.error) throw r.error;
    setRows(r.data);
  };
  useEffect(() => {
    load().catch((e) => setError(customerError(e)));
  }, [client, projectId, entryId]);
  const act = async (fn) => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await fn();
      await load();
    } catch (e) {
      setError(customerError(e));
    } finally {
      setBusy(false);
    }
  };
  const send = async (invite) => {
    if (!mailer)
      throw new Error("Conecte ao banco da equipe para solicitar o código.");
    await requestCustomerCode(mailer, invite);
    const r = await client.rpc("implanta_customer_invite_action", {
      p_invite: invite.id,
      p_action: "requested",
    });
    if (r.error) throw r.error;
    setMessage(
      "Envio solicitado ao Supabase. O cliente deve usar o código recebido no e-mail.",
    );
  };
  return (
    <section className="customer-invite-panel">
      <p>
        <strong>{responsible.name}</strong> · {responsible.role}
        <br />
        {responsible.email}
      </p>
      <p>
        O acesso externo é opcional e vale por 7 dias. O cliente verá somente os
        pontos apresentados pelo técnico e atribuídos a ele neste módulo e
        entidade. Com vários responsáveis, use Responsáveis do ponto para
        definir quem valida cada item. A conferência interna continua
        disponível.
      </p>
      {error && (
        <p role="alert" className="team-error">
          {error}
        </p>
      )}
      {message && (
        <p role="status" className="team-note">
          {message}
        </p>
      )}
      {current && (
        <>
          <p>
            Válido até {new Date(current.expires_at).toLocaleString("pt-BR")}.
          </p>
          <label className="customer-link-label">
            Link do formulário
            <input
              readOnly
              value={customerPortalUrl(current.id)}
              onFocus={(e) => e.target.select()}
            />
          </label>
          <div className="implantation-editor-actions">
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  await navigator.clipboard.writeText(
                    customerPortalUrl(current.id),
                  );
                  setMessage(
                    "Link copiado. O acesso também exige o código enviado ao e-mail do responsável.",
                  );
                })
              }
            >
              Copiar link
            </button>
            <button
              type="button"
              className="button secondary"
              disabled={busy}
              onClick={() => act(() => send(current))}
            >
              Reenviar código
            </button>
            <button
              type="button"
              className="button secondary danger-button"
              disabled={busy}
              onClick={() => setRevoke(true)}
            >
              Revogar acesso
            </button>
          </div>
        </>
      )}
      {revoke && (
        <div className="info-box">
          <p>
            Revogar o acesso de {responsible.name}? O link deixará de funcionar.
            Os aceites já registrados serão preservados.
          </p>
          <button
            type="button"
            className="button secondary"
            disabled={busy}
            onClick={() => setRevoke(false)}
          >
            Cancelar revogação
          </button>
          <button
            type="button"
            className="button primary"
            disabled={busy}
            onClick={() =>
              act(async () => {
                const r = await client.rpc("implanta_customer_invite_action", {
                  p_invite: current.id,
                  p_action: "revoke",
                });
                if (r.error) throw r.error;
                setRevoke(false);
                setMessage("Acesso revogado.");
              })
            }
          >
            Confirmar revogação
          </button>
        </div>
      )}
      <button
        type="button"
        className="button primary"
        disabled={busy || !responsible.email}
        onClick={() =>
          act(async () => {
            const r = await client.rpc("implanta_customer_invite_create", {
              p_project: projectId,
              p_entry: entryId,
              p_responsible: responsible.id,
            });
            if (r.error) throw r.error;
            setRows((old) => [
              r.data,
              ...old.map((x) =>
                x.responsible_id === responsible.id
                  ? { ...x, revoked_at: new Date().toISOString() }
                  : x,
              ),
            ]);
            await send(r.data);
          })
        }
      >
        {busy
          ? "Processando…"
          : current
            ? "Renovar por 7 dias e enviar"
            : "Gerar acesso e enviar código"}
      </button>
      <small>
        Renovar cria um novo link e revoga o anterior. Se o envio falhar, o
        convite continuará disponível para copiar ou reenviar.
      </small>
      <a
        href="https://github.com/rmvitor/Implantation-WS/blob/main/docs/portal-cliente.md"
        target="_blank"
        rel="noreferrer"
      >
        Guia de ativação e modelo de e-mail
      </a>
    </section>
  );
}
