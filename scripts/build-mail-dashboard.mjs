import { build } from "esbuild";
import { fileURLToPath } from "node:url";

// Same implementation as the CLI deployment, packaged for a single browser
// editor tab. Keep the Auth dependency external so Supabase resolves it in Deno.
const root = new URL("../", import.meta.url);
await build({
  entryPoints: [fileURLToPath(new URL("supabase/functions/mail/index.ts", root))],
  outfile: fileURLToPath(new URL("public/setup/implanta-mail.ts", root)),
  absWorkingDir: fileURLToPath(root),
  bundle: true,
  format: "esm",
  platform: "neutral",
  target: "es2022",
  external: ["npm:*"],
  charset: "utf8",
  banner: { js: "// @ts-nocheck\n// JavaScript gerado pelo bundler; tipos do entrypoint original verificados separadamente.\n// Implanta: funcao mail para o editor web do Supabase.\n// Copie TODO este arquivo para index.ts. Nome da funcao: mail.\n// Gerado por npm run build:mail-dashboard; edite os fontes em supabase/functions/mail/.\n// A autenticacao e a liberacao do usuario sao obrigatorias dentro deste codigo.\n// Guia: https://github.com/rmvitor/Implantation-WS/blob/main/docs/EMAIL.md" },
});
