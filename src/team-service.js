import { validateBackup } from "./domain.js";
import { mergeProject, same, workspacePreferences } from "./team-domain.js";

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}
export function friendlyTeamError(error) {
  if (error?.code === "42501")
    return "Seu acesso a esta operação não está liberado. Confira as permissões com o administrador.";
  if (error?.code === "23505")
    return "Já existe um projeto com essa identificação. Confira os projetos antes de importar novamente.";
  if (/fetch|network|offline/i.test(error?.message || ""))
    return "Não foi possível conectar ao banco. Seu formulário foi mantido; tente novamente com internet.";
  return (
    error?.message ||
    "Não foi possível salvar no banco. Seu formulário foi mantido."
  );
}

export function createTeamService(client, onRefresh) {
  let rows = new Map();
  let snapshot = { version: 2, selectedId: "", projects: [] };
  let access = [];
  let committing = false;
  let warning = "";
  const service = {
    get warning() {
      return warning;
    },
    get snapshot() {
      return snapshot;
    },
    get access() {
      return access;
    },
    get committing() {
      return committing;
    },
    async read() {
      const [projects, members, preferences] = await Promise.all([
        client
          .from("implanta_projects")
          .select("id,data,version")
          .order("updated_at", { ascending: false }),
        client.from("implanta_members").select("project_id,user_id,role"),
        client.from("implanta_preferences").select("data").maybeSingle(),
      ]);
      return {
        rows: check(projects),
        access: check(members),
        preferences: check(preferences)?.data || {},
      };
    },
    apply(result) {
      rows = new Map(result.rows.map((row) => [row.id, row]));
      access = result.access;
      snapshot = validateBackup({
        ...result.preferences,
        version: 2,
        projects: result.rows.map((row) => row.data),
      });
      return snapshot;
    },
    async load() {
      return service.apply(await service.read());
    },
    async commit(base, next) {
      if (committing)
        throw new Error(
          "Um salvamento está em andamento. Aguarde a confirmação.",
        );
      committing = true;
      warning = "";
      try {
        const before = new Map(base.projects.map((p) => [p.id, p]));
        const after = new Map(next.projects.map((p) => [p.id, p]));
        const changes = [...after].filter(
          ([id, p]) => !same(before.get(id), p),
        );
        const removed = [...before.keys()].filter((id) => !after.has(id));
        const removals = removed.map((id) => ({
          id,
          version: rows.get(id)?.version,
        }));
        const preferences = same(
          workspacePreferences(base),
          workspacePreferences(next),
        )
          ? null
          : workspacePreferences(next);
        let saved = false,
          confirmed = [];
        for (let attempt = 0; attempt < 3 && !saved; attempt++) {
          const payload = [];
          for (const [id, desired] of changes) {
            if (!before.has(id)) {
              payload.push({ id, create: true, data: desired });
              continue;
            }
            const latest = check(
              await client
                .from("implanta_projects")
                .select("id,data,version")
                .eq("id", id)
                .single(),
            );
            const merged = mergeProject(before.get(id), desired, latest.data);
            validateBackup({ version: 2, selectedId: id, projects: [merged] });
            payload.push({
              id,
              create: false,
              data: merged,
              version: latest.version,
            });
          }
          const result = await client.rpc("implanta_commit", {
            p_changes: payload,
            p_removed: removals,
            p_preferences: preferences,
          });
          if (result.error?.code === "40001") continue;
          check(result);
          saved = true;
          confirmed = payload;
        }
        if (!saved)
          throw new Error(
            "O projeto recebeu novas alterações. Seu formulário foi mantido; feche a edição para carregar a atualização e tente novamente.",
          );
        // The transaction is confirmed. A failed refresh must not report the
        // confirmed write as unsaved or make a project import run twice.
        try {
          return service.apply(await service.read());
        } catch {
          const known = new Map(rows);
          for (const id of removed) known.delete(id);
          for (const item of confirmed)
            known.set(item.id, {
              id: item.id,
              data: item.data,
              version: item.create ? 1 : item.version + 1,
            });
          warning =
            "Alteração salva. A conexão caiu ao atualizar a tela; reconectando ao banco.";
          return service.apply({
            rows: [...known.values()],
            access,
            preferences: preferences || workspacePreferences(snapshot),
          });
        }
      } finally {
        committing = false;
      }
    },
    subscribe(userId) {
      const channel = client
        .channel(`implanta-${userId}`)
        .on(
          "postgres_changes",
          {
            event: "UPDATE",
            schema: "public",
            table: "implanta_notifications",
            filter: `user_id=eq.${userId}`,
          },
          () => onRefresh(),
        )
        .subscribe();
      return () => client.removeChannel(channel);
    },
  };
  return service;
}
