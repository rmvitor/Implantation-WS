// Never reflect arbitrary server/URL descriptions or request bodies in diagnostics.
export function authErrorInfo(error) {
  const raw = error?.code || "";
  let code = /^[A-Za-z0-9_]{2,60}$/.test(raw) ? raw : "auth_unknown";
  const network =
    error?.name === "AuthRetryableFetchError" ||
    /fetch|network|offline|failed to fetch/i.test(error?.message || "");
  if (network) code = "network_error";
  if (
    /lock.*timeout|lock.*timed|acquire.*lock/i.test(error?.message || "") ||
    error?.name === "NavigatorLockAcquireTimeoutError"
  )
    code = "session_lock_timeout";
  const status =
    Number.isInteger(error?.status) &&
    error.status >= 100 &&
    error.status <= 599
      ? error.status
      : null;
  return { code, status };
}
export function authErrorMessage(error) {
  const { code, status } = authErrorInfo(error);
  if (code === "network_error")
    return "Não foi possível conectar ao serviço de login. Confira a internet e tente novamente. Seus campos foram mantidos.";
  if (code === "session_lock_timeout")
    return "O navegador não conseguiu concluir a operação da sessão. Feche as outras janelas do Implanta e tente novamente.";
  if (code === "invalid_credentials")
    return "O servidor recusou a combinação de e-mail e senha. Confira os dados ou use Esqueci minha senha.";
  if (code === "email_not_confirmed")
    return "Seu e-mail ainda precisa ser confirmado. Abra a mensagem de confirmação enviada no cadastro.";
  if (code === "user_banned")
    return "O serviço de autenticação bloqueou esta conta. Verifique a situação com o responsável pela plataforma.";
  if (code === "email_provider_disabled")
    return "O login por e-mail está desativado no serviço de autenticação. Verifique a configuração com o responsável pela plataforma.";
  if (code === "captcha_failed")
    return "O serviço de login exige uma verificação de segurança que não foi concluída. Informe o código do diagnóstico ao responsável pela plataforma.";
  if (
    status === 429 ||
    ["over_request_rate_limit", "over_email_send_rate_limit"].includes(code)
  )
    return "O serviço limitou temporariamente as tentativas. Aguarde alguns minutos antes de tentar novamente.";
  if (
    [
      "session_not_found",
      "refresh_token_not_found",
      "refresh_token_already_used",
      "bad_jwt",
    ].includes(code)
  )
    return "Sua sessão não pôde ser validada. Entre novamente na conta.";
  if (code === "weak_password")
    return "A senha não atende às regras do serviço. Escolha uma senha mais forte.";
  return "O serviço de autenticação não concluiu a solicitação. Confira o código em Diagnóstico do acesso antes de tentar novamente.";
}
