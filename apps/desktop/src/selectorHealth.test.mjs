import test from "node:test";
import assert from "node:assert/strict";
import { calculateSelectorHealthTrends, parseTimestamp } from "./selectorHealth.mjs";

const NOW = Date.parse("2026-10-09T12:00:00.000Z");
const successfulRun = (createdAt, platformId = "p1") => ({
  id: `run-${createdAt}`, platformId, platformName: "Platform One", createdAt,
  missingChecks: [], plannedSelector: "button[type=submit]", plannedFields: ["name"]
});
const failedRun = (createdAt, platformId = "p1") => ({
  ...successfulRun(createdAt, platformId), missingChecks: ["name"], plannedFields: []
});
const recipe = (updatedAt, platformId = "p1") => ({
  id: `recipe-${platformId}`, platformId, platformName: "Platform One", updatedAt
});

test("empty history returns no platform trends and no false recipe improvements", () => {
  const result = calculateSelectorHealthTrends([], [recipe("2026-10-08T00:00:00Z")], NOW);
  assert.deepEqual(result.platforms, []);
  assert.equal(result.recipes[0].beforeRuns, 0);
  assert.equal(result.recipes[0].afterRuns, 0);
  assert.equal(result.recipes[0].confirmed, false);
});

test("success rate counts successful and failed runs accurately", () => {
  const result = calculateSelectorHealthTrends([
    successfulRun("2026-10-08T00:00:00Z"),
    failedRun("2026-10-07T00:00:00Z"),
    successfulRun("2026-10-06T00:00:00Z", "p2")
  ], [], NOW);
  const p1 = result.platforms.find((item) => item.platformId === "p1");
  assert.equal(p1.total, 2);
  assert.equal(p1.successes, 1);
  assert.equal(p1.failures, 1);
  assert.equal(p1.successRate, 50);
});

test("30-day trend excludes old, invalid, and future runs", () => {
  const result = calculateSelectorHealthTrends([
    successfulRun("2026-10-08T00:00:00Z"),
    failedRun("2026-09-20T00:00:00Z"),
    successfulRun("2026-08-01T00:00:00Z"),
    successfulRun("2026-10-10T00:00:00Z"),
    successfulRun("not-a-date")
  ], [], NOW);
  const platform = result.platforms[0];
  assert.equal(platform.total, 5);
  assert.equal(platform.recent, 2);
  assert.equal(platform.recentSuccesses, 1);
  assert.equal(platform.recentRate, 50);
});

test("saving a recipe without a later dry-run does not confirm improvement", () => {
  const result = calculateSelectorHealthTrends([
    failedRun("2026-10-08T10:00:00Z")
  ], [recipe("2026-10-08T11:00:00Z")], NOW);
  assert.equal(result.recipes[0].beforeRuns, 1);
  assert.equal(result.recipes[0].afterRuns, 0);
  assert.equal(result.recipes[0].confirmed, false);
});

test("a failed dry-run after recipe update is counted but not marked improved", () => {
  const result = calculateSelectorHealthTrends([
    failedRun("2026-10-08T12:00:00Z"),
    failedRun("2026-10-08T14:00:00Z")
  ], [recipe("2026-10-08T13:00:00Z")], NOW);
  assert.equal(result.recipes[0].beforeFailures, 1);
  assert.equal(result.recipes[0].afterRuns, 1);
  assert.equal(result.recipes[0].afterFailures, 1);
  assert.equal(result.recipes[0].confirmed, false);
});

test("only a successful post-update dry-run confirms improvement", () => {
  const result = calculateSelectorHealthTrends([
    failedRun("2026-10-08T12:00:00Z"),
    failedRun("2026-10-08T14:00:00Z"),
    successfulRun("2026-10-08T15:00:00Z")
  ], [recipe("2026-10-08T13:00:00Z")], NOW);
  assert.equal(result.recipes[0].beforeFailures, 1);
  assert.equal(result.recipes[0].afterRuns, 2);
  assert.equal(result.recipes[0].afterFailures, 1);
  assert.equal(result.recipes[0].confirmed, true);
});

test("numeric Unix timestamps in seconds and milliseconds are both supported", () => {
  assert.equal(parseTimestamp("1791547200"), 1791547200000);
  assert.equal(parseTimestamp(1791547200000), 1791547200000);
});
