import React, { useRef, useState } from "react";

export function AccountPassword({ client, disabled = false, onBusyChange = () => {} }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [nonce, setNonce] = useState("");
  const [needCode, setNeedCode] = useState(false);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const act = async (sendCode = false) => {
    if (lock.current || disabled) return;
    setError(""); setMessage("");
    if (!sendCode && (password.length < 10 || password !== confirm)) {
      setError(password.length < 10 ? "Use pelo menos 10 caracteres." : "A confirmação da senha não coincide.");
      return;
    }
    lock.current = true; setBusy(true); onBusyChange(true);
    try {
      const result = sendCode
        ? await client.auth.reauthenticate()
        : await client.auth.updateUser({ password, ...(nonce.trim() ? { nonce: nonce.trim() } : {}) });
      if (result.error) throw result.error;
      if (sendCode) {
        setNeedCode(true);
        setMessage("Código solicitado. Confira o contato de recuperação da sua conta.");
      } else {
        setPassword(""); setConfirm(""); setNonce(""); setNeedCode(false);
        setMessage("Senha alterada com sucesso.");
      }
    } catch (err) {
      if (["reauthentication_needed", "reauthentication_not_valid"].includes(err.code)) {
        setNeedCode(true);
        setError("Confirme sua identidade com o código solicitado pelo Supabase e tente novamente.");
      } else if (err.code === "weak_password")
        setError("A senha não atende às regras do banco. Escolha uma senha mais forte.");
      else if (err.code === "same_password")
        setError("Escolha uma senha diferente da atual.");
      else setError("Não foi possível alterar a senha ou solicitar o código. Confira a conexão e tente novamente.");
    } finally {
      lock.current = false; setBusy(false); onBusyChange(false);
    }
  };
  return (
    <details className="account-password">
      <summary>Alterar minha senha</summary>
      <form onSubmit={(e) => { e.preventDefault(); act(); }}>
        <fieldset disabled={busy || disabled}>
          <label>Nova senha
            <input type="password" autoComplete="new-password" required minLength={10} value={password} onChange={(e) => setPassword(e.target.value)} />
          </label>
          <label>Confirmar nova senha
            <input type="password" autoComplete="new-password" required minLength={10} value={confirm} onChange={(e) => setConfirm(e.target.value)} />
          </label>
          <p>Use pelo menos 10 caracteres. A alteração vale para sua conta em todos os aparelhos.</p>
          {needCode && <div className="account-code">
            <button type="button" className="button secondary" onClick={() => act(true)}>Enviar código de confirmação</button>
            <label>Código de confirmação
              <input autoComplete="one-time-code" value={nonce} onChange={(e) => setNonce(e.target.value)} />
            </label>
          </div>}
          <button className="button primary" type="submit">{busy ? "Aguarde…" : "Alterar senha"}</button>
        </fieldset>
        {error && <p className="team-error" role="alert">{error}</p>}
        {message && <p className="team-message" role="status">{message}</p>}
      </form>
    </details>
  );
}
