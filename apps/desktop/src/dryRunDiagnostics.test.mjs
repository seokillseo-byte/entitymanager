import test from "node:test";
import assert from "node:assert/strict";
import { buildDryRunDiagnosticReport } from "./dryRunDiagnostics.mjs";

test("reports totals, success rate, platform summaries, and recent records", () => {
  const now = "2026-10-10T12:00:00.000Z";
  const report = buildDryRunDiagnosticReport([
    { id: "1", platformId: "p1", platformName: "Platform One", plannedFields: ["email"], plannedSelector: "button[type=submit]", missingChecks: [], createdAt: "2026-10-10T11:00:00.000Z" },
    { id: "2", platformId: "p1", platformName: "Platform One", plannedFields: [], plannedSelector: "", missingChecks: ["email"], createdAt: "2026-10-09T11:00:00.000Z" },
    { id: "3", platformId: "p2", platformName: "Platform Two", plannedFields: ["username"], plannedSelector: "button.submit", missingChecks: [], createdAt: "2026-08-01T11:00:00.000Z" }
  ], now);

  assert.equal(report.readOnly, true);
  assert.equal(report.summary.totalRecords, 3);
  assert.equal(report.summary.successes, 2);
  assert.equal(report.summary.failures, 1);
  assert.equal(report.summary.successRatePercent, 67);
  assert.equal(report.summary.last30Days.totalRecords, 2);
  assert.equal(report.summary.last30Days.successes, 1);
  assert.equal(report.summary.recordsWithInvalidOrMissingTimestamp, 0);
  assert.equal(report.platforms[0].platformId, "p1");
  assert.equal(report.records.length, 3);
});

test("keeps malformed or missing timestamps visible without inventing dates", () => {
  const report = buildDryRunDiagnosticReport([
    { id: "legacy", platformId: "p1", platformName: "Platform One", plannedFields: ["email"], plannedSelector: "submit", missingChecks: [], createdAt: "" },
    { id: "bad", platformId: "p2", platformName: "Platform Two", plannedFields: [], plannedSelector: "", missingChecks: [], createdAt: "not-a-date" }
  ], "2026-10-10T12:00:00.000Z");

  assert.equal(report.summary.totalRecords, 2);
  assert.equal(report.summary.recordsWithInvalidOrMissingTimestamp, 2);
  assert.equal(report.records[0].createdAt, "");
  assert.equal(report.records[1].createdAt, "not-a-date");
  assert.equal(report.summary.last30Days.totalRecords, 0);
});

test("empty history produces safe zero totals", () => {
  const report = buildDryRunDiagnosticReport([], "2026-10-10T12:00:00.000Z");
  assert.equal(report.summary.totalRecords, 0);
  assert.equal(report.summary.successRatePercent, 0);
  assert.deepEqual(report.platforms, []);
});


test("records whether the export contains the complete SQLite history", () => {
  const records = [
    { id: "recent", platformId: "p1", platformName: "Platform One", plannedFields: ["email"], plannedSelector: "button.submit", missingChecks: [], createdAt: "2026-10-10T11:00:00.000Z" }
  ];
  const partial = buildDryRunDiagnosticReport(records, "2026-10-10T12:00:00.000Z", {
    totalRecords: 125, uniqueIds: 125, oldestCreatedAt: "2026-01-01T00:00:00.000Z", newestCreatedAt: "2026-10-10T11:00:00.000Z"
  });
  assert.equal(partial.sourceAudit.totalRecords, 125);
  assert.equal(partial.sourceAudit.includedRecords, 1);
  assert.equal(partial.sourceAudit.complete, false);

  const complete = buildDryRunDiagnosticReport(records, "2026-10-10T12:00:00.000Z", {
    totalRecords: 1, uniqueIds: 1, oldestCreatedAt: records[0].createdAt, newestCreatedAt: records[0].createdAt
  });
  assert.equal(complete.sourceAudit.complete, true);
});
