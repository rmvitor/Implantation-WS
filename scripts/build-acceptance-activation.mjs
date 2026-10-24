// Build a reviewable, atomic activation bundle for the already configured team.
// No live database is accessed; the existing Master is preserved by role_settings.
import { readFile, writeFile } from "node:fs/promises";
const read = async (name) =>
  (
    await readFile(
      new URL("../supabase/migrations/" + name, import.meta.url),
      "utf8",
    )
  )
    .replace(/^begin;\r?\n/m, "")
    .replace(/^commit;\s*$/m, "")
    .trim();
const records = await read("202610090002_records.sql");
let roles = await read("202610150001_project_ownership.sql");
roles = roles
  .replace(
    /-- First activation:[\s\S]*?select set_config\('implanta.master_email','SEU_EMAIL_MASTER',true\);/,
    "-- Master already configured: the activated role_settings row prevents bootstrap changes.\nselect set_config('implanta.master_email','master-ja-configurado',true);",
  )
  .replaceAll("SEU_EMAIL_MASTER", "MASTER_JA_CONFIGURADO");
const base = await read("202610240001_implantation_acceptance.sql"),
  workflow = await read("202610240002_acceptance_workflow.sql");
const execute = (source, tag) => {
  const delimiter = "$" + tag + "$";
  if (source.includes(delimiter)) throw Error("SQL delimiter collision");
  return `execute ${delimiter}\n${source}\n${delimiter};`;
};
const result = `-- Ativação completa 1.15.0: registros separados + novas funções dos aceites.
-- Requer níveis Master/gestor e o primeiro SQL de homologação já aplicados.
-- Faça backup antes. Copie este arquivo inteiro no SQL Editor e execute uma vez.
-- Não há campos para substituir. Dados, Master, gestores e acessos são preservados.
-- Transação única: uma falha desfaz todas as etapas; reaplicação segura.
begin;
set local lock_timeout='15s';
-- Wait for in-flight project writes before copying; concurrent edits cannot be lost.
lock table public.implanta_projects in access exclusive mode;
do $acceptance_activation$
begin
 if to_regclass('implanta_private.role_settings') is null then raise exception 'Ative primeiro os níveis Master/gestor.'; end if;
 if not exists(select 1 from implanta_private.role_settings where id=1) then raise exception 'Os níveis de acesso ainda não foram ativados.'; end if;
 if to_regprocedure('public.implanta_implantation_capabilities()') is null then raise exception 'Execute primeiro 202610240001_implantation_acceptance.sql.'; end if;
 if to_regclass('implanta_private.record_tables') is null then
 ${execute(records, "acceptance_records_migration")}
 end if;
 ${execute(roles, "acceptance_roles_migration")}
 ${execute(base, "acceptance_base_migration")}
 ${execute(workflow, "acceptance_workflow_migration")}
end
$acceptance_activation$;
notify pgrst,'reload schema';
commit;
`;
const destination = new URL(
  "../supabase/migrations/202610240003_activate_acceptance_records.sql",
  import.meta.url,
);
if (process.argv.includes("--check")) {
  if ((await readFile(destination, "utf8")) !== result)
    throw Error(
      "Regenere o SQL de ativação: node scripts/build-acceptance-activation.mjs",
    );
} else {
  await writeFile(destination, result);
  console.log(
    "SQL único de ativação gerado sem alterar dados ou acessar produção.",
  );
}
