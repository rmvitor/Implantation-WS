import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  implantationProject,
  preparedImplantation,
  technicalActor,
} from "../tests/fixtures/implantation.js";
import { recordChanges, assembleRecords } from "../src/records.js";
import {
  saveImplantationQuestion,
  resetImplantationReport,
  importedImplantation,
  saveImplantationResponsibles,
} from "../src/implantation.js";
export async function testCustomerPortal(owner, connectionUrl) {
  const name = `customer_portal_${process.pid}_${Date.now()}`,
    url = new URL(connectionUrl);
  url.pathname = "/" + name;
  const clients = [];
  let checks = 0;
  const ids = {
    master: "00000000-0000-4000-8000-000000000001",
    editor: technicalActor.id,
    viewer: "00000000-0000-4000-8000-000000000003",
    ana: "00000000-0000-4000-8000-000000000004",
    bruno: "00000000-0000-4000-8000-000000000005",
    wrong: "00000000-0000-4000-8000-000000000006",
  };
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
  const sql = async (file) =>
    readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    );
  await owner.query(`create database ${name}`);
  try {
    const root = await open();
    await root.query(
      "create schema auth;create table auth.users(id uuid primary key,email text,email_confirmed_at timestamptz default now(),raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;",
    );
    await root.query(await sql("202610090001_implanta.sql"));
    for (const [who, id] of Object.entries(ids))
      await root.query(
        "insert into auth.users(id,email,raw_user_meta_data)values($1,$2,$3)",
        [id, who + "@example.invalid", { display_name: who }],
      );
    await root.query(
      "update public.implanta_profiles set active=true where id=any($1)",
      [[ids.master, ids.editor, ids.viewer]],
    );
    await root.query("insert into implanta_private.admins values($1)", [
      ids.master,
    ]);
    const initial = implantationProject();
    await root.query(
      "insert into public.implanta_projects(id,data,created_by)values($1,$2,$3)",
      [initial.id, initial, ids.editor],
    );
    await root.query(
      "insert into public.implanta_members values($1,$2,'viewer')",
      [initial.id, ids.viewer],
    );
    await root.query(await sql("202610090002_records.sql"));
    await root.query(
      (await sql("202610150001_project_ownership.sql")).replaceAll(
        "SEU_EMAIL_MASTER",
        "master@example.invalid",
      ),
    );
    for (const file of [
      "202610240001_implantation_acceptance.sql",
      "202610240002_acceptance_workflow.sql",
      "202610260001_acceptance_flags.sql",
      "202610260003_customer_portal.sql",
    ])
      await root.query(await sql(file));
    const master = await open("master");
    const editor = await open("editor"),
      ana = await open("ana"),
      bruno = await open("bruno"),
      wrong = await open("wrong"),
      viewer = await open("viewer");
    const read = async () => {
      const snapshot = (
        await editor.query("select public.implanta_read_v2() value")
      ).rows[0].value;
      return {
        snapshot,
        project: assembleRecords(snapshot.records).find(
          (p) => p.id === initial.id,
        ),
      };
    };
    const write = async (next, importing = false) => {
      const { snapshot, project } = await read(),
        diff = recordChanges([project], [next], snapshot.records);
      const r = (
        await (importing ? master : editor).query(
          "select public.implanta_commit_v2($1,$2,'[]','[]',null,$3) value",
          [
            JSON.stringify(diff.changes),
            JSON.stringify(diff.removed),
            importing,
          ],
        )
      ).rows[0].value;
      return assembleRecords(r.records).find((p) => p.id === initial.id);
    };
    let p = preparedImplantation();
    p.implantation.entries[0].responsibles[1].email = "bruno@example.invalid";
    const e = p.implantation.entries[0];
    p = saveImplantationQuestion(
      p,
      e.id,
      "01",
      {
        answer: "yes",
        notes: "Apresentação liberada",
        technical: true,
        responsibleIds: ["ana", "bruno"],
        clientIds: [],
      },
      technicalActor,
    );
    p = await write(p);
    const techBefore = structuredClone(
      p.implantation.entries[0].questions[0].technical,
    );
    const create = async (id, c = editor) =>
      (
        await c.query(
          "select public.implanta_customer_invite_create($1,$2,$3) value",
          [p.id, e.id, id],
        )
      ).rows[0].value;
    const inviteA = await create("ana"),
      inviteB = await create("bruno");
    assert.ok(
      Math.abs(
        new Date(inviteA.expires_at) -
          new Date(inviteA.created_at) -
          7 * 86400000,
      ) < 1000,
    );
    checks++;
    await assert.rejects(create("ana", viewer), (err) => err.code === "42501");
    checks++;
    await assert.rejects(
      ana.query("select * from implanta_private.customer_invites"),
      (err) => err.code === "42501",
    );
    checks++;
    assert.equal(
      (await ana.query("select * from public.implanta_municipality_records"))
        .rowCount,
      0,
    );
    checks++;
    await assert.rejects(
      ana.query("select public.implanta_read_v2()"),
      (err) => err.code === "42501",
    );
    checks++;
    const get = async (c, id) =>
      (await c.query("select public.implanta_customer_read($1) value", [id]))
        .rows[0].value;
    await assert.rejects(get(wrong, inviteA.id), (err) => err.code === "42501");
    checks++;
    await root.query(
      "update auth.users set email_confirmed_at=null where id=$1",
      [ids.ana],
    );
    await assert.rejects(get(ana, inviteA.id), (err) => err.code === "42501");
    checks++;
    await root.query(
      "update auth.users set email_confirmed_at=now() where id=$1",
      [ids.ana],
    );
    let a = await get(ana, inviteA.id),
      b = await get(bruno, inviteB.id);
    assert.equal(a.points.length, 1);
    assert.equal(a.total, 11);
    assert.equal(a.name, "Ana");
    assert.equal(a.email, "ana@example.invalid");
    assert.ok(!JSON.stringify(a).includes(initial.cpf));
    assert.equal(a.project, undefined);
    checks += 6;
    const accept = async (c, invite, point, value = true) =>
      (
        await c.query(
          "select public.implanta_customer_accept($1,$2,$3,$4) value",
          [invite.id, point.id, point.revision, value],
        )
      ).rows[0].value;
    await assert.rejects(
      accept(ana, inviteA, { id: "02", revision: 1 }),
      (err) => ["23514", "40001", "42501"].includes(err.code),
    );
    checks++;
    await assert.rejects(
      accept(ana, inviteA, { id: "01", revision: null }),
      (err) => err.code === "40001",
    );
    await assert.rejects(
      accept(ana, inviteA, a.points[0], null),
      (err) => err.code === "23514",
    );
    assert.equal(
      (
        await root.query(
          "select has_function_privilege('anon','public.implanta_customer_read(uuid)','execute') allowed",
        )
      ).rows[0].allowed,
      false,
    );
    const directory = (
      await master.query("select public.implanta_admin_users() value")
    ).rows[0].value;
    assert.equal(
      directory.find((x) => x.id === ids.ana).externalCustomer,
      true,
    );
    assert.equal(
      directory.find((x) => x.id === ids.wrong).externalCustomer,
      false,
    );
    checks += 5;
    a = await accept(ana, inviteA, a.points[0]);
    assert.equal(a.points[0].accepted, true);
    p = (await read()).project;
    let q = p.implantation.entries[0].questions[0];
    assert.deepEqual(q.technical, techBefore);
    assert.equal(q.clients[0].actorId, ids.ana);
    assert.equal(q.clients[0].origin, "customer-portal");
    checks += 4;
    const ownProof = structuredClone(q.clients[0]);
    for (const responsibleIds of [["ana"], ["ana", "bruno"]]) {
      p = await write(
        saveImplantationQuestion(
          p,
          e.id,
          "01",
          {
            answer: q.answer,
            notes: q.notes,
            technical: true,
            responsibleIds,
            clientIds: ["ana"],
          },
          technicalActor,
        ),
      );
      q = p.implantation.entries[0].questions[0];
      assert.deepEqual(q.clients[0], ownProof);
      assert.deepEqual(q.technical, techBefore);
      checks += 2;
    }
    await assert.rejects(
      accept(bruno, inviteB, b.points[0]),
      (err) => err.code === "40001",
    );
    checks++;
    b = await get(bruno, inviteB.id);
    await accept(bruno, inviteB, b.points[0]);
    p = (await read()).project;
    q = p.implantation.entries[0].questions[0];
    assert.equal(q.clients.length, 2);
    assert.equal(q.clients.find((c) => c.id === "ana").actorId, ids.ana);
    checks += 2;
    const forged = structuredClone(p);
    forged.implantation.entries[0].questions[0].clients[0].by = "Falso";
    await assert.rejects(write(forged), (err) => err.code === "42501");
    checks++;
    const changed = structuredClone(p);
    changed.implantation.entries[0].questions[0].notes =
      "Troca sem retirar cliente";
    await assert.rejects(write(changed), (err) => err.code === "23514");
    checks++;
    a = await get(ana, inviteA.id);
    await accept(ana, inviteA, a.points[0], false);
    p = (await read()).project;
    q = p.implantation.entries[0].questions[0];
    assert.deepEqual(q.technical, techBefore);
    assert.equal(q.clients.length, 1);
    assert.equal(q.clients[0].id, "bruno");
    checks += 3;
    a = await get(ana, inviteA.id);
    await accept(ana, inviteA, a.points[0]);
    p = (await read()).project;
    for (const old of p.implantation.entries[0].questions.slice(1))
      p = await write(
        saveImplantationQuestion(
          p,
          e.id,
          old.id,
          {
            answer:
              old.kind === "blocking" ? "no" : old.id === "03" ? "na" : "yes",
            notes: old.id === "03" ? "Não contratado neste caso." : "",
            technical: old.kind !== "blocking" && old.id !== "03",
            responsibleIds:
              old.kind !== "blocking" && old.id !== "03" ? ["ana"] : [],
            clientIds: [],
          },
          technicalActor,
        ),
      );
    a = await get(ana, inviteA.id);
    assert.equal(a.points.length, 9);
    b = await get(bruno, inviteB.id);
    assert.equal(b.points.length, 1);
    const otherPoint = (
      await root.query(
        "select revision from public.implanta_implantation_question_records where project_id=$1 and data->'question'->>'id'='02'",
        [p.id],
      )
    ).rows[0];
    await assert.rejects(
      accept(bruno, inviteB, { id: "02", revision: otherPoint.revision }),
      (err) => err.code === "42501",
    );
    checks += 3;
    for (const point of a.points.filter((x) => !x.accepted))
      a = await accept(ana, inviteA, point);
    assert.equal(a.ready, true);
    checks++;
    const term = (
      await ana.query("select public.implanta_customer_report($1) value", [
        inviteA.id,
      ])
    ).rows[0].value;
    assert.equal(term.module, "Frota");
    assert.equal(term.origin, "customer-portal");
    assert.equal(term.actorId, ids.ana);
    assert.ok(!JSON.stringify(term).includes(initial.cpf));
    checks += 4;
    const again = (
      await ana.query("select public.implanta_customer_report($1) value", [
        inviteA.id,
      ])
    ).rows[0].value;
    assert.equal(again.id, term.id);
    checks++;
    const backup = structuredClone((await read()).project);
    await editor.query(
      "select public.implanta_customer_invite_action($1,'revoke')",
      [inviteA.id],
    );
    await assert.rejects(get(ana, inviteA.id), (err) => err.code === "42501");
    checks++;
    let renewed = await create("ana");
    assert.notEqual(renewed.id, inviteA.id);
    assert.ok((await get(ana, renewed.id)).ready);
    checks += 2;
    // A revocation committed while a customer waits for the project lock wins.
    a = await get(ana, renewed.id);
    await editor.query("begin");
    await editor.query(
      "select public.implanta_customer_invite_action($1,'revoke')",
      [renewed.id],
    );
    const waiting = assert.rejects(
      accept(ana, renewed, a.points[0]),
      (err) => err.code === "42501",
    );
    let blocked = false;
    for (let n = 0; n < 100; n++) {
      blocked = (
        await root.query(
          "select exists(select 1 from pg_stat_activity where datname=$1 and wait_event_type='Lock' and query like '%implanta_customer_accept%') value",
          [name],
        )
      ).rows[0].value;
      if (blocked) break;
      await new Promise((r) => setTimeout(r, 20));
    }
    await editor.query("commit");
    await waiting;
    assert.equal(blocked, true);
    checks += 2;
    renewed = await create("ana");
    await root.query(
      "update implanta_private.customer_invites set expires_at=now()-interval '1 second' where id=$1",
      [renewed.id],
    );
    await assert.rejects(get(ana, renewed.id), (err) => err.code === "42501");
    checks++;
    const next = await create("ana");
    p = (await read()).project;
    p = await write(
      saveImplantationResponsibles(
        p,
        e.id,
        p.implantation.entries[0].responsibles.map((r) =>
          r.id === "ana" ? { ...r, email: "different@example.invalid" } : r,
        ),
        technicalActor,
      ),
    );
    await assert.rejects(get(ana, next.id), (err) => err.code === "42501");
    checks++;
    p = await write(resetImplantationReport(p, e.id, technicalActor));
    await assert.rejects(get(bruno, inviteB.id), (err) => err.code === "42501");
    assert.equal(p.implantation.terms[0].id, term.id);
    checks += 2;
    assert.equal(
      (
        await root.query(
          "select active from public.implanta_profiles where id=$1",
          [ids.ana],
        )
      ).rows[0].active,
      false,
    );
    checks++;
    // A sole responsible is assigned without fabricating a customer acceptance.
    p = await write(
      saveImplantationResponsibles(
        p,
        e.id,
        [
          {
            id: "ana",
            name: "Ana",
            role: "Diretora de Frota",
            email: "ana@example.invalid",
          },
        ],
        technicalActor,
      ),
    );
    p = await write(
      saveImplantationQuestion(
        p,
        e.id,
        "01",
        {
          answer: "yes",
          notes: "",
          technical: true,
          responsibleIds: [],
          clientIds: [],
        },
        technicalActor,
      ),
    );
    const sole = await create("ana");
    a = await get(ana, sole.id);
    assert.equal(a.points.length, 1);
    p = (await read()).project;
    assert.deepEqual(p.implantation.entries[0].questions[0].responsibleIds, [
      "ana",
    ]);
    assert.deepEqual(p.implantation.entries[0].questions[0].clients, []);
    checks += 3;
    // Backups preserve evidence as unverified; they cannot recreate trusted external OKs.
    p = await write(importedImplantation(backup, p), true);
    assert.equal(
      p.implantation.entries[0].questions[0].clients[0].source,
      "imported-unverified",
    );
    assert.equal((await get(ana, sole.id)).points.length, 0);
    assert.equal((await get(ana, sole.id)).ready, false);
    assert.equal(p.implantation.terms[0].id, term.id);
    checks += 4;
    await root.query(await sql("202610260003_customer_portal.sql"));
    assert.equal(
      (
        await root.query(
          "select count(*) from public.implanta_implantation_term_records",
        )
      ).rows[0].count,
      "1",
    );
    checks++;
    console.log(
      `${checks} verificações do portal: escopo, OTP verificado, concorrência, autoria, termos, expiração, revogação e rotina interna preservados.`,
    );
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    await owner.query(`drop database if exists ${name}`);
  }
}
