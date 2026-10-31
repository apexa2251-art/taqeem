import { test } from "node:test";
import assert from "node:assert/strict";
import {
  approvalIssues,
  deriveNotifications,
  csvCell,
  localToIso,
  isoToLocal,
} from "../shared/domain.js";
const cycle = {
  id: "c",
  version: 1,
  workflow: "submitted",
  program_snapshot: {
    criteria: {
      temp_min: 130,
      temp_max: 140,
      exposure_min: 5,
      pressure_min: 1,
      pressure_max: 3,
      pressure_unit: "bar",
      bi_required: false,
    },
  },
  payload: {
    M: "P",
    C: "P",
    D: "P",
    temperature: 134,
    exposure: 6,
    pressure: 2,
    pressure_unit: "bar",
    completion: "complete",
  },
};
test("approval blocks failure, missing readings, and expired BI evidence", () => {
  assert.deepEqual(approvalIssues(cycle), []);
  assert.ok(
    approvalIssues({
      ...cycle,
      payload: { ...cycle.payload, D: "F" },
    }).includes("APPROVAL_BLOCKED_RESULTS"),
  );
  assert.ok(
    approvalIssues({
      ...cycle,
      payload: { ...cycle.payload, temperature: "" },
    }).includes("APPROVAL_BLOCKED_CRITERIA"),
  );
  const c = { ...cycle, payload: { ...cycle.payload, implantable_load: true } };
  const tests = [
    {
      cycle_id: "c",
      kind: "bi",
      created_at: "2026-01-01",
      payload: { test_result: "negative", control_result: "positive" },
    },
    {
      cycle_id: "c",
      kind: "bi",
      created_at: "2026-01-02",
      payload: { test_result: "positive", control_result: "positive" },
    },
  ];
  assert.ok(approvalIssues(c, tests).includes("APPROVAL_BLOCKED_BI"));
});
test("alerts reflect clinical state independently of read receipts", () => {
  const c = { ...cycle, decision: "H" };
  assert.equal(deriveNotifications([c], [])[0].level, "critical");
  assert.equal(c.decision, "H");
});
test("Saudi date conversion handles midnight without host timezone assumptions", () => {
  assert.equal(localToIso("2026-10-31T00:15"), "2026-10-30T21:15:00.000Z");
  assert.equal(isoToLocal("2026-10-30T21:15:00.000Z"), "2026-10-31T00:15");
});
test("CSV quotes and neutralizes spreadsheet formulas", () => {
  assert.equal(csvCell("=SUM(A1)"), `"'=SUM(A1)"`);
  assert.equal(csvCell('a"b'), `"a""b"`);
});
