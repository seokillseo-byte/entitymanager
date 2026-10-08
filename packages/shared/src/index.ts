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
  | "document"
  | "video"
  | "audio"
  | "portfolio"
  | "qa"
  | "local";

export type AutomationMode = "auto" | "semi_auto" | "manual_review";
export type PlatformDifficulty = "easy" | "medium" | "hard";
export type EntityValue = "brand" | "author" | "content" | "local" | "media" | "authority";
export type EntityProfileType = "brand" | "person" | "local_business" | "organization";
export type AccountPlanPriority = "high" | "medium" | "low";
export type AccountStatus = "planned" | "created" | "needs_manual_review" | "failed" | "verified";

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

export interface PlatformLibraryRecord {
  id: string;
  name: string;
  type: PlatformType;
  homepageUrl: string;
  authorityScore: number;
  difficulty: PlatformDifficulty;
  automationMode: AutomationMode;
  entityValue: EntityValue;
  requiresCaptcha: boolean;
  requiresEmail: boolean;
  notes: string;
}

export interface EntityProfileRecord {
  id: string;
  profileType: EntityProfileType;
  brandName: string;
  legalName: string;
  shortDescription: string;
  fullDescription: string;
  founderName: string;
  authorName: string;
  email: string;
  phone: string;
  address: string;
  sameAsUrls: string;
  targetKeywords: string;
  topicalNiche: string;
  expertiseProof: string;
  trustSignals: string;
}

export interface AccountCreationPlanItem {
  id: string;
  platformId: string;
  platformName: string;
  platformType: PlatformType;
  authorityScore: number;
  automationMode: AutomationMode;
  difficulty: PlatformDifficulty;
  entityValue: EntityValue;
  priority: AccountPlanPriority;
  recommendedUsername: string;
  profileAngle: string;
  requiredAssets: string[];
  workflowSteps: string[];
}

export interface AccountRecord {
  id: string;
  platformId: string;
  platformName: string;
  recommendedUsername: string;
  status: AccountStatus;
  priority: AccountPlanPriority;
  automationMode: AutomationMode;
  evidenceUrl: string;
  notes: string;
  createdAt: string;
  updatedAt: string;
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
