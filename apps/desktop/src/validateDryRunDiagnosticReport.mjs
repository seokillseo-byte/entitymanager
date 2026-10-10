import { buildDryRunDiagnosticReport } from "./dryRunDiagnostics.mjs";

const sameJson = (left, right) => JSON.stringify(left) === JSON.stringify(right);

export function validateDryRunDiagnosticReport(input) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Report must be a JSON object."], checkedRecords: 0 };
  }
  if (input.reportType !== "entitymanager-dry-run-diagnostics") errors.push("Unrecognized reportType.");
  if (input.schemaVersion !== 1) errors.push("Unsupported or missing schemaVersion; expected 1.");
  if (input.readOnly !== true) errors.push("Report is not marked read-only.");
  if (typeof input.exportedAt !== "string" || !Number.isFinite(Date.parse(input.exportedAt))) {
    errors.push("exportedAt is missing or is not a valid date.");
  }
  if (!Array.isArray(input.records)) {
    errors.push("records must be an array.");
    return { valid: false, errors, checkedRecords: 0 };
  }
  if (!input.summary || typeof input.summary !== "object" || !Array.isArray(input.platforms)) {
    errors.push("summary and platforms are required.");
    return { valid: false, errors, checkedRecords: input.records.length };
  }
  if (typeof input.exportedAt !== "string" || !Number.isFinite(Date.parse(input.exportedAt))) {
    return { valid: false, errors, checkedRecords: input.records.length };
  }

  const expected = buildDryRunDiagnosticReport(input.records, input.exportedAt);
  const summaryKeys = ["totalRecords", "successes", "failures", "successRatePercent", "last30Days", "recordsWithInvalidOrMissingTimestamp"];
  for (const key of summaryKeys) {
    if (!sameJson(input.summary[key], expected.summary[key])) {
      errors.push(`Summary mismatch at "${key}".`);
    }
  }
  const platformProjection = (rows) => rows.map((row) => ({
    platformId: row?.platformId,
    platformName: row?.platformName,
    total: row?.total,
    successes: row?.successes,
    failures: row?.failures,
    recentRuns: row?.recentRuns,
    recentSuccesses: row?.recentSuccesses
  }));
  if (!sameJson(platformProjection(input.platforms), platformProjection(expected.platforms))) {
    errors.push("Per-platform totals do not match the included history records.");
  }
  return { valid: errors.length === 0, errors, checkedRecords: input.records.length };
}
