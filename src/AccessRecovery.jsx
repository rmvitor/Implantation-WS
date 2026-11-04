import React, { useState } from "react";
import { RefreshCw } from "lucide-react";
import { usePwa } from "./PwaControls.jsx";
import defaultConnection from "./team-config.json";
import { version } from "../package.json";
export function AccessRecovery({
  session,
  connection,
  accountEmail,
  diagnostic,
  disabled,
  onRestoreDefault,
}) {
  const pwa = usePwa();
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [confirm, setConfirm] = useState(false);
  const update = async () => {
    setBusy(true);
    setMessage("");
    try {
      if (await pwa.checkForUpdates()) await pwa.refresh();
      else
        setMessage(
          "Não há atualização pendente neste momento. Se a versão continuar antiga, use Recuperar atualização deste aparelho.",
        );
    } catch (error) {
      setMessage(
        error.message ||
          "Não foi possível atualizar. Confira a internet e tente novamente.",
      );
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <div className="auth-update-controls">
        <button
          type="button"
          className="button secondary"
          disabled={disabled || busy}
          onClick={update}
        >
          <RefreshCw size={16} />
          {busy ? "Verificando atualização…" : "Atualizar aplicativo"}
        </button>
        <a
          href={
            new URL(
              "assets/atualizar.html",
              new URL(import.meta.env.BASE_URL, location.href),
            ).href
          }
        >
          Recuperar atualização deste aparelho
        </a>
        <small>
          Atualiza os arquivos do app, preservando sua sessão e os dados salvos.
          Salve rascunhos de outras abas antes de atualizar.
        </small>
        {message && <p role="status">{message}</p>}
      </div>
      {(session || diagnostic) && (
        <details className="auth-diagnostic" open={!!diagnostic}>
          <summary>Diagnóstico do acesso</summary>
          <p>
            Versão: {version}
            <br />
            Servidor: {new URL(connection.url).hostname}
            <br />
            Conta:{" "}
            {session?.user.email || accountEmail?.trim() || "Não informada"}
            <br />
            Etapa: {diagnostic?.stage || "Verificação da conta"}
            <br />
            Código: {diagnostic?.code || "Não informado"}
            {diagnostic?.status && (
              <>
                <br />
                HTTP: {diagnostic.status}
              </>
            )}
          </p>
          {connection.url !== defaultConnection.url &&
            (confirm ? (
              <div>
                <p>
                  Usar a conexão padrão (
                  {new URL(defaultConnection.url).hostname}) neste aparelho? Os
                  dados locais e as sessões armazenadas serão preservados;
                  poderá ser necessário entrar na conta do servidor padrão.
                </p>
                <button
                  type="button"
                  className="button secondary"
                  onClick={onRestoreDefault}
                >
                  Confirmar conexão padrão
                </button>
                <button
                  type="button"
                  className="button secondary"
                  onClick={() => setConfirm(false)}
                >
                  Cancelar
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="button secondary"
                onClick={() => setConfirm(true)}
              >
                Usar conexão padrão do Implanta
              </button>
            ))}
        </details>
      )}
    </>
  );
}
