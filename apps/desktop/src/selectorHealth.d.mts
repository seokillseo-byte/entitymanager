import type { DryRunHistoryRecord, SelectorRecipeRecord } from "@entitymanager/shared";

export interface SelectorPlatformTrend {
  platformId: string;
  platformName: string;
  total: number;
  successes: number;
  failures: number;
  recent: number;
  recentSuccesses: number;
  successRate: number;
  recentRate: number;
}

export type SelectorRecipeTrend = SelectorRecipeRecord & {
  beforeRuns: number;
  beforeFailures: number;
  afterRuns: number;
  afterFailures: number;
  confirmed: boolean;
};

export function parseTimestamp(value: string | number | null | undefined): number;
export function normalizeDryRunHistoryRecord(record: unknown, index?: number): DryRunHistoryRecord;
export function isSuccessfulDryRun(run: DryRunHistoryRecord): boolean;
export function calculateSelectorHealthTrends(
  dryRunHistory: DryRunHistoryRecord[],
  selectorRecipes: SelectorRecipeRecord[],
  now?: number
): { platforms: SelectorPlatformTrend[]; recipes: SelectorRecipeTrend[] };
