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
  ])
    await db.exec(
      await readFile(
        new URL("../supabase/migrations/" + file, import.meta.url),
        "utf8",
      ),
    );
  for (let n = 1; n <= 7; n++) {
    await db.query("insert into auth.users values($1)", [id(n)]);
    await db.query("insert into public.profiles values($1,$2,$3,true)", [
      id(n),
      "Person " + n,
      n === 1,
    ]);
  }
  await db.exec(
    `insert into public.memberships values('${id(1)}','buraydah','branch_admin'),('${id(2)}','buraydah','viewer'),('${id(3)}','buraydah','operator'),('${id(4)}','buraydah','reviewer'),('${id(5)}','unayzah','operator'),('${id(6)}','buraydah','viewer'),('${id(7)}','buraydah','viewer');`,
  );
  const as = async (n) => {
    await db.exec("reset role");
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [
      id(n),
    ]);
    await db.exec("set role authenticated");
  };
  const rpc = async (op, input = {}, b = "buraydah") =>
    (
      await db.query("select public.tracking($1,$2,$3) result", [
        op,
        b,
        JSON.stringify(input),
      ])
    ).rows[0].result;
  const mutate = async (op, input) =>
    (
      await db.query("select public.mutate($1,$2,$3) result", [
        op,
        "buraydah",
        JSON.stringify(input),
      ])
    ).rows[0].result;
  await as(1);
  const cl = (await rpc("clinic", { name: "Clinic A", doctor: "Doctor A" })).id,
    cl2 = (await rpc("clinic", { name: "Clinic B", doctor: "Doctor B" })).id;
  for (const [n, c] of [
    [2, cl],
    [6, cl2],
    [7, cl],
  ])
    await rpc("link_nurse", { user_id: id(n), clinic_id: c });
  const box = (await rpc("box", { clinic_id: cl, code: "BUR-BOX-01" })).id,
    box2 = (await rpc("box", { clinic_id: cl2, code: "BUR-BOX-02" })).id;
  for (const n of [3, 4])
    for (const task of [
      "receive",
      "clean",
      "inspect",
      "pack",
      "load",
      "approve",
      "dispatch",
      "recall",
      "supervise",
    ])
      await rpc("grant", {
        user_id: id(n),
        task,
        training_ref: "Synthetic test only",
        valid_until: "2099-01-01T00:00:00Z",
      });
  return { db, as, rpc, mutate, box, box2, cl };
}
test("manual, no-print workflow: differences, split cycles, mixed clinics, partial collection and clinical gates", async () => {
  const { db, as, rpc, mutate, box, box2 } = await setup();
  try {
    await as(2);
    const s = (
      await rpc("send", { box_id: box, items: [{ name: "Exam", sent: 4 }] })
    ).id;
    await assert.rejects(
      () => rpc("send", { box_id: box, items: [{ name: "Exam", sent: 1 }] }),
      /BOX_IN_USE/,
    );
    await as(6);
    const s2 = (
      await rpc("send", { box_id: box2, items: [{ name: "Surgery", sent: 1 }] })
    ).id;
    assert.equal(
      (await db.query("select * from tr_shipments")).rows.length,
      1,
      "clinic cannot see other clinic",
    );
    await as(5);
    assert.equal((await db.query("select * from tr_shipments")).rows.length, 0);
    await assert.rejects(
      () => rpc("receive", { id: s, received: [] }),
      /FORBIDDEN/,
    );
    await as(3);
    await assert.rejects(
      () =>
        rpc("receive", {
          id: s,
          received: [{ name: "Exam", received: 3, damaged: 1 }],
        }),
      /DIFFERENCE_REASON_REQUIRED/,
    );
    await rpc("receive", {
      id: s,
      received: [{ name: "Exam", received: 3, damaged: 1 }],
      reason: "One missing; one damaged",
    });
    await rpc("receive", {
      id: s2,
      received: [{ name: "Surgery", received: 1, damaged: 0 }],
    });
    await assert.rejects(
      () => rpc("receive", { id: s, received: [] }),
      /ALREADY_MATCHED/,
    );
    const p1 = (
        await rpc("package", {
          shipment_id: s,
          contents: [{ name: "Exam", quantity: 1 }],
        })
      ).id,
      p2 = (
        await rpc("package", {
          shipment_id: s,
          contents: [{ name: "Exam", quantity: 1 }],
        })
      ).id,
      p3 = (
        await rpc("package", {
          shipment_id: s2,
          contents: [{ name: "Surgery", quantity: 1 }],
        })
      ).id;
    await assert.rejects(
      () =>
        rpc("package", {
          shipment_id: s,
          contents: [{ name: "Exam", quantity: 1 }],
        }),
      /OVER_ALLOCATION/,
    );
    await rpc("return_box", { id: s });
    for (const pid of [p1, p2, p3]) {
      await rpc("clean", { id: pid });
      await rpc("inspect", { id: pid });
      await rpc("pack", { id: pid });
    }
    assert.equal(
      (await db.query("select * from tr_packages where cycle_id is null")).rows
        .length,
      3,
      "no fabricated cycle",
    );
    await as(1);
    const ds = (await db.query("select * from devices order by code")).rows;
    assert.equal(ds.length, 6);
    for (const d of ds.slice(0, 2))
      await mutate("save_device", {
        id: d.id,
        model: "TEST ONLY",
        ifu: "TEST ONLY",
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
    const cycles = [];
    for (let i = 0; i < 2; i++) {
      const pg = await mutate("create_program", {
        device_id: ds[i].id,
        name: "TEST ONLY",
        ifu: "Synthetic",
        criteria,
      });
      await as(3);
      const c = await mutate("save_cycle", {
        id: id(100 + i),
        device_id: ds[i].id,
        program_id: pg.id,
        machine_number: "TEST-" + i,
        operating_date: "2026-11-05",
        payload: {
          items: [{ name: "Test items", quantity: i === 0 ? 2 : 1 }],
          packs: i === 0 ? 2 : 1,
          temperature: 134,
          pressure: 2,
          pressure_unit: "bar",
          exposure: 5,
          start: "2026-11-05T08:00:00+03:00",
          end: "2026-11-05T08:30:00+03:00",
          M: "P",
          C: "P",
          D: "P",
          completion: "complete",
        },
      });
      cycles.push(c);
      const path = "buraydah/" + c.id + "/test.pdf";
      await db.query(
        "insert into storage.objects(bucket_id,name) values('cycle-reports',$1)",
        [path],
      );
      await mutate("attach_report", {
        cycle_id: c.id,
        object_path: path,
        filename: "test.pdf",
        content_type: "application/pdf",
      });
      await as(1);
    }
    await as(3);
    for (const [pid, c] of [
      [p1, cycles[0]],
      [p3, cycles[0]],
      [p2, cycles[1]],
    ]) {
      await rpc("load", { id: pid, cycle_id: c.id });
      await assert.rejects(
        () => rpc("ready", { id: pid }),
        /APPROVAL_REQUIRED/,
      );
      await rpc("confirm_label", { id: pid, confirmed: true });
    }
    for (const c of cycles) {
      await rpc("start_cycle", { id: c.id });
      if (c.id === cycles[0].id) {
        const linked = (
          await db.query("select * from cycles where id=$1", [c.id])
        ).rows[0];
        await mutate("save_cycle", {
          ...linked,
          payload: {
            ...linked.payload,
            items: [{ name: "Wrong item", quantity: 2 }],
          },
        });
        await assert.rejects(
          () => mutate("submit_cycle", { id: c.id }),
          /PACKAGE_CONTENT_MISMATCH/,
        );
        await mutate("save_cycle", linked);
      }
      await mutate("submit_cycle", { id: c.id });
    }
    await as(1);
    await assert.rejects(
      () => mutate("decide_cycle", { id: cycles[0].id, decision: "R" }),
      /CLINICAL_AUTHORIZATION_REQUIRED/,
    );
    await as(4);
    await mutate("decide_cycle", { id: cycles[0].id, decision: "R" });
    await rpc("ready", { id: p1 });
    await rpc("ready", { id: p3 });
    await assert.rejects(() => rpc("ready", { id: p2 }), /APPROVAL_REQUIRED/);
    await as(7);
    await assert.rejects(
      () => rpc("collect", { id: p1 }),
      /SENDER_COLLECTION_REQUIRED/,
    );
    await as(2);
    await rpc("collect", { id: p1 });
    await assert.rejects(
      () => rpc("collect", { id: p2 }),
      /COLLECTION_BLOCKED/,
    );
    await as(4);
    await mutate("decide_cycle", {
      id: cycles[1].id,
      decision: "H",
      reason: "Synthetic failed cycle",
      corrective_action: "Segregated for reprocessing",
    });
    assert.equal(
      (await db.query("select stage from tr_packages where id=$1", [p2]))
        .rows[0].stage,
      "held",
    );
    await rpc("recall", { id: p1, reason: "Synthetic recall" });
    await assert.rejects(
      () => rpc("reprocess", { id: p1, reason: "Reprocess" }),
      /RETURN_AND_REASON_REQUIRED/,
    );
    await rpc("reprocess", {
      id: p1,
      reason: "Returned for reprocessing",
      returned: true,
    });
    assert.equal(
      (await db.query("select attempt from tr_packages where id=$1", [p1]))
        .rows[0].attempt,
      2,
    );
    await assert.rejects(
      () => rpc("print", { id: p3, reason: "Test" }),
      /PRINTING_DISABLED/,
    );
    assert.ok(
      (await db.query("select * from tr_events where action='collect'")).rows
        .length,
    );
    assert.ok(
      (await db.query("select * from tr_events where action='reprocess'"))
        .rows[0].detail.before_package.cycle_id,
    );
    await assert.rejects(
      () => db.query("update tr_packages set stage='ready'"),
      /permission denied/,
    );
    await db.exec("reset role;set role anon");
    await assert.rejects(
      () => db.query("select * from tr_packages"),
      /permission denied/,
    );
  } finally {
    await db.close();
  }
});
test("coverage, assistance, training, duty exclusivity, handover and printing settings", async () => {
  const { db, as, rpc, box } = await setup();
  try {
    await as(3);
    const times = {
      starts_at: new Date(Date.now() - 60000).toISOString(),
      ends_at: new Date(Date.now() + 3600000).toISOString(),
    };
    await assert.rejects(
      () =>
        rpc("assignment", {
          user_id: id(2),
          kind: "coverage",
          zone: "dirty",
          tasks: ["clean"],
          exclusive_duty: true,
          ...times,
        }),
      /QUALIFICATION_REQUIRED/,
    );
    await as(1);
    for (const task of ["receive", "clean"])
      await rpc("grant", {
        user_id: id(2),
        task,
        training_ref: "Qualified nurse training",
        valid_until: "2099-01-01",
      });
    await as(3);
    await assert.rejects(
      () =>
        rpc("assignment", {
          user_id: id(2),
          kind: "coverage",
          zone: "dirty",
          tasks: ["clean"],
          exclusive_duty: false,
          ...times,
        }),
      /check constraint/,
    );
    await rpc("assignment", {
      user_id: id(2),
      kind: "coverage",
      zone: "dirty",
      tasks: ["receive", "clean"],
      exclusive_duty: true,
      ...times,
    });
    await assert.rejects(
      () =>
        rpc("assignment", {
          user_id: id(2),
          kind: "assistance",
          zone: "dirty",
          tasks: ["clean"],
          exclusive_duty: false,
          ...times,
        }),
      /ASSIGNMENT_OVERLAP/,
    );
    await as(2);
    await assert.rejects(
      () => rpc("send", { box_id: box, items: [{ name: "Exam", sent: 1 }] }),
      /EXCLUSIVE_CSSD_DUTY/,
    );
    await as(1);
    await rpc("grant", {
      user_id: id(7),
      task: "clean",
      training_ref: "Assistance qualification",
      valid_until: "2099-01-01",
    });
    await as(3);
    await rpc("assignment", {
      user_id: id(7),
      kind: "assistance",
      zone: "dirty",
      tasks: ["clean"],
      exclusive_duty: false,
      ...times,
    });
    await as(7);
    const s = (
      await rpc("send", { box_id: box, items: [{ name: "Exam", sent: 1 }] })
    ).id;
    await as(2);
    await rpc("receive", {
      id: s,
      received: [{ name: "Exam", received: 1, damaged: 0 }],
    });
    const p = (
      await rpc("package", {
        shipment_id: s,
        contents: [{ name: "Exam", quantity: 1 }],
      })
    ).id;
    const h = (
      await rpc("handover", {
        to_id: id(3),
        package_ids: [p],
        note: "Cleaning remains pending",
      })
    ).id;
    await assert.rejects(() => rpc("accept_handover", { id: h }), /NOT_FOUND/);
    await as(3);
    await rpc("accept_handover", { id: h });
    assert.ok(
      (await db.query("select accepted_at from tr_handovers where id=$1", [h]))
        .rows[0].accepted_at,
    );
    await as(7);
    await rpc("clean", { id: p });
    await assert.rejects(
      () => rpc("inspect", { id: p }),
      /QUALIFIED_DUTY_REQUIRED/,
    );
    await as(1);
    await rpc("settings", { printing_enabled: true });
    assert.equal(
      (
        await db.query(
          "select printing_enabled from tr_settings where branch_id=$1",
          ["buraydah"],
        )
      ).rows[0].printing_enabled,
      true,
    );
  } finally {
    await db.close();
  }
});
