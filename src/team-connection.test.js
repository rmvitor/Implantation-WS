import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveConnection } from "./team-domain.js";
import { friendlyTeamError } from "./team-service.js";
import { checkSupabase } from "../scripts/check-supabase.mjs";

const defaults = {
  url: "https://test.supabase.co",
  key: "sb_publishable_test_public",
};
test("publicação inicia com a conexão da equipe; desenvolvimento e build local continuam locais", () => {
  assert.deepEqual(resolveConnection({ production: true, defaults }), defaults);
  assert.equal(resolveConnection({ defaults }), null);
  assert.equal(
    resolveConnection({
      production: true,
      defaults,
      environment: { mode: "local" },
    }),
    null,
  );
});
test("conexão escolhida no aparelho prevalece; preferências inválidas não removem o login padrão", () => {
  const saved = {
    url: "https://other.supabase.co",
    key: "sb_publishable_other_public",
  };
  assert.deepEqual(
    resolveConnection({
      production: true,
      defaults,
      stored: JSON.stringify(saved),
    }),
    saved,
  );
  assert.deepEqual(
    resolveConnection({ production: true, defaults, stored: "invalid" }),
    defaults,
  );
  assert.deepEqual(
    resolveConnection({ production: true, defaults, environment: saved }),
    saved,
  );
});
test("verificação distingue chave aceita, migração ausente e políticas restritas sem ler dados", async () => {
  const calls = [];
  const request = async (url, options) => {
    calls.push({ url, options });
    return url.endsWith("/settings")
      ? { ok: true }
      : { status: 404, json: async () => ({ code: "PGRST205" }) };
  };
  assert.deepEqual(await checkSupabase(defaults, request), {
    connection: "ok",
    schema: "missing",
  });
  assert.equal(calls.length, 2);
  assert.match(calls[1].url, /limit=0$/);
  assert.equal(calls[0].options.headers.apikey, defaults.key);
  assert.deepEqual(
    await checkSupabase(defaults, async (url) =>
      url.endsWith("/settings")
        ? { ok: true }
        : { status: 401, json: async () => ({ code: "42501" }) },
    ),
    { connection: "ok", schema: "restricted" },
  );
  assert.deepEqual(await checkSupabase(defaults, async () => ({ ok: false })), {
    connection: "error",
    schema: "unknown",
  });
  assert.deepEqual(
    await checkSupabase(defaults, async () => {
      throw new Error("network");
    }),
    { connection: "unreachable", schema: "unknown" },
  );
});
test("ausência da estrutura aponta o SQL necessário, sem declarar o cadastro liberado", () => {
  assert.match(friendlyTeamError({ code: "PGRST202" }), /Execute o SQL/);
  assert.match(
    friendlyTeamError({ code: "PGRST205" }),
    /ainda não foi aplicada/,
  );
});
