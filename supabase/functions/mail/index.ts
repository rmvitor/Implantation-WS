import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { createMailHandler } from "./handler.js";

// Session JWTs are explicitly verified with Auth, then app approval is checked
// through its existing RLS-aware RPC. No service_role key or password vault.
const handler = createMailHandler({
  allowedOrigins: (Deno.env.get("MAIL_ALLOWED_ORIGINS") || "https://rmvitor.github.io").split(",").map((s) => s.trim()).filter(Boolean),
  authenticate: async (token: string) => {
    const client = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const user = await client.auth.getUser(token);
    if (user.error || !user.data.user) return false;
    const access = await client.rpc("implanta_access");
    return !access.error && access.data?.id === user.data.user.id && access.data?.active === true;
  },
});
Deno.serve(handler);
