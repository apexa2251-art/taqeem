import { test } from "node:test";
import assert from "node:assert/strict";
import { PGlite } from "@electric-sql/pglite";
import { readFile } from "node:fs/promises";
const ids = {
  admin: "00000000-0000-0000-0000-000000000001",
  opB: "00000000-0000-0000-0000-000000000002",
  opU: "00000000-0000-0000-0000-000000000003",
  reviewB: "00000000-0000-0000-0000-000000000004",
};
test("database enforces branch isolation, operator identity, immutable submissions and approval gates", async () => {
  const db = new PGlite();
  await db.exec(
    `create role anon;create role authenticated;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;grant usage on schema auth to authenticated;grant execute on function auth.uid() to authenticated;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;grant usage on schema storage to authenticated;grant select,insert on storage.objects to authenticated;create function storage.foldername(text) returns text[] language sql as $$select (string_to_array($1,'/'))[1:array_length(string_to_array($1,'/'),1)-1]$$;`,
  );
  await db.exec(
    await readFile(
      new URL("../supabase/migrations/001_sterilog.sql", import.meta.url),
      "utf8",
    ),
  );
  for (const [name, id] of Object.entries(ids)) {
    await db.query("insert into auth.users values($1)", [id]);
    await db.query(
      "insert into public.profiles(id,full_name,system_admin) values($1,$2,$3)",
      [id, name, name === "admin"],
    );
  }
  await db.exec(
    `insert into public.memberships values('${ids.opB}','buraydah','operator'),('${ids.opU}','unayzah','operator'),('${ids.reviewB}','buraydah','reviewer');`,
  );
  async function as(id) {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id]);
    await db.exec("set role authenticated");
  }
  async function mutate(op, b, input) {
    return (
      await db.query("select public.mutate($1,$2,$3::jsonb) value", [
        op,
        b,
        JSON.stringify(input),
      ])
    ).rows[0].value;
  }
  await as(ids.admin);
  const devices = (await db.query("select * from public.devices order by code"))
    .rows;
  assert.equal(devices.length, 4);
  assert.ok(devices.every((d) => d.branch_id === null && !d.active));
  await mutate("save_device", "buraydah", {
    id: devices[0].id,
    model: "Test model",
    ifu: "Test-only IFU",
    active: true,
  });
  await mutate("save_device", "unayzah", {
    id: devices[1].id,
    model: "Test model",
    ifu: "Test-only IFU",
    active: true,
  });
  const criteria = {
    temp_min: 130,
    temp_max: 140,
    exposure_min: 5,
    pressure_min: 1,
    pressure_max: 3,
    pressure_unit: "bar",
    allow_na: false,
    bi_required: false,
  };
  const program = await mutate("create_program", "buraydah", {
    device_id: devices[0].id,
    name: "Synthetic test program",
    ifu: "TEST ONLY — NOT CLINICAL SETTINGS",
    criteria,
  });
  const cycleId = "10000000-0000-0000-0000-000000000001";
  const payload = {
    items: [{ name: "Test set", quantity: 2 }],
    packs: 2,
    temperature: 134,
    exposure: 6,
    pressure: 2,
    pressure_unit: "bar",
    start: "2026-10-31T07:00:00Z",
    end: "2026-10-31T07:20:00Z",
    M: "P",
    C: "P",
    D: "P",
    completion: "complete",
  };
  await as(ids.opB);
  const input = {
    id: cycleId,
    device_id: devices[0].id,
    machine_number: "00025",
    operating_date: "2026-10-31",
    program_id: program.id,
    payload,
    operator_name: "SPOOFED",
    operator_id: ids.admin,
  };
  const c = await mutate("save_cycle", "buraydah", input);
  assert.equal(c.operator_name, "opB");
  assert.equal(c.operator_id, ids.opB);
  assert.equal(c.machine_number, "00025");
  await assert.rejects(
    () =>
      db.query("update public.profiles set system_admin=true where id=$1", [
        ids.opB,
      ]),
    /permission denied/i,
  );
  await assert.rejects(
    () =>
      db.query("update public.cycles set decision='R' where id=$1", [cycleId]),
    /permission denied/i,
  );
  await assert.rejects(
    () => mutate("submit_cycle", "buraydah", { id: cycleId }),
    /REPORT_REQUIRED/,
  );
  const path = `buraydah/${cycleId}/file.pdf`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('cycle-reports',$1)",
    [path],
  );
  await mutate("attach_report", "buraydah", {
    cycle_id: cycleId,
    object_path: path,
    filename: "test.pdf",
    content_type: "application/pdf",
  });
  await as(ids.opU);
  assert.equal((await db.query("select * from public.cycles")).rows.length, 0);
  assert.equal((await db.query("select * from public.devices")).rows.length, 1);
  assert.equal(
    (await db.query("select * from storage.objects")).rows.length,
    0,
  );
  await assert.rejects(
    () => mutate("save_cycle", "buraydah", input),
    /FORBIDDEN/,
  );
  await as(ids.opB);
  await mutate("submit_cycle", "buraydah", { id: cycleId });
  await assert.rejects(
    () => mutate("save_cycle", "buraydah", input),
    /IMMUTABLE_OR_NOT_OWNER/,
  );
  await assert.rejects(
    () => mutate("decide_cycle", "buraydah", { id: cycleId, decision: "R" }),
    /FORBIDDEN/,
  );
  await as(ids.reviewB);
  const approved = await mutate("decide_cycle", "buraydah", {
    id: cycleId,
    decision: "R",
  });
  assert.equal(approved.decision, "R");
  assert.equal(approved.reviewer_name, "reviewB");
  const revised = await mutate("revise_cycle", "buraydah", {
    id: cycleId,
    reason: "Correcting actual readings",
  });
  assert.equal(revised.version, 2);
  assert.equal(
    (await db.query("select * from public.cycle_versions")).rows.length,
    1,
  );
  await mutate("save_cycle", "buraydah", {
    ...input,
    payload: { ...payload, D: "F" },
  });
  await assert.rejects(
    () => mutate("submit_cycle", "buraydah", { id: cycleId }),
    /REPORT_REQUIRED/,
  );
  const path2 = `buraydah/${cycleId}/revision.pdf`;
  await db.query(
    "insert into storage.objects(bucket_id,name) values('cycle-reports',$1)",
    [path2],
  );
  await mutate("attach_report", "buraydah", {
    cycle_id: cycleId,
    object_path: path2,
    filename: "revision.pdf",
    content_type: "application/pdf",
  });
  await mutate("submit_cycle", "buraydah", { id: cycleId });
  await as(ids.admin);
  await assert.rejects(
    () => mutate("decide_cycle", "buraydah", { id: cycleId, decision: "R" }),
    /APPROVAL_BLOCKED_RESULTS/,
  );
  await assert.rejects(
    () => mutate("decide_cycle", "buraydah", { id: cycleId, decision: "H" }),
    /REASON_ACTION_REQUIRED/,
  );
  await mutate("decide_cycle", "buraydah", {
    id: cycleId,
    decision: "H",
    reason: "Wet packages",
    corrective_action: "Segregated for follow-up",
  });
  await mutate("read_notification", "buraydah", {
    event_key: "critical:" + cycleId,
    acknowledge: true,
  });
  assert.equal(
    (
      await db.query("select decision from public.cycles where id=$1", [
        cycleId,
      ])
    ).rows[0].decision,
    "H",
  );
  const logs = (await db.query("select * from public.audit_events")).rows;
  assert.ok(
    logs.some((l) => l.action === "decide_cycle" && l.actor_name === "reviewB"),
  );
  assert.ok(logs.some((l) => l.action === "revise_cycle"));
  await db.close();
});
