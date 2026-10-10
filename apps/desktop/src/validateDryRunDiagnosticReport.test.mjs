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
  assert.deepEqual(validateDryRunDiagnosticReport(report), { valid: true, errors: [], checkedRecords: 3, complete: true });
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


test("accepts a consistent but explicitly partial export and detects altered source counts", () => {
  const report = buildDryRunDiagnosticReport(history, "2026-10-10T12:00:00.000Z", {
    totalRecords: 125,
    uniqueIds: 125,
    oldestCreatedAt: "2026-01-01T00:00:00.000Z",
    newestCreatedAt: "2026-10-10T11:00:00.000Z"
  });
  const result = validateDryRunDiagnosticReport(report);
  assert.equal(result.valid, true);
  assert.equal(result.complete, false);

  report.sourceAudit.totalRecords = 2;
  const tampered = validateDryRunDiagnosticReport(report);
  assert.equal(tampered.valid, false);
  assert.ok(tampered.errors.some((error) => error.includes("sourceAudit.totalRecords")));
});

test("reconciles a large complete history and rejects altered IDs or timestamp bounds", () => {
  const many = Array.from({ length: 1500 }, (_, index) => ({
    id: `run-${index}`,
    platformId: index % 3 === 0 ? "p1" : "p2",
    platformName: index % 3 === 0 ? "Platform One" : "Platform Two",
    plannedFields: index % 2 ? ["email"] : [],
    plannedSelector: index % 2 ? "button.submit" : "",
    missingChecks: index % 2 ? [] : ["email"],
    createdAt: new Date(Date.UTC(2026, 0, 1) + index * 1000).toISOString()
  }));
  const report = buildDryRunDiagnosticReport(many, "2026-10-10T12:00:00.000Z", {
    totalRecords: many.length,
    uniqueIds: many.length,
    oldestCreatedAt: many[0].createdAt,
    newestCreatedAt: many[many.length - 1].createdAt
  });
  assert.equal(validateDryRunDiagnosticReport(report).valid, true);
  assert.equal(validateDryRunDiagnosticReport(report).checkedRecords, 1500);
  assert.equal(report.sourceAudit.complete, true);

  report.records[1].id = report.records[0].id;
  const duplicateId = validateDryRunDiagnosticReport(report);
  assert.equal(duplicateId.valid, false);
  assert.ok(duplicateId.errors.some((error) => error.includes("distinct record IDs")));

  const restored = buildDryRunDiagnosticReport(many, "2026-10-10T12:00:00.000Z", {
    totalRecords: many.length,
    uniqueIds: many.length,
    oldestCreatedAt: many[0].createdAt,
    newestCreatedAt: many[many.length - 1].createdAt
  });
  restored.sourceAudit.newestCreatedAt = "2099-01-01T00:00:00.000Z";
  const alteredBounds = validateDryRunDiagnosticReport(restored);
  assert.equal(alteredBounds.valid, false);
  assert.ok(alteredBounds.errors.some((error) => error.includes("timestamp bounds")));
});

test("rejects missing audit extrema when a complete non-empty source is claimed", () => {
  const report = buildDryRunDiagnosticReport(history, "2026-10-10T12:00:00.000Z", {
    totalRecords: history.length,
    uniqueIds: history.length,
    oldestCreatedAt: null,
    newestCreatedAt: null
  });
  const result = validateDryRunDiagnosticReport(report);
  assert.equal(result.valid, false);
  assert.ok(result.errors.some((error) => error.includes("timestamp bounds")));
});
