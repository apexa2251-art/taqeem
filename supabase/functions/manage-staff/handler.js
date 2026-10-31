const roles = new Set(["operator", "reviewer", "branch_admin", "viewer"]);
const branches = new Set(["buraydah", "unayzah"]);
export function createStaffHandler({
  createAdmin,
  serviceKey,
  serviceKeys = [],
  appOrigin,
}) {
  const privilegedKeys = new Set(
    [serviceKey, ...serviceKeys].filter(
      (key) => typeof key === "string" && key.length > 0,
    ),
  );
  return async (request) => {
    const origin = request.headers.get("origin");
    const allowedOrigin =
      origin === appOrigin || origin === "https://supabase.com";
    const headers = {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "Access-Control-Allow-Origin": allowedOrigin ? origin : appOrigin,
      "Access-Control-Allow-Headers":
        "authorization, apikey, content-type, x-client-info, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      Vary: "Origin",
    };
    const reply = (status, body) =>
      new Response(JSON.stringify(body), { status, headers });
    if (origin && !allowedOrigin) return reply(403, { error: "FORBIDDEN" });
    if (request.method === "OPTIONS")
      return new Response(null, { status: 204, headers });
    if (request.method !== "POST")
      return reply(405, { error: "METHOD_NOT_ALLOWED" });
    const token = request.headers
      .get("authorization")
      ?.match(/^Bearer (.+)$/i)?.[1];
    const isDashboard =
      privilegedKeys.has(token) ||
      privilegedKeys.has(request.headers.get("apikey"));
    if ((!token && !isDashboard) || !serviceKey)
      return reply(401, { error: "AUTH_REQUIRED" });
    if (Number(request.headers.get("content-length") || 0) > 4096)
      return reply(413, { error: "INPUT_TOO_LARGE" });
    try {
      // The authenticated Dashboard can submit a password as plain text, so
      // the account owner does not have to edit JSON containing credentials.
      const dashboardTarget =
        isDashboard && new URL(request.url).searchParams.get("reset_admin");
      const input = dashboardTarget
        ? {
            op: "reset_password",
            user_id: dashboardTarget,
            password: await request.text(),
          }
        : await request.json();
      if (
        !input ||
        !["create", "reset_password", "change_own_password"].includes(input.op)
      )
        return reply(400, { error: "INVALID_OPERATION" });
      const admin = createAdmin();
      let actor;
      if (isDashboard) {
        // Dashboard recovery can reset only an existing active system administrator.
        // It cannot create accounts or grant any role.
        if (input.op !== "reset_password" || typeof input.user_id !== "string")
          return reply(403, { error: "FORBIDDEN" });
        const { data, error } = await admin
          .from("profiles")
          .select("id,full_name,system_admin,active")
          .eq("id", input.user_id)
          .single();
        if (error || !data?.active || !data.system_admin)
          return reply(403, { error: "FORBIDDEN" });
        actor = data;
      } else {
        const { data, error } = await admin.auth.getUser(token);
        if (error || !data?.user) return reply(401, { error: "AUTH_REQUIRED" });
        const profile = await admin
          .from("profiles")
          .select("id,full_name,system_admin,active")
          .eq("id", data.user.id)
          .single();
        if (profile.error || !profile.data?.active)
          return reply(403, { error: "ACCOUNT_NOT_ASSIGNED" });
        actor = profile.data;
        if (input.op !== "change_own_password" && !actor.system_admin)
          return reply(403, { error: "FORBIDDEN" });
      }
      if (
        typeof input.password !== "string" ||
        input.password.length < 12 ||
        input.password.length > 128
      )
        return reply(400, { error: "PASSWORD_LENGTH" });
      let targetId =
        input.op === "change_own_password" ? actor.id : input.user_id;
      let email, fullName;
      if (input.op === "create") {
        email =
          typeof input.email === "string"
            ? input.email.trim().toLowerCase()
            : "";
        fullName =
          typeof input.full_name === "string" ? input.full_name.trim() : "";
        if (
          !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
          email.length > 254 ||
          fullName.length < 2 ||
          fullName.length > 100 ||
          !roles.has(input.role) ||
          !branches.has(input.branch_id)
        )
          return reply(400, { error: "STAFF_DETAILS_REQUIRED" });
      } else {
        if (typeof targetId !== "string" || !/^[0-9a-f-]{36}$/i.test(targetId))
          return reply(400, { error: "USER_REQUIRED" });
        const target = await admin
          .from("profiles")
          .select("id,active")
          .eq("id", targetId)
          .single();
        if (target.error || !target.data?.active)
          return reply(404, { error: "USER_NOT_FOUND" });
      }
      const recent = await admin
        .from("audit_events")
        .select("id", { count: "exact", head: true })
        .eq("actor_id", actor.id)
        .eq("action", "account.change_requested")
        .gte("created_at", new Date(Date.now() - 600000).toISOString());
      if (recent.error) return reply(503, { error: "AUDIT_UNAVAILABLE" });
      if ((recent.count || 0) >= 10)
        return reply(429, { error: "ACCOUNT_RATE_LIMIT" });
      // Never put passwords or tokens into audit records, responses, or logs.
      const audit = await admin.from("audit_events").insert({
        actor_id: actor.id,
        actor_name: actor.full_name,
        action: "account.change_requested",
        entity_id: targetId || "new_staff",
        detail: {
          operation: input.op,
          source: isDashboard ? "dashboard" : "app",
        },
      });
      if (audit.error) return reply(503, { error: "AUDIT_UNAVAILABLE" });
      if (input.op === "create") {
        const created = await admin.auth.admin.createUser({
          email,
          password: input.password,
          email_confirm: true,
        });
        if (created.error || !created.data?.user)
          return reply(400, { error: "ACCOUNT_CREATE_FAILED" });
        targetId = created.data.user.id;
        const profile = await admin.from("profiles").insert({
          id: targetId,
          full_name: fullName,
          system_admin: false,
          active: true,
        });
        if (profile.error) {
          await admin.auth.admin.deleteUser(targetId);
          return reply(500, { error: "PROVISIONING_FAILED" });
        }
        const membership = await admin.from("memberships").insert({
          user_id: targetId,
          branch_id: input.branch_id,
          role: input.role,
        });
        if (membership.error) {
          await admin.from("profiles").delete().eq("id", targetId);
          await admin.auth.admin.deleteUser(targetId);
          return reply(500, { error: "PROVISIONING_FAILED" });
        }
      } else {
        const updated = await admin.auth.admin.updateUserById(targetId, {
          password: input.password,
        });
        if (updated.error)
          return reply(400, { error: "PASSWORD_UPDATE_FAILED" });
      }
      const completed = await admin.from("audit_events").insert({
        actor_id: actor.id,
        actor_name: actor.full_name,
        action: "account.change_completed",
        entity_id: targetId,
        detail: { operation: input.op },
      });
      return reply(200, {
        ok: true,
        user_id: targetId,
        audit_recorded: !completed.error,
      });
    } catch {
      return reply(400, { error: "ACCOUNT_REQUEST_FAILED" });
    }
  };
}
