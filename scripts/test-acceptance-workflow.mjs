import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  configureImplantation,
  saveImplantationResponsibles,
  saveImplantationQuestion,
  implantationProgress,
  implantationSnapshot,
  issueImplantationTerm,
  saveImplantationModel,
  resetImplantationReport,
  validateImplantation,
} from "../src/implantation.js";
import { recordChanges, assembleRecords } from "../src/records.js";
import {
  implantationProject,
  completeImplantation,
} from "../tests/fixtures/implantation.js";
export async function testAcceptanceWorkflow(owner, connectionUrl) {
  let checks = 0;
  const sql = async (name) =>
    readFile(
      new URL(`../supabase/migrations/${name}`, import.meta.url),
      "utf8",
    );
  const ids = {
    master: "00000000-0000-4000-8000-000000000001",
    editor: "00000000-0000-4000-8000-000000000002",
    viewer: "00000000-0000-4000-8000-000000000003",
  };
  const actor = { id: ids.editor, name: "editor" };
  for (const normalized of [false, true]) {
    const name = `acceptance_v2_${process.pid}_${Date.now()}`,
      url = new URL(connectionUrl);
    url.pathname = `/${name}`;
    let modern = normalized;
    const clients = [];
    const open = async (key) => {
      const c = new pg.Client({ connectionString: url.href });
      await c.connect();
      clients.push(c);
      if (key) {
        await c.query("set role authenticated");
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids[key],
        ]);
      }
      return c;
    };
    await owner.query(`create database ${name}`);
    try {
      const root = await open();
      await root.query(
        `create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
      );
      await root.query(await sql("202610090001_implanta.sql"));
      for (const [key, id] of Object.entries(ids))
        await root.query(
          "insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)",
          [id, `${key}@example.invalid`, { display_name: key }],
        );
      await root.query("update public.implanta_profiles set active=true");
      await root.query("insert into implanta_private.admins values($1)", [
        ids.master,
      ]);
      const original = {
        ...implantationProject(),
        entities: [
          "Prefeitura",
          ...Array.from({ length: 14 }, (_, i) => `Entidade ${i + 2}`),
        ],
      };
      await root.query(
        "insert into public.implanta_projects(id,data,created_by)values($1,$2,$3)",
        [original.id, original, ids.editor],
      );
      await root.query(
        "insert into public.implanta_members values($1,$2,'viewer')",
        [original.id, ids.viewer],
      );
      if (normalized) await root.query(await sql("202610090002_records.sql"));
      await root.query(
        (await sql("202610150001_project_ownership.sql")).replaceAll(
          "SEU_EMAIL_MASTER",
          "master@example.invalid",
        ),
      );
      await root.query(await sql("202610240001_implantation_acceptance.sql"));
      const migration = await sql("202610240002_acceptance_workflow.sql");
      await root.query(migration);
      // Seed an actual v2 project/term before installing v3; prior negative
      // approvals must be archived without changing the issued snapshot.
      await root.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids.editor,
      ]);
      let prior = { ...completeImplantation(), id: "prior-flags" };
      const previousNegative = prior.implantation.entries[0].questions.find(
        (q) => q.kind === "blocking",
      );
      previousNegative.technical = structuredClone(
        prior.implantation.entries[0].questions[0].technical,
      );
      previousNegative.clients = structuredClone(
        prior.implantation.entries[0].questions[0].clients,
      );
      const priorRead = async () =>
        normalized
          ? assembleRecords(
              (await root.query("select public.implanta_read_v2() value"))
                .rows[0].value.records,
            ).find((x) => x.id === prior.id)
          : (
              await root.query(
                "select data from public.implanta_projects where id=$1",
                [prior.id],
              )
            ).rows[0].data;
      const priorWrite = async (next, create = false) => {
        if (normalized) {
          const snapshot = (
            await root.query("select public.implanta_read_v2() value")
          ).rows[0].value;
          const diff = recordChanges(
            create ? [] : [await priorRead()],
            [next],
            snapshot.records,
          );
          await root.query(
            "select public.implanta_commit_v2($1,'[]',$2,'[]',null,false)",
            [
              JSON.stringify(diff.changes),
              JSON.stringify(create ? [{ id: next.id, data: next }] : []),
            ],
          );
        } else {
          const version = create
            ? 0
            : (
                await root.query(
                  "select version from public.implanta_projects where id=$1",
                  [prior.id],
                )
              ).rows[0].version;
          await root.query(
            "select public.implanta_commit_implantation($1,'[]',null)",
            [JSON.stringify([{ id: next.id, data: next, version, create }])],
          );
        }
      };
      await priorWrite(prior, true);
      prior = await priorRead();
      prior.implantation.terms = [
        {
          id: "legacy-term",
          entity: "Prefeitura",
          actorId: ids.editor,
          actorName: "editor",
          at: new Date().toISOString(),
          source: "authenticated-client",
          snapshot: implantationSnapshot(prior, "Prefeitura"),
        },
      ];
      await priorWrite(prior);
      prior = await priorRead();
      const oldTerm = structuredClone(prior.implantation.terms[0]);
      const oldNegative = structuredClone(
        prior.implantation.entries[0].questions.find(
          (q) => q.kind === "blocking",
        ),
      );
      const oldPositive = structuredClone(
        prior.implantation.entries[0].questions[0],
      );
      await root.query("select set_config('request.jwt.claim.sub','',false)");
      await root.query(await sql("202610260001_acceptance_flags.sql"));
      await root.query("select set_config('request.jwt.claim.sub',$1,false)", [
        ids.editor,
      ]);
      const migratedPrior = await priorRead();
      const migratedNegative =
        migratedPrior.implantation.entries[0].questions.find(
          (q) => q.kind === "blocking",
        );
      assert.equal(migratedNegative.technical, null);
      assert.deepEqual(migratedNegative.clients, []);
      assert.deepEqual(
        migratedNegative.approvalHistory[0].technical,
        oldNegative.technical,
      );
      assert.deepEqual(
        migratedNegative.approvalHistory[0].clients,
        oldNegative.clients,
      );
      assert.deepEqual(migratedPrior.implantation.terms[0], oldTerm);
      assert.doesNotThrow(() =>
        validateImplantation(migratedPrior.implantation),
      );
      checks++;
      assert.deepEqual(
        migratedPrior.implantation.entries[0].questions[0],
        oldPositive,
      );
      checks += 6;
      await priorWrite(
        resetImplantationReport(
          migratedPrior,
          migratedPrior.implantation.entries[0].id,
          { id: ids.editor, name: "editor" },
        ),
      );
      const resetPrior = await priorRead();
      assert.equal(resetPrior.implantation.entries[0].responsibles.length, 0);
      assert.ok(
        resetPrior.implantation.entries[0].questions.every(
          (q) =>
            q.answer === "" &&
            q.notes === "" &&
            q.technical === null &&
            q.clients.length === 0,
        ),
      );
      assert.deepEqual(resetPrior.implantation.terms[0], oldTerm);
      checks += 3;
      await root.query("select set_config('request.jwt.claim.sub','',false)");

      const editor = await open("editor"),
        master = await open("master"),
        viewer = await open("viewer");
      const models = async (c) =>
        (await c.query("select public.implanta_implantation_templates() value"))
          .rows[0].value;
      let catalog = await models(editor);
      assert.equal(catalog.length, 6);
      checks++;
      assert.equal(
        (
          await editor.query(
            "select public.implanta_implantation_capabilities() value",
          )
        ).rows[0].value.workflowVersion,
        3,
      );
      checks++;
      for (const c of [editor, viewer]) {
        await assert.rejects(
          c.query(
            "select public.implanta_save_implantation_template($1,$2,1,$3)",
            ["Frota", "[]", "changed"],
          ),
          (e) => e.code === "42501",
        );
        checks++;
      }
      await assert.rejects(
        master.query(
          "update public.implanta_implantation_templates set version='forjado'",
        ),
        (e) => e.code === "42501",
      );
      checks++;
      const read = async () => {
        if (modern) {
          const snapshot = (
            await editor.query("select public.implanta_read_v2() value")
          ).rows[0].value;
          return {
            snapshot,
            project: assembleRecords(snapshot.records).find(
              (p) => p.id === original.id,
            ),
          };
        }
        const row = (
          await editor.query(
            "select data,version from public.implanta_projects where id=$1",
            [original.id],
          )
        ).rows[0];
        return { project: row.data, version: row.version };
      };
      const write = async (next, c = editor) => {
        const current = await read();
        if (modern) {
          const diff = recordChanges(
            [current.project],
            [next],
            current.snapshot.records,
          );
          const result = (
            await c.query(
              "select public.implanta_commit_v2($1,$2,'[]','[]',null,false) value",
              [JSON.stringify(diff.changes), JSON.stringify(diff.removed)],
            )
          ).rows[0].value;
          return assembleRecords(result.records).find(
            (p) => p.id === original.id,
          );
        }
        return (
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
        ).rows[0].value[0].data;
      };
      const stablePrior = await root.query(
        "select version from public.implanta_projects where id='prior-flags'",
      );
      await root.query(await sql("202610260001_acceptance_flags.sql"));
      assert.deepEqual(
        (
          await root.query(
            "select version from public.implanta_projects where id='prior-flags'",
          )
        ).rows,
        stablePrior.rows,
      );
      checks++;
      const available = catalog.filter((m) => m.questions.length);
      const pairs = original.entities.flatMap((entity) =>
        available.map((m) => ({ entity, module: m.module })),
      );
      const start = Date.now();
      let p = await write(
        configureImplantation(original, pairs, actor, catalog),
      );
      console.log(
        `Ativação de 60 relatórios / 15 entidades (${normalized ? "registros" : "legado"}): ${Date.now() - start} ms.`,
      );
      assert.equal(p.implantation.entries.length, 60);
      checks++;
      const e = p.implantation.entries.find(
        (e) => e.module === "Frota" && e.entity === "Prefeitura",
      );
      const tampered = structuredClone(p);
      tampered.implantation.entries.find(
        (x) => x.id === e.id,
      ).questions[0].text = "Texto arbitrário por editor?";
      await assert.rejects(write(tampered), (err) => err.code === "42501");
      checks++;
      const reordered = structuredClone(p);
      reordered.implantation.entries
        .find((x) => x.id === e.id)
        .questions.reverse();
      await assert.rejects(write(reordered), (err) => err.code === "42501");
      checks++;
      const model = catalog.find((m) => m.module === "Frota");
      const modified = structuredClone(model.questions);
      modified[0].text = "Pergunta global revisada?";
      await master.query(
        "select public.implanta_save_implantation_template($1,$2,$3,$4)",
        ["Frota", JSON.stringify(modified), model.revision, "2026-4"],
      );
      catalog = await models(editor);
      assert.equal(catalog.find((m) => m.module === "Frota").revision, 2);
      checks++;
      const audit = (
        await master.query(
          "select * from public.implanta_implantation_template_audit",
        )
      ).rows;
      assert.equal(audit.length, 1);
      assert.equal(audit[0].actor_id, ids.master);
      assert.equal(
        audit[0].before_data.questions[0].text,
        model.questions[0].text,
      );
      assert.equal(audit[0].after_data.questions[0].text, modified[0].text);
      assert.ok(audit[0].at);
      assert.equal(
        (
          await editor.query(
            "select * from public.implanta_implantation_template_audit",
          )
        ).rowCount,
        0,
      );
      checks += 6;
      assert.notEqual(
        (await read()).project.implantation.entries.find((x) => x.id === e.id)
          .questions[0].text,
        "Pergunta global revisada?",
      );
      checks++;
      await assert.rejects(
        master.query(
          "select public.implanta_save_implantation_template($1,$2,$3,$4)",
          ["Frota", JSON.stringify(modified), model.revision, "stale"],
        ),
        (err) => err.code === "40001",
      );
      checks++;
      p = await write(
        saveImplantationResponsibles(
          p,
          e.id,
          [{ id: "ana", name: "Ana", role: "Diretora", email: "" }],
          actor,
        ),
      );
      for (const answer of ["no", "na"]) {
        const invalid = structuredClone(p);
        const point = invalid.implantation.entries.find((x) => x.id === e.id)
          .questions[0];
        point.answer = answer;
        point.notes = "Justificativa";
        point.technical = {
          actorId: ids.editor,
          by: "editor",
          at: new Date().toISOString(),
          source: "server",
        };
        await assert.rejects(write(invalid), (err) => err.code === "23514");
        checks++;
      }
      const base = {
        answer: "no",
        notes: "",
        responsibleIds: [],
        technical: false,
        clientIds: [],
      };
      p = await write(saveImplantationQuestion(p, e.id, "01", base, actor));
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions[0].answer,
        "no",
      );
      checks++;
      const annotated = {
        ...base,
        notes: "Não será utilizado pela entidade.",
        notUsed: false,
        responsibleIds: ["ana"],
        answer: "na",
        technical: false,
        clientIds: [],
      };
      p = await write(
        saveImplantationQuestion(
          p,
          e.id,
          "01",
          { ...base, answer: "yes", technical: true },
          actor,
        ),
      );
      p = await write(
        saveImplantationQuestion(
          p,
          e.id,
          "01",
          {
            ...base,
            answer: "yes",
            technical: true,
            responsibleIds: ["ana"],
            clientIds: ["ana"],
          },
          { id: ids.master, name: "master" },
        ),
        master,
      );
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions[0].technical
          .actorId,
        ids.editor,
      );
      checks++;
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions[0]
          .clients[0].actorId,
        ids.master,
      );
      checks++;
      for (const c of [editor, master]) {
        const invalid = structuredClone(p);
        const point = invalid.implantation.entries.find((x) => x.id === e.id)
          .questions[0];
        point.technical = null;
        point.clients = [];
        await assert.rejects(write(invalid, c), (err) => err.code === "23514");
        checks++;
      }
      p = await write(
        saveImplantationQuestion(
          p,
          e.id,
          "01",
          {
            ...base,
            answer: "yes",
            technical: true,
            responsibleIds: ["ana"],
            clientIds: [],
          },
          actor,
        ),
      );
      p = await write(
        saveImplantationQuestion(p, e.id, "01", annotated, actor),
      );
      assert.equal(
        !!p.implantation.entries.find((x) => x.id === e.id).questions[0]
          .notUsed,
        false,
      );
      checks++;
      for (const q of e.questions.slice(1))
        p = await write(
          saveImplantationQuestion(
            p,
            e.id,
            q.id,
            {
              ...base,
              answer: q.kind === "blocking" ? "no" : "yes",
              responsibleIds: ["ana"],
              technical: q.kind !== "blocking",
              clientIds: q.kind === "blocking" ? [] : ["ana"],
            },
            actor,
          ),
        );
      const only = {
        ...p,
        implantation: {
          entries: [p.implantation.entries.find((x) => x.id === e.id)],
        },
      };
      assert.equal(implantationProgress(only, "Prefeitura").ready, true);
      checks++;
      assert.equal(implantationProgress(p, "Prefeitura").ready, false);
      checks++;
      p = await write(
        issueImplantationTerm(
          p,
          "Prefeitura",
          actor,
          new Date().toISOString(),
          "Frota",
        ),
      );
      const term = structuredClone(p.implantation.terms[0]);
      assert.equal(term.module, "Frota");
      assert.equal(term.snapshot.entries.length, 1);
      checks += 2;
      const badTerm = structuredClone(p);
      badTerm.implantation.terms.unshift({
        ...term,
        id: "bad-entity-term",
        module: undefined,
        snapshot: implantationSnapshot(p, "Prefeitura"),
      });
      await assert.rejects(write(badTerm), /OKs/);
      checks++;
      const toKeep = pairs.filter(
        (pair) => !(pair.entity === "Prefeitura" && pair.module === "Frota"),
      );
      const directUncheck = structuredClone(p);
      directUncheck.implantation.entries.find((x) => x.id === e.id).included =
        false;
      await assert.rejects(write(directUncheck), /apagar/);
      checks++;
      p = await write(configureImplantation(p, toKeep, actor, catalog));
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions.length,
        0,
      );
      assert.deepEqual(p.implantation.terms[0], term);
      checks += 2;
      p = await write(configureImplantation(p, pairs, actor, catalog));
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions[0].text,
        "Pergunta global revisada?",
      );
      assert.equal(
        p.implantation.entries.find((x) => x.id === e.id).questions[0].answer,
        "",
      );
      checks += 2;
      const rightsBefore = (
        await root.query(
          "select project_id,user_id,role from public.implanta_members order by project_id,user_id",
        )
      ).rows;
      const peopleBefore = (
        await root.query(
          "select id,active from public.implanta_profiles order by id",
        )
      ).rows;
      const mastersBefore = (
        await root.query(
          "select user_id from implanta_private.admins order by user_id",
        )
      ).rows;
      const beforeBundle = structuredClone(p.implantation);
      const bundle = await sql("202610240003_activate_acceptance_records.sql");
      // Any error near the end rolls the entire cutover back, including DDL.
      const failingBundle = bundle.replace(
        /\nnotify pgrst,'reload schema';\ncommit;\n$/,
        () =>
          "\ndo $rollback_test$ begin raise exception 'rollback test'; end $rollback_test$;\ncommit;\n",
      );
      assert.notEqual(failingBundle, bundle);
      await assert.rejects(root.query(failingBundle), /rollback test/);
      await root.query("rollback");
      assert.equal(
        (
          await root.query(
            "select to_regclass('implanta_private.record_tables') is not null as separated",
          )
        ).rows[0].separated,
        normalized,
      );
      assert.deepEqual((await read()).project.implantation, beforeBundle);
      checks += 2;
      // A pre-cutover edit holds the project lock; the bundle must wait and
      // include the committed edit, never copy a stale project snapshot.
      const writer = await open();
      await writer.query("begin");
      await writer.query(
        "update public.implanta_projects set updated_at=now() where id=$1",
        [original.id],
      );
      if (!normalized)
        await writer.query(
          "update public.implanta_projects set data=jsonb_set(data,'{name}','\"Edição anterior ao corte\"') where id=$1",
          [original.id],
        );
      else
        await writer.query(
          "update public.implanta_municipality_records set data=jsonb_set(data,'{name}','\"Edição anterior ao corte\"') where project_id=$1 and id=$1",
          [original.id],
        );
      const migrating = root.query(bundle);
      const observing = await open();
      let waiting = false;
      for (let tries = 0; tries < 50; tries++) {
        const blocked = await observing.query(
          "select 1 from pg_stat_activity where pid=$1 and wait_event_type='Lock'",
          [root.processID],
        );
        if (blocked.rowCount) {
          waiting = true;
          break;
        }
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.ok(waiting, "cutover must wait for active project transaction");
      await writer.query("commit");
      await migrating;
      await root.query(await sql("202610260001_acceptance_flags.sql"));
      checks++;
      modern = true;
      assert.deepEqual((await read()).project.implantation, beforeBundle);
      checks++;
      assert.equal((await read()).project.name, "Edição anterior ao corte");
      checks++;
      assert.deepEqual(
        (
          await root.query(
            "select project_id,user_id,role from public.implanta_members order by project_id,user_id",
          )
        ).rows,
        rightsBefore,
      );
      checks++;
      assert.deepEqual(
        (
          await root.query(
            "select id,active from public.implanta_profiles order by id",
          )
        ).rows,
        peopleBefore,
      );
      checks++;
      assert.deepEqual(
        (
          await root.query(
            "select user_id from implanta_private.admins order by user_id",
          )
        ).rows,
        mastersBefore,
      );
      checks++;
      assert.equal((await read()).project.cpf, original.cpf);
      checks++;
      await assert.rejects(
        editor.query("select data from public.implanta_projects"),
        (e) => e.code === "42501",
      );
      checks++;
      await root.query(bundle);
      await root.query(await sql("202610260001_acceptance_flags.sql"));
      assert.deepEqual((await read()).project.implantation, beforeBundle);
      checks++;
      await assert.rejects(
        root.query(
          "update public.implanta_projects set data=jsonb_set(data,'{name}','\"stale write\"') where id=$1",
          [original.id],
        ),
        (err) => err.code === "55000",
      );
      await assert.rejects(
        root.query(
          "insert into public.implanta_projects(id,data,created_by) values($1,$2,$3)",
          ["legacy-resumed", { ...original, id: "legacy-resumed" }, ids.editor],
        ),
        (err) => err.code === "55000",
      );
      checks += 2;
      const intact = structuredClone(p);
      await root.query(migration);
      await root.query(await sql("202610260001_acceptance_flags.sql"));
      assert.deepEqual(
        (await read()).project.implantation,
        intact.implantation,
      );
      assert.equal(
        (await models(editor)).find((m) => m.module === "Frota").revision,
        2,
      );
      checks += 2;
      await assert.rejects(
        write(configureImplantation(p, [], actor, catalog), viewer),
        (err) => err.code === "42501",
      );
      checks++;
      const created = { ...implantationProject(), id: "created-after-cutover" };
      const diff = recordChanges([], [created], []);
      const createdResult = (
        await editor.query(
          "select public.implanta_commit_v2($1,'[]',$2,'[]',null,false) value",
          [
            JSON.stringify(diff.changes),
            JSON.stringify([{ id: created.id, data: created }]),
          ],
        )
      ).rows[0].value;
      assert.equal(
        assembleRecords(createdResult.records).find((x) => x.id === created.id)
          .name,
        created.name,
      );
      assert.equal(
        (
          await root.query(
            "select owner_id from public.implanta_projects where id=$1",
            [created.id],
          )
        ).rows[0].owner_id,
        ids.editor,
      );
      checks += 2;
    } finally {
      await Promise.all(clients.map((c) => c.end()));
      await owner.query(`drop database if exists ${name}`);
    }
  }
  console.log(
    `${checks} verificações do fluxo de aceites: modelos Master, 15 entidades, dispensas, emissão por módulo e desativação aprovadas.`,
  );
}
