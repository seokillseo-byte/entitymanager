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

  const audit = input.sourceAudit;
  if (!audit || typeof audit !== "object" || Array.isArray(audit)) {
    errors.push("sourceAudit is required to reconcile the export with SQLite.");
  } else {
    if (!Number.isInteger(audit.totalRecords) || audit.totalRecords < input.records.length) {
      errors.push("sourceAudit.totalRecords must be an integer at least as large as the included record count.");
    }
    if (!Number.isInteger(audit.uniqueIds) || audit.uniqueIds < 0 || audit.uniqueIds > audit.totalRecords) {
      errors.push("sourceAudit.uniqueIds must be a valid SQLite distinct-ID count.");
    }
    if (audit.includedRecords !== input.records.length) {
      errors.push("sourceAudit.includedRecords does not match the report records array.");
    }
    if (audit.complete !== (audit.totalRecords === input.records.length)) {
      errors.push("sourceAudit.complete does not match the SQLite and included record counts.");
    }
    for (const key of ["oldestCreatedAt", "newestCreatedAt"]) {
      if (audit[key] !== null && typeof audit[key] !== "string") {
        errors.push(`sourceAudit.${key} must be a string or null.`);
      }
    }
    const includedIds = new Set(input.records.map((record) => record && typeof record.id === "string" ? record.id : ""));
    includedIds.delete("");
    if (includedIds.size > audit.uniqueIds) {
      errors.push("Included distinct record IDs exceed the SQLite distinct-ID count.");
    }
    if (audit.complete === true) {
      if (includedIds.size !== audit.uniqueIds) {
        errors.push("Complete report distinct IDs do not match sourceAudit.uniqueIds.");
      }
      const timestamps = input.records
        .map((record) => record && typeof record.createdAt === "string" ? record.createdAt : "")
        .filter((value) => typeof value === "string");
      const oldest = timestamps.length ? [...timestamps].sort()[0] : null;
      const sortedTimestamps = [...timestamps].sort();
      const newest = sortedTimestamps.length ? sortedTimestamps[sortedTimestamps.length - 1] : null;
      if (oldest !== audit.oldestCreatedAt || newest !== audit.newestCreatedAt) {
        errors.push("Complete report timestamp bounds do not match the SQLite source audit.");
      }
    }
  }

  const expected = buildDryRunDiagnosticReport(input.records, input.exportedAt, audit);
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
  return { valid: errors.length === 0, errors, checkedRecords: input.records.length, complete: audit?.complete === true };
}
