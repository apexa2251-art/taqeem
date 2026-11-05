import express from "express";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { createClient } from "@supabase/supabase-js";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { randomUUID } from "node:crypto";
export function createApp(env = process.env, dependencies = {}) {
  const publicKey = env.SUPABASE_PUBLISHABLE_KEY || "";
  let allowedKey = publicKey.startsWith("sb_publishable_");
  if (!allowedKey && publicKey.split(".").length === 3) {
    try {
      allowedKey =
        JSON.parse(Buffer.from(publicKey.split(".")[1], "base64url").toString())
          .role === "anon";
    } catch {}
  }
  const configured = !!(env.SUPABASE_URL && allowedKey);
  const app = express();
  app.set("trust proxy", 1);
  app.disable("x-powered-by");
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          upgradeInsecureRequests: env.NODE_ENV === "production" ? [] : null,
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          imgSrc: ["'self'", "data:"],
          connectSrc: [
            "'self'",
            "https://*.supabase.co",
            "wss://*.supabase.co",
          ],
          objectSrc: ["'none'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
  app.use(
    "/api",
    rateLimit({
      windowMs: 60_000,
      limit: 180,
      standardHeaders: "draft-8",
      legacyHeaders: false,
    }),
  );
  app.get("/api/health", (_, res) =>
    res.json({ app: "taqeem", ok: true, configured: configured }),
  );
  app.get("/api/config", (_, res) =>
    res.json({
      url: configured ? env.SUPABASE_URL : "",
      key: configured ? publicKey : "",
    }),
  );
  app.use("/api", async (req, res, next) => {
    res.set("Cache-Control", "no-store");
    if (!configured) return res.status(503).json({ error: "SETUP_REQUIRED" });
    const token = req.headers.authorization?.match(/^Bearer (.+)$/)?.[1];
    if (!token) return res.status(401).json({ error: "AUTH_REQUIRED" });
    req.db = dependencies.clientFactory
      ? dependencies.clientFactory(token)
      : createClient(env.SUPABASE_URL, env.SUPABASE_PUBLISHABLE_KEY, {
          global: { headers: { Authorization: `Bearer ${token}` } },
          auth: { persistSession: false, autoRefreshToken: false },
        });
    const { data, error } = await req.db.auth.getUser(token);
    if (error || !data?.user)
      return res.status(401).json({ error: "AUTH_REQUIRED" });
    const profile = await req.db
      .from("profiles")
      .select("*")
      .eq("id", data.user.id)
      .single();
    if (profile.error || !profile.data?.active)
      return res.status(403).json({ error: "ACCOUNT_NOT_ASSIGNED" });
    req.user = data.user;
    req.profile = profile.data;
    next();
  });
  app.use(express.json({ limit: "1mb" }));
  const fail = (res, e) =>
    res.status(e?.code === "23505" ? 409 : 400).json({
      error:
        e?.code === "23505"
          ? "DUPLICATE_CYCLE"
          : e?.message || "REQUEST_FAILED",
    });
  app.get("/api/me", async (req, res) => {
    const [branches, memberships] = await Promise.all([
      req.db.from("branches").select("*"),
      req.db.from("memberships").select("*").eq("user_id", req.user.id),
    ]);
    if (branches.error || memberships.error)
      return fail(res, branches.error || memberships.error);
    res.json({
      profile: req.profile,
      branches: branches.data,
      memberships: memberships.data,
    });
  });
  app.get("/api/data/:branch", async (req, res) => {
    const branch = req.params.branch;
    const tables = [
      "devices",
      "programs",
      "cycles",
      "evidence_tests",
      "attachments",
      "cycle_versions",
      "audit_events",
      "notification_receipts",
      "tr_grants",
    ];
    const result = {};
    for (const table of tables) {
      result[table] = [];
      for (let offset = 0; ; offset += 500) {
        let q = req.db.from(table).select("*");
        q =
          table === "devices" && req.profile.system_admin
            ? q
            : q.eq("branch_id", branch);
        const { data, error } = await q
          .order(
            table === "devices"
              ? "code"
              : table === "notification_receipts"
                ? "event_key"
                : "id",
            { ascending: true },
          )
          .range(offset, offset + 499);
        if (error) return fail(res, error);
        result[table].push(...data);
        if (data.length < 500) break;
      }
      if (table === "devices")
        result[table] = result[table].filter(
          (d) => !d.branch_id || d.branch_id === branch,
        );
    }
    if (req.profile.system_admin) {
      const p = await req.db.from("profiles").select("*");
      const m = await req.db.from("memberships").select("*");
      if (p.error || m.error) return fail(res, p.error || m.error);
      result.profiles = p.data;
      result.memberships = m.data;
    }
    res.json(result);
  });
  app.get("/api/tracking/:branch", async (req, res) => {
    const result = {};
    for (const name of [
      "clinics",
      "clinic_users",
      "grants",
      "boxes",
      "templates",
      "shipments",
      "packages",
      "assignments",
      "handovers",
      "settings",
      "events",
    ]) {
      result[name] = [];
      for (let offset = 0; ; offset += 500) {
        const { data, error } = await req.db
          .from("tr_" + name)
          .select("*")
          .eq("branch_id", req.params.branch)
          .order(name === "settings" ? "branch_id" : "id")
          .range(offset, offset + 499);
        if (error) return fail(res, error);
        result[name].push(...data);
        if (data.length < 500) break;
      }
    }
    const people = await req.db.rpc("tracking", {
      op: "people",
      b: req.params.branch,
      input: {},
    });
    if (people.error) return fail(res, people.error);
    result.people = people.data;
    res.json(result);
  });
  app.post("/api/tracking/:branch", async (req, res) => {
    const { op, input } = req.body || {};
    if (
      typeof op !== "string" ||
      !input ||
      Array.isArray(input) ||
      typeof input !== "object"
    )
      return res.status(400).json({ error: "INVALID_INPUT" });
    const { data, error } = await req.db.rpc("tracking", {
      op,
      b: req.params.branch,
      input,
    });
    if (error) return fail(res, error);
    res.json(data);
  });
  app.post("/api/action", async (req, res) => {
    const { op, branch, input } = req.body || {};
    if (
      typeof op !== "string" ||
      typeof branch !== "string" ||
      !input ||
      typeof input !== "object"
    )
      return res.status(400).json({ error: "INVALID_INPUT" });
    const { data, error } = await req.db.rpc("mutate", {
      op,
      b: branch,
      input,
    });
    if (error) return fail(res, error);
    res.json(data);
  });
  app.post(
    "/api/reports/:branch/:cycle",
    express.raw({
      type: ["application/pdf", "image/png", "image/jpeg"],
      limit: "10mb",
    }),
    async (req, res) => {
      const bytes = req.body,
        type = req.headers["content-type"];
      if (!Buffer.isBuffer(bytes) || bytes.length < 8)
        return res.status(400).json({ error: "FILE_INVALID" });
      const valid =
        type === "application/pdf"
          ? bytes.subarray(0, 5).toString() === "%PDF-"
          : type === "image/png"
            ? bytes
                .subarray(0, 8)
                .equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
            : type === "image/jpeg" &&
              bytes[0] === 255 &&
              bytes[1] === 216 &&
              bytes[2] === 255;
      if (!valid) return res.status(400).json({ error: "FILE_INVALID" });
      const ext =
        type === "application/pdf"
          ? "pdf"
          : type === "image/png"
            ? "png"
            : "jpg";
      const objectPath = `${req.params.branch}/${req.params.cycle}/${randomUUID()}.${ext}`;
      const up = await req.db.storage
        .from("cycle-reports")
        .upload(objectPath, bytes, { contentType: type, upsert: false });
      if (up.error) return fail(res, up.error);
      const { data, error } = await req.db.rpc("mutate", {
        op: "attach_report",
        b: req.params.branch,
        input: {
          cycle_id: req.params.cycle,
          object_path: objectPath,
          filename: `report.${ext}`,
          content_type: type,
        },
      });
      if (error) return fail(res, error);
      res.json(data);
    },
  );
  app.get("/api/report/:id", async (req, res) => {
    const a = await req.db
      .from("attachments")
      .select("*")
      .eq("id", req.params.id)
      .single();
    if (a.error) return res.status(404).json({ error: "NOT_FOUND" });
    const signed = await req.db.storage
      .from("cycle-reports")
      .createSignedUrl(a.data.object_path, 60);
    if (signed.error) return fail(res, signed.error);
    res.json({ url: signed.data.signedUrl });
  });
  const dist = path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../dist",
  );
  app.use(express.static(dist, { index: false }));
  app.get("/{*path}", (_, res) => res.sendFile(path.join(dist, "index.html")));
  app.use((err, req, res, next) => {
    res.status(err.status === 413 ? 413 : 500).json({
      error: err.status === 413 ? "FILE_TOO_LARGE" : "REQUEST_FAILED",
    });
  });
  return app;
}
