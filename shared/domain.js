export const roles = ["operator", "reviewer", "branch_admin", "viewer"];
export function approvalIssues(cycle, tests = []) {
  const p = cycle.payload || {},
    k = cycle.program_snapshot?.criteria,
    issues = [];
  if (!k) issues.push("PROGRAM_REQUIRED");
  if (
    p.M !== "P" ||
    p.D !== "P" ||
    !["P", "NA"].includes(p.C) ||
    p.completion !== "complete"
  )
    issues.push("APPROVAL_BLOCKED_RESULTS");
  if (p.C === "NA" && (!k?.allow_na || !p.na_reason?.trim()))
    issues.push("NA_NOT_ALLOWED");
  if (
    k &&
    (![p.temperature, p.pressure, p.exposure].every(
      (v) => v !== "" && Number.isFinite(Number(v)),
    ) ||
      Number(p.temperature) < Number(k.temp_min) ||
      Number(p.temperature) > Number(k.temp_max) ||
      Number(p.exposure) < Number(k.exposure_min) ||
      Number(p.pressure) < Number(k.pressure_min) ||
      Number(p.pressure) > Number(k.pressure_max) ||
      p.pressure_unit !== k.pressure_unit)
  )
    issues.push("APPROVAL_BLOCKED_CRITERIA");
  if (k?.bi_required || p.implantable_load) {
    const bi = tests
      .filter((t) => t.kind === "bi" && t.cycle_id === cycle.id)
      .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
    if (
      bi?.payload?.test_result !== "negative" ||
      bi?.payload?.control_result !== "positive"
    )
      issues.push("APPROVAL_BLOCKED_BI");
  }
  return issues;
}
export function deriveNotifications(cycles, tests) {
  const result = [];
  for (const c of cycles) {
    if (
      c.decision === "H" ||
      c.decision === "X" ||
      ["M", "C", "D"].some((k) => c.payload?.[k] === "F") ||
      ["alarm", "interrupted"].includes(c.payload?.completion)
    )
      result.push({
        key: `issue:${c.id}:${c.version}`,
        level: "critical",
        kind: "cycle_issue",
        cycle: c,
        page: "review",
        active: true,
      });
    else if (c.workflow === "submitted")
      result.push({
        key: `review:${c.id}:${c.version}`,
        level: "info",
        kind: "review_due",
        cycle: c,
        page: "review",
        active: true,
      });
  }
  const latest = new Map();
  for (const t of [...tests].sort((a, b) =>
    b.created_at.localeCompare(a.created_at),
  )) {
    const key = t.kind === "bi" && t.cycle_id ? `bi:${t.cycle_id}` : t.id;
    if (!latest.has(key)) latest.set(key, t);
  }
  for (const t of latest.values()) {
    if (
      t.kind === "bi" &&
      (t.payload.test_result === "pending" ||
        t.payload.control_result === "pending")
    )
      result.push({
        key: `bi:${t.id}`,
        level: "warning",
        kind: "bi_pending",
        test: t,
        page: "bio",
        active: true,
      });
    if (
      (t.kind === "bi" &&
        (t.payload.test_result === "positive" ||
          t.payload.control_result === "negative")) ||
      (t.kind === "device_check" && t.payload.result === "F")
    )
      result.push({
        key: `test-issue:${t.id}`,
        level: "critical",
        kind: "test_issue",
        test: t,
        page: t.kind === "bi" ? "bio" : "checks",
        active: true,
      });
  }
  return result;
}
export function csvCell(value) {
  const text = String(value ?? "");
  return (
    '"' +
    (/^[=+@\-\t\r]/.test(text) ? "'" + text : text).replaceAll('"', '""') +
    '"'
  );
}
export function localToIso(value) {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) return null;
  return new Date(value + ":00+03:00").toISOString();
}
export function isoToLocal(value) {
  if (!value) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })
    .format(new Date(value))
    .replace(" ", "T");
}
export function operatingDate() {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Riyadh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}
