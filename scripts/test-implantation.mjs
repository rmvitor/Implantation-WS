import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  configureImplantation,
  saveImplantationResponsibles,
  saveImplantationQuestion,
  implantationId,
  implantationProgress,
  implantationSnapshot,
  issueImplantationTerm,
  currentImplantationTerm,
} from "../src/implantation.js";
import {
  projectRecords,
  assembleRecords,
  recordChanges,
} from "../src/records.js";
import { implantationProject } from "../tests/fixtures/implantation.js";

// Disposable databases only. No production URL or credentials are accepted here.
export async function testImplantation(owner, connectionUrl) {
  const migration = await readFile(
    new URL(
      "../supabase/migrations/202610240001_implantation_acceptance.sql",
      import.meta.url,
    ),
    "utf8",
  );
  const roles = (
    await readFile(
      new URL(
        "../supabase/migrations/202610150001_project_ownership.sql",
        import.meta.url,
      ),
      "utf8",
    )
  ).replaceAll("SEU_EMAIL_MASTER", "master@example.invalid");
  const ids = Object.fromEntries(
    ["master", "editor", "viewer", "other", "pending"].map((name, i) => [
      name,
      `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    ]),
  );
  const claimed = { id: ids.master, name: "Nome forjado no navegador" };
  let checks = 0;
  for (const normalized of [false, true]) {
    const name = `implanta_acceptance_${process.pid}_${Date.now()}`;
    const url = new URL(connectionUrl);
    url.pathname = `/${name}`;
    const clients = [];
    const open = async (key) => {
      const c = new pg.Client({ connectionString: url.href });
      await c.connect();
      clients.push(c);
      if (key) {
        await c.query(`set role ${key === "anon" ? "anon" : "authenticated"}`);
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids[key] || "",
        ]);
      }
      return c;
    };
    await owner.query(`create database ${name}`);
    try {
      const root = await open();
      await root.query(`create schema auth; create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');
        create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
        grant usage on schema auth to authenticated,anon; grant execute on function auth.uid() to authenticated,anon;`);
      await root.query(
        await readFile(
          new URL(
            "../supabase/migrations/202610090001_implanta.sql",
            import.meta.url,
          ),
          "utf8",
        ),
      );
      for (const [key, id] of Object.entries(ids))
        await root.query(
          "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
          [id, `${key}@example.invalid`, { display_name: key }],
        );
      await root.query(
        "update public.implanta_profiles set active=true where id<>$1",
        [ids.pending],
      );
      await root.query("insert into implanta_private.admins values($1)", [
        ids.master,
      ]);
      const original = implantationProject();
      for (const [project, creator] of [
        [original, ids.editor],
        [
          { ...original, id: "other-project", name: "Outro projeto" },
          ids.other,
        ],
      ])
        await root.query(
          "insert into public.implanta_projects(id,data,created_by) values($1,$2,$3)",
          [project.id, project, creator],
        );
      await root.query(
        "insert into public.implanta_members values($1,$2,'viewer')",
        [original.id, ids.viewer],
      );
      if (normalized)
        await root.query(
          await readFile(
            new URL(
              "../supabase/migrations/202610090002_records.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
      await root.query(roles);
      const before = (
        await root.query(
          "select id,data,version from public.implanta_projects order by id",
        )
      ).rows;
      await root.query(migration);
      assert.deepEqual(
        (
          await root.query(
            "select id,data,version from public.implanta_projects order by id",
          )
        ).rows,
        before,
      );
      checks++;
      const editor = await open("editor"),
        viewer = await open("viewer"),
        other = await open("other"),
        pending = await open("pending"),
        anon = await open("anon");
      assert.equal(
        (
          await editor.query(
            "select public.implanta_implantation_capabilities() value",
          )
        ).rows[0].value.version,
        1,
      );
      checks++;
      for (const c of [pending, anon]) {
        await assert.rejects(
          c.query("select public.implanta_implantation_capabilities()"),
          (e) => e.code === "42501",
        );
        checks++;
      }
      for (const c of [editor, viewer]) {
        await assert.rejects(
          c.query(
            "insert into public.implanta_implantation_records(project_id,id,data) values($1,$1,'{}')",
            [original.id],
          ),
          (e) => e.code === "42501",
        );
        checks++;
      }
      let modern = normalized;
      const read = async (c = editor) => {
        if (modern) {
          const snapshot = (
            await c.query("select public.implanta_read_v2() value")
          ).rows[0].value;
          return {
            snapshot,
            project: assembleRecords(snapshot.records).find(
              (p) => p.id === original.id,
            ),
          };
        }
        const row = (
          await c.query(
            "select data,version from public.implanta_projects where id=$1",
            [original.id],
          )
        ).rows[0];
        return { project: row?.data, version: row?.version };
      };
      const write = async (next, c = editor, base) => {
        const current = base || (await read(c));
        if (modern) {
          const diff = recordChanges(
            [current.project],
            [next],
            current.snapshot.records,
          );
          const saved = (
            await c.query(
              "select public.implanta_commit_v2($1,$2,'[]','[]',null,false) value",
              [JSON.stringify(diff.changes), JSON.stringify(diff.removed)],
            )
          ).rows[0].value;
          return assembleRecords(saved.records).find(
            (p) => p.id === original.id,
          );
        }
        const saved = (
          await c.query(
            "select public.implanta_commit_implantation($1,'[]',null) value",
            [
              JSON.stringify([
                {
                  id: original.id,
                  data: next,
                  create: false,
                  version: current.version,
                },
              ]),
            ],
          )
        ).rows[0].value;
        return saved[0].data;
      };
      let p = await write(
        configureImplantation(
          original,
          [{ module: "Frota", entity: "Prefeitura" }],
          claimed,
        ),
      );
      const entryId = implantationId("Frota", "Prefeitura");
      assert.equal(p.implantation.entries[0].questions.length, 11);
      checks++;
      p = await write(
        saveImplantationResponsibles(
          p,
          entryId,
          [
            { id: "ana", name: "Ana", role: "Diretora", email: "" },
            { id: "bruno", name: "Bruno", role: "Operador", email: "" },
          ],
          claimed,
        ),
      );
      const draft = {
        answer: "yes",
        notes: "",
        responsibleIds: ["ana", "bruno"],
        technical: true,
        clientIds: ["ana"],
      };
      p = await write(
        saveImplantationQuestion(p, entryId, "01", draft, claimed),
      );
      const first = p.implantation.entries[0].questions[0];
      assert.equal(first.technical.actorId, ids.editor);
      assert.equal(first.technical.by, "editor");
      assert.equal(first.technical.source, "server");
      assert.ok(first.technical.at);
      checks += 4;
      assert.equal(first.clients[0].actorId, ids.editor);
      assert.equal(first.clients[0].clientName, "Ana");
      checks += 2;
      assert.equal(implantationProgress(p).ready, false);
      checks++;
      const spoofTerm = {
        id: "premature",
        entity: "Prefeitura",
        at: "1900-01-01T00:00:00Z",
        actorId: ids.master,
        actorName: "Falso",
        source: "server",
        snapshot: implantationSnapshot(p, "Prefeitura"),
      };
      const premature = structuredClone(p);
      premature.implantation.terms.push(spoofTerm);
      await assert.rejects(write(premature), /todos os OKs/);
      checks++;
      for (const q of p.implantation.entries[0].questions)
        p = await write(
          saveImplantationQuestion(
            p,
            entryId,
            q.id,
            {
              ...draft,
              answer: q.kind === "blocking" ? "no" : "yes",
              clientIds: ["ana", "bruno"],
            },
            claimed,
          ),
        );
      assert.equal(implantationProgress(p).ready, true);
      checks++;
      const confirmed = structuredClone(
        p.implantation.entries[0].questions[0].technical,
      );
      // A restored/copied server actor must never impersonate another account.
      const forged = structuredClone(p);
      forged.implantation.entries[0].questions[0].technical = {
        ...confirmed,
        actorId: ids.master,
        by: "Master falso",
      };
      p = await write(forged);
      assert.equal(
        p.implantation.entries[0].questions[0].technical.actorId,
        ids.editor,
      );
      checks++;
      p = await write(issueImplantationTerm(p, "Prefeitura", claimed));
      const issued = structuredClone(p.implantation.terms[0]);
      assert.equal(issued.actorId, ids.editor);
      assert.equal(issued.actorName, "editor");
      assert.equal(issued.source, "server");
      assert.ok(currentImplantationTerm(p, "Prefeitura"));
      checks += 4;
      const changedTerm = structuredClone(p);
      changedTerm.implantation.terms[0].snapshot.entries[0].responsibles[0].name =
        "Outro nome";
      await assert.rejects(write(changedTerm), /não podem ser alterados/);
      checks++;
      const blocked = saveImplantationQuestion(
        p,
        entryId,
        "11",
        {
          ...draft,
          answer: "yes",
          notes: "Impedimento",
          clientIds: ["ana", "bruno"],
        },
        claimed,
      );
      p = await write(blocked);
      assert.equal(implantationProgress(p).ready, false);
      assert.deepEqual(p.implantation.terms[0], issued);
      checks += 2;
      const invalidIssue = structuredClone(p);
      invalidIssue.implantation.terms.unshift({
        ...spoofTerm,
        id: "blocked",
        snapshot: implantationSnapshot(p, "Prefeitura"),
      });
      await assert.rejects(write(invalidIssue), /impedimentos/);
      checks++;
      const latest = await read();
      const unconfirmedChange = structuredClone(p);
      unconfirmedChange.implantation.entries[0].questions[0].notes =
        "Resposta alterada mantendo provas antigas";
      p = await write(unconfirmedChange);
      assert.equal(p.implantation.entries[0].questions[0].technical, null);
      assert.deepEqual(p.implantation.entries[0].questions[0].clients, []);
      checks += 2;
      const staleDesired = structuredClone(latest.project);
      staleDesired.implantation.entries[0].questions[0].notes =
        "Edição de uma versão antiga";
      if (modern)
        await assert.rejects(
          write(staleDesired, editor, latest),
          (e) => e.code === "40001",
        );
      else
        await assert.rejects(
          editor.query(
            "select public.implanta_commit_implantation($1,'[]',null)",
            [
              JSON.stringify([
                {
                  id: original.id,
                  data: latest.project,
                  version: latest.version,
                  create: false,
                },
              ]),
            ],
          ),
          (e) => e.code === "40001",
        );
      checks++;
      // Permission checks use the server, not disabled UI controls.
      await assert.rejects(
        write(configureImplantation(p, [], claimed), viewer),
        (e) => e.code === "42501",
      );
      checks++;
      assert.equal(
        (
          await other.query(
            "select count(*) from public.implanta_implantation_question_records where project_id=$1",
            [original.id],
          )
        ).rows[0].count,
        "0",
      );
      checks++;
      if (!modern) {
        const noField = structuredClone(p);
        delete noField.implantation;
        p = await write(noField);
        assert.deepEqual(p.implantation.terms[0], issued);
        checks++;
      }
      const intact = structuredClone(p.implantation);
      await root.query(migration);
      assert.deepEqual((await read()).project.implantation, intact);
      checks++;
      if (!modern) {
        await root.query(
          await readFile(
            new URL(
              "../supabase/migrations/202610090002_records.sql",
              import.meta.url,
            ),
            "utf8",
          ),
        );
        assert.equal(
          (
            await editor.query(
              "select public.implanta_implantation_capabilities() value",
            )
          ).rows[0].value.version,
          0,
        );
        checks++;
        await root.query(roles);
        await root.query(migration);
        modern = true;
        assert.deepEqual((await read()).project.implantation, intact);
        checks++;
      }
      // Every term snapshot remains available, independent of current edits.
      assert.deepEqual((await read()).project.implantation.terms[0], issued);
      checks++;
      const deletionVersion = (await read()).snapshot.projects.find(
        (row) => row.id === original.id,
      ).version;
      await editor.query(
        "select public.implanta_commit_v2('[]','[]','[]',$1,null,false)",
        [JSON.stringify([{ id: original.id, version: deletionVersion }])],
      );
      assert.equal(
        (
          await root.query(
            "select count(*) from public.implanta_implantation_term_records where project_id=$1",
            [original.id],
          )
        ).rows[0].count,
        "0",
      );
      checks++;
      assert.equal(
        (
          await root.query(
            "select count(*) from public.implanta_projects where id='other-project'",
          )
        ).rows[0].count,
        "1",
      );
      checks++;
      console.log(
        `Homologação da implantação (${normalized ? "registros" : "legado + transição v2"}): identidade de servidor, múltiplos responsáveis, bloqueios, termos, permissões e preservação aprovados.`,
      );
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await owner.query(`drop database if exists ${name}`);
    }
  }
  console.log(
    `${checks} verificações adicionais da homologação da implantação aprovadas.`,
  );
}
