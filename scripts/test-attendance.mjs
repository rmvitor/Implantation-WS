import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
export async function testAttendance(owner, connectionUrl) {
  const name = `attendance_${process.pid}_${Date.now()}`,
    url = new URL(connectionUrl);
  url.pathname = "/" + name;
  const clients = [];
  let checks = 0;
  const ids = Object.fromEntries(
    ["master", "manager", "editor", "viewer", "other", "pending"].map((k) => [
      k,
      randomUUID(),
    ]),
  );
  const open = async (who, role = "authenticated") => {
    const c = new pg.Client({ connectionString: url.href });
    await c.connect();
    clients.push(c);
    if (who || role === "anon") {
      await c.query(`set role ${role}`);
      if (who)
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids[who],
        ]);
    }
    return c;
  };
  const migration = async (file) =>
    readFile(
      new URL("../supabase/migrations/" + file, import.meta.url),
      "utf8",
    );
  const fail = async (c, sql, args = [], code = "42501") => {
    await assert.rejects(c.query(sql, args), (e) => e.code === code);
    checks++;
  };
  const rpc = async (c, fn, args = []) =>
    (
      await c.query(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) data`,
        args,
      )
    ).rows[0].data;
  await owner.query(`create database ${name}`);
  try {
    const root = await open();
    await root.query(
      `create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated,anon;grant execute on function auth.uid() to authenticated,anon;`,
    );
    await root.query(await migration("202610090001_implanta.sql"));
    for (const [k, id] of Object.entries(ids))
      await root.query(
        "insert into auth.users(id,email,raw_user_meta_data) values($1,$2,$3)",
        [id, k + "@example.invalid", { display_name: k }],
      );
    await root.query(
      "update public.implanta_profiles set active=true where id<>$1",
      [ids.pending],
    );
    await root.query("insert into implanta_private.admins values($1)", [
      ids.master,
    ]);
    for (const p of ["p", "foreign"])
      await root.query(
        "insert into public.implanta_projects(id,data,created_by) values($1,$2,$3)",
        [
          p,
          {
            id: p,
            name: p,
            status: "active",
            entities: ["Prefeitura"],
            tasks: [],
            trainings: [],
            logs: [],
          },
          ids[p === "p" ? "manager" : "other"],
        ],
      );
    await root.query(
      "insert into public.implanta_members values('p',$1,'editor'),('p',$2,'viewer')",
      [ids.editor, ids.viewer],
    );
    await root.query(await migration("202610090002_records.sql"));
    await root.query(
      (await migration("202610150001_project_ownership.sql")).replaceAll(
        "SEU_EMAIL_MASTER",
        "master@example.invalid",
      ),
    );
    const sql = await migration("202611030001_training_attendance.sql");
    await root.query(sql);
    const master = await open("master"),
      manager = await open("manager"),
      editor = await open("editor"),
      viewer = await open("viewer"),
      other = await open("other"),
      pending = await open("pending"),
      anon = await open(null, "anon"),
      anon2 = await open(null, "anon");
    const list = randomUUID(),
      person = randomUUID(),
      data = {
        title: "Presencial",
        entity: "Prefeitura",
        city: "Cidade",
        state: "SC",
        system: "Atende.Net",
        module: "Frota",
        submodules: "Abastecimentos",
        instructor: "Instrutor",
        hours: "2h",
        date: "2026-11-03",
        trainingId: "",
      };
    const save = (c, d = data, rev = 0, id = list, p = "p") =>
      rpc(c, "implanta_attendance_save", [p, id, rev, JSON.stringify(d)]);
    await fail(anon, "select public.implanta_attendance_lists($1)", ["p"]);
    for (const c of [viewer, other, pending])
      await fail(c, "select public.implanta_attendance_save($1,$2,0,$3)", [
        "p",
        list,
        data,
      ]);
    const saved = await save(manager);
    assert.equal(saved.created_by, ids.manager);
    assert.equal(saved.revision, 1);
    checks++;
    assert.equal(
      (await rpc(editor, "implanta_attendance_lists", ["p"])).length,
      1,
    );
    checks++;
    await fail(other, "select public.implanta_attendance_read($1,false)", [
      list,
    ]);
    await fail(anon, "select * from implanta_private.attendance_people");
    await fail(editor, "select * from implanta_private.attendance_lists");
    await fail(
      editor,
      "select public.implanta_attendance_save($1,$2,1,$3)",
      ["p", list, { ...data, trainingId: "foreign-training" }],
      "23514",
    );
    await fail(
      editor,
      "select public.implanta_attendance_save($1,$2,1,$3)",
      ["p", list, { ...data, date: "2026-02-30" }],
      "22008",
    );
    await save(editor, { ...data, hours: "3h" }, 1);
    checks++;
    await fail(
      manager,
      "select public.implanta_attendance_save($1,$2,1,$3)",
      ["p", list, data],
      "40001",
    );
    await fail(editor, "select public.implanta_attendance_read($1,true)", [
      list,
    ]);
    const personData = {
      name: "Participante Teste",
      cpf: "529.982.247-25",
      sector: "Compras",
      email: "test@example.invalid",
      confirmed: true,
    };
    await rpc(editor, "implanta_attendance_person_save", [
      list,
      person,
      0,
      JSON.stringify({ ...personData, created_by: ids.master }),
      false,
    ]);
    const raw = (
      await root.query(
        "select * from implanta_private.attendance_people where id=$1",
        [person],
      )
    ).rows[0];
    assert.equal(raw.created_by, ids.editor);
    assert.equal(raw.origin, "manual");
    assert(raw.confirmed_at);
    checks++;
    const visible = await rpc(viewer, "implanta_attendance_read", [
      list,
      false,
    ]);
    assert.equal(visible.people[0].cpf, "***.***.***-25");
    assert.equal(
      visible.audit.find((a) => a.action === "participant_created").actor_name,
      "editor",
    );
    checks++;
    assert(!JSON.stringify(visible).includes("52998224725"));
    checks++;
    assert.equal(
      (await rpc(master, "implanta_attendance_read", [list, true])).people[0]
        .cpf,
      "529.982.247-25",
    );
    checks++;
    assert.equal(
      (
        await root.query(
          "select count(*) from implanta_private.attendance_audit where action='full_cpf_report'",
        )
      ).rows[0].count,
      "1",
    );
    checks++;
    await rpc(editor, "implanta_attendance_person_save", [
      list,
      person,
      1,
      JSON.stringify({ ...personData, name: "Nome corrigido", cpf: "" }),
      false,
    ]);
    assert.equal(
      (
        await root.query(
          "select cpf from implanta_private.attendance_people where id=$1",
          [person],
        )
      ).rows[0].cpf,
      "52998224725",
    );
    checks++;
    await fail(
      editor,
      "select public.implanta_attendance_person_save($1,$2,1,$3,false)",
      [list, person, personData],
      "40001",
    );
    await fail(
      editor,
      "select public.implanta_attendance_person_save($1,$2,0,$3,false)",
      [list, randomUUID(), { ...personData, cpf: "11111111111" }],
      "23514",
    );
    const future = new Date(Date.now() + 86400000).toISOString();
    const link = (
      await rpc(editor, "implanta_attendance_link", [list, "generate", future])
    ).token;
    assert.match(link, /^[a-f0-9]{64}$/);
    checks++;
    assert(
      !JSON.stringify(
        await rpc(editor, "implanta_attendance_lists", ["p"]),
      ).includes(link),
    );
    checks++;
    const pub = await rpc(anon, "implanta_attendance_public_read", [link]);
    const { trainingId, ...expected } = data;
    assert.deepEqual(pub, { ...expected, hours: "3h" });
    checks++;
    assert(!("people" in pub));
    assert(!("project_id" in pub));
    checks++;

    const publicPerson = {
      ...personData,
      cpf: "",
      email: "public@example.invalid",
    };
    await fail(
      anon,
      "select public.implanta_attendance_register($1,$2,$3)",
      [link, randomUUID(), { ...publicPerson, confirmed: false }],
      "23514",
    );
    const request = randomUUID();
    await Promise.all(
      [anon, anon2].map((c) =>
        rpc(c, "implanta_attendance_register", [
          link,
          request,
          JSON.stringify(publicPerson),
        ]),
      ),
    );
    assert.equal(
      (
        await root.query(
          "select count(*) from implanta_private.attendance_people where list_id=$1",
          [list],
        )
      ).rows[0].count,
      "2",
    );
    checks++;
    await rpc(anon, "implanta_attendance_register", [
      link,
      randomUUID(),
      JSON.stringify(publicPerson),
    ]);
    assert.equal(
      (
        await root.query(
          "select count(*) from implanta_private.attendance_people where list_id=$1",
          [list],
        )
      ).rows[0].count,
      "2",
    );
    checks++;
    const external = (
      await root.query(
        "select * from implanta_private.attendance_people where id=$1",
        [request],
      )
    ).rows[0];
    assert.equal(external.origin, "public");
    assert.equal(external.created_by, null);
    assert(external.confirmed_at);
    checks++;
    await fail(viewer, "select public.implanta_attendance_delete($1,$2,2)", [
      list,
      person,
    ]);
    await rpc(editor, "implanta_attendance_person_save", [
      list,
      person,
      2,
      JSON.stringify({ ...personData, cpf: "" }),
      true,
    ]);
    assert.equal(
      (
        await root.query(
          "select cpf from implanta_private.attendance_people where id=$1",
          [person],
        )
      ).rows[0].cpf,
      "",
    );
    checks++;
    await fail(
      editor,
      "select public.implanta_attendance_delete($1,$2,2)",
      [list, person],
      "40001",
    );
    await rpc(editor, "implanta_attendance_delete", [list, person, 3]);
    checks++;
    const second = (
      await rpc(editor, "implanta_attendance_link", [list, "generate", future])
    ).token;
    await fail(anon, "select public.implanta_attendance_public_read($1)", [
      link,
    ]);
    await fail(anon, "select public.implanta_attendance_register($1,$2,$3)", [
      link,
      randomUUID(),
      publicPerson,
    ]);
    await fail(anon, "select public.implanta_attendance_public_read($1)", [
      "x".repeat(64),
    ]);
    // Closing/rotation that wins the list lock must reject a waiting send.
    await editor.query("begin");
    await rpc(editor, "implanta_attendance_link", [list, "close", null]);
    const competing = rpc(anon, "implanta_attendance_register", [
      second,
      randomUUID(),
      JSON.stringify({ ...publicPerson, email: "waiting@example.invalid" }),
    ]).then(
      () => null,
      (e) => e,
    );
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (
          await root.query(
            "select cardinality(pg_blocking_pids($1))>0 blocked",
            [anon.processID],
          )
        ).rows[0].blocked;
        if (blocked) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert(blocked);
    } finally {
      await editor.query("commit");
    }
    assert.equal((await competing)?.code, "42501");
    checks++;
    const third = (
      await rpc(editor, "implanta_attendance_link", [list, "generate", future])
    ).token;
    await root.query(
      "update implanta_private.attendance_lists set expires_at=now()-interval '1 second' where id=$1",
      [list],
    );
    await fail(anon, "select public.implanta_attendance_register($1,$2,$3)", [
      third,
      randomUUID(),
      publicPerson,
    ]);
    const fourth = (
      await rpc(editor, "implanta_attendance_link", [list, "generate", future])
    ).token;
    await root.query(
      "update public.implanta_municipality_records set data=jsonb_set(data,'{status}','\"closed\"') where project_id='p'",
    );
    await fail(anon, "select public.implanta_attendance_register($1,$2,$3)", [
      fourth,
      randomUUID(),
      publicPerson,
    ]);
    await assert.rejects(save(editor, data, 6), /Reabra o projeto/);
    checks++;
    await root.query(
      "update public.implanta_municipality_records set data=jsonb_set(data,'{status}','\"active\"') where project_id='p'",
    );
    await root.query(sql);
    assert.equal(
      (await rpc(editor, "implanta_attendance_read", [list, false])).people
        .length,
      1,
    );
    checks++;
    // New policy is per municipality and additive: old participants remain intact.
    const requiredMigration = await migration(
      "202611030002_attendance_required_fields.sql",
    );
    const beforePolicy = (
      await root.query(
        "select * from implanta_private.attendance_people order by id",
      )
    ).rows;
    await root.query(requiredMigration);
    assert.deepEqual(
      (
        await root.query(
          "select * from implanta_private.attendance_people order by id",
        )
      ).rows,
      beforePolicy,
    );
    checks++;
    const allRequired = { name: true, cpf: true, sector: true, email: true },
      optional = { name: false, cpf: false, sector: false, email: false };
    const policy = () => rpc(editor, "implanta_attendance_settings", ["p"]);
    assert.deepEqual((await policy()).requiredFields, allRequired);
    assert.equal((await policy()).revision, 0);
    checks++;
    assert.deepEqual(
      (await rpc(anon, "implanta_attendance_public_read", [fourth]))
        .requiredFields,
      allRequired,
    );
    checks++;
    await fail(anon, "select public.implanta_attendance_settings('p')");
    await fail(editor, "select * from implanta_private.attendance_settings");
    for (const c of [viewer, other, pending])
      await fail(
        c,
        "select public.implanta_attendance_settings_save($1,0,$2)",
        ["p", optional],
      );
    await fail(
      editor,
      "select public.implanta_attendance_settings_save($1,0,$2)",
      ["p", { name: true, cpf: false }],
      "23514",
    );
    await fail(
      editor,
      "select public.implanta_attendance_settings_save($1,0,$2)",
      ["p", { ...allRequired, cpf: "false" }],
      "23514",
    );
    const complete = {
      name: "Cliente completo",
      cpf: "52998224725",
      sector: "Setor",
      email: "complete@example.invalid",
      confirmed: true,
    };
    for (const key of Object.keys(allRequired)) {
      const missing = { ...complete, [key]: "", requiredFields: optional };
      await fail(
        anon,
        "select public.implanta_attendance_register($1,$2,$3)",
        [fourth, randomUUID(), missing],
        "23514",
      );
      await fail(
        editor,
        "select public.implanta_attendance_person_save($1,$2,0,$3,false)",
        [list, randomUUID(), missing],
        "23514",
      );
    }
    // A previously acknowledged request remains idempotent after the policy changes.
    assert.equal(
      (
        await rpc(anon, "implanta_attendance_register", [
          fourth,
          request,
          JSON.stringify(publicPerson),
        ])
      ).registered,
      true,
    );
    checks++;
    const withCpf = randomUUID();
    await rpc(editor, "implanta_attendance_person_save", [
      list,
      withCpf,
      0,
      JSON.stringify(complete),
      false,
    ]);
    await rpc(editor, "implanta_attendance_person_save", [
      list,
      withCpf,
      1,
      JSON.stringify({ ...complete, cpf: "", name: "Nome corrigido" }),
      false,
    ]);
    assert.equal(
      (
        await root.query(
          "select cpf from implanta_private.attendance_people where id=$1",
          [withCpf],
        )
      ).rows[0].cpf,
      complete.cpf,
    );
    checks++;
    await fail(
      editor,
      "select public.implanta_attendance_person_save($1,$2,2,$3,true)",
      [list, withCpf, { ...complete, cpf: "" }],
      "23514",
    );
    // Two colleagues cannot silently overwrite the municipality setting.
    const results = await Promise.allSettled(
      [manager, editor].map((c) =>
        rpc(c, "implanta_attendance_settings_save", [
          "p",
          0,
          JSON.stringify({ ...allRequired, cpf: false }),
        ]),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find((r) => r.status === "rejected").reason.code,
      "40001",
    );
    checks++;
    const secondList = randomUUID(),
      foreignList = randomUUID();
    await save(editor, data, 0, secondList);
    await save(other, data, 0, foreignList, "foreign");
    const secondToken = (
      await rpc(editor, "implanta_attendance_link", [
        secondList,
        "generate",
        future,
      ])
    ).token;
    const foreignToken = (
      await rpc(other, "implanta_attendance_link", [
        foreignList,
        "generate",
        future,
      ])
    ).token;
    const changed = await rpc(editor, "implanta_attendance_settings_save", [
      "p",
      1,
      JSON.stringify(optional),
    ]);
    assert.equal(changed.revision, 2);
    assert.equal(changed.audit[0].actor_name, "editor");
    checks++;
    for (const t of [fourth, secondToken])
      assert.deepEqual(
        (await rpc(anon, "implanta_attendance_public_read", [t]))
          .requiredFields,
        optional,
      );
    checks++;
    assert.deepEqual(
      (await rpc(anon, "implanta_attendance_public_read", [foreignToken]))
        .requiredFields,
      allRequired,
    );
    checks++;
    await rpc(anon, "implanta_attendance_register", [
      secondToken,
      randomUUID(),
      JSON.stringify({
        name: "",
        cpf: "",
        sector: "",
        email: "",
        confirmed: true,
      }),
    ]);
    checks++;
    await fail(
      anon,
      "select public.implanta_attendance_register($1,$2,$3)",
      [
        secondToken,
        randomUUID(),
        {
          name: "",
          cpf: "11111111111",
          sector: "",
          email: "",
          confirmed: true,
        },
      ],
      "23514",
    );
    await fail(
      anon,
      "select public.implanta_attendance_register($1,$2,$3)",
      [
        secondToken,
        randomUUID(),
        { name: "", cpf: "", sector: "", email: "invalid", confirmed: true },
      ],
      "23514",
    );
    // A submit already waiting when the editor changes requirements must use the new rules.
    await editor.query("begin");
    await rpc(editor, "implanta_attendance_settings_save", [
      "p",
      2,
      JSON.stringify(allRequired),
    ]);
    const pendingSend = rpc(anon, "implanta_attendance_register", [
      secondToken,
      randomUUID(),
      JSON.stringify({
        name: "",
        cpf: "",
        sector: "",
        email: "",
        confirmed: true,
      }),
    ]).then(
      () => null,
      (e) => e,
    );
    try {
      let blocked = false;
      for (let i = 0; i < 100; i++) {
        blocked = (
          await root.query(
            "select cardinality(pg_blocking_pids($1))>0 blocked",
            [anon.processID],
          )
        ).rows[0].blocked;
        if (blocked) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert(blocked);
    } finally {
      await editor.query("commit");
    }
    assert.equal((await pendingSend)?.code, "23514");
    checks++;
    await rpc(editor, "implanta_attendance_settings_save", [
      "p",
      3,
      JSON.stringify(optional),
    ]);
    await root.query(requiredMigration);
    assert.deepEqual((await policy()).requiredFields, optional);
    checks++;
    for (const [c, id] of [
      [editor, secondList],
      [other, foreignList],
    ])
      await rpc(c, "implanta_attendance_delete", [
        id,
        null,
        (await rpc(c, "implanta_attendance_read", [id, false])).list.revision,
      ]);

    await root.query(
      "insert into implanta_private.attendance_people(id,list_id,name,origin) select gen_random_uuid(),$1,'Pessoa '||n,'manual' from generate_series(1,999)n",
      [list],
    );
    await assert.rejects(
      rpc(anon, "implanta_attendance_register", [
        fourth,
        randomUUID(),
        JSON.stringify(publicPerson),
      ]),
      /encerradas/,
    );
    checks++;
    const latest = await rpc(editor, "implanta_attendance_read", [list, false]);
    await rpc(editor, "implanta_attendance_delete", [
      list,
      null,
      latest.list.revision,
    ]);
    await fail(anon, "select public.implanta_attendance_public_read($1)", [
      fourth,
    ]);
    assert.equal(
      (
        await root.query(
          "select count(*) from implanta_private.attendance_people",
        )
      ).rows[0].count,
      "0",
    );
    checks++;
    assert.equal(
      (await root.query("select count(*) from public.implanta_projects"))
        .rows[0].count,
      "2",
    );
    checks++;
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    await owner.query(`drop database ${name}`);
  }
  console.log(
    `${checks} verificações PostgreSQL de listas de presença aprovadas.`,
  );
}
