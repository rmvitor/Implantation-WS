import pg from "pg";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import {
  newTimeAdjustment,
  TIME_JUSTIFICATIONS,
} from "../src/time-adjustments.js";
export async function testTimeAdjustments(owner, connection) {
  const database = `time_adjustments_${process.pid}_${Date.now()}`,
    url = new URL(connection);
  url.pathname = "/" + database;
  const clients = [],
    ids = {
      user: randomUUID(),
      other: randomUUID(),
      master: randomUUID(),
      pending: randomUUID(),
    };
  let checks = 0;
  const open = async (who) => {
    const c = new pg.Client({ connectionString: url.href });
    await c.connect();
    clients.push(c);
    if (who) {
      await c.query(
        who === "anon" ? "set role anon" : "set role authenticated",
      );
      if (who !== "anon")
        await c.query("select set_config('request.jwt.claim.sub',$1,false)", [
          ids[who],
        ]);
    }
    return c;
  };
  const rpc = async (c, fn, args = []) =>
    (
      await c.query(
        `select public.${fn}(${args.map((_, i) => "$" + (i + 1)).join(",")}) data`,
        args,
      )
    ).rows[0].data;
  const fail = async (c, fn, args, code = "42501") => {
    await assert.rejects(rpc(c, fn, args), (e) => e.code === code);
    checks++;
  };
  await owner.query(`create database ${database}`);
  try {
    const root = await open();
    await root.query(
      `create schema auth;create table auth.users(id uuid primary key,email text,raw_user_meta_data jsonb default '{}');create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to anon,authenticated;grant execute on function auth.uid() to anon,authenticated;`,
    );
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
      await root.query("insert into auth.users values($1,$2,$3)", [
        id,
        key + "@example.invalid",
        { display_name: key },
      ]);
    await root.query(
      "update public.implanta_profiles set active=true where id<>$1",
      [ids.pending],
    );
    await root.query("insert into implanta_private.admins values($1)", [
      ids.master,
    ]);
    const sql = await readFile(
      new URL(
        "../supabase/migrations/202611040001_time_adjustments.sql",
        import.meta.url,
      ),
      "utf8",
    );
    await root.query(sql);
    const user = await open("user"),
      other = await open("other"),
      master = await open("master"),
      pending = await open("pending"),
      anon = await open("anon"),
      second = await open("user");
    const id = randomUUID(),
      data = {
        ...newTimeAdjustment(
          { name: "Funcionário" },
          new Date(2026, 10, 4, 13, 25),
        ),
        place: "Cidade / SC",
        justification: TIME_JUSTIFICATIONS.forgotten,
      };
    data.punches.entry = { selected: true, time: "00:00" };
    for (const c of [anon, pending]) {
      await fail(c, "implanta_time_adjustments", []);
      await fail(c, "implanta_time_adjustment_save", [id, 0, data]);
    }
    const saved = await rpc(user, "implanta_time_adjustment_save", [
      id,
      0,
      { ...data, user_id: ids.master, coordinates: { latitude: 1 } },
    ]);
    assert.equal(saved.user_id, ids.user);
    assert.equal(saved.data.user_id, undefined);
    assert.equal(saved.data.coordinates, undefined);
    await fail(user, "implanta_time_adjustment_save", [id, 0, data], "40001");
    assert.equal((await rpc(user, "implanta_time_adjustments")).length, 1);
    checks++;
    checks++;
    assert.equal((await rpc(user, "implanta_time_adjustments")).length, 1);
    checks++;
    for (const c of [other, master]) {
      assert.deepEqual(await rpc(c, "implanta_time_adjustments"), []);
      checks++;
      await fail(c, "implanta_time_adjustment_save", [id, 0, data], "40001");
      await fail(c, "implanta_time_adjustment_save", [id, 1, data], "40001");
      await fail(c, "implanta_time_adjustment_delete", [id, 1], "40001");
    }
    await assert.rejects(
      user.query("select * from implanta_private.time_adjustments"),
      (e) => e.code === "42501",
    );
    checks++;
    const empty = { ...data, punches: newTimeAdjustment().punches };
    await fail(
      user,
      "implanta_time_adjustment_save",
      [randomUUID(), 0, empty],
      "23514",
    );
    await fail(
      user,
      "implanta_time_adjustment_save",
      [
        randomUUID(),
        0,
        {
          ...data,
          punches: { ...data.punches, exit: { selected: true, time: "" } },
        },
      ],
      "23514",
    );
    await fail(
      user,
      "implanta_time_adjustment_save",
      [
        randomUUID(),
        0,
        {
          ...data,
          punches: {
            ...data.punches,
            entry: { selected: false, time: "08:00" },
          },
        },
      ],
      "23514",
    );
    await fail(
      user,
      "implanta_time_adjustment_save",
      [randomUUID(), 0, { ...data, justification: "x".repeat(3001) }],
      "23514",
    );
    const results = await Promise.allSettled(
      [user, second].map((c, i) =>
        rpc(c, "implanta_time_adjustment_save", [
          id,
          1,
          { ...data, place: "Cidade " + i },
        ]),
      ),
    );
    assert.equal(results.filter((r) => r.status === "fulfilled").length, 1);
    assert.equal(
      results.find((r) => r.status === "rejected").reason.code,
      "40001",
    );
    checks++;
    await fail(user, "implanta_time_adjustment_delete", [id, 1], "40001");
    await root.query("begin");
    await root.query("select pg_advisory_xact_lock(2026100901)");
    await root.query(
      "update public.implanta_profiles set active=false where id=$1",
      [ids.user],
    );
    const blocked = rpc(user, "implanta_time_adjustment_save", [
      id,
      2,
      data,
    ]).then(
      () => null,
      (e) => e,
    );
    try {
      let waiting = false;
      for (let i = 0; i < 100; i++) {
        waiting = (
          await root.query(
            "select cardinality(pg_blocking_pids($1))>0 blocked",
            [user.processID],
          )
        ).rows[0].blocked;
        if (waiting) break;
        await new Promise((r) => setTimeout(r, 10));
      }
      assert(waiting);
    } finally {
      await root.query("commit");
    }
    assert.equal((await blocked)?.code, "42501");
    checks++;
    await root.query(
      "update public.implanta_profiles set active=true where id=$1",
      [ids.user],
    );
    await root.query(sql);
    assert.equal((await rpc(user, "implanta_time_adjustments"))[0].revision, 2);
    checks++;
    await rpc(user, "implanta_time_adjustment_delete", [id, 2]);
    assert.equal((await rpc(user, "implanta_time_adjustments")).length, 0);
    checks++;
    const audit = (
      await root.query(
        "select actor_name,action from implanta_private.time_adjustment_audit order by id",
      )
    ).rows;
    assert.deepEqual(
      audit.map((a) => a.action),
      ["created", "updated", "deleted"],
    );
    assert(audit.every((a) => a.actor_name === "user"));
    checks++;
    assert.equal(
      (await root.query("select count(*) from public.implanta_projects"))
        .rows[0].count,
      "0",
    );
    checks++;
  } finally {
    await Promise.all(clients.map((c) => c.end()));
    await owner.query(`drop database ${database}`);
  }
  console.log(
    `${checks} verificações PostgreSQL de ajustes de ponto: isolamento pessoal, sem município, validação e concorrência aprovados.`,
  );
}
