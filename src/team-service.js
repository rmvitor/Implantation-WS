import { validateBackup } from "./domain.js";
import { assembleRecords, recordChanges } from "./records.js";
import { mergeProject, same, workspacePreferences } from "./team-domain.js";

function check(result) {
  if (result.error) throw result.error;
  return result.data;
}
export function friendlyTeamError(error) {
  if (["PGRST202", "PGRST205", "42P01"].includes(error?.code))
    return "A estrutura do banco ainda não foi aplicada. Execute o SQL do guia de ativação no painel Supabase e verifique o acesso novamente.";
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
  let normalized = false;
  const service = {
    get normalized() {
      return normalized;
    },
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
      const modern = await client.rpc("implanta_read_v2");
      if (!modern.error) {
        if (!modern.data || !Array.isArray(modern.data.records))
          throw new Error(
            "Resposta incompleta do banco; nenhum dado foi substituído.",
          );
        normalized = true;
        const projects = assembleRecords(modern.data.records);
        return {
          ...modern.data,
          rows: projects.map((data) => ({
            id: data.id,
            data,
            version: modern.data.projects.find((p) => p.id === data.id)
              ?.version,
          })),
        };
      }
      if (modern.error.code !== "PGRST202") throw modern.error;
      if (normalized)
        throw new Error(
          "A estrutura do banco mudou. Atualize o aplicativo antes de salvar.",
        );
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
    async commit(base, next, options = {}) {
      if (committing)
        throw new Error(
          "Um salvamento está em andamento. Aguarde a confirmação.",
        );
      committing = true;
      warning = "";
      try {
        if (normalized) return await commitRecords(base, next, options);
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
            // Use the same migration defaults as load() before comparing older
            // records. Missing optional fields are not concurrent edits.
            const remote = validateBackup({
              version: 2,
              selectedId: id,
              projects: [latest.data],
            }).projects[0];
            const merged = mergeProject(before.get(id), desired, remote);
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
  async function commitRecords(base, next, options) {
    const before = new Map(base.projects.map((p) => [p.id, p]));
    const after = new Map(next.projects.map((p) => [p.id, p]));
    const deleted = [...before.keys()]
      .filter((id) => !after.has(id))
      .map((id) => ({ id, version: rows.get(id)?.version }));
    const preferences = same(
      workspacePreferences(base),
      workspacePreferences(next),
    )
      ? null
      : workspacePreferences(next);
    for (let attempt = 0; attempt < 3; attempt++) {
      const current = await service.read();
      const remote = validateBackup({
        version: 2,
        projects: current.rows.map((r) => r.data),
      }).projects;
      const latest = new Map(remote.map((p) => [p.id, p]));
      const merged = remote.filter((p) => !deleted.some((d) => d.id === p.id));
      const created = [];
      for (const [id, desired] of after) {
        if (same(before.get(id), desired)) continue;
        if (!before.has(id) && latest.has(id))
          throw new Error(
            "Outro colega criou um projeto com esta identificação. Seu formulário foi mantido; carregue os projetos atuais antes de importar novamente.",
          );
        if (before.has(id) && !latest.has(id))
          throw new Error(
            "O projeto foi excluído por outro colega. Seu formulário foi mantido.",
          );
        const result = before.has(id)
          ? mergeProject(before.get(id), desired, latest.get(id))
          : desired;
        validateBackup({ version: 2, projects: [result] });
        const index = merged.findIndex((p) => p.id === id);
        if (index >= 0) merged[index] = result;
        else {
          merged.push(result);
          created.push({
            id,
            data: {
              id,
              name: result.name,
              status: result.status || "active",
              entities: result.entities,
              tasks: [],
              trainings: [],
              logs: [],
            },
          });
        }
      }
      const diff = recordChanges(
        remote.filter((p) => !deleted.some((d) => d.id === p.id)),
        merged,
        current.records,
        current.admin || current.records.some((r) => r.kind === "personal"),
      );
      const response = await client.rpc("implanta_commit_v2", {
        p_changes: diff.changes,
        p_removed: diff.removed,
        p_created: created,
        p_deleted: deleted,
        p_preferences: preferences,
        p_import: options.import === true,
      });
      if (response.error?.code === "40001") continue;
      check(response);
      try {
        return service.apply(await service.read());
      } catch {
        // A committed transaction cannot be reported as unsaved. Keep the returned
        // canonical server snapshot (including validation stamps) until refresh.
        warning = "Alteração salva. Reconectando para atualizar a equipe.";
        if (response.data?.records) {
          const result = response.data;
          result.rows = assembleRecords(result.records).map((data) => ({
            id: data.id,
            data,
            version: result.projects.find((p) => p.id === data.id)?.version,
          }));
          return service.apply(result);
        }
        throw new Error(
          "Salvamento confirmado no banco. Reabra o aplicativo para carregar os dados antes de editar novamente.",
        );
      }
    }
    throw new Error(
      "Novas alterações chegaram durante o salvamento. Seu formulário foi mantido; atualize os dados antes de tentar novamente.",
    );
  }
  return service;
}
