import test from "node:test";
import assert from "node:assert/strict";
import { buildDryRunDiagnosticReport } from "./dryRunDiagnostics.mjs";
import { validateDryRunDiagnosticReport } from "./validateDryRunDiagnosticReport.mjs";

const history = [
  { id: "a", platformId: "p1", platformName: "Platform One", plannedFields: ["email"], plannedSelector: "button.submit", missingChecks: [], createdAt: "2026-10-10T11:00:00.000Z" },
  { id: "b", platformId: "p1", platformName: "Platform One", plannedFields: [], plannedSelector: "", missingChecks: ["email"], createdAt: "2026-10-09T11:00:00.000Z" },
  { id: "c", platformId: "p2", platformName: "Platform Two", plannedFields: ["username"], plannedSelector: "button.submit", missingChecks: [], createdAt: "2026-08-01T11:00:00.000Z" }
];

test("accepts a consistent diagnostic report", () => {
  const report = buildDryRunDiagnosticReport(history, "2026-10-10T12:00:00.000Z");
  assert.deepEqual(validateDryRunDiagnosticReport(report), { valid: true, errors: [], checkedRecords: 3 });
});

test("detects edited overall totals", () => {
  const report = buildDryRunDiagnosticReport(history, "2026-10-10T12:00:00.000Z");
  report.summary.failures = 0;
  const result = validateDryRunDiagnosticReport(report);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes('"failures"')));
});

test("detects edited platform totals", () => {
  const report = buildDryRunDiagnosticReport(history, "2026-10-10T12:00:00.000Z");
  report.platforms[0].successes += 1;
  const result = validateDryRunDiagnosticReport(report);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("Per-platform totals")));
});

test("rejects wrong schema and malformed reports", () => {
  assert.equal(validateDryRunDiagnosticReport(null).valid, false);
  const report = buildDryRunDiagnosticReport([], "2026-10-10T12:00:00.000Z");
  report.schemaVersion = 2;
  assert.ok(validateDryRunDiagnosticReport(report).errors.some((error) => error.includes("schemaVersion")));
  assert.ok(validateDryRunDiagnosticReport({ records: "not-an-array" }).errors.some((error) => error.includes("records")));
});

test("validates reports with empty history and invalid record timestamps", () => {
  const report = buildDryRunDiagnosticReport([
    { id: "legacy", platformId: "p1", platformName: "Platform One", plannedFields: [], plannedSelector: "", missingChecks: [], createdAt: "bad-date" }
  ], "2026-10-10T12:00:00.000Z");
  assert.equal(validateDryRunDiagnosticReport(report).valid, true);
  const empty = buildDryRunDiagnosticReport([], "2026-10-10T12:00:00.000Z");
  assert.equal(validateDryRunDiagnosticReport(empty).valid, true);
});
