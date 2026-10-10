export interface DryRunDiagnosticReport {
  schemaVersion: 1;
  reportType: "entitymanager-dry-run-diagnostics";
  exportedAt: string;
  readOnly: true;
  source: string;
  summary: {
    totalRecords: number;
    successes: number;
    failures: number;
    successRatePercent: number;
    last30Days: { totalRecords: number; successes: number; failures: number };
    recordsWithInvalidOrMissingTimestamp: number;
  };
  platforms: Array<{
    platformId: string;
    platformName: string;
    total: number;
    successes: number;
    failures: number;
    recentRuns: number;
    recentSuccesses: number;
  }>;
  records: unknown[];
}

export function buildDryRunDiagnosticReport(
  records: unknown[],
  exportedAt?: string
): DryRunDiagnosticReport;
