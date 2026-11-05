import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const id = (n) => `00000000-0000-0000-0000-${String(n).padStart(12, "0")}`;
async function setup() {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`,
  );
  for (const file of [
    "001_sterilog.sql",
    "20261105124919_instrument_tracking.sql",
    "20261106090000_staff_admin_controls.sql",
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  // 1 system admin, 2 Buraydah branch admin, 3 Buraydah operator,
  // 4 Unayzah operator, 5 second system admin.
  for (let n = 1; n <= 5; n++) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query("insert into public.profiles values($1,$2,$3,true)", [
      id(n),
      "Person " + n,
      n === 1 || n === 5,
    ]);
  }
  await db.exec(
    `insert into public.memberships values('${id(2)}','buraydah','branch_admin'),('${id(3)}','buraydah','operator'),('${id(4)}','unayzah','operator');`,
  );
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id(n),
    ]);
    await db.exec("set role authenticated");
  };
  const admin = async (op, input, b = "buraydah") =>
    (
      await db.query("select public.admin_ops($1,$2,$3) result", [
        op,
        b,
        JSON.stringify(input),
      ])
    ).rows[0].result;
  const fails = async (promise, code) =>
    assert.rejects(promise, (e) => e.message.includes(code));
  const sql = async (q, p = []) => {
    await db.exec("reset role");
    return (await db.query(q, p)).rows;
  };
  return { db, as, admin, fails, sql };
}

test("system administrator can deactivate and reactivate staff; access stops immediately", async () => {
  const { as, admin, fails, sql } = await setup();
  await as(1);
  await sql(
    `insert into public.tr_grants(branch_id,user_id,task,training_ref,valid_until,granted_by) values('buraydah',$1,'receive','TRN-001',now()+interval '1 year',$2)`,
    [id(3), id(1)],
  );
  await as(1);
  await admin("set_active", { user_id: id(3), active: false });
  let [p] = await sql("select active from public.profiles where id=$1", [
    id(3),
  ]);
  assert.equal(p.active, false);
  const [g] = await sql(
    "select active from public.tr_grants where user_id=$1",
    [id(3)],
  );
  assert.equal(g.active, false, "deactivation suspends tracking grants");
  await as(1);
  const audit = await sql(
    "select action from public.audit_events where entity_id=$1 order by id",
    [id(3)],
  );
  assert.deepEqual(
    audit.map((a) => a.action),
    ["account.deactivated"],
  );
  await as(1);
  await admin("set_active", { user_id: id(3), active: true });
  [p] = await sql("select active from public.profiles where id=$1", [id(3)]);
  assert.equal(p.active, true);
  const [g2] = await sql(
    "select active from public.tr_grants where user_id=$1",
    [id(3)],
  );
  assert.equal(g2.active, false, "reactivation does not restore grants");
});

test("deactivated staff are blocked from branch data and commands", async () => {
  const { db, as, admin, fails } = await setup();
  await as(1);
  await admin("set_active", { user_id: id(3), active: false });
  await as(3);
  const rows = (await db.query("select * from public.cycles")).rows;
  assert.equal(rows.length, 0);
  const devices = (await db.query("select * from public.devices")).rows;
  assert.equal(devices.length, 0, "no branch rows visible when inactive");
  await fails(
    db.query("select public.mutate('save_cycle','buraydah','{}'::jsonb)"),
    "FORBIDDEN",
  );
  await fails(
    db.query("select public.tracking('people','buraydah','{}'::jsonb)"),
    "FORBIDDEN",
  );
});

test("account controls are restricted and guard self and last administrator", async () => {
  const { as, admin, fails } = await setup();
  // Branch administrator cannot change account status.
  await as(2);
  await fails(
    admin("set_active", { user_id: id(3), active: false }),
    "FORBIDDEN",
  );
  await fails(admin("remove_member", { user_id: id(3) }), "FORBIDDEN");
  // Operator cannot either.
  await as(3);
  await fails(
    admin("set_active", { user_id: id(2), active: false }),
    "FORBIDDEN",
  );
  // Administrator cannot deactivate themselves.
  await as(1);
  await fails(
    admin("set_active", { user_id: id(1), active: false }),
    "SELF_CHANGE_FORBIDDEN",
  );
  await fails(admin("set_active", { user_id: id(3) }), "USER_REQUIRED");
  // Another administrator can be deactivated, and then loses admin rights.
  await as(5);
  await admin("set_active", { user_id: id(1), active: false });
  await as(1);
  await fails(
    admin("set_active", { user_id: id(5), active: false }),
    "FORBIDDEN",
  );
});

test("removing branch membership removes branch access and suspends branch grants only", async () => {
  const { db, as, admin, fails, sql } = await setup();
  await sql(`insert into public.memberships values($1,'unayzah','viewer')`, [
    id(3),
  ]);
  await sql(
    `insert into public.tr_grants(branch_id,user_id,task,training_ref,valid_until,granted_by) values('buraydah',$1,'clean','TRN-1',now()+interval '1 year',$2),('unayzah',$1,'clean','TRN-2',now()+interval '1 year',$2)`,
    [id(3), id(1)],
  );
  await as(1);
  await admin("remove_member", { user_id: id(3) }, "buraydah");
  await fails(
    admin("remove_member", { user_id: id(3) }, "buraydah"),
    "NOT_FOUND",
  );
  const grants = await sql(
    "select branch_id,active from public.tr_grants where user_id=$1 order by branch_id",
    [id(3)],
  );
  assert.deepEqual(
    grants.map((g) => [g.branch_id, g.active]),
    [
      ["buraydah", false],
      ["unayzah", true],
    ],
  );
  await as(3);
  await fails(
    db.query("select public.mutate('save_cycle','buraydah','{}'::jsonb)"),
    "FORBIDDEN",
  );
  const branches = (await db.query("select id from public.branches")).rows;
  assert.deepEqual(
    branches.map((b) => b.id),
    ["unayzah"],
  );
});

test("branch administrator can retire a program; retired programs cannot start new cycles", async () => {
  const { db, as, admin, fails, sql } = await setup();
  const [dev] = await sql(
    "update public.devices set branch_id='buraydah',model='M',ifu='IFU',active=true where code='01' returning id",
  );
  const [prog] = await sql(
    `insert into public.programs(device_id,branch_id,name,criteria,ifu,approved_by,approved_name) values($1,'buraydah','134C','{"temp_min":134,"temp_max":137,"exposure_min":3,"pressure_min":2,"pressure_max":2.3,"pressure_unit":"bar"}','IFU',$2,'Person 1') returning id`,
    [dev.id, id(1)],
  );
  // Operator and other-branch staff cannot retire it.
  await as(3);
  await fails(
    admin("set_program_active", { id: prog.id, active: false }),
    "FORBIDDEN",
  );
  await as(4);
  await fails(
    admin("set_program_active", { id: prog.id, active: false }, "unayzah"),
    "FORBIDDEN",
  );
  // Even an administrator cannot reach a Buraydah program through Unayzah.
  await as(1);
  await fails(
    admin("set_program_active", { id: prog.id, active: false }, "unayzah"),
    "NOT_FOUND",
  );
  await as(2);
  await admin("set_program_active", { id: prog.id, active: false });
  const [p] = await sql("select active from public.programs where id=$1", [
    prog.id,
  ]);
  assert.equal(p.active, false);
  // A new draft cannot carry the retired program (stored without a program snapshot).
  await as(3);
  const cycleId = "10000000-0000-0000-0000-000000000001";
  const saved = (
    await db.query("select public.mutate('save_cycle','buraydah',$1) r", [
      JSON.stringify({
        id: cycleId,
        device_id: dev.id,
        program_id: prog.id,
        machine_number: "1",
        operating_date: "2026-11-06",
        payload: {},
      }),
    ])
  ).rows[0].r;
  assert.equal(saved.program_id, null);
  assert.equal(saved.program_snapshot, null);
  await as(2);
  await admin("set_program_active", { id: prog.id, active: true });
  const audit = await sql(
    "select action from public.audit_events where entity_id=$1 order by id",
    [prog.id],
  );
  assert.deepEqual(
    audit.map((a) => a.action),
    ["program.retired", "program.activated"],
  );
});
