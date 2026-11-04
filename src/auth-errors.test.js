import { test } from "node:test";
import assert from "node:assert/strict";
import { authErrorInfo, authErrorMessage } from "./auth-errors.js";
test("login diferencia recusa de credenciais, rede, confirmação e limite sem refletir dados do servidor", () => {
  assert.match(
    authErrorMessage({ code: "invalid_credentials" }),
    /combinação de e-mail e senha/,
  );
  assert.match(
    authErrorMessage({
      name: "AuthRetryableFetchError",
      message: "Failed to fetch",
    }),
    /conectar ao serviço/,
  );
  assert.match(
    authErrorMessage({ code: "email_not_confirmed" }),
    /precisa ser confirmado/,
  );
  assert.match(authErrorMessage({ status: 429 }), /limitou temporariamente/);
  assert.match(
    authErrorMessage({ code: "captcha_failed" }),
    /verificação de segurança/,
  );
  assert.match(
    authErrorMessage({ name: "NavigatorLockAcquireTimeoutError" }),
    /operação da sessão/,
  );
  const e = {
    code: "<img onerror=secret>",
    status: 400,
    message: "password=secret&access_token=private",
  };
  assert.deepEqual(authErrorInfo(e), { code: "auth_unknown", status: 400 });
  assert(!authErrorMessage(e).includes("secret"));
  assert(!authErrorMessage(e).includes("private"));
});
