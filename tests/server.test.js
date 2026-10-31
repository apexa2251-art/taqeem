import { test } from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.js";
test("health/config expose no secrets and unconfigured API fails closed", async () => {
  const app = createApp({ SUPABASE_SECRET_KEY: "NEVER_EXPOSE" });
  const config = await request(app).get("/api/config");
  assert.equal(JSON.stringify(config.body).includes("NEVER_EXPOSE"), false);
  assert.equal((await request(app).get("/api/me")).status, 503);
  assert.equal((await request(app).get("/api/health")).body.configured, false);
});
test("configured API requires verified authentication", async () => {
  const app = createApp(
    {
      SUPABASE_URL: "https://example.supabase.co",
      SUPABASE_PUBLISHABLE_KEY: "sb_publishable_test",
    },
    {
      clientFactory: () => ({
        auth: { getUser: async () => ({ error: { message: "invalid" } }) },
      }),
    },
  );
  assert.equal((await request(app).get("/api/me")).status, 401);
  assert.equal(
    (await request(app).get("/api/me").set("Authorization", "Bearer fake"))
      .status,
    401,
  );
});

test("a secret mistakenly assigned to the public variable is never exposed", async () => {
  const app = createApp({
    SUPABASE_URL: "https://example.supabase.co",
    SUPABASE_PUBLISHABLE_KEY: "sb_secret_NEVER_EXPOSE",
  });
  const r = await request(app).get("/api/config");
  assert.equal(r.body.key, "");
  assert.equal((await request(app).get("/api/health")).body.configured, false);
});
