import { isSuccessfulDryRun, normalizeDryRunHistoryRecord, parseTimestamp } from "./selectorHealth.mjs";

const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

export function buildDryRunDiagnosticReport(records, exportedAt = new Date().toISOString(), sourceAudit = null) {
  const source = Array.isArray(records) ? records : [];
  const history = source.map((record, index) => normalizeDryRunHistoryRecord(record, index));
  const now = parseTimestamp(exportedAt);
  const cutoff = now - THIRTY_DAYS_MS;
  const byPlatform = new Map();
  let successes = 0;
  let failures = 0;
  let recentRuns = 0;
  let recentSuccesses = 0;
  let invalidTimestamps = 0;

  for (const run of history) {
    const success = isSuccessfulDryRun(run);
    const timestamp = parseTimestamp(run.createdAt);
    const recent = Number.isFinite(timestamp) && Number.isFinite(now) && timestamp >= cutoff && timestamp <= now;
    if (success) successes += 1;
    else failures += 1;
    if (recent) {
      recentRuns += 1;
      if (success) recentSuccesses += 1;
    }
    if (!Number.isFinite(timestamp)) invalidTimestamps += 1;

    const entry = byPlatform.get(run.platformId) ?? {
      platformId: run.platformId,
      platformName: run.platformName,
      total: 0,
      successes: 0,
      failures: 0,
      recentRuns: 0,
      recentSuccesses: 0
    };
    entry.total += 1;
    if (success) entry.successes += 1;
    else entry.failures += 1;
    if (recent) {
      entry.recentRuns += 1;
      if (success) entry.recentSuccesses += 1;
    }
    byPlatform.set(run.platformId, entry);
  }

  const sourceTotal = Number.isInteger(sourceAudit?.totalRecords) && sourceAudit.totalRecords >= 0
    ? sourceAudit.totalRecords
    : history.length;
  const uniqueIds = Number.isInteger(sourceAudit?.uniqueIds) && sourceAudit.uniqueIds >= 0
    ? sourceAudit.uniqueIds
    : new Set(history.map((record) => record.id)).size;
  const createdAtValues = history.map((record) => record.createdAt).filter((value) => typeof value === "string");
  const sortedCreatedAt = [...createdAtValues].sort();
  const inferredOldest = sortedCreatedAt.length ? sortedCreatedAt[0] : null;
  const inferredNewest = sortedCreatedAt.length ? sortedCreatedAt[sortedCreatedAt.length - 1] : null;

  return {
    schemaVersion: 1,
    reportType: "entitymanager-dry-run-diagnostics",
    exportedAt,
    readOnly: true,
    source: "local SQLite dry-run history loaded by Desktop",
    sourceAudit: {
      totalRecords: sourceTotal,
      uniqueIds,
      oldestCreatedAt: typeof sourceAudit?.oldestCreatedAt === "string" ? sourceAudit.oldestCreatedAt : sourceAudit ? null : inferredOldest,
      newestCreatedAt: typeof sourceAudit?.newestCreatedAt === "string" ? sourceAudit.newestCreatedAt : sourceAudit ? null : inferredNewest,
      includedRecords: history.length,
      complete: sourceTotal === history.length
    },
    summary: {
      totalRecords: history.length,
      successes,
      failures,
      successRatePercent: history.length ? Math.round((successes / history.length) * 100) : 0,
      last30Days: {
        totalRecords: recentRuns,
        successes: recentSuccesses,
        failures: recentRuns - recentSuccesses
      },
      recordsWithInvalidOrMissingTimestamp: invalidTimestamps
    },
    platforms: Array.from(byPlatform.values()).sort((a, b) => b.failures - a.failures || b.total - a.total),
    records: history
  };
}
