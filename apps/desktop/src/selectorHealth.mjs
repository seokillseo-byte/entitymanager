const DAY_MS = 24 * 60 * 60 * 1000;

export function parseTimestamp(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value < 1e12 ? value * 1000 : value;
  }
  if (typeof value !== "string" || !value.trim()) return Number.NaN;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  return Date.parse(value);
}

export function normalizeDryRunHistoryRecord(record, index = 0) {
  const source = record && typeof record === "object" && !Array.isArray(record) ? record : {};
  const stringValue = (value) => typeof value === "string" ? value : "";
  const stringArray = (value) => Array.isArray(value) ? value.filter((item) => typeof item === "string") : [];
  return {
    id: stringValue(source.id) || `legacy-dry-run-${index}`,
    platformId: stringValue(source.platformId) || "unknown-platform",
    platformName: stringValue(source.platformName) || "Legacy platform",
    accountId: stringValue(source.accountId),
    plannedFields: stringArray(source.plannedFields),
    plannedSelector: stringValue(source.plannedSelector),
    missingChecks: stringArray(source.missingChecks),
    currentUrl: stringValue(source.currentUrl),
    createdAt: typeof source.createdAt === "string" || typeof source.createdAt === "number" ? source.createdAt : ""
  };
}

export function isSuccessfulDryRun(run) {
  const normalized = normalizeDryRunHistoryRecord(run);
  return normalized.missingChecks.length === 0
    && Boolean(normalized.plannedSelector)
    && normalized.plannedFields.length > 0;
}

export function calculateSelectorHealthTrends(dryRunHistory, selectorRecipes, now = Date.now()) {
  const cutoff = now - 30 * DAY_MS;
  const byPlatform = new Map();

  for (const run of dryRunHistory) {
    const item = byPlatform.get(run.platformId) ?? {
      platformId: run.platformId,
      platformName: run.platformName,
      total: 0,
      successes: 0,
      failures: 0,
      recent: 0,
      recentSuccesses: 0
    };
    const success = isSuccessfulDryRun(run);
    item.total += 1;
    if (success) item.successes += 1;
    else item.failures += 1;

    const timestamp = parseTimestamp(run.createdAt);
    if (Number.isFinite(timestamp) && timestamp >= cutoff && timestamp <= now) {
      item.recent += 1;
      if (success) item.recentSuccesses += 1;
    }
    byPlatform.set(run.platformId, item);
  }

  const platforms = Array.from(byPlatform.values())
    .map((item) => ({
      ...item,
      successRate: item.total ? Math.round(item.successes / item.total * 100) : 0,
      recentRate: item.recent ? Math.round(item.recentSuccesses / item.recent * 100) : 0
    }))
    .sort((a, b) => a.successRate - b.successRate || b.total - a.total);

  const recipes = selectorRecipes.map((recipe) => {
    const updatedAt = parseTimestamp(recipe.updatedAt);
    const runs = dryRunHistory.filter((run) => (
      run.platformId === recipe.platformId && Number.isFinite(parseTimestamp(run.createdAt))
    ));
    const before = Number.isFinite(updatedAt)
      ? runs.filter((run) => parseTimestamp(run.createdAt) <= updatedAt)
      : [];
    const after = Number.isFinite(updatedAt)
      ? runs.filter((run) => parseTimestamp(run.createdAt) > updatedAt)
      : [];
    const countFailures = (items) => items.filter((run) => !isSuccessfulDryRun(run)).length;

    return {
      ...recipe,
      beforeRuns: before.length,
      beforeFailures: countFailures(before),
      afterRuns: after.length,
      afterFailures: countFailures(after),
      confirmed: after.some(isSuccessfulDryRun)
    };
  });

  return { platforms, recipes };
}
