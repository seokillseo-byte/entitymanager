export type EntityModule =
  | "Overview"
  | "Money Sites"
  | "Entity Profile"
  | "Entity Builder"
  | "Entity Care"
  | "EEAT Planner"
  | "Entity Graph"
  | "Evidence Bank"
  | "Platform Library"
  | "API Integrations"
  | "Reports"
  | "Settings";

export type DashboardMetricTone = "good" | "neutral" | "warning" | "danger";

export interface DashboardMetric {
  label: string;
  value: string;
  tone: DashboardMetricTone;
}

export type PlatformType =
  | "social"
  | "blog"
  | "forum"
  | "citation"
  | "profile"
  | "media"
  | "qa"
  | "local";

export type AutomationMode = "auto" | "semi_auto" | "manual_review";

export interface MoneySiteProfile {
  id: string;
  domain: string;
  homepageUrl: string;
  sitemapUrl?: string;
  language: string;
  targetCountry: string;
  industry: string;
}

export interface PlatformSeed {
  id: string;
  name: string;
  type: PlatformType;
  homepageUrl: string;
  difficulty: 1 | 2 | 3 | 4 | 5;
  supportsAuto: boolean;
  supportsSemiAuto: boolean;
  requiresCaptcha: boolean;
  requiresEmail: boolean;
  fit: "brand" | "author" | "content" | "local" | "media";
}

export interface LocalIntegrationSetting {
  type: "ai" | "captcha" | "email" | "proxy" | "indexing";
  provider: string;
  isEnabled: boolean;
  maskedValue: string;
}

export interface DemoProjectSeed {
  projectName: string;
  moneySite: MoneySiteProfile;
  readinessInput: EntityReadinessInput;
  platforms: PlatformSeed[];
  integrations: LocalIntegrationSetting[];
}

export interface EntityReadinessInput {
  hasBrandProfile: boolean;
  hasNapProfile: boolean;
  hasAuthorProfile: boolean;
  hasMediaAssets: boolean;
  hasSeoTargets: boolean;
  hasContentSource: boolean;
  hasApiSettings: boolean;
}

export function calculateEntityReadiness(input: EntityReadinessInput): number {
  const weightedChecks = [
    [input.hasBrandProfile, 20],
    [input.hasNapProfile, 15],
    [input.hasAuthorProfile, 15],
    [input.hasMediaAssets, 10],
    [input.hasSeoTargets, 15],
    [input.hasContentSource, 15],
    [input.hasApiSettings, 10]
  ] as const;

  return weightedChecks.reduce((score, [passed, weight]) => score + (passed ? weight : 0), 0);
}
