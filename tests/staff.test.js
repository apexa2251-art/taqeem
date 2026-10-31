import test from "node:test";
import assert from "node:assert/strict";
import { createStaffHandler } from "../supabase/functions/manage-staff/handler.js";
const uid = "11111111-1111-4111-8111-111111111111";
function fixture({ system_admin = false, active = true, valid = true } = {}) {
  const events = [],
    changes = [],
    rows = [];
  const admin = {
    auth: {
      getUser: async () => ({
        data: { user: valid ? { id: uid } : null },
        error: valid ? null : { message: "bad" },
      }),
      admin: {
        createUser: async (v) => {
          changes.push(["create", v]);
          return { data: { user: { id: uid } } };
        },
        updateUserById: async (id, v) => {
          changes.push(["update", id, v]);
          return { data: { user: { id } } };
        },
        deleteUser: async () => ({ error: null }),
      },
    },
    from(table) {
      let insert;
      const q = {
        select() {
          return q;
        },
        eq() {
          return q;
        },
        gte() {
          return Promise.resolve({ count: 0, error: null });
        },
        async single() {
          return {
            data: { id: uid, full_name: "Owner", system_admin, active },
            error: null,
          };
        },
        insert(v) {
          insert = v;
          rows.push([table, v]);
          if (table === "audit_events") events.push(v);
          return Promise.resolve({ error: null });
        },
        delete() {
          return q;
        },
      };
      return q;
    },
  };
  const handle = createStaffHandler({
    createAdmin: () => admin,
    serviceKey: "server-only",
    appOrigin: "https://app.example",
  });
  const call = (token, input, apikey) =>
    handle(
      new Request("https://edge.example", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: "Bearer " + token } : {}),
          ...(apikey ? { apikey } : {}),
        },
        body: JSON.stringify(input),
      }),
    );
  return { call, handle, events, changes, rows };
}
const password = "Temporary-Password-123";
test("anonymous and invalid sessions cannot reset passwords", async () => {
  const f = fixture({ valid: false });
  assert.equal(
    (await f.call(null, { op: "reset_password", password, user_id: uid }))
      .status,
    401,
  );
  assert.equal(
    (await f.call("bad", { op: "reset_password", password, user_id: uid }))
      .status,
    401,
  );
  assert.equal(f.changes.length, 0);
});
test("operator cannot create staff or reset another account", async () => {
  const f = fixture();
  for (const op of ["create", "reset_password"])
    assert.equal(
      (await f.call("user", { op, password, user_id: uid })).status,
      403,
    );
  assert.equal(f.changes.length, 0);
});
test("disabled profiles cannot change their own password", async () => {
  const f = fixture({ active: false });
  assert.equal(
    (await f.call("user", { op: "change_own_password", password })).status,
    403,
  );
});
test("own password change uses the verified user and never logs the password", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call("user", {
        op: "change_own_password",
        password,
        user_id: "attacker-selected-id",
      })
    ).status,
    200,
  );
  assert.equal(f.changes[0][1], uid);
  assert.equal(JSON.stringify(f.events).includes(password), false);
});
test("new staff are confirmed without email and cannot be promoted to system admin through input", async () => {
  const f = fixture({ system_admin: true });
  assert.equal(
    (
      await f.call("owner", {
        op: "create",
        password,
        email: "staff@example.com",
        full_name: "Staff One",
        branch_id: "buraydah",
        role: "operator",
        system_admin: true,
      })
    ).status,
    200,
  );
  assert.equal(f.changes[0][1].email_confirm, true);
  assert.equal(
    f.rows.find(([table]) => table === "profiles")[1].system_admin,
    false,
  );
});
test("dashboard credential can reset an existing active administrator only", async () => {
  const f = fixture();
  assert.equal(
    (
      await f.call("server-only", {
        op: "reset_password",
        password,
        user_id: uid,
      })
    ).status,
    403,
  );
  const a = fixture({ system_admin: true });
  assert.equal(
    (await a.call("server-only", { op: "create", password })).status,
    403,
  );
  assert.equal(
    (
      await a.call("server-only", {
        op: "reset_password",
        password,
        user_id: uid,
      })
    ).status,
    200,
  );
});

test("dashboard secret-key header is accepted but a publishable key is rejected", async () => {
  const f = fixture({ system_admin: true });
  assert.equal(
    (
      await f.call(
        null,
        { op: "reset_password", password, user_id: uid },
        "public-key",
      )
    ).status,
    401,
  );
  assert.equal(
    (
      await f.call(
        null,
        { op: "reset_password", password, user_id: uid },
        "server-only",
      )
    ).status,
    200,
  );
});

test("plain-text dashboard reset still requires the server key and existing admin profile", async () => {
  const f = fixture({ system_admin: true });
  const request = (token) =>
    new Request("https://edge.example?reset_admin=" + uid, {
      method: "POST",
      headers: { apikey: token, "Content-Type": "text/plain" },
      body: password,
    });
  assert.equal((await f.handle(request("public-key"))).status, 401);
  assert.equal(f.changes.length, 0);
  assert.equal((await f.handle(request("server-only"))).status, 200);
  assert.equal(f.changes[0][1], uid);
  assert.equal(JSON.stringify(f.events).includes(password), false);
});
