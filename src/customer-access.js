import { createClient } from "@supabase/supabase-js";
export const CUSTOMER_AUTH_KEY = "implanta.customer.auth.v1";
export const customerInviteId = (url = location.href) =>
  new URL(url).searchParams.get("aceite");
export const validCustomerInvite = (id) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    id || "",
  );
export function customerPortalUrl(id, base = location.href) {
  if (!validCustomerInvite(id)) throw new Error("Convite inválido.");
  const url = new URL("./", base);
  url.searchParams.set("aceite", id);
  return url.href;
}
export function customerAuthClient(
  config,
  { issuer = false, inviteId = "" } = {},
) {
  return createClient(config.url, config.key, {
    auth: {
      storageKey: issuer
        ? "implanta.customer.issuer"
        : `${CUSTOMER_AUTH_KEY}:${inviteId}`,
      persistSession: !issuer,
      storage: issuer ? undefined : sessionStorage,
      autoRefreshToken: !issuer,
      detectSessionInUrl: !issuer,
      flowType: "implicit",
    },
  });
}
export async function requestCustomerAccess(client, invite) {
  const { error } = await client.auth.signInWithOtp({
    email: invite.email,
    options: {
      emailRedirectTo: customerPortalUrl(invite.id),
      shouldCreateUser: true,
      data: { display_name: invite.name, account_type: "customer_portal" },
    },
  });
  if (error) throw error;
}
export const customerError = (error) => {
  if (error?.code === "40001")
    return "Este ponto foi atualizado. Confira a apresentação novamente antes de confirmar.";
  if (error?.code === "PGRST202")
    return "O acesso externo ainda não foi ativado pela equipe.";
  if (error?.status === 429 || error?.code === "over_email_send_rate_limit")
    return "Aguarde antes de solicitar outro acesso. Use o link ou código mais recente recebido.";
  if (
    error?.code === "otp_expired" ||
    error?.code === "otp_disabled" ||
    (error?.name?.startsWith("Auth") &&
      /expired|token.*invalid|code.*invalid/i.test(error.message || ""))
  )
    return "Link ou código inválido ou vencido. Solicite um novo acesso.";
  if (error?.code === "42501")
    return "Acesso indisponível. Confira se usou o e-mail do convite ou solicite novo acesso à equipe.";
  return (
    error?.message ||
    "Não foi possível concluir. Confira a conexão e tente novamente."
  );
};
