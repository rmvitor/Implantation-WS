import { readFile, appendFile } from "node:fs/promises";
import { pathToFileURL } from "node:url";
import { validateConnection } from "../src/team-domain.js";

// Only read-only public API requests: no signup, e-mail, project data or DDL.
export async function checkSupabase(config, request = fetch) {
  const { url, key } = validateConnection(config);
  const options = {
    headers: { apikey: key },
    signal: AbortSignal.timeout(15000),
  };
  try {
    const auth = await request(`${url}/auth/v1/settings`, options);
    if (!auth.ok) return { connection: "error", schema: "unknown" };
    const result = await request(
      `${url}/rest/v1/implanta_projects?select=id&limit=0`,
      { ...options, signal: AbortSignal.timeout(15000) },
    );
    const data = await result.json();
    if (data?.code === "PGRST205" || data?.code === "42P01")
      return { connection: "ok", schema: "missing" };
    if ([401, 403].includes(result.status) && data?.code === "42501")
      return { connection: "ok", schema: "restricted" };
    return { connection: "ok", schema: "unknown" };
  } catch {
    return { connection: "unreachable", schema: "unknown" };
  }
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  const defaults = JSON.parse(
    await readFile(new URL("../src/team-config.json", import.meta.url), "utf8"),
  );
  const config =
    process.env.VITE_SUPABASE_URL && process.env.VITE_SUPABASE_ANON_KEY
      ? {
          url: process.env.VITE_SUPABASE_URL,
          key: process.env.VITE_SUPABASE_ANON_KEY,
        }
      : defaults;
  const result = await checkSupabase(config);
  // The job's next step includes these states in its name, visible through the
  // Actions API even when this environment cannot download runner logs.
  console.log(
    `Conexão Supabase: ${result.connection}; estrutura: ${result.schema}.`,
  );
  if (process.env.GITHUB_OUTPUT)
    await appendFile(
      process.env.GITHUB_OUTPUT,
      `connection=${result.connection}\nschema=${result.schema}\n`,
    );
}
