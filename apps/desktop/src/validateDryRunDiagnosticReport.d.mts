export interface DryRunDiagnosticValidation {
  valid: boolean;
  errors: string[];
  checkedRecords: number;
}
export function validateDryRunDiagnosticReport(input: unknown): DryRunDiagnosticValidation;
