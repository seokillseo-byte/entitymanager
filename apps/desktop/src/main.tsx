import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, Brain, CheckSquare, ChevronDown, Database, Download, FileCheck2, GitBranch, Globe2, KeyRound, LayoutDashboard, Library, ListChecks, Play, Puzzle, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildProviderConfig, testIntegrationAdapter } from "@entitymanager/integrations";
import { calculateEntityReadiness } from "@entitymanager/shared";
import type { AccountCreationPlanItem, AccountPlanPriority, AccountRecord, AccountStatus, AccountSubmitVerifyResult, AutomationGateType, AutomationQueueItem, AutomationQueueStatus, AutomationMode, BrowserSessionRecord, BrowserStorageOverview, CaptchaInjectionPayload, CaptchaInjectionResult, DashboardMetric, EntityModule, EntityProfileRecord, IntegrationAdapterResult, IntegrationType, PlatformDifficulty, PlatformLibraryRecord, PlatformType, PlatformValidationRecord, PlatformValidationStatus, ProviderKeyStatus, ProvisioningCampaignRecord, ProvisioningJobRecord, ProxyRecord, SelectorRecipeRecord, DryRunHistoryRecord, WorkflowRunRecord, WorkflowRunStatus } from "@entitymanager/shared";
import { demoEntityProfileSeed, demoProjectSeed, platformLibrarySeed } from "@entitymanager/shared/seed";
import { createWorkflowTask, WORKFLOW_STATUSES } from "@entitymanager/workflow";
import { calculateSelectorHealthTrends, normalizeDryRunHistoryRecord } from "./selectorHealth.mjs";
import { buildDryRunDiagnosticReport } from "./dryRunDiagnostics.mjs";
import { validateDryRunDiagnosticReport } from "./validateDryRunDiagnosticReport.mjs";
import "./styles.css";

const primaryNavigation: Array<{ module: EntityModule; label: string }> = [
  { module: "Overview", label: "Tổng quan" },
  { module: "Entity Builder", label: "Tạo Entity" },
  { module: "Entity Care", label: "Chăm sóc Entity" },
  { module: "Platform Library", label: "Platform" },
  { module: "Evidence Bank", label: "Indexing" },
  { module: "Settings", label: "Cài đặt" }
];

const advancedNavigation: Array<{ module: EntityModule; label: string }> = [
  { module: "Money Sites", label: "Money Sites" },
  { module: "Entity Profile", label: "Entity Profile" },
  { module: "EEAT Planner", label: "EEAT Planner" },
  { module: "Entity Graph", label: "Entity Graph" },
  { module: "Platform Validation", label: "Platform Validation" },
  { module: "Selector Recipes", label: "Selector Recipes" },
  { module: "API Integrations", label: "API Integrations" },
  { module: "Reports", label: "Reports & Logs" }
];

const moduleLabels = Object.fromEntries([...primaryNavigation, ...advancedNavigation].map((item) => [item.module, item.label])) as Record<EntityModule, string>;

const icons = {
  Overview: LayoutDashboard,
  "Money Sites": Globe2,
  "Entity Profile": ShieldCheck,
  "Entity Builder": Bot,
  "Entity Care": Activity,
  "EEAT Planner": Brain,
  "Entity Graph": GitBranch,
  "Evidence Bank": FileCheck2,
  "Platform Library": Library,
  "Platform Validation": CheckSquare,
  "Selector Recipes": Bot,
  "API Integrations": KeyRound,
  Reports: Database,
  Settings
};

const metrics: DashboardMetric[] = [
  { label: "Entity Readiness", value: `${calculateEntityReadiness(demoProjectSeed.readinessInput)}%`, tone: "good" },
  { label: "Live Profiles", value: "0", tone: "neutral" },
  { label: "Care Plans", value: "0", tone: "neutral" },
  { label: "Waiting Manual", value: "0", tone: "warning" }
];

const starterTasks = [
  createWorkflowTask("Collect money-site data", "manual_required"),
  createWorkflowTask("Generate brand/entity variants", "pending"),
  createWorkflowTask("Prepare first platform adapter", "pending"),
  createWorkflowTask("Capture evidence URL", "pending")
];

interface MoneySiteForm {
  domain: string;
  homepageUrl: string;
  sitemapUrl: string;
  language: string;
  targetCountry: string;
  industry: string;
}

interface IntegrationSettingForm {
  settingType: IntegrationType;
  provider: string;
  apiKey: string;
  isEnabled: boolean;
  keyStatus: ProviderKeyStatus;
  lastTestAt: string;
}

interface GmailOAuthStatus {
  clientId: string;
  configured: boolean;
  connected: boolean;
  accountEmail: string;
  status: string;
  lastMessage: string;
  lastCheckedAt: string;
  authorizationUrl: string;
}

interface BrowserWorkerStatus {
  status: "starting" | "ready" | "failed" | "stopped";
  protocolVersion: string;
  processId: number;
  startedAt: string;
  heartbeatAt: string;
  activeSessions: number;
  message: string;
}

interface SystemDiagnosticCheck { id: string; label: string; status: "ok" | "warning" | "error" | "not_tested"; message: string; }

type PlatformTypeFilter = "all" | PlatformType;
type AutomationModeFilter = "all" | AutomationMode;
type DifficultyFilter = "all" | PlatformDifficulty;
interface EvidenceRecord { id: string; title: string; evidenceType: string; url: string; relatedPlatformId: string; notes: string; status: string; createdAt: string; }
type PlatformViewMode = "compact" | "table";
type BuilderPanelId = "guide" | "campaign" | "accounts" | "plans" | "activity";

const fallbackMoneySite: MoneySiteForm = {
  domain: demoProjectSeed.moneySite.domain,
  homepageUrl: demoProjectSeed.moneySite.homepageUrl,
  sitemapUrl: demoProjectSeed.moneySite.sitemapUrl ?? "",
  language: demoProjectSeed.moneySite.language,
  targetCountry: demoProjectSeed.moneySite.targetCountry,
  industry: demoProjectSeed.moneySite.industry
};

const fallbackSettings: IntegrationSettingForm[] = demoProjectSeed.integrations.map((integration) => ({
  settingType: integration.type,
  provider: integration.provider,
  apiKey: "",
  isEnabled: integration.isEnabled,
  keyStatus: "missing",
  lastTestAt: ""
}));

const fallbackPlatforms: PlatformLibraryRecord[] = platformLibrarySeed;
const fallbackEntityProfile: EntityProfileRecord = {
  ...demoEntityProfileSeed,
  id: "primary"
};

const platformTypes: PlatformTypeFilter[] = ["all", "social", "blog", "forum", "citation", "profile", "media", "document", "video", "audio", "portfolio", "qa", "local"];
const automationModes: AutomationModeFilter[] = ["all", "auto", "semi_auto", "manual_review"];
const difficulties: DifficultyFilter[] = ["all", "easy", "medium", "hard"];
const accountStatuses: AccountStatus[] = ["planned", "created", "needs_manual_review", "failed", "verified"];
const queueStatuses: AutomationQueueStatus[] = ["queued", "waiting", "resolved", "failed"];
const validationStatuses: PlatformValidationStatus[] = ["not_tested", "dry_run_ok", "text_saved", "media_uploaded", "needs_recipe_fix"];
const starterCampaignPlatformIds = ["github", "medium", "aboutme", "tumblr"];
const validationStatusLabels: Record<PlatformValidationStatus, string> = {
  not_tested: "Chưa test",
  dry_run_ok: "Dry-run OK",
  text_saved: "Text đã lưu",
  media_uploaded: "Media đã upload",
  needs_recipe_fix: "Cần sửa recipe"
};

type ReleaseAsset = { name: string; browser_download_url: string; size: number };
type LatestRelease = { name: string; tag_name: string; html_url: string; published_at: string; assets: ReleaseAsset[] };
type DryRunHistoryAudit = { totalRecords: number; uniqueIds: number; oldestCreatedAt: string | null; newestCreatedAt: string | null };
type RecipeFixSuggestion = {
  platformId: string;
  platformName: string;
  latestUrl: string;
  latestAt: string;
  status: "ready" | "needs_fix" | "untested";
  failedRuns: number;
  missingIssues: string[];
  selectorSuggestions: Record<string, string[]>;
  submitSuggestions: string[];
};
type PlatformGuide = {
  primaryUrl: string;
  secondaryUrls: string[];
  profileArea: string;
  textStep: string;
  mediaStep: string;
  saveStep: string;
  evidenceStep: string;
  warnings: string[];
};

function releaseBuildNumber(release: Pick<LatestRelease, "tag_name">) {
  const match = release.tag_name.match(/build-(\d+)$/);
  return match ? Number(match[1]) : 0;
}

function pickHighestBuildRelease(releases: LatestRelease[]) {
  return releases
    .filter((release) => release.assets.some((asset) => asset.name === "EntityManager-Chrome-Extension.zip") && release.assets.some((asset) => asset.name.endsWith("-setup.exe")))
    .sort((a, b) => releaseBuildNumber(b) - releaseBuildNumber(a))[0] ?? null;
}

function buildExportFilename(prefix: string) {
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${prefix}-${stamp}.json`;
}

function parseDryRunTime(value: string) {
  if (!value.trim()) return 0;
  const numeric = Number(value);
  if (Number.isFinite(numeric)) return numeric < 1e12 ? numeric * 1000 : numeric;
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeIssueField(issue: string) {
  const [rawField, problem] = issue.split(":");
  if (problem && problem !== "selector") return "";
  const fieldKeyMap: Record<string, string> = {
    username: "username",
    email: "email",
    displayName: "displayName",
    display_name: "displayName",
    bio: "bio",
    websiteUrl: "websiteUrl",
    website_url: "websiteUrl",
    company: "company",
    location: "location",
    socialLinks: "socialLinks",
    social_links: "socialLinks",
    profileImage: "profileImage",
    profile_image: "profileImage",
    avatarImageUrl: "avatarImageUrl",
    avatar_image_url: "avatarImageUrl",
    bannerImageUrl: "bannerImageUrl",
    banner_image_url: "bannerImageUrl"
  };
  return fieldKeyMap[rawField] ?? "";
}

function recipeSelectorCandidates(platformId: string): Record<string, string[]> {
  const shared: Record<string, string[]> = {
    username: ['input[name="username"]', 'input[autocomplete="username"]', 'input[aria-label*="username" i]'],
    email: ['input[type="email"]', 'input[name="email"]'],
    displayName: ['input[name="name"]', 'input[aria-label*="name" i]', 'input[placeholder*="name" i]'],
    bio: ['textarea[name="bio"]', 'textarea[aria-label*="bio" i]', 'textarea[placeholder*="bio" i]', 'textarea[aria-label*="about" i]'],
    websiteUrl: ['input[type="url"]', 'input[name*="website" i]', 'input[name*="url" i]', 'input[aria-label*="website" i]', 'input[placeholder*="url" i]'],
    socialLinks: ['input[name*="link" i]', 'input[aria-label*="link" i]', 'input[placeholder*="link" i]', 'input[aria-label*="social" i]'],
    avatarImageUrl: ['input[type="file"][accept*="image" i]', 'input[type="file"][name*="avatar" i]', 'input[type="file"][name*="photo" i]'],
    profileImage: ['input[type="file"][accept*="image" i]', 'input[type="file"][name*="image" i]'],
    bannerImageUrl: ['input[type="file"][name*="banner" i]', 'input[type="file"][name*="cover" i]', 'input[type="file"][name*="header" i]', 'input[type="file"][accept*="image" i]']
  };

  if (platformId === "medium") {
    return {
      ...shared,
      displayName: ['input[name="name"]', 'input[data-testid*="name" i]', 'input[aria-label*="name" i]', 'input[placeholder*="name" i]'],
      bio: ['textarea[aria-label*="bio" i]', 'textarea[placeholder*="bio" i]', 'textarea[name*="bio" i]'],
      websiteUrl: ['input[name*="url" i]', 'input[aria-label*="website" i]', 'input[placeholder*="website" i]', 'input[aria-label*="url" i]'],
      avatarImageUrl: ['input[type="file"][accept*="image" i]', 'input[type="file"][name*="image" i]']
    };
  }

  if (platformId === "aboutme") {
    return {
      ...shared,
      username: ['input[name*="slug" i]', 'input[name*="username" i]'],
      displayName: ['input[name="name"]', 'input[name*="display" i]', 'input[aria-label*="name" i]'],
      bio: ['textarea[name="bio"]', 'textarea[name*="bio" i]', 'textarea[placeholder*="about" i]'],
      websiteUrl: ['input[name="website"]', 'input[name*="website" i]', 'input[aria-label*="website" i]'],
      socialLinks: ['input[name*="link" i]', 'input[aria-label*="link" i]', 'input[placeholder*="link" i]']
    };
  }

  if (platformId === "tumblr") {
    return {
      ...shared,
      username: ['input[name="tumblelog[name]"]', 'input[name="blogName"]', 'input[aria-label*="username" i]'],
      displayName: ['input[name="title"]', 'input[name*="title" i]', 'input[aria-label*="title" i]', 'input[placeholder*="title" i]'],
      bio: ['textarea[name="description"]', 'textarea[name*="description" i]', 'textarea[aria-label*="description" i]', 'textarea[placeholder*="description" i]'],
      websiteUrl: ['input[name="url"]', 'input[name*="url" i]', 'input[aria-label*="website" i]'],
      bannerImageUrl: ['input[type="file"][name*="header" i]', 'input[type="file"][name*="banner" i]', 'input[type="file"][name*="cover" i]', 'input[type="file"][accept*="image" i]']
    };
  }

  return shared;
}

function selectorSuggestionsForIssues(platformId: string, issues: string[]) {
  const candidates = recipeSelectorCandidates(platformId);
  return issues.reduce<Record<string, string[]>>((result, issue) => {
    const field = normalizeIssueField(issue);
    if (field && candidates[field]) result[field] = candidates[field];
    return result;
  }, {});
}

function submitSelectorSuggestionsForPlatform(platformId: string) {
  if (platformId === "medium") {
    return ['button[data-testid*="save" i]', 'button[aria-label*="save" i]', 'button[data-action="save"]', 'button[type="submit"]'];
  }
  if (platformId === "aboutme") {
    return ['button[aria-label*="save" i]', 'button[data-testid*="save" i]', 'button[data-test*="save" i]', 'button[type="submit"]'];
  }
  if (platformId === "tumblr") {
    return ['button[aria-label*="save" i]', 'button[data-testid*="save" i]', 'button[data-test-id*="save" i]', 'button[type="submit"]'];
  }
  return ['button[type="submit"]', 'input[type="submit"]', 'button[name="submit"]'];
}

function guidedRunnerForPlatform(platformId: string, fallbackUrl = ""): PlatformGuide {
  const guides: Record<string, PlatformGuide> = {
    github: {
      primaryUrl: "https://github.com/settings/profile",
      secondaryUrls: ["https://github.com/settings/profile", "https://github.com/settings/account"],
      profileArea: "Settings → Public profile",
      textStep: "Chạy dry-run tại /settings/profile, sau đó dùng Điền thử an toàn để lưu display name, bio, URL, company, location và social links.",
      mediaStep: "Dùng Cập nhật avatar/banner cho avatar. GitHub không có banner profile phổ thông, nên banner có thể bỏ qua.",
      saveStep: "Text profile cần được lưu trước; avatar là bước riêng và cần confirm Set new profile picture.",
      evidenceStep: "Mở profile public của tài khoản GitHub sau khi lưu, copy URL profile làm evidence.",
      warnings: ["Logo/avatar nên dưới 1MB để GitHub nhận upload ổn.", "Không chạy upload avatar cùng lúc với lưu text nếu trang báo rời khỏi website."]
    },
    medium: {
      primaryUrl: "https://medium.com/me/settings",
      secondaryUrls: ["https://medium.com/me/settings", "https://medium.com/me/about", "https://medium.com/"],
      profileArea: "Medium → Settings/Profile hoặc About page của tài khoản",
      textStep: "Mở trang settings/profile, chạy dry-run, rồi điền display name, bio/about và website URL nếu trang có field.",
      mediaStep: "Upload avatar/logo ở khu vực profile photo. Medium thường không có banner profile chuẩn trong settings cá nhân.",
      saveStep: "Sau khi Điền thử an toàn, kiểm tra nút Save/Update trên trang Medium rồi lưu profile.",
      evidenceStep: "Mở trang public Medium của tài khoản hoặc author page, copy URL đó làm evidence.",
      warnings: ["Medium thay đổi UI theo trạng thái login khá nhiều; nếu dry-run fail, vào Selector Recipes → Platform Test Assistant để draft fix.", "Website URL có thể nằm ở About/Profile section chứ không phải màn signup."]
    },
    aboutme: {
      primaryUrl: "https://about.me/account/edit",
      secondaryUrls: ["https://about.me/account/edit", "https://about.me/settings", "https://about.me/"],
      profileArea: "About.me → Edit page/Profile details",
      textStep: "Mở trang edit profile, dry-run rồi điền name, bio/about, website và social/profile links.",
      mediaStep: "Upload avatar/logo ở profile photo. Banner/cover chỉ xử lý nếu trang hiện input ảnh tương ứng.",
      saveStep: "Bấm Save/Publish/Update sau khi điền text và sau khi upload media nếu About.me tách hai bước.",
      evidenceStep: "Mở trang public about.me/username, copy URL profile làm evidence.",
      warnings: ["About.me có thể yêu cầu publish page trước khi URL public hoạt động.", "Nếu social link chưa có field, thêm link thủ công rồi chạy dry-run lại để assistant học lỗi."]
    },
    tumblr: {
      primaryUrl: "https://www.tumblr.com/settings/blog",
      secondaryUrls: ["https://www.tumblr.com/settings/blog", "https://www.tumblr.com/customize", "https://www.tumblr.com/settings"],
      profileArea: "Tumblr → Blog settings / Edit appearance / Customize",
      textStep: "Mở blog settings hoặc edit appearance, dry-run rồi điền blog title, description/bio và website URL.",
      mediaStep: "Upload avatar/logo và banner/header trong edit appearance nếu các control hiện trên trang.",
      saveStep: "Tumblr thường có nút Save/Update theo từng khu vực; lưu text trước rồi xử lý avatar/banner.",
      evidenceStep: "Mở URL blog public dạng username.tumblr.com hoặc tumblr.com/username, copy URL làm evidence.",
      warnings: ["Tumblr có nhiều layout settings khác nhau theo loại blog; nếu dry-run fail, dùng Platform Test Assistant để lấy lỗi selector.", "CAPTCHA hoặc email verify có thể cần xử lý thủ công trước khi profile public ổn định."]
    }
  };

  return guides[platformId] ?? {
    primaryUrl: fallbackUrl,
    secondaryUrls: fallbackUrl ? [fallbackUrl] : [],
    profileArea: "Trang profile/settings của platform",
    textStep: "Mở trang chỉnh sửa profile, chạy dry-run rồi điền các trường entity/EEAT có trên trang.",
    mediaStep: "Upload avatar/logo hoặc banner nếu platform hỗ trợ.",
    saveStep: "Lưu profile trên website trước khi đánh dấu hoàn tất trong Desktop.",
    evidenceStep: "Mở trang public profile và copy URL làm evidence.",
    warnings: ["Platform này chưa có hướng dẫn riêng; bắt đầu bằng dry-run và đọc lỗi trong Selector Recipes."]
  };
}

function signupUrlForPlatform(platformId: string, fallbackUrl = "") {
  const urls: Record<string, string> = {
    medium: "https://medium.com/m/signin?operation=register",
    aboutme: "https://about.me/signup",
    tumblr: "https://www.tumblr.com/register",
    github: "https://github.com/signup"
  };
  return urls[platformId] ?? fallbackUrl;
}

function formatStorage(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 MB";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index >= 3 ? 1 : 0)} ${units[index]}`;
}

function identityIdFor(moneySite: MoneySiteForm, profile: EntityProfileRecord) {
  const source = `${moneySite.domain || "site"}-${profile.id || profile.email || "primary"}`.toLowerCase();
  const safe = source.replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 96);
  return `identity-${safe || "primary"}`;
}

function App() {
  const [activeModule, setActiveModule] = useState<EntityModule>("Overview");
  const [moneySite, setMoneySite] = useState<MoneySiteForm>(fallbackMoneySite);
  const [settings, setSettings] = useState<IntegrationSettingForm[]>(fallbackSettings);
  const [platforms, setPlatforms] = useState<PlatformLibraryRecord[]>(fallbackPlatforms);
  const [selectorRecipes, setSelectorRecipes] = useState<SelectorRecipeRecord[]>([]);
  const [dryRunHistory, setDryRunHistory] = useState<DryRunHistoryRecord[]>([]);
  const [platformValidation, setPlatformValidation] = useState<PlatformValidationRecord[]>([]);
  const [dryRunSourceAudit, setDryRunSourceAudit] = useState<DryRunHistoryAudit | null>(null);
  const [dryRunHistoryAllLoaded, setDryRunHistoryAllLoaded] = useState(false);
  const [diagnosticExportMessage, setDiagnosticExportMessage] = useState("");
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [evidenceDraft, setEvidenceDraft] = useState<Omit<EvidenceRecord, "id" | "createdAt">>({ title: "", evidenceType: "profile", url: "", relatedPlatformId: "", notes: "", status: "needs_review" });
  const [recipeImportJson, setRecipeImportJson] = useState("");
  const [recipeImportMessage, setRecipeImportMessage] = useState("");
  const [diagnosticImportJson, setDiagnosticImportJson] = useState("");
  const [diagnosticValidation, setDiagnosticValidation] = useState<{ valid: boolean; errors: string[]; checkedRecords: number; complete?: boolean } | null>(null);
  const [entityProfile, setEntityProfile] = useState<EntityProfileRecord>(fallbackEntityProfile);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);
  const [automationQueue, setAutomationQueue] = useState<AutomationQueueItem[]>([]);
  const [captchaBridgePayload, setCaptchaBridgePayload] = useState<CaptchaInjectionPayload | null>(null);
  const [adapterResults, setAdapterResults] = useState<Record<string, IntegrationAdapterResult>>({});
  const [campaignPlatformIds, setCampaignPlatformIds] = useState<string[]>(starterCampaignPlatformIds);
  const [executionPlatformId, setExecutionPlatformId] = useState<string>(starterCampaignPlatformIds[0]);
  const [executionEvidenceUrl, setExecutionEvidenceUrl] = useState("");
  const [platformTypeFilter, setPlatformTypeFilter] = useState<PlatformTypeFilter>("all");
  const [automationModeFilter, setAutomationModeFilter] = useState<AutomationModeFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [platformViewMode, setPlatformViewMode] = useState<PlatformViewMode>("compact");
  const [statusMessage, setStatusMessage] = useState("SQLite local data ready");
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(null);
  const [builderPanels, setBuilderPanels] = useState<Record<BuilderPanelId, boolean>>({
    guide: false,
    campaign: false,
    accounts: false,
    plans: false,
    activity: false
  });
  const [openingPlatformUrl, setOpeningPlatformUrl] = useState(false);
  const [externalOpenMessage, setExternalOpenMessage] = useState("");
  const [orchestratorStarting, setOrchestratorStarting] = useState(false);
  const [indexingQueueCount, setIndexingQueueCount] = useState(0);
  const [provisioningCampaigns, setProvisioningCampaigns] = useState<ProvisioningCampaignRecord[]>([]);
  const [provisioningJobs, setProvisioningJobs] = useState<ProvisioningJobRecord[]>([]);
  const [campaignLaunching, setCampaignLaunching] = useState(false);
  const [proxyRecords, setProxyRecords] = useState<ProxyRecord[]>([]);
  const [browserSessions, setBrowserSessions] = useState<BrowserSessionRecord[]>([]);
  const [browserStorage, setBrowserStorage] = useState<BrowserStorageOverview | null>(null);
  const [storageBusy, setStorageBusy] = useState("");
  const [selectedProxyId, setSelectedProxyId] = useState("");
  const [browserVisible, setBrowserVisible] = useState(true);
  const [browserWorker, setBrowserWorker] = useState<BrowserWorkerStatus | null>(null);
  const [browserPreviews, setBrowserPreviews] = useState<Record<string, string>>({});
  const [proxyDraft, setProxyDraft] = useState({ name: "", protocol: "http", host: "", port: "", username: "", password: "", countryCode: "" });
  const [gmailOAuth, setGmailOAuth] = useState<GmailOAuthStatus>({ clientId: "", configured: false, connected: false, accountEmail: "", status: "not_configured", lastMessage: "Chưa cấu hình Gmail OAuth.", lastCheckedAt: "", authorizationUrl: "" });
  const [gmailOAuthDraft, setGmailOAuthDraft] = useState({ clientId: "", clientSecret: "" });
  const [gmailActionMessage, setGmailActionMessage] = useState("");
  const [gmailActionRunning, setGmailActionRunning] = useState<"oauth" | "test" | "medium" | "">("");
  const [systemDiagnostics, setSystemDiagnostics] = useState<SystemDiagnosticCheck[]>([]);
  const [diagnosticsRunning, setDiagnosticsRunning] = useState(false);

  useEffect(() => {
    void loadLocalData();
    void startExtensionBridge();
  }, []);

  useEffect(() => {
    if (gmailOAuth.status !== "authorizing") return;
    const intervalId = window.setInterval(async () => {
      try {
        const latest = await invoke<GmailOAuthStatus>("get_gmail_oauth_status");
        setGmailOAuth(latest);
        if (latest.connected) {
          setGmailActionMessage(`Đã kết nối Gmail ${latest.accountEmail}. Worker xác minh Medium đã sẵn sàng.`);
          setStatusMessage(`Gmail OAuth connected: ${latest.accountEmail}`);
        } else if (latest.status === "error") {
          setGmailActionMessage(latest.lastMessage);
        }
      } catch (error) {
        setGmailActionMessage(`Không làm mới được trạng thái OAuth: ${String(error)}`);
      }
    }, 2000);
    return () => window.clearInterval(intervalId);
  }, [gmailOAuth.status]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      void refreshPlatformValidation(false);
    }, 5000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(async () => {
      try {
        const [sessions, jobs, campaigns, queueCount] = await Promise.all([
          invoke<BrowserSessionRecord[]>("get_browser_sessions"),
          invoke<ProvisioningJobRecord[]>("get_provisioning_jobs"),
          invoke<ProvisioningCampaignRecord[]>("get_provisioning_campaigns"),
          invoke<number>("get_indexing_queue_count")
        ]);
        setBrowserSessions(sessions);
        setProvisioningJobs(jobs);
        setProvisioningCampaigns(campaigns);
        setIndexingQueueCount(queueCount);
        try {
          setBrowserWorker(await invoke<BrowserWorkerStatus>("get_browser_worker_status"));
        } catch {
          setBrowserWorker((current) => current?.status === "ready" ? { ...current, status: "failed", message: "Browser Worker đã mất heartbeat." } : current);
        }
      } catch {
        // Desktop may be closing; the next interval retries without interrupting the operator.
      }
    }, 3000);
    return () => window.clearInterval(intervalId);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("https://api.github.com/repos/seokillseo-byte/entitymanager/releases?per_page=20", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
        return response.json() as Promise<LatestRelease[]>;
      })
      .then((releases) => {
        const release = pickHighestBuildRelease(releases);
        if (!cancelled) setLatestRelease(release);
      })
      .catch(() => {
        if (!cancelled) setLatestRelease(null);
      });
    return () => { cancelled = true; };
  }, []);

  const readiness = useMemo(() => {
    const checks = [
      Boolean(moneySite.domain.trim()),
      Boolean(moneySite.homepageUrl.trim()),
      Boolean(entityProfile.brandName.trim()),
      Boolean(entityProfile.authorName.trim()),
      Boolean(entityProfile.expertiseProof.trim()),
      Boolean(entityProfile.trustSignals.trim()),
      evidenceRecords.length > 0,
      settings.some((item) => item.isEnabled),
    ];
    return Math.round((checks.filter(Boolean).length / checks.length) * 100);
  }, [moneySite, entityProfile, evidenceRecords, settings]);
  const filteredPlatforms = useMemo(() => {
    return platforms.filter((platform) => {
      const typeMatches = platformTypeFilter === "all" || platform.type === platformTypeFilter;
      const automationMatches = automationModeFilter === "all" || platform.automationMode === automationModeFilter;
      const difficultyMatches = difficultyFilter === "all" || platform.difficulty === difficultyFilter;

      return typeMatches && automationMatches && difficultyMatches;
    });
  }, [automationModeFilter, difficultyFilter, platformTypeFilter, platforms]);

  const platformStats = useMemo(() => {
    const total = platforms.length;
    const semiAuto = platforms.filter((platform) => platform.automationMode === "semi_auto").length;
    const manual = platforms.filter((platform) => platform.automationMode === "manual_review").length;
    const averageAuthority = total
      ? Math.round(platforms.reduce((sum, platform) => sum + platform.authorityScore, 0) / total)
      : 0;

    return { total, semiAuto, manual, averageAuthority };
  }, [platforms]);

  const selectorFailureAnalytics = useMemo(() => {
    const grouped = new Map<string, { platformId: string; platformName: string; runs: number; failures: number; issueCounts: Map<string, number> }>();
    for (const record of dryRunHistory) {
      const entry = grouped.get(record.platformId) ?? {
        platformId: record.platformId,
        platformName: record.platformName,
        runs: 0,
        failures: 0,
        issueCounts: new Map<string, number>()
      };
      entry.runs += 1;
      const issues = [...record.missingChecks];
      if (!record.plannedSelector) issues.push("submitButton");
      if (!record.plannedFields.length) issues.push("noPlannedFields");
      if (issues.length) entry.failures += 1;
      for (const issue of new Set(issues)) entry.issueCounts.set(issue, (entry.issueCounts.get(issue) ?? 0) + 1);
      grouped.set(record.platformId, entry);
    }
    return Array.from(grouped.values())
      .map((entry) => ({
        ...entry,
        repeatedIssues: Array.from(entry.issueCounts.entries())
          .filter(([, count]) => count > 1)
          .sort((a, b) => b[1] - a[1])
      }))
      .sort((a, b) => b.failures - a.failures || b.runs - a.runs);
  }, [dryRunHistory]);

  const selectorHealthTrends = useMemo(
    () => calculateSelectorHealthTrends(dryRunHistory, selectorRecipes),
    [dryRunHistory, selectorRecipes]
  );

  const platformTestAssistant = useMemo<RecipeFixSuggestion[]>(() => {
    return starterCampaignPlatformIds.slice(1).map((platformId) => {
      const platform = platforms.find((item) => item.id === platformId);
      const runs = dryRunHistory
        .filter((run) => run.platformId === platformId)
        .sort((a, b) => parseDryRunTime(b.createdAt) - parseDryRunTime(a.createdAt));
      const failedRuns = runs.filter((run) => run.missingChecks.length > 0 || !run.plannedSelector || run.plannedFields.length === 0);
      const latestRun = runs[0];
      const missingIssues = Array.from(new Set(failedRuns.flatMap((run) => {
        const issues = [...run.missingChecks];
        if (!run.plannedSelector) issues.push("submitButton");
        if (!run.plannedFields.length) issues.push("noPlannedFields");
        return issues;
      })));
      const selectorSuggestions = selectorSuggestionsForIssues(platformId, missingIssues);
      const submitSuggestions = missingIssues.includes("submitButton") || missingIssues.includes("noPlannedFields")
        ? submitSelectorSuggestionsForPlatform(platformId)
        : [];
      const status: RecipeFixSuggestion["status"] = !runs.length
        ? "untested"
        : failedRuns.length
          ? "needs_fix"
          : "ready";

      return {
        platformId,
        platformName: platform?.name ?? platformId,
        latestUrl: latestRun?.currentUrl ?? "",
        latestAt: latestRun?.createdAt ?? "",
        status,
        failedRuns: failedRuns.length,
        missingIssues,
        selectorSuggestions,
        submitSuggestions
      };
    });
  }, [dryRunHistory, platforms]);

  const validationPack = useMemo(() => {
    const targets = ["github", "medium", "aboutme", "tumblr"];
    const existing = new Map(platformValidation.map((record) => [record.platformId, record]));
    return targets.map((platformId) => {
      const platform = platforms.find((item) => item.id === platformId);
      return existing.get(platformId) ?? {
        platformId,
        platformName: platform?.name ?? platformId,
        status: "not_tested" as PlatformValidationStatus,
        dryRunCheckedAt: "",
        textSavedAt: "",
        mediaUploadedAt: "",
        evidenceSavedAt: "",
        certifiedAt: "",
        lastTestedUrl: "",
        notes: "",
        updatedAt: ""
      };
    });
  }, [platformValidation, platforms]);

  const validationStats = useMemo(() => ({
    total: validationPack.length,
    dryRunOk: validationPack.filter((record) => ["dry_run_ok", "text_saved", "media_uploaded"].includes(record.status)).length,
    textSaved: validationPack.filter((record) => ["text_saved", "media_uploaded"].includes(record.status)).length,
    mediaUploaded: validationPack.filter((record) => record.status === "media_uploaded").length,
    needsFix: validationPack.filter((record) => record.status === "needs_recipe_fix").length
  }), [validationPack]);

  const accountCreationPlan = useMemo<AccountCreationPlanItem[]>(() => {
    const cleanBrand = entityProfile.brandName
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "")
      .slice(0, 22) || "entitybrand";

    return platforms
      .map((platform) => {
        const priority: AccountPlanPriority = platform.authorityScore >= 88 || platform.entityValue === "authority"
          ? "high"
          : platform.authorityScore >= 78
            ? "medium"
            : "low";

        const profileAngle = buildProfileAngle(platform, entityProfile);

        return {
          id: `${platform.id}-account-plan`,
          platformId: platform.id,
          platformName: platform.name,
          platformType: platform.type,
          authorityScore: platform.authorityScore,
          automationMode: platform.automationMode,
          difficulty: platform.difficulty,
          entityValue: platform.entityValue,
          priority,
          recommendedUsername: `${cleanBrand}${platform.type === "local" ? "local" : ""}`,
          profileAngle,
          requiredAssets: requiredAssetsForPlatform(platform),
          workflowSteps: workflowStepsForPlatform(platform)
        };
      })
      .sort((first, second) => second.authorityScore - first.authorityScore);
  }, [entityProfile, platforms]);

  const campaignPlans = useMemo(() => {
    const selected = accountCreationPlan.filter((plan) => campaignPlatformIds.includes(plan.platformId));
    return selected.length ? selected : accountCreationPlan.slice(0, 4);
  }, [accountCreationPlan, campaignPlatformIds]);

  const campaignDataRows = useMemo(() => ([
    ["Brand name", entityProfile.brandName],
    ["Legal/NAP name", entityProfile.legalName || entityProfile.brandName],
    ["Author / founder", entityProfile.authorName || entityProfile.founderName],
    ["Email", entityProfile.email],
    ["Phone", entityProfile.phone],
    ["Address", entityProfile.address],
    ["Homepage URL", moneySite.homepageUrl],
    ["Bio / short description", entityProfile.shortDescription],
    ["Topical niche", entityProfile.topicalNiche],
    ["Target keywords", entityProfile.targetKeywords],
    ["SameAs / social links", entityProfile.sameAsUrls],
    ["Avatar / logo", entityProfile.avatarImageUrl],
    ["Banner", entityProfile.bannerImageUrl],
    ["Expertise proof", entityProfile.expertiseProof],
    ["Trust signals", entityProfile.trustSignals]
  ]), [entityProfile, moneySite]);

  const activeExecutionPlan = useMemo(() => {
    return campaignPlans.find((plan) => plan.platformId === executionPlatformId) ?? campaignPlans[0] ?? null;
  }, [campaignPlans, executionPlatformId]);

  const activeExecutionAccount = useMemo(() => {
    if (!activeExecutionPlan) return null;
    return accounts.find((account) => account.platformId === activeExecutionPlan.platformId) ?? null;
  }, [accounts, activeExecutionPlan]);

  const activeExecutionPlatform = useMemo(() => {
    if (!activeExecutionPlan) return null;
    return platforms.find((platform) => platform.id === activeExecutionPlan.platformId) ?? null;
  }, [activeExecutionPlan, platforms]);

  const activeExecutionValidation = useMemo(() => {
    if (!activeExecutionPlan) return null;
    return platformValidation.find((record) => record.platformId === activeExecutionPlan.platformId)
      ?? validationPack.find((record) => record.platformId === activeExecutionPlan.platformId)
      ?? null;
  }, [activeExecutionPlan, platformValidation, validationPack]);

  const activeExecutionQueue = useMemo(() => {
    if (!activeExecutionAccount && !activeExecutionPlan) return [];
    return automationQueue.filter((item) => (
      item.accountId === activeExecutionAccount?.id
      || item.platformName === activeExecutionPlan?.platformName
    ));
  }, [activeExecutionAccount, activeExecutionPlan, automationQueue]);

  const activeSubmitVerifyQueue = useMemo(() => (
    activeExecutionQueue.find((item) => item.gateType === "submit_verify") ?? null
  ), [activeExecutionQueue]);

  const activeEvidenceUrl = executionEvidenceUrl
    || activeExecutionAccount?.evidenceUrl
    || activeExecutionValidation?.lastTestedUrl
    || "";
  const activePlatformGuide = activeExecutionPlan
    ? guidedRunnerForPlatform(activeExecutionPlan.platformId, activeExecutionPlatform?.homepageUrl ?? "")
    : null;
  const activeCertificationGates = activeExecutionValidation ? [
    { label: "Dry-run đạt", passed: Boolean(activeExecutionValidation.dryRunCheckedAt) },
    { label: "Text/NAP/EEAT đã lưu", passed: Boolean(activeExecutionValidation.textSavedAt) },
    { label: "Avatar/banner đã upload", passed: Boolean(activeExecutionValidation.mediaUploadedAt && activeExecutionValidation.status === "media_uploaded") },
    { label: "Evidence URL hợp lệ", passed: Boolean(activeExecutionAccount?.status === "verified" && /^https?:\/\//.test(activeExecutionAccount.evidenceUrl)) },
    { label: "Platform certified", passed: Boolean(activeExecutionValidation.certifiedAt) }
  ] : [];
  const activeCertificationReady = activeCertificationGates.slice(0, 4).every((gate) => gate.passed);

  async function loadLocalData() {
    try {
      const [storedMoneySite, storedSettings, storedPlatforms, storedRecipes, storedEntityProfile, storedAccounts, storedRuns, storedQueue, storedDryRunHistory, storedDryRunAudit, storedEvidence, storedValidation, storedIndexingQueueCount, storedProvisioningCampaigns, storedProvisioningJobs, storedProxies, storedBrowserSessions, storedBrowserStorage, storedGmailOAuth] = await Promise.all([
        invoke<MoneySiteForm>("get_money_site"),
        invoke<IntegrationSettingForm[]>("get_integration_settings"),
        invoke<PlatformLibraryRecord[]>("get_platforms"),
        invoke<SelectorRecipeRecord[]>("get_selector_recipes"),
        invoke<EntityProfileRecord>("get_entity_profile"),
        invoke<AccountRecord[]>("get_accounts"),
        invoke<WorkflowRunRecord[]>("get_workflow_runs"),
        invoke<AutomationQueueItem[]>("get_automation_queue"),
        invoke<DryRunHistoryRecord[]>("get_dry_run_history"),
        invoke<DryRunHistoryAudit>("get_dry_run_history_audit"),
        invoke<EvidenceRecord[]>("get_evidence_records"),
        invoke<PlatformValidationRecord[]>("get_platform_validation_records"),
        invoke<number>("get_indexing_queue_count"),
        invoke<ProvisioningCampaignRecord[]>("get_provisioning_campaigns"),
        invoke<ProvisioningJobRecord[]>("get_provisioning_jobs"),
        invoke<ProxyRecord[]>("get_proxy_records"),
        invoke<BrowserSessionRecord[]>("get_browser_sessions"),
        invoke<BrowserStorageOverview>("get_browser_storage_overview"),
        invoke<GmailOAuthStatus>("get_gmail_oauth_status")
      ]);

      setMoneySite(storedMoneySite);
      setSettings(storedSettings);
      setPlatforms(storedPlatforms);
      setSelectorRecipes(storedRecipes);
      setEntityProfile(storedEntityProfile);
      setAccounts(storedAccounts);
      setWorkflowRuns(storedRuns);
      setAutomationQueue(storedQueue);
      setDryRunHistory(storedDryRunHistory.map((record, index) => normalizeDryRunHistoryRecord(record, index)));
      setDryRunSourceAudit(storedDryRunAudit);
      setEvidenceRecords(storedEvidence);
      setPlatformValidation(storedValidation);
      setIndexingQueueCount(storedIndexingQueueCount);
      setProvisioningCampaigns(storedProvisioningCampaigns);
      setProvisioningJobs(storedProvisioningJobs);
      setProxyRecords(storedProxies);
      setBrowserSessions(storedBrowserSessions);
      setBrowserStorage(storedBrowserStorage);
      setGmailOAuth(storedGmailOAuth);
      setGmailOAuthDraft((current) => ({ ...current, clientId: storedGmailOAuth.clientId }));
      setStatusMessage("Loaded from local SQLite");
    } catch {
      setStatusMessage("Preview mode using seed data");
    }
  }

  async function startExtensionBridge(strict = false): Promise<string> {
    try {
      const message = await invoke<string>("start_extension_bridge_server");
      setStatusMessage(message);
      return message;
    } catch (error) {
      const message = `Extension bridge server không khởi động được: ${error instanceof Error ? error.message : String(error)}`;
      setStatusMessage(message);
      if (strict) throw new Error(message);
      return message;
    }
  }

  async function savePlatform(platform: PlatformLibraryRecord) {
    try {
      const saved = await invoke<PlatformLibraryRecord>("save_platform", { platform });
      setPlatforms((current) => current.map((item) => (item.id === saved.id ? saved : item)));
      setStatusMessage(`${saved.name} platform saved`);
    } catch {
      setStatusMessage("Preview mode: Platform changes are local only");
    }
  }

  function updatePlatform(id: string, patch: Partial<PlatformLibraryRecord>) {
    setPlatforms((current) => current.map((platform) => (platform.id === id ? { ...platform, ...patch } : platform)));
  }

  function updateSelectorRecipe(platformId: string, patch: Partial<SelectorRecipeRecord>) {
    setSelectorRecipes((current) => current.map((recipe) => (recipe.platformId === platformId ? { ...recipe, ...patch } : recipe)));
  }

  async function importSelectorRecipes() {
    try {
      const parsed = JSON.parse(recipeImportJson) as unknown;
      const candidates = Array.isArray(parsed) ? parsed : (parsed && typeof parsed === "object" && Array.isArray((parsed as { recipes?: unknown }).recipes) ? (parsed as { recipes: unknown[] }).recipes : []);
      const valid = candidates.filter((item): item is SelectorRecipeRecord => Boolean(item && typeof item === "object" && typeof (item as SelectorRecipeRecord).platformId === "string" && typeof (item as SelectorRecipeRecord).platformName === "string" && typeof (item as SelectorRecipeRecord).fieldSelectorsJson === "string"));
      if (!valid.length) throw new Error("JSON không chứa selector recipe hợp lệ.");
      for (const recipe of valid) await saveSelectorRecipe({ ...recipe, updatedAt: new Date().toISOString() });
      setRecipeImportMessage(`Đã import ${valid.length} recipe.`);
    } catch (error) { setRecipeImportMessage(error instanceof Error ? error.message : "Import JSON thất bại."); }
  }

  async function exportSelectorRecipes() {
    try {
      const payload = JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), recipes: selectorRecipes }, null, 2);
      const path = await invoke<string>("save_json_export", { filename: buildExportFilename("entitymanager-selector-recipes"), contents: payload });
      setStatusMessage(`Selector recipes exported to ${path}`);
    } catch (error) {
      setStatusMessage(`Could not export selector recipes: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  async function saveSelectorRecipe(recipe: SelectorRecipeRecord) {
    const nextRecipe = { ...recipe, updatedAt: new Date().toISOString() };

    try {
      const saved = await invoke<SelectorRecipeRecord>("save_selector_recipe", { recipe: nextRecipe });
      setSelectorRecipes((current) => current.map((item) => (item.platformId === saved.platformId ? saved : item)));
      setStatusMessage(`${saved.platformName} selector recipe saved`);
    } catch {
      setSelectorRecipes((current) => current.map((item) => (item.platformId === recipe.platformId ? nextRecipe : item)));
      setStatusMessage("Preview mode: Selector recipe changes are local only");
    }
  }

  async function savePlatformValidation(record: PlatformValidationRecord) {
    const nextRecord = { ...record, updatedAt: new Date().toISOString() };
    try {
      const saved = await invoke<PlatformValidationRecord>("save_platform_validation_record", { record: nextRecord });
      setPlatformValidation((current) => upsertByPlatformId(current, saved));
      setStatusMessage(`${saved.platformName} validation status saved`);
    } catch {
      setPlatformValidation((current) => upsertByPlatformId(current, nextRecord));
      setStatusMessage("Preview mode: Validation status is local only");
    }
  }

  async function refreshPlatformValidation(showStatus = true) {
    try {
      const [records, queueCount, campaigns, jobs] = await Promise.all([
        invoke<PlatformValidationRecord[]>("get_platform_validation_records"),
        invoke<number>("get_indexing_queue_count"),
        invoke<ProvisioningCampaignRecord[]>("get_provisioning_campaigns"),
        invoke<ProvisioningJobRecord[]>("get_provisioning_jobs")
      ]);
      setPlatformValidation(records);
      setIndexingQueueCount(queueCount);
      setProvisioningCampaigns(campaigns);
      setProvisioningJobs(jobs);
      if (showStatus) setStatusMessage("Platform validation checklist refreshed from SQLite");
    } catch {
      if (showStatus) setStatusMessage("Could not refresh platform validation checklist.");
    }
  }

  function updatePlatformValidation(platformId: string, patch: Partial<PlatformValidationRecord>) {
    const current = validationPack.find((record) => record.platformId === platformId);
    if (!current) return;
    const timestamp = new Date().toISOString();
    const nextRecord: PlatformValidationRecord = { ...current, ...patch, updatedAt: timestamp };
    if (patch.status === "dry_run_ok" && !nextRecord.dryRunCheckedAt) nextRecord.dryRunCheckedAt = timestamp;
    if (patch.status === "text_saved" && !nextRecord.textSavedAt) nextRecord.textSavedAt = timestamp;
    if (patch.status === "media_uploaded" && !nextRecord.mediaUploadedAt) nextRecord.mediaUploadedAt = timestamp;
    setPlatformValidation((records) => upsertByPlatformId(records, nextRecord));
  }

  async function exportDryRunDiagnostics() {
    try {
      const audit = await invoke<DryRunHistoryAudit>("get_dry_run_history_audit");
      setDryRunSourceAudit(audit);
      const records = await invoke<DryRunHistoryRecord[]>("get_all_dry_run_history");
      const uniqueIds = new Set(records.map((record) => record.id)).size;
      const createdAtValues = records.map((record) => record.createdAt).filter((value) => typeof value === "string");
      const oldestCreatedAt = createdAtValues.length ? [...createdAtValues].sort()[0] : null;
      const newestCreatedAt = createdAtValues.length ? [...createdAtValues].sort()[createdAtValues.length - 1] ?? null : null;
      if (records.length !== audit.totalRecords || uniqueIds !== audit.uniqueIds || oldestCreatedAt !== audit.oldestCreatedAt || newestCreatedAt !== audit.newestCreatedAt) {
        const message = "Không xuất báo cáo: lịch sử tải về không khớp hoàn toàn với kiểm kê SQLite. Hãy thử Refresh & reconcile rồi xuất lại.";
        setDiagnosticExportMessage(message);
        setStatusMessage(message);
        return;
      }
      const report = buildDryRunDiagnosticReport(records, new Date().toISOString(), audit);
      const path = await invoke<string>("save_json_export", {
        filename: buildExportFilename("entitymanager-dry-run-diagnostics"),
        contents: JSON.stringify(report, null, 2)
      });
      const message = report.sourceAudit.complete
        ? `Đã xuất báo cáo SQLite đầy đủ: ${report.sourceAudit.includedRecords} bản ghi. Tệp: ${path}`
        : `Đã xuất ${report.sourceAudit.includedRecords}/${report.sourceAudit.totalRecords} bản ghi; báo cáo chưa đầy đủ. Tệp: ${path}`;
      setDiagnosticExportMessage(message);
      setStatusMessage(message);
    } catch (error) {
      const message = `Không thể xuất báo cáo: ${error instanceof Error ? error.message : String(error)}`;
      setDiagnosticExportMessage(message);
      setStatusMessage(message);
    }
  }

  function validateImportedDryRunDiagnostics() {
    try {
      const report: unknown = JSON.parse(diagnosticImportJson);
      const result = validateDryRunDiagnosticReport(report);
      setDiagnosticValidation(result);
      setStatusMessage(result.valid
        ? `Diagnostic report verified: ${result.checkedRecords} records, totals consistent.`
        : `Diagnostic report needs review: ${result.errors.length} issue(s) found.`);
    } catch {
      const result = { valid: false, errors: ["The pasted content is not valid JSON."], checkedRecords: 0 };
      setDiagnosticValidation(result);
      setStatusMessage("Diagnostic report could not be parsed as JSON.");
    }
  }

  async function refreshDryRunHistory() {
    try {
      const [records, audit] = await Promise.all([
        invoke<DryRunHistoryRecord[]>("get_dry_run_history"),
        invoke<DryRunHistoryAudit>("get_dry_run_history_audit")
      ]);
      setDryRunHistory(records.map((record, index) => normalizeDryRunHistoryRecord(record, index)));
      setDryRunSourceAudit(audit);
      setDryRunHistoryAllLoaded(false);
      setStatusMessage(`Loaded ${records.length} recent records; SQLite contains ${audit.totalRecords}`);
    } catch {
      setStatusMessage("Could not refresh dry-run history or reconcile its SQLite count.");
    }
  }

  async function loadAllDryRunHistory() {
    try {
      const [records, audit] = await Promise.all([
        invoke<DryRunHistoryRecord[]>("get_all_dry_run_history"),
        invoke<DryRunHistoryAudit>("get_dry_run_history_audit")
      ]);
      const uniqueIds = new Set(records.map((record) => record.id)).size;
      const createdAtValues = records.map((record) => record.createdAt).filter((value) => typeof value === "string");
      const oldestCreatedAt = createdAtValues.length ? [...createdAtValues].sort()[0] : null;
      const newestCreatedAt = createdAtValues.length ? [...createdAtValues].sort()[createdAtValues.length - 1] ?? null : null;
      if (records.length !== audit.totalRecords || uniqueIds !== audit.uniqueIds || oldestCreatedAt !== audit.oldestCreatedAt || newestCreatedAt !== audit.newestCreatedAt) {
        setStatusMessage("Lịch sử tải về chưa khớp với SQLite; chưa thay danh sách đang xem.");
        return;
      }
      setDryRunHistory(records.map((record, index) => normalizeDryRunHistoryRecord(record, index)));
      setDryRunSourceAudit(audit);
      setDryRunHistoryAllLoaded(true);
      setStatusMessage(`Loaded and reconciled all ${records.length} SQLite dry-run records.`);
    } catch {
      setStatusMessage("Could not load all dry-run records from SQLite.");
    }
  }

  function draftRecipeSuggestions(platformId: string) {
    const recipe = selectorRecipes.find((item) => item.platformId === platformId);
    const assistantItem = platformTestAssistant.find((item) => item.platformId === platformId);
    if (!recipe || !assistantItem || (assistantItem.missingIssues.length === 0 && assistantItem.submitSuggestions.length === 0)) {
      setStatusMessage("No failed dry-run data available for this platform yet.");
      return;
    }

    let selectors: Record<string, unknown> = {};
    try {
      const parsed = JSON.parse(recipe.fieldSelectorsJson || "{}") as unknown;
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) selectors = parsed as Record<string, unknown>;
    } catch {
      setStatusMessage("Recipe field selector JSON is invalid. Fix the JSON before applying suggestions.");
      return;
    }

    const submitSelectors = recipe.submitSelectors.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    let fieldSuggestions = 0;

    for (const [field, suggestions] of Object.entries(assistantItem.selectorSuggestions)) {
      const current = Array.isArray(selectors[field]) ? (selectors[field] as unknown[]).filter((value): value is string => typeof value === "string") : [];
      const additions = suggestions.filter((candidate) => !current.includes(candidate));
      if (additions.length) {
        selectors[field] = [...current, ...additions];
        fieldSuggestions += additions.length;
      }
    }

    const nextSubmitSelectors = assistantItem.submitSuggestions.length
      ? [...new Set([...submitSelectors, ...assistantItem.submitSuggestions])]
      : submitSelectors;
    const drafted: SelectorRecipeRecord = {
      ...recipe,
      fieldSelectorsJson: JSON.stringify(selectors, null, 2),
      submitSelectors: nextSubmitSelectors.join("\n"),
      updatedAt: new Date().toISOString()
    };
    setSelectorRecipes((current) => current.map((item) => item.platformId === platformId ? drafted : item));
    setStatusMessage(`Drafted ${fieldSuggestions} field selector fallback(s)${assistantItem.submitSuggestions.length ? " and submit-button fallbacks" : ""} for ${recipe.platformName}. Review the editor, then click Save Recipe to persist.`);
  }

  async function saveEntityProfileForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const saved = await invoke<EntityProfileRecord>("save_entity_profile", { profile: entityProfile });
      setEntityProfile(saved);
      setStatusMessage("Entity Profile saved to SQLite");
    } catch {
      setStatusMessage("Preview mode: Entity Profile changes are local only");
    }
  }

  function updateEntityProfile(patch: Partial<EntityProfileRecord>) {
    setEntityProfile((current) => ({ ...current, ...patch }));
  }

  async function saveAccountFromPlan(plan: AccountCreationPlanItem): Promise<AccountRecord> {
    const existing = accounts.find((account) => account.platformId === plan.platformId);
    const timestamp = new Date().toISOString();
    const account: AccountRecord = {
      id: existing?.id ?? `account-${plan.platformId}`,
      platformId: plan.platformId,
      platformName: plan.platformName,
      recommendedUsername: plan.recommendedUsername,
      status: existing?.status ?? "planned",
      priority: plan.priority,
      automationMode: plan.automationMode,
      evidenceUrl: existing?.evidenceUrl ?? "",
      notes: existing?.notes ?? plan.profileAngle,
      createdAt: existing?.createdAt ?? timestamp,
      updatedAt: timestamp
    };

    await persistAccount(account, `${plan.platformName} account saved`, "save_account", "Account record created from generated plan");
    await enqueueAutomationGates(account, plan);
    return account;
  }

  async function startEntityCampaign() {
    if (!campaignPlans.length) {
      setStatusMessage("Chưa chọn platform nào cho campaign.");
      return;
    }

    for (const plan of campaignPlans) {
      await saveAccountFromPlan(plan);
    }

    setStatusMessage(`Entity campaign prepared for ${campaignPlans.length} platform(s). Open each platform, run dry-run, fill profile, upload media, then capture evidence URL.`);
  }

  async function saveProxy() {
    const port = Number(proxyDraft.port);
    if (!proxyDraft.name.trim() || !proxyDraft.host.trim() || !Number.isInteger(port)) {
      setStatusMessage("Proxy cần tên, host và port hợp lệ.");
      return;
    }
    const timestamp = new Date().toISOString();
    const proxy = await invoke<ProxyRecord>("save_proxy_record", { proxy: {
      id: `proxy-${Date.now()}`,
      name: proxyDraft.name.trim(), protocol: proxyDraft.protocol, host: proxyDraft.host.trim(), port,
      username: proxyDraft.username.trim(), password: proxyDraft.password, hasPassword: Boolean(proxyDraft.password),
      countryCode: proxyDraft.countryCode.trim().toUpperCase(), status: "untested", latencyMs: 0, exitIp: "", lastError: "", lastCheckedAt: "",
      isEnabled: true, createdAt: timestamp, updatedAt: timestamp
    } });
    setProxyRecords((current) => upsertById(current, proxy));
    setSelectedProxyId(proxy.id);
    setProxyDraft({ name: "", protocol: "http", host: "", port: "", username: "", password: "", countryCode: "" });
    setStatusMessage("Đã lưu proxy; hãy bấm Kiểm tra trước khi chạy campaign.");
  }

  async function testProxy(proxyId: string) {
    setStatusMessage("Đang kiểm tra IP và độ trễ proxy...");
    try {
      const tested = await invoke<ProxyRecord>("test_proxy_record", { proxyId });
      setProxyRecords((current) => upsertById(current, tested));
      setStatusMessage(tested.status === "healthy" ? `Proxy hoạt động: ${tested.exitIp} · ${tested.latencyMs}ms` : `Proxy lỗi: ${tested.lastError}`);
    } catch (error) {
      setStatusMessage(`Không kiểm tra được proxy: ${String(error)}`);
    }
  }

  async function launchBrowserForJob(job: ProvisioningJobRecord) {
    setBrowserWorker((current) => ({ status: "starting", protocolVersion: current?.protocolVersion || "1.0", processId: 0, startedAt: "", heartbeatAt: "", activeSessions: 0, message: "Đang khởi động Playwright Browser Worker..." }));
    const worker = await invoke<BrowserWorkerStatus>("start_browser_worker_runtime");
    setBrowserWorker(worker);
    const session = await invoke<BrowserSessionRecord>("launch_playwright_browser", { request: {
      sessionId: `browser-${job.id}`,
      campaignId: job.campaignId,
      jobId: job.id,
      accountId: job.accountId,
      platformId: job.platformId,
      url: job.signupUrl || job.profileUrl,
      proxyId: selectedProxyId,
      visible: browserVisible,
      identityId: identityIdFor(moneySite, entityProfile)
    } });
    setBrowserSessions((current) => upsertById(current, session));
    return session;
  }

  async function stopBrowser(sessionId: string) {
    const session = await invoke<BrowserSessionRecord>("stop_playwright_browser", { sessionId });
    setBrowserSessions((current) => upsertById(current, session));
    setBrowserPreviews((current) => { const next = { ...current }; delete next[sessionId]; return next; });
  }

  async function refreshBrowserPreview(sessionId: string) {
    try {
      const preview = await invoke<string>("get_browser_worker_preview", { sessionId });
      setBrowserPreviews((current) => ({ ...current, [sessionId]: preview }));
    } catch (error) {
      setStatusMessage(`Không lấy được preview worker: ${String(error)}`);
    }
  }

  async function setBrowserVisibility(sessionId: string, visible: boolean) {
    try {
      const session = await invoke<BrowserSessionRecord>("set_managed_browser_visibility", { sessionId, visible });
      setBrowserSessions((current) => upsertById(current, session));
    } catch (error) {
      setStatusMessage(`Không thể ${visible ? "hiện" : "ẩn"} browser: ${String(error)}`);
    }
  }

  async function launchBrowserControl(visible: boolean) {
    try {
      const running = browserSessions.find((session) => session.status === "running" && session.platformId === "control-center");
      if (running) {
        await setBrowserVisibility(running.id, visible);
        setStatusMessage(visible ? "Đã hiển thị Chromium được quản lý." : "Chromium vẫn chạy nhưng đã được ẩn khỏi Desktop.");
        return;
      }
      const session = await invoke<BrowserSessionRecord>("launch_managed_browser", { request: {
        sessionId: `browser-control-${Date.now()}`,
        campaignId: "control-center",
        jobId: "control-center",
        accountId: "control-center",
        platformId: "control-center",
        url: "https://accounts.google.com/",
        proxyId: "",
        visible,
        identityId: identityIdFor(moneySite, entityProfile)
      } });
      setBrowserSessions((current) => upsertById(current, session));
      setStatusMessage(visible ? "Đã mở Chromium được quản lý." : "Đã khởi chạy Chromium ở chế độ ẩn.");
    } catch (error) {
      setStatusMessage(`Không khởi chạy được Chromium: ${String(error)}`);
    }
  }

  async function setAllBrowserVisibility(visible: boolean) {
    const running = browserSessions.filter((session) => session.status === "running");
    if (!running.length) {
      setStatusMessage("Chưa có phiên Chromium nào đang chạy. Hãy bấm Mở Chromium quản lý.");
      return;
    }
    await Promise.all(running.map((session) => setBrowserVisibility(session.id, visible)));
    setStatusMessage(visible ? `Đã hiển thị ${running.length} phiên Chromium.` : `Đã ẩn ${running.length} phiên Chromium; worker vẫn tiếp tục chạy.`);
  }

  async function openGmailBootstrap(sessionId: string) {
    try {
      const session = await invoke<BrowserSessionRecord>("open_managed_browser_url", { sessionId, url: "https://accounts.google.com/" });
      setBrowserSessions((current) => upsertById(current, session));
      setStatusMessage("Đã mở Gmail trong đúng browser profile. Đăng nhập một lần; phiên sẽ được giữ cho account này.");
    } catch (error) {
      setStatusMessage(`Không mở được Gmail bootstrap: ${String(error)}`);
    }
  }

  async function refreshBrowserStorage() {
    setStorageBusy("refresh");
    try {
      setBrowserStorage(await invoke<BrowserStorageOverview>("get_browser_storage_overview"));
      setStatusMessage("Đã đo lại dung lượng Browser Identity.");
    } catch (error) { setStatusMessage(`Không đo được dung lượng: ${String(error)}`); }
    finally { setStorageBusy(""); }
  }

  async function saveStorageLimit(maxGb: number) {
    if (!browserStorage) return;
    setStorageBusy("policy");
    try {
      const policy = { ...browserStorage.policy, maxTotalBytes: Math.round(maxGb * 1024 ** 3) };
      setBrowserStorage(await invoke<BrowserStorageOverview>("save_browser_storage_policy", { policy }));
      setStatusMessage(`Đã lưu trần dung lượng ${maxGb} GB. Tool không chiếm sẵn dung lượng này.`);
    } catch (error) { setStatusMessage(`Không lưu được Storage Policy: ${String(error)}`); }
    finally { setStorageBusy(""); }
  }

  async function maintainBrowserIdentity(command: "cleanup_browser_identity" | "archive_browser_identity" | "restore_browser_identity", identityId: string) {
    setStorageBusy(`${command}:${identityId}`);
    try {
      const overview = await invoke<BrowserStorageOverview>(command, { identityId });
      setBrowserStorage(overview);
      setStatusMessage(overview.message);
    } catch (error) { setStatusMessage(`Không thể bảo trì Browser Identity: ${String(error)}`); }
    finally { setStorageBusy(""); }
  }

  async function startFullProvisioningCampaign() {
    if (!campaignPlans.length || campaignLaunching) {
      if (!campaignPlans.length) setStatusMessage("Hãy chọn ít nhất một platform trước khi chạy chiến dịch.");
      return;
    }
    setCampaignLaunching(true);
    try {
      await startExtensionBridge(true);
      const timestamp = new Date().toISOString();
      const campaignId = `provisioning-${Date.now()}`;
      const campaign: ProvisioningCampaignRecord = {
        id: campaignId,
        name: `${entityProfile.brandName || moneySite.domain || "Entity"} · ${new Date().toLocaleString("vi-VN")}`,
        status: "running",
        totalJobs: campaignPlans.length,
        currentPosition: 0,
        createdAt: timestamp,
        updatedAt: timestamp
      };
      const savedCampaign = await invoke<ProvisioningCampaignRecord>("save_provisioning_campaign", { campaign });
      const jobs: ProvisioningJobRecord[] = [];
      for (const [position, plan] of campaignPlans.entries()) {
        const account = await saveAccountFromPlan(plan);
        await saveQueueItem(buildQueueItem(
          account,
          "submit_verify",
          "waiting",
          JSON.stringify({
            action: "full_account_provisioning",
            platformId: plan.platformId,
            requiresCaptchaToken: false,
            executionSteps: ["signup", "email_verification", "fill_text", "upload_media", "submit_verify", "evidence", "indexing"],
            evidenceCapture: "current_url",
            message: `Managed Browser payload prepared for ${plan.platformName}.`
          })
        ));
        const platform = platforms.find((item) => item.id === plan.platformId);
        const guide = guidedRunnerForPlatform(plan.platformId, platform?.homepageUrl ?? "");
        const job: ProvisioningJobRecord = {
          id: `${campaignId}-${plan.platformId}`,
          campaignId,
          accountId: account.id,
          platformId: plan.platformId,
          platformName: plan.platformName,
          position,
          stage: "signup",
          status: position === 0 ? "running" : "queued",
          signupUrl: signupUrlForPlatform(plan.platformId, platform?.homepageUrl ?? ""),
          profileUrl: guide.primaryUrl,
          evidenceUrl: "",
          lastMessage: position === 0 ? "Đang mở trang đăng ký. Extension sẽ tiếp tục sau các cổng xác minh." : "Đang chờ platform trước hoàn tất.",
          attemptCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        };
        jobs.push(await invoke<ProvisioningJobRecord>("save_provisioning_job", { job }));
      }
      setProvisioningCampaigns((current) => [savedCampaign, ...current]);
      setProvisioningJobs((current) => [...jobs, ...current.filter((item) => item.campaignId !== campaignId)]);
      const first = jobs[0];
      const launchedSession = await launchBrowserForJob(first);
      setStatusMessage(`Đã bắt đầu chiến dịch ${campaignPlans.length} platform bằng Managed Browser. ${first.platformName} đang chạy với browser profile riêng${selectedProxyId ? " và proxy cố định" : " bằng kết nối trực tiếp"}.`);
      if (browserVisible && launchedSession.visibility !== "visible") {
        throw new Error("Managed Chromium đã chạy nhưng cửa sổ chưa ở chế độ hiển thị.");
      }
    } catch (error) {
      setStatusMessage(`Không thể khởi tạo chiến dịch: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setCampaignLaunching(false);
    }
  }

  function toggleCampaignPlatform(platformId: string) {
    setCampaignPlatformIds((current) => (
      current.includes(platformId)
        ? current.filter((id) => id !== platformId)
        : [...current, platformId]
    ));
  }

  function selectExecutionPlatform(platformId: string) {
    setExecutionPlatformId(platformId);
    const account = accounts.find((item) => item.platformId === platformId);
    const validation = platformValidation.find((item) => item.platformId === platformId);
    setExecutionEvidenceUrl(account?.evidenceUrl || validation?.lastTestedUrl || "");
  }

  function toggleBuilderPanel(panel: BuilderPanelId) {
    setBuilderPanels((current) => ({ ...current, [panel]: !current[panel] }));
  }

  async function openExternalPlatformUrl(url: string, label: string) {
    if (openingPlatformUrl) return;
    setOpeningPlatformUrl(true);
    setExternalOpenMessage(`Đang mở ${label} trong trình duyệt...`);
    try {
      await invoke<string>("open_external_url", { url });
      setExternalOpenMessage(`Đã gửi lệnh mở ${label}. Hãy kiểm tra trình duyệt Chrome/Edge trên thanh taskbar.`);
      setStatusMessage(`${label}: trang thao tác đã được mở trong trình duyệt mặc định.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      setExternalOpenMessage(`Không mở được trang: ${message}`);
      setStatusMessage(`Không mở được ${label}: ${message}`);
    } finally {
      setOpeningPlatformUrl(false);
    }
  }

  async function startOneClickOrchestrator() {
    if (!activeExecutionPlan || !activePlatformGuide?.primaryUrl || orchestratorStarting) return;
    setOrchestratorStarting(true);
    try {
      await startExtensionBridge(true);
      const account = await saveAccountFromPlan(activeExecutionPlan);
      const queueItem = buildQueueItem(
        account,
        "submit_verify",
        "waiting",
        JSON.stringify({
          action: "one_click_profile_orchestration",
          platformId: activeExecutionPlan.platformId,
          requiresCaptchaToken: false,
          executionSteps: ["dry_run", "fill_text", "upload_media", "submit_verify"],
          evidenceCapture: "current_url",
          message: `One-click run prepared for ${activeExecutionPlan.platformName}.`
        })
      );
      await saveQueueItem(queueItem);
      const timestamp = new Date().toISOString();
      let job = provisioningJobs.find((item) => item.platformId === activeExecutionPlan.platformId && ["running", "waiting_user"].includes(item.status));
      if (!job) {
        const campaignId = `provisioning-${Date.now()}`;
        const campaign = await invoke<ProvisioningCampaignRecord>("save_provisioning_campaign", { campaign: {
          id: campaignId,
          name: `${entityProfile.brandName || moneySite.domain || "Entity"} · ${activeExecutionPlan.platformName}`,
          status: "running",
          totalJobs: 1,
          currentPosition: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        } });
        job = await invoke<ProvisioningJobRecord>("save_provisioning_job", { job: {
          id: `${campaignId}-${activeExecutionPlan.platformId}`,
          campaignId,
          accountId: account.id,
          platformId: activeExecutionPlan.platformId,
          platformName: activeExecutionPlan.platformName,
          position: 0,
          stage: "signup",
          status: "running",
          signupUrl: signupUrlForPlatform(activeExecutionPlan.platformId, activePlatformGuide.primaryUrl),
          profileUrl: activePlatformGuide.primaryUrl,
          evidenceUrl: "",
          lastMessage: "Đang khởi chạy Managed Browser và đánh thức Bridge.",
          attemptCount: 0,
          createdAt: timestamp,
          updatedAt: timestamp
        } });
        setProvisioningCampaigns((current) => [campaign, ...current]);
        setProvisioningJobs((current) => [job!, ...current]);
      }
      const session = await launchBrowserForJob(job);
      setStatusMessage(`${activeExecutionPlan.platformName}: Managed Chromium ${session.visibility === "visible" ? "đã hiển thị" : "đang chạy ẩn"}; Bridge sẽ tự nhận trang và tiếp tục, không cần bấm extension.`);
    } catch (error) {
      setStatusMessage(`Không thể khởi tạo phiên tự động: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      setOrchestratorStarting(false);
    }
  }

  async function prepareExtensionPayload(plan: AccountCreationPlanItem) {
    const previewEndpoint = `http://127.0.0.1:17321/account/submit-verify/preview?platformId=${encodeURIComponent(plan.platformId)}`;

    try {
      await navigator.clipboard.writeText(previewEndpoint);
      setStatusMessage(`${plan.platformName}: endpoint payload đã copy. Mở website, bật extension, rồi chạy dry-run/fill/media theo từng bước.`);
    } catch {
      setStatusMessage(`${plan.platformName}: endpoint payload sẵn sàng tại ${previewEndpoint}`);
    }
  }

  async function markExecutionComplete() {
    if (!activeExecutionPlan) {
      setStatusMessage("Chưa chọn platform nào trong campaign workspace.");
      return;
    }

    if (!activeExecutionAccount) {
      await saveAccountFromPlan(activeExecutionPlan);
      setStatusMessage(`${activeExecutionPlan.platformName}: đã tạo account record. Hãy kiểm tra lại evidence URL rồi bấm hoàn tất lần nữa.`);
      return;
    }

    const evidenceUrl = activeEvidenceUrl.trim();
    await updateAccount(activeExecutionAccount.id, { status: "verified", evidenceUrl });

    if (activeSubmitVerifyQueue) {
      await completeSubmitVerify(activeSubmitVerifyQueue, true, evidenceUrl);
    }

    if (evidenceUrl) {
      const record: EvidenceRecord = {
        id: `evidence-${activeExecutionPlan.platformId}-${Date.now()}`,
        title: `${activeExecutionPlan.platformName} entity profile`,
        evidenceType: "profile",
        url: evidenceUrl,
        relatedPlatformId: activeExecutionPlan.platformId,
        notes: `Campaign evidence for ${entityProfile.brandName}: ${activeExecutionPlan.profileAngle}`,
        status: "verified",
        createdAt: new Date().toISOString()
      };

      try {
        const saved = await invoke<EvidenceRecord>("save_evidence_record", { record });
        setEvidenceRecords((current) => [saved, ...current.filter((item) => item.id !== saved.id)]);
      } catch {
        setEvidenceRecords((current) => [record, ...current.filter((item) => item.id !== record.id)]);
      }
    }

    setStatusMessage(`${activeExecutionPlan.platformName}: đã đánh dấu hoàn tất và lưu evidence cho entity campaign.`);
  }

  async function certifyActivePlatform() {
    if (!activeExecutionPlan) return;
    try {
      const certified = await invoke<PlatformValidationRecord>("certify_platform", { platformId: activeExecutionPlan.platformId });
      setPlatformValidation((current) => upsertByPlatformId(current, certified));
      setExecutionEvidenceUrl(certified.lastTestedUrl);
      setStatusMessage(`${certified.platformName}: CERTIFIED — đã vượt đủ dry-run, text/NAP/EEAT, media, verified account và evidence.`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : String(error));
    }
  }

  async function updateAccount(id: string, patch: Partial<AccountRecord>) {
    const current = accounts.find((account) => account.id === id);

    if (!current) {
      return;
    }

    const nextAccount = { ...current, ...patch, updatedAt: new Date().toISOString() };
    await persistAccount(nextAccount, `${current.platformName} status saved`, "update_status", `Account updated to ${nextAccount.status}`);

    if (patch.status === "needs_manual_review") {
      await saveQueueItem(buildQueueItem(nextAccount, "manual_review", "waiting", "Manual review requested from account status."));
    }

    if (patch.status === "verified") {
      await saveWorkflowRun(nextAccount, "verify_account", "completed", "Account marked as verified.");
    }
  }

  async function persistAccount(account: AccountRecord, successMessage: string, action: string, message: string) {
    try {
      const saved = await invoke<AccountRecord>("save_account", { account });
      setAccounts((current) => {
        const exists = current.some((item) => item.id === saved.id);

        if (!exists) {
          return [...current, saved];
        }

        return current.map((item) => (item.id === saved.id ? saved : item));
      });
      setStatusMessage(successMessage);
      await saveWorkflowRun(saved, action, account.status === "failed" ? "failed" : "completed", message);
    } catch {
      setAccounts((current) => {
        const exists = current.some((item) => item.id === account.id);

        if (!exists) {
          return [...current, account];
        }

        return current.map((item) => (item.id === account.id ? account : item));
      });
      setStatusMessage("Preview mode: Account changes are local only");
      await saveWorkflowRun(account, action, "completed", message);
    }
  }

  async function saveWorkflowRun(account: AccountRecord, action: string, status: WorkflowRunStatus, message: string) {
    const timestamp = new Date().toISOString();
    const run: WorkflowRunRecord = {
      id: `run-${account.id}-${Date.now()}`,
      accountId: account.id,
      platformName: account.platformName,
      action,
      status,
      message,
      createdAt: timestamp
    };

    try {
      const saved = await invoke<WorkflowRunRecord>("save_workflow_run", { run });
      setWorkflowRuns((current) => [saved, ...current].slice(0, 100));
    } catch {
      setWorkflowRuns((current) => [run, ...current].slice(0, 100));
    }
  }

  async function enqueueAutomationGates(account: AccountRecord, plan: AccountCreationPlanItem) {
    const gates: AutomationGateType[] = [];

    if (plan.workflowSteps.some((step) => step.toLowerCase().includes("captcha"))) {
      gates.push("captcha");
    }

    gates.push("email");

    if (plan.automationMode === "manual_review") {
      gates.push("manual_review");
    }

    gates.push("submit_verify");
    gates.push("evidence");

    for (const gate of gates) {
      const queueStatus: AutomationQueueStatus = gate === "evidence" || gate === "submit_verify" ? "waiting" : "queued";
      await saveQueueItem(buildQueueItem(account, gate, queueStatus, `${gate.replace("_", " ")} gate prepared for ${account.platformName}.`));
    }
  }

  function buildQueueItem(account: AccountRecord, gateType: AutomationGateType, status: AutomationQueueStatus, payload: string): AutomationQueueItem {
    const timestamp = new Date().toISOString();
    const queuePayload = gateType === "captcha"
      ? JSON.stringify({
          captchaType: "recaptcha_v2",
          websiteUrl: "",
          websiteKey: "",
          note: payload
        })
      : payload;

    return {
      id: `queue-${account.id}-${gateType}`,
      accountId: account.id,
      platformName: account.platformName,
      gateType,
      status,
      payload: queuePayload,
      createdAt: timestamp,
      updatedAt: timestamp
    };
  }

  async function saveQueueItem(item: AutomationQueueItem) {
    try {
      const saved = await invoke<AutomationQueueItem>("save_automation_queue_item", { item });
      setAutomationQueue((current) => upsertById(current, saved));
    } catch {
      setAutomationQueue((current) => upsertById(current, item));
    }
  }

  async function updateQueueItem(id: string, patch: Partial<AutomationQueueItem>) {
    const current = automationQueue.find((item) => item.id === id);

    if (!current) {
      return;
    }

    await saveQueueItem({ ...current, ...patch, updatedAt: new Date().toISOString() });
  }

  async function executeCaptchaQueueItem(item: AutomationQueueItem) {
    try {
      const saved = await invoke<AutomationQueueItem>("execute_captcha_queue_item", { item });
      setAutomationQueue((current) => upsertById(current, saved));
      setStatusMessage(`CAPTCHA queue sent for ${saved.platformName}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CAPTCHA provider execution failed");
    }
  }

  async function pollCaptchaQueueItem(item: AutomationQueueItem) {
    try {
      const saved = await invoke<AutomationQueueItem>("poll_captcha_queue_item", { item });
      setAutomationQueue((current) => upsertById(current, saved));
      setStatusMessage(saved.status === "resolved" ? `CAPTCHA token captured for ${saved.platformName}` : `CAPTCHA result checked for ${saved.platformName}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CAPTCHA result polling failed");
    }
  }

  async function prepareCaptchaInjection(item: AutomationQueueItem) {
    try {
      const payload = await invoke<CaptchaInjectionPayload>("get_captcha_injection_payload", {
        request: {
          queueId: item.id,
          accountId: item.accountId,
          injector: "desktop_preview"
        }
      });
      setCaptchaBridgePayload(payload);
      setStatusMessage(`CAPTCHA injection payload ready for ${payload.platformName}`);
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CAPTCHA injection payload is not ready");
    }
  }

  async function completeCaptchaInjection(success: boolean) {
    if (!captchaBridgePayload) {
      return;
    }

    try {
      const result = await invoke<CaptchaInjectionResult>("complete_captcha_injection", {
        request: {
          queueId: captchaBridgePayload.queueId,
          accountId: captchaBridgePayload.accountId,
          injector: "desktop_preview",
          success,
          evidenceUrl: "",
          message: success
            ? "Desktop bridge preview marked CAPTCHA token as injected. Ready for submit/verify."
            : "Desktop bridge preview marked CAPTCHA injection as failed."
        }
      });
      setAutomationQueue((current) => upsertById(current, result.queueItem));
      if (result.submitVerifyQueueItem) {
        setAutomationQueue((current) => upsertById(current, result.submitVerifyQueueItem!));
      }
      setAccounts((current) => upsertById(current, result.account));
      setWorkflowRuns((current) => [result.workflowRun, ...current].slice(0, 100));
      setCaptchaBridgePayload(null);
      setStatusMessage(success ? "CAPTCHA bridge completed. Workflow is ready for submit/verify." : "CAPTCHA bridge failed and needs review.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "CAPTCHA injection completion failed");
    }
  }

  async function completeSubmitVerify(item: AutomationQueueItem, success: boolean, evidenceUrl = "") {
    try {
      const result = await invoke<AccountSubmitVerifyResult>("complete_account_submit_verify", {
        request: {
          queueId: item.id,
          accountId: item.accountId,
          success,
          evidenceUrl,
          message: success
            ? "Submit/verify step completed from Desktop workflow control."
            : "Submit/verify step failed from Desktop workflow control."
        }
      });
      setAutomationQueue((current) => upsertById(current, result.queueItem));
      setAccounts((current) => upsertById(current, result.account));
      setWorkflowRuns((current) => [result.workflowRun, ...current].slice(0, 100));
      setStatusMessage(success ? "Account submit/verify completed." : "Account submit/verify failed and needs review.");
    } catch (error) {
      setStatusMessage(error instanceof Error ? error.message : "Submit/verify completion failed");
    }
  }

  async function saveMoneySiteForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      const saved = await invoke<MoneySiteForm>("save_money_site", { moneySite });
      setMoneySite(saved);
      setStatusMessage("Money Site saved to SQLite");
    } catch {
      setStatusMessage("Preview mode: Money Site changes are local only");
    }
  }

  async function saveSetting(setting: IntegrationSettingForm) {
    try {
      const saved = await invoke<IntegrationSettingForm>("save_integration_setting", { setting });
      setSettings((current) => current.map((item) => (item.settingType === saved.settingType ? saved : item)));
      setStatusMessage(`${saved.provider} setting saved`);
    } catch {
      setStatusMessage("Preview mode: Settings changes are local only");
    }
  }

  function updateSetting(settingType: string, patch: Partial<IntegrationSettingForm>) {
    setSettings((current) => current.map((setting) => (setting.settingType === settingType ? { ...setting, ...patch } : setting)));
  }

  async function testSetting(setting: IntegrationSettingForm) {
    const timestamp = new Date().toISOString();
    const payload = { ...setting, lastTestAt: timestamp };

    try {
      const result = await invoke<IntegrationAdapterResult>("test_integration_setting", { setting: payload });
      setAdapterResults((current) => ({ ...current, [setting.settingType]: result }));
      updateSetting(setting.settingType, { lastTestAt: timestamp });
      setStatusMessage(`${setting.provider} adapter dry-run complete`);
    } catch {
      const config = buildProviderConfig({
        type: setting.settingType,
        provider: setting.provider,
        isEnabled: setting.isEnabled,
        keyStatus: setting.keyStatus,
        maskedValue: setting.apiKey
      });
      const result = testIntegrationAdapter(config);
      setAdapterResults((current) => ({ ...current, [setting.settingType]: result }));
      setStatusMessage("Preview mode: Adapter dry-run is local only");
    }
  }

  async function testLiveSetting(setting: IntegrationSettingForm) {
    const timestamp = new Date().toISOString();
    const payload = { ...setting, lastTestAt: timestamp };

    try {
      const result = await invoke<IntegrationAdapterResult>("test_live_integration_setting", { setting: payload });
      setAdapterResults((current) => ({ ...current, [setting.settingType]: result }));
      updateSetting(setting.settingType, { lastTestAt: timestamp });
      setStatusMessage(`${setting.provider} live adapter test complete`);
    } catch {
      setStatusMessage("Live adapter tests are available only inside the packaged desktop app");
    }
  }

  async function saveGmailOAuthConfig() {
    try {
      setGmailActionMessage("Đang lưu Client ID và Client Secret vào Windows Credential Manager...");
      const saved = await invoke<GmailOAuthStatus>("save_gmail_oauth_config", { config: gmailOAuthDraft });
      setGmailOAuth(saved);
      setGmailOAuthDraft((current) => ({ ...current, clientSecret: "" }));
      setStatusMessage("Đã lưu cấu hình Gmail OAuth an toàn.");
      setGmailActionMessage("Đã lưu cấu hình. Bây giờ nhấn “2. Kết nối Gmail”.");
    } catch (error) {
      setStatusMessage(`Không lưu được Gmail OAuth: ${String(error)}`);
      setGmailActionMessage(`Lỗi lưu OAuth: ${String(error)}`);
    }
  }

  async function importGmailOAuthJson(file: File | undefined) {
    if (!file) return;
    try {
      const parsed = JSON.parse(await file.text()) as {
        installed?: { client_id?: string; client_secret?: string };
        web?: { client_id?: string; client_secret?: string };
      };
      const source = parsed.installed ?? parsed.web;
      const clientId = source?.client_id?.trim() ?? "";
      const clientSecret = source?.client_secret?.trim() ?? "";
      if (!clientId || !clientSecret) {
        throw new Error("File JSON không chứa client_id và client_secret.");
      }
      setGmailOAuthDraft({ clientId, clientSecret });
      setGmailActionMessage("Đã đọc file OAuth JSON. Đang lưu Client Secret an toàn vào Windows Credential Manager...");
      const saved = await invoke<GmailOAuthStatus>("save_gmail_oauth_config", { config: { clientId, clientSecret } });
      if (!saved.configured) throw new Error("Windows chưa xác nhận lưu Client Secret. Hãy thử nhập lại file JSON.");
      setGmailOAuth(saved);
      setGmailOAuthDraft({ clientId, clientSecret: "" });
      setStatusMessage("Đã nhập và lưu file Gmail OAuth.");
      setGmailActionMessage("Đã lưu đủ Client ID và Client Secret. Bây giờ bấm “2. Kết nối Gmail”.");
    } catch (error) {
      setGmailActionMessage(`Không nhập được file OAuth JSON: ${String(error)}`);
      setStatusMessage("File OAuth JSON không hợp lệ hoặc không lưu được Credential Manager.");
    }
  }

  async function connectGmailOAuth() {
    if (!gmailOAuth.configured) {
      setGmailActionMessage("Chưa có Client Secret. Hãy bấm Choose File và chọn lại file OAuth JSON trước khi kết nối.");
      setStatusMessage("Gmail OAuth chưa đủ Client ID/Client Secret.");
      return;
    }
    try {
      setGmailActionRunning("oauth");
      setGmailActionMessage("Đang tạo phiên OAuth và mở Chrome/Edge mặc định của Windows...");
      const current = await invoke<GmailOAuthStatus>("start_gmail_oauth");
      setGmailOAuth(current);
      setStatusMessage("Trang Google OAuth đã mở trong trình duyệt Windows thông thường. Hãy chấp thuận quyền một lần rồi quay lại EntityManager.");
      setGmailActionMessage(current.authorizationUrl ? "Đang chờ Google xác nhận trong Chrome/Edge mặc định. Không đăng nhập bằng Chrome for Testing." : current.lastMessage);
    } catch (error) {
      setStatusMessage(`Không bắt đầu được Gmail OAuth: ${String(error)}`);
      setGmailActionMessage(`Không bắt đầu được OAuth: ${String(error)}`);
    } finally {
      setGmailActionRunning("");
    }
  }

  async function testGmailConnection() {
    if (!gmailOAuth.connected) {
      setGmailActionMessage("Gmail chưa Connected. Hãy hoàn tất cấp quyền trên cửa sổ Google trước khi kiểm tra Gmail API.");
      setStatusMessage("Chưa thể kiểm tra Gmail API vì OAuth chưa hoàn tất.");
      return;
    }
    try {
      setGmailActionRunning("test");
      setGmailActionMessage("Đang gọi Gmail API để xác minh token và quyền đọc...");
      const message = await invoke<string>("test_gmail_connection");
      setGmailActionMessage(message);
      setStatusMessage(message);
    } catch (error) {
      setGmailActionMessage(`Kiểm tra Gmail API thất bại: ${String(error)}`);
      setStatusMessage(`Gmail API chưa hoạt động: ${String(error)}`);
    } finally {
      setGmailActionRunning("");
    }
  }

  async function refreshGmailOAuthStatus() {
    try {
      const latest = await invoke<GmailOAuthStatus>("get_gmail_oauth_status");
      setGmailOAuth(latest);
      setGmailActionMessage(latest.lastMessage);
      setStatusMessage("Đã làm mới trạng thái Gmail OAuth.");
    } catch (error) {
      setStatusMessage(`Không đọc được trạng thái Gmail OAuth: ${String(error)}`);
    }
  }

  async function openGmailAuthorizationPage() {
    if (!gmailOAuth.authorizationUrl) {
      setGmailActionMessage("Chưa có URL OAuth. Hãy nhấn “2. Kết nối Gmail” để tạo phiên mới.");
      return;
    }
    try {
      await invoke<string>("open_external_url", { url: gmailOAuth.authorizationUrl });
      setGmailActionMessage("Đã yêu cầu Windows mở trang Google trong Chrome/Edge mặc định. Nếu cửa sổ nằm phía sau, kiểm tra thanh tác vụ.");
    } catch (error) {
      setGmailActionMessage(`Windows không mở được URL: ${String(error)}. Có thể copy URL dự phòng bên dưới.`);
    }
  }

  async function runSystemDiagnostics() {
    setDiagnosticsRunning(true);
    try {
      const checks = await invoke<SystemDiagnosticCheck[]>("run_system_diagnostics");
      setSystemDiagnostics(checks);
      const errors = checks.filter((check) => check.status === "error").length;
      setStatusMessage(errors ? `Diagnostics tìm thấy ${errors} lỗi cần xử lý.` : "Diagnostics hoàn tất; không thấy lỗi nền tảng bắt buộc.");
    } catch (error) {
      setStatusMessage(`Không chạy được System Diagnostics: ${String(error)}`);
    } finally {
      setDiagnosticsRunning(false);
    }
  }

  async function checkMediumVerificationNow() {
    if (!gmailOAuth.connected) {
      setGmailActionMessage("Chưa thể kiểm tra Medium: Gmail OAuth chưa Connected. Hãy hoàn tất trang Google trước.");
      setStatusMessage("Medium worker đang chờ Gmail OAuth hoàn tất.");
      return;
    }
    try {
      setGmailActionRunning("medium");
      const latestJobs = await invoke<ProvisioningJobRecord[]>("get_provisioning_jobs");
      setProvisioningJobs(latestJobs);
      const waitingMedium = latestJobs.some((job) => job.platformId === "medium" && job.stage === "email_verification" && ["waiting_user", "running"].includes(job.status));
      if (!waitingMedium) {
        setGmailActionMessage("Gmail đã sẵn sàng, nhưng chưa có Medium job ở bước email_verification. Hãy chạy campaign Medium trước; worker sẽ tự kiểm tra khi checkpoint được tạo.");
        setStatusMessage("Không có Medium checkpoint đang chờ email; không có việc nào để worker xử lý.");
        return;
      }
      const message = await invoke<string>("poll_medium_verification_now");
      setStatusMessage(message);
      setGmailActionMessage(message);
      setGmailOAuth(await invoke<GmailOAuthStatus>("get_gmail_oauth_status"));
      setProvisioningJobs(await invoke<ProvisioningJobRecord[]>("get_provisioning_jobs"));
      setBrowserSessions(await invoke<BrowserSessionRecord[]>("get_browser_sessions"));
    } catch (error) {
      setStatusMessage(`Kiểm tra email chưa hoàn tất: ${String(error)}`);
      setGmailActionMessage(`Medium worker chưa hoàn tất: ${String(error)}`);
    } finally {
      setGmailActionRunning("");
    }
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">EM</div>
          <div>
            <strong>EntityManager</strong>
            <span>Desktop Growth Platform</span>
          </div>
        </div>

        <nav className="nav-list" aria-label="Điều hướng chính">
          {primaryNavigation.map(({ module, label }) => {
            const Icon = icons[module];
            return (
              <button
                className={module === activeModule ? "nav-item active" : "nav-item"}
                key={module}
                onClick={() => setActiveModule(module)}
              >
                <Icon size={18} />
                <span>{label}</span>
              </button>
            );
          })}
          <details className="advanced-nav">
            <summary><ChevronDown size={16} /><span>Developer / Advanced</span></summary>
            <div className="advanced-nav-list">
              {advancedNavigation.map(({ module, label }) => {
                const Icon = icons[module];
                return (
                  <button className={module === activeModule ? "nav-item active" : "nav-item"} key={module} onClick={() => setActiveModule(module)}>
                    <Icon size={16} />
                    <span>{label}</span>
                  </button>
                );
              })}
            </div>
          </details>
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">ENTITY AUTOMATION WORKSPACE</p>
            <h1>{moduleLabels[activeModule]}</h1>
          </div>
          <button className="primary-action" onClick={() => setActiveModule("Entity Builder")}>
            <Play size={18} />
            Tạo Entity
          </button>
        </header>

        <div className="status-banner">{statusMessage}</div>

        {activeModule === "Overview" && (
          <>
            <section className="metrics-grid">
              {metrics.map((metric) => (
                <article className={`metric-card ${metric.tone}`} key={metric.label}>
                  <span>{metric.label}</span>
                  <strong>{metric.label === "Entity Readiness" ? `${readiness}%` : metric.label === "Live Profiles" ? accounts.filter((account) => account.status === "created" || account.status === "verified").length : metric.label === "Care Plans" ? workflowRuns.length : metric.label === "Waiting Manual" ? automationQueue.filter((item) => item.status === "waiting").length : metric.value}</strong>
                </article>
              ))}
            </section>

            <section className="download-center-grid" aria-label="Tải bản mới nhất">
                <article className="panel extension-download-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">TÙY CHỌN DỰ PHÒNG · CHROME CÁ NHÂN</p>
                      <h2>EntityManager Bridge thủ công</h2>
                    </div>
                    <Puzzle size={22} />
                  </div>
                  <p className="panel-description">
                    {latestRelease ? latestRelease.name : "Phiên bản mới nhất trên GitHub Releases"}
                  </p>
                  <p className="panel-hint">
                    {latestRelease ? `Tag: ${latestRelease.tag_name} · Build: ${releaseBuildNumber(latestRelease)} · Cập nhật: ${new Date(latestRelease.published_at).toLocaleDateString()}` : "Phiên bản và tệp tải sẽ lấy từ build mới nhất."}
                  </p>
                  <button
                    className="primary-action extension-download-action"
                    type="button"
                    onClick={() => {
                      if (!latestRelease) {
                        setStatusMessage("Chưa lấy được thông tin release mới nhất từ GitHub.");
                        return;
                      }
                      void invoke("open_release_asset_download", { releaseTag: latestRelease.tag_name, assetName: "EntityManager-Chrome-Extension.zip" }).catch((error) => setStatusMessage(`Không mở được link tải Extension: ${String(error)}`));
                    }}
                  >
                    <Download size={18} />
                    Tải Extension (.zip)
                  </button>
                  <p className="panel-hint">
                    Không cần tải để dùng Managed Chromium. Chỉ cài ZIP này nếu anh muốn dùng Bridge trong Chrome cá nhân thay cho browser tự động của tool.
                  </p>
                </article>
  
                <article className="panel extension-download-panel">
                  <div className="panel-header">
                    <div>
                      <p className="eyebrow">BẢN MỚI NHẤT · WINDOWS</p>
                      <h2>EntityManager Desktop</h2>
                    </div>
                    <Download size={22} />
                  </div>
                  <p className="panel-description">
                    {latestRelease ? latestRelease.name : "Phiên bản mới nhất trên GitHub Releases"}
                  </p>
                  <p className="panel-hint">
                    {latestRelease ? `Tag: ${latestRelease.tag_name} · Tệp: ${latestRelease.assets.find((item) => item.name.endsWith("-setup.exe"))?.name ?? "đang kiểm tra"}` : "Tải bộ cài Windows từ bản phát hành mới nhất."}
                  </p>
                  <button
                    className="primary-action extension-download-action"
                    type="button"
                    onClick={() => {
                      const asset = latestRelease?.assets.find((item) => item.name.endsWith("-setup.exe"));
                      if (!latestRelease || !asset) {
                        setStatusMessage("Chưa lấy được link tải bộ cài Windows mới nhất từ GitHub.");
                        return;
                      }
                      void invoke("open_release_asset_download", { releaseTag: latestRelease.tag_name, assetName: asset.name }).catch((error) => setStatusMessage(`Không mở được link tải bộ cài Windows: ${String(error)}`));
                    }}
                  >
                    <Download size={18} />
                    Tải bộ cài Windows (.exe)
                  </button>
                  <p className="panel-hint">
                    Overview chọn build có số lớn nhất, tránh lệch khi GitHub publish nhiều release gần nhau.{" "}
                    <a href={latestRelease?.html_url ?? "https://github.com/seokillseo-byte/entitymanager/releases/latest"} target="_blank" rel="noreferrer">Xem ghi chú phát hành</a>
                  </p>
                </article>
  
              </section>

            <section className="main-grid overview-grid">
              <article className="panel overview-project-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">{demoProjectSeed.projectName}</p>
                    <h2>{moneySite.domain}</h2>
                  </div>
                  <span className="badge">SQLite local</span>
                </div>
                <div className="readiness">
                  <div className="score-ring">{readiness}%</div>
                  <div className="readiness-list">
                    <div><strong>Homepage</strong><span>{moneySite.homepageUrl}</span></div>
                    <div><strong>Sitemap</strong><span>{moneySite.sitemapUrl}</span></div>
                    <div><strong>Market</strong><span>{moneySite.language} / {moneySite.targetCountry}</span></div>
                    <div><strong>Industry</strong><span>{moneySite.industry}</span></div>
                  </div>
                </div>
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Workflow Engine</p>
                    <h2>Starter state machine</h2>
                  </div>
                </div>
                <div className="task-list">
                  {starterTasks.map((task) => (
                    <div className="task-row" key={task.id}>
                      <span>{task.name}</span>
                      <em>{task.status.replace("_", " ")}</em>
                    </div>
                  ))}
                </div>
              </article>
              
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Supported Statuses</p>
                    <h2>Automation states</h2>
                  </div>
                </div>
                <div className="status-cloud">
                  {WORKFLOW_STATUSES.map((status) => (
                    <span key={status}>{status.replace("_", " ")}</span>
                  ))}
                </div>
              </article>

              <article className="panel overview-platform-panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Platform Library Seed</p>
                    <h2>Starter platform candidates</h2>
                  </div>
                  <span className="badge">{platforms.length} platforms</span>
                </div>
                <div className="platform-table">
                  {platforms.slice(0, 5).map((platform) => (
                    <div className="platform-row" key={platform.id}>
                      <div>
                        <strong>{platform.name}</strong>
                        <span>{platform.type} / {platform.entityValue}</span>
                      </div>
                      <span>Authority {platform.authorityScore}</span>
                      <span>{platform.requiresCaptcha ? "CAPTCHA" : "No CAPTCHA"}</span>
                      <em>{platform.automationMode.replace("_", " ")}</em>
                    </div>
                  ))}
                </div>
              </article>
            </section>
          </>
        )}

        {activeModule === "Platform Library" && (
          <section className="single-panel">
            <section className="metrics-grid">
              <article className="metric-card good">
                <span>Total Platforms</span>
                <strong>{platformStats.total}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Avg Authority</span>
                <strong>{platformStats.averageAuthority}</strong>
              </article>
              <article className="metric-card warning">
                <span>Semi-auto Ready</span>
                <strong>{platformStats.semiAuto}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Manual Review</span>
                <strong>{platformStats.manual}</strong>
              </article>
            </section>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Platform Library</p>
                  <h2>SQLite-backed entity platform catalog</h2>
                </div>
                <span className="badge">{filteredPlatforms.length} shown</span>
              </div>

              <div className="filter-bar">
                <label>
                  Type
                  <select value={platformTypeFilter} onChange={(event) => setPlatformTypeFilter(event.target.value as PlatformTypeFilter)}>
                    {platformTypes.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Automation
                  <select value={automationModeFilter} onChange={(event) => setAutomationModeFilter(event.target.value as AutomationModeFilter)}>
                    {automationModes.map((mode) => (
                      <option key={mode} value={mode}>{mode.replace("_", " ")}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Difficulty
                  <select value={difficultyFilter} onChange={(event) => setDifficultyFilter(event.target.value as DifficultyFilter)}>
                    {difficulties.map((difficulty) => (
                      <option key={difficulty} value={difficulty}>{difficulty}</option>
                    ))}
                  </select>
                </label>
              </div>

              <div className="platform-view-toolbar">
                <span className="muted-text">View mode</span>
                <div className="view-mode-switch" role="group" aria-label="Platform view mode">
                  <button
                    className={platformViewMode === "compact" ? "secondary-action active-view" : "secondary-action"}
                    type="button"
                    aria-pressed={platformViewMode === "compact"}
                    onClick={() => setPlatformViewMode("compact")}
                  >Compact cards</button>
                  <button
                    className={platformViewMode === "table" ? "secondary-action active-view" : "secondary-action"}
                    type="button"
                    aria-pressed={platformViewMode === "table"}
                    onClick={() => setPlatformViewMode("table")}
                  >Table</button>
                </div>
              </div>

              {platformViewMode === "compact" ? (
                <div className="platform-library platform-library-compact">
                  {filteredPlatforms.map((platform) => (
                    <article className="platform-card platform-card-compact" key={platform.id}>
                      <div className="platform-card-header">
                        <div className="platform-card-title">
                          <p className="eyebrow">{platform.type} / {platform.entityValue}</p>
                          <h2>{platform.name}</h2>
                          <a href={platform.homepageUrl} target="_blank" rel="noreferrer">{platform.homepageUrl}</a>
                        </div>
                        <div className="authority-score authority-score-compact">
                          <span>Authority</span>
                          <strong>{platform.authorityScore}</strong>
                        </div>
                      </div>
                      <p className="platform-notes platform-notes-compact">{platform.notes}</p>
                      <div className="platform-meta platform-meta-compact">
                        <span>{platform.difficulty}</span>
                        <span>{platform.automationMode.replace("_", " ")}</span>
                        <span>{platform.requiresCaptcha ? "CAPTCHA" : "No CAPTCHA"}</span>
                        <span>{platform.requiresEmail ? "Email required" : "No email"}</span>
                      </div>
                      <div className="platform-edit-grid platform-edit-grid-compact">
                        <label>
                          Authority
                          <input type="number" min="0" max="100" value={platform.authorityScore}
                            onChange={(event) => updatePlatform(platform.id, { authorityScore: Number(event.target.value) })} />
                        </label>
                        <label>
                          Automation
                          <select value={platform.automationMode}
                            onChange={(event) => updatePlatform(platform.id, { automationMode: event.target.value as AutomationMode })}>
                            <option value="auto">auto</option>
                            <option value="semi_auto">semi auto</option>
                            <option value="manual_review">manual review</option>
                          </select>
                        </label>
                        <button className="secondary-action" type="button" onClick={() => savePlatform(platform)}>Save</button>
                      </div>
                    </article>
                  ))}
                  {!filteredPlatforms.length && <p className="muted-text">No platforms match these filters.</p>}
                </div>
              ) : (
                <div className="platform-table-wrap">
                  <table className="platform-library-table">
                    <thead>
                      <tr>
                        <th>Platform</th>
                        <th>Type / value</th>
                        <th>Authority</th>
                        <th>Difficulty</th>
                        <th>Automation</th>
                        <th>Requirements</th>
                        <th>Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredPlatforms.map((platform) => (
                        <tr key={platform.id}>
                          <td className="platform-table-name">
                            <strong>{platform.name}</strong>
                            <a href={platform.homepageUrl} target="_blank" rel="noreferrer">{platform.homepageUrl}</a>
                            <span>{platform.notes}</span>
                          </td>
                          <td>{platform.type}<span className="table-subtext">{platform.entityValue}</span></td>
                          <td>
                            <label className="table-field-label" aria-label={platform.name + " authority score"}>
                              <input type="number" min="0" max="100" value={platform.authorityScore}
                                onChange={(event) => updatePlatform(platform.id, { authorityScore: Number(event.target.value) })} />
                            </label>
                          </td>
                          <td><span className={"difficulty-pill difficulty-" + platform.difficulty}>{platform.difficulty}</span></td>
                          <td>
                            <select aria-label={platform.name + " automation mode"} value={platform.automationMode}
                              onChange={(event) => updatePlatform(platform.id, { automationMode: event.target.value as AutomationMode })}>
                              <option value="auto">auto</option>
                              <option value="semi_auto">semi auto</option>
                              <option value="manual_review">manual review</option>
                            </select>
                          </td>
                          <td>
                            <div className="table-requirements">
                              <span>{platform.requiresCaptcha ? "CAPTCHA" : "No CAPTCHA"}</span>
                              <span>{platform.requiresEmail ? "Email required" : "No email"}</span>
                            </div>
                          </td>
                          <td><button className="secondary-action table-save-button" type="button" onClick={() => savePlatform(platform)}>Save</button></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {!filteredPlatforms.length && <p className="muted-text">No platforms match these filters.</p>}
                </div>
              )}
            </article>
          </section>
        )}

        {activeModule === "Platform Validation" && (
          <section className="single-panel platform-validation-page">
            <section className="metrics-grid">
              <article className="metric-card neutral"><span>Platforms</span><strong>{validationStats.total}</strong></article>
              <article className="metric-card good"><span>Dry-run OK</span><strong>{validationStats.dryRunOk}</strong></article>
              <article className="metric-card good"><span>Text Saved</span><strong>{validationStats.textSaved}</strong></article>
              <article className={validationStats.needsFix ? "metric-card warning" : "metric-card neutral"}><span>Needs Fix</span><strong>{validationStats.needsFix}</strong></article>
            </section>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Platform Validation Pack</p>
                  <h2>Checklist test từng platform</h2>
                </div>
                <div className="queue-actions">
                  <span className="badge">{validationStats.mediaUploaded}/{validationStats.total} media uploaded</span>
                  <button className="secondary-action" type="button" onClick={() => void refreshPlatformValidation()}>Refresh</button>
                </div>
              </div>
              <p className="muted-text">Dùng màn này để ghi nhận anh đã test tới đâu: chạy dry-run, lưu text, upload avatar/banner, hoặc đánh dấu cần sửa recipe. Extension build mới sẽ tự đồng bộ kết quả về Desktop; màn này tự refresh mỗi 5 giây và vẫn cho phép anh sửa tay khi cần.</p>

              <div className="data-table-wrap">
                <table className="data-table platform-validation-table">
                  <thead>
                    <tr>
                      <th>Platform</th>
                      <th>Status</th>
                      <th>Checklist timestamps</th>
                      <th>Test URL</th>
                      <th>Notes</th>
                      <th>Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {validationPack.map((record) => (
                      <tr key={record.platformId}>
                        <td>
                          <strong>{record.platformName}</strong>
                          <small>{record.platformId}</small>
                        </td>
                        <td>
                          <select value={record.status} onChange={(event) => updatePlatformValidation(record.platformId, { status: event.target.value as PlatformValidationStatus })}>
                            {validationStatuses.map((status) => (
                              <option key={status} value={status}>{validationStatusLabels[status]}</option>
                            ))}
                          </select>
                        </td>
                        <td>
                          <small>Dry-run: {record.dryRunCheckedAt ? new Date(record.dryRunCheckedAt).toLocaleString("vi-VN") : "chưa có"}</small>
                          <small>Text: {record.textSavedAt ? new Date(record.textSavedAt).toLocaleString("vi-VN") : "chưa có"}</small>
                          <small>Media: {record.mediaUploadedAt ? new Date(record.mediaUploadedAt).toLocaleString("vi-VN") : "chưa có"}</small>
                        </td>
                        <td>
                          <input
                            aria-label={record.platformName + " last tested URL"}
                            placeholder="https://..."
                            value={record.lastTestedUrl}
                            onChange={(event) => updatePlatformValidation(record.platformId, { lastTestedUrl: event.target.value })}
                          />
                        </td>
                        <td>
                          <textarea
                            aria-label={record.platformName + " validation notes"}
                            rows={3}
                            placeholder="Ví dụ: avatar cần ảnh < 1MB, selector bio fail..."
                            value={record.notes}
                            onChange={(event) => updatePlatformValidation(record.platformId, { notes: event.target.value })}
                          />
                        </td>
                        <td>
                          <div className="queue-actions">
                            <button className="secondary-action" type="button" onClick={() => void savePlatformValidation(record)}>Save</button>
                            <button className="secondary-action" type="button" onClick={() => setActiveModule("Selector Recipes")}>Fix recipe</button>
                          </div>
                          <small>Updated: {record.updatedAt ? new Date(record.updatedAt).toLocaleString("vi-VN") : "not saved"}</small>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </article>
          </section>
        )}

        {activeModule === "Selector Recipes" && (
          <section className="single-panel selector-recipes-page">
            <article className="panel selector-recipes-panel">
              <div className="panel-header selector-recipes-title">
                <div>
                  <p className="eyebrow">Selector Recipe Editor</p>
                  <h2>Platform field mapping and submit safety rules</h2>
                </div>
                <span className="badge">{selectorRecipes.length} recipes</span>
              </div>

              <div className="form-grid selector-import-tools">
                <button className="secondary-action" type="button" onClick={() => void exportSelectorRecipes()}>Export recipes JSON to Downloads</button>
                <label className="full-span">Import recipes JSON<textarea rows={5} value={recipeImportJson} onChange={(event) => setRecipeImportJson(event.target.value)} placeholder="Paste JSON export..." /></label>
                <button className="primary-action" type="button" onClick={() => void importSelectorRecipes()}>Import JSON to SQLite</button>
                {recipeImportMessage && <p className="muted-text">{recipeImportMessage}</p>}
              </div>
              <div className="panel-header"><div><p className="eyebrow">Diagnostic Report Integrity</p><h2>Verify exported dry-run JSON</h2></div><span className="badge">Read-only</span></div>
              <p className="muted-text">Dán nội dung tệp entitymanager-dry-run-diagnostics.json để kiểm tra cấu trúc và tính nhất quán của tổng số liệu với các bản ghi bên trong. Công cụ chỉ kiểm tra tệp được dán, không ghi vào SQLite và không thể xác minh tệp có chứa toàn bộ lịch sử trên máy hay không.</p>
              <div className="form-grid">
                <label className="full-span">Diagnostic JSON<textarea rows={6} value={diagnosticImportJson} onChange={(event) => { setDiagnosticImportJson(event.target.value); setDiagnosticValidation(null); }} placeholder="Paste diagnostic JSON export here..." /></label>
                <button className="primary-action" type="button" disabled={!diagnosticImportJson.trim()} onClick={validateImportedDryRunDiagnostics}>Verify report integrity</button>
              </div>
              {diagnosticValidation && <div className={`status-message ${diagnosticValidation.valid ? "success" : "warning"}`} role="status">
                <strong>{diagnosticValidation.valid ? (diagnosticValidation.complete ? "Report reconciles with the SQLite record count" : "Report is consistent but only includes part of SQLite history") : "Report validation found issues"}</strong>
                <span>{diagnosticValidation.checkedRecords} record(s) checked.</span>
                {diagnosticValidation.errors.map((error, index) => <span key={index}>{error}</span>)}
                {diagnosticValidation.valid && <span>{diagnosticValidation.complete ? "Included record count matches the SQLite count recorded at export time." : "The export is internally consistent but does not include every row in SQLite. Refresh history/export again after reviewing the record limit."} Source counts are audit metadata, not a cryptographic proof.</span>}
              </div>}
              <div className="panel-header"><div><p className="eyebrow">Platform Test Assistant</p><h2>Medium / About.me / Tumblr fix loop</h2></div><span className="badge">{platformTestAssistant.filter((item) => item.status === "needs_fix").length} cần sửa</span></div>
              <p className="muted-text">Assistant này đọc lỗi selector do extension gửi về Desktop, gom theo platform, rồi đề xuất selector cần thêm vào recipe. Quy trình: mở platform → chạy dry-run → nếu fail bấm Draft fix → Save Recipe → chạy dry-run lại.</p>
              <div className="platform-test-assistant-grid">
                {platformTestAssistant.map((item) => (
                  <article className={`platform-test-card status-${item.status}`} key={item.platformId}>
                    <div>
                      <p className="eyebrow">{item.platformId}</p>
                      <h3>{item.platformName}</h3>
                      <strong>{item.status === "ready" ? "Dry-run đang ổn" : item.status === "needs_fix" ? "Cần sửa recipe" : "Chưa test"}</strong>
                      <span>{item.failedRuns ? `${item.failedRuns} lần fail trong lịch sử đang tải` : "Chưa có lỗi trong lịch sử đang tải"}</span>
                      <span>Lần gần nhất: {item.latestAt ? new Date(item.latestAt).toLocaleString("vi-VN") : "chưa có"}</span>
                    </div>
                    <div className="test-checklist">
                      <span className={item.status !== "untested" ? "done" : ""}>1. Extension gửi dry-run về Desktop</span>
                      <span className={item.missingIssues.length ? "needs-fix" : item.status === "ready" ? "done" : ""}>2. Lỗi selector: {item.missingIssues.join(", ") || "none"}</span>
                      <span className={Object.keys(item.selectorSuggestions).length || item.submitSuggestions.length ? "needs-fix" : item.status === "ready" ? "done" : ""}>3. Gợi ý fix: {Object.keys(item.selectorSuggestions).join(", ") || (item.submitSuggestions.length ? "submitButton" : "none")}</span>
                    </div>
                    <div className="suggestion-list">
                      {Object.entries(item.selectorSuggestions).map(([field, suggestions]) => (
                        <div key={field}>
                          <strong>{field}</strong>
                          {suggestions.slice(0, 4).map((selector) => <code key={selector}>{selector}</code>)}
                        </div>
                      ))}
                      {item.submitSuggestions.length > 0 && <div>
                        <strong>submitButton</strong>
                        {item.submitSuggestions.slice(0, 4).map((selector) => <code key={selector}>{selector}</code>)}
                      </div>}
                    </div>
                    <div className="queue-actions">
                      {item.latestUrl && <a className="secondary-action" href={item.latestUrl} target="_blank" rel="noreferrer">Mở URL lỗi gần nhất</a>}
                      <button className="secondary-action" type="button" disabled={item.status !== "needs_fix"} onClick={() => draftRecipeSuggestions(item.platformId)}>Draft fix vào recipe</button>
                      <button className="primary-action" type="button" onClick={() => setActiveModule("Entity Builder")}>Mở Campaign Workspace</button>
                    </div>
                  </article>
                ))}
              </div>
              <div className="panel-header"><div><p className="eyebrow">Selector Failure Analytics</p><h2>Failures by platform</h2></div><span className="badge">{dryRunHistory.filter((item) => item.missingChecks.length > 0 || !item.plannedSelector || item.plannedFields.length === 0).length} failed previews</span></div>
              <div className="queue-list">
                {selectorFailureAnalytics.map((item) => (
                  <div className="queue-row" key={item.platformId}>
                    <div>
                      <strong>{item.platformName} — {item.failures}/{item.runs} previews need review</strong>
                      <span>Platform ID: {item.platformId}</span>
                      <span>Repeated issues: {item.repeatedIssues.map(([issue, count]) => `${issue} (${count})`).join(", ") || "No repeated issue detected yet"}</span>
                    </div>
                    <div className="queue-actions">
                      <button className="secondary-action" type="button" disabled={!item.failures} onClick={() => draftRecipeSuggestions(item.platformId)}>Draft recipe suggestions</button>
                    </div>
                  </div>
                ))}
                {!selectorFailureAnalytics.length && <p className="muted-text">Analytics sẽ xuất hiện sau khi extension gửi dry-run history.</p>}
              </div>
              <div className="panel-header"><div><p className="eyebrow">Selector Health Trends</p><h2>Dry-run success rate by platform</h2></div><span className="badge">30-day trend</span></div>
              <div className="queue-list">
                {selectorHealthTrends.platforms.map((item) => <div className="queue-row" key={item.platformId}>
                  <div><strong>{item.platformName} — {item.successRate}% success</strong><span>{item.successes} successful / {item.total} total · {item.failures} failed</span><span>Last 30 days: {item.recent ? item.recentRate + "% (" + item.recentSuccesses + "/" + item.recent + ")" : "No recent dry-run data"}</span></div>
                </div>)}
                {!selectorHealthTrends.platforms.length && <p className="muted-text">Chưa đủ dữ liệu để tính success rate.</p>}
              </div>
              <div className="panel-header"><div><p className="eyebrow">Recipe Change Impact</p><h2>Before / after saved recipe</h2></div></div>
              <div className="queue-list">
                {selectorHealthTrends.recipes.map((item) => <div className="queue-row" key={item.platformId}>
                  <div><strong>{item.platformName} — {item.confirmed ? "Improvement verified by a new successful dry-run" : "Awaiting successful dry-run confirmation"}</strong>
                    <span>Before update: {item.beforeFailures} errors / {item.beforeRuns} runs</span>
                    <span>After update: {item.afterFailures} errors / {item.afterRuns} runs</span>
                    <span>{item.confirmed ? "Recipe change has at least one successful dry-run after the saved update." : "Saving a recipe alone does not count as an improvement; run a new dry-run after updating it."}</span>
                  </div>
                </div>)}
              </div>
              <div className="panel-header"><div><p className="eyebrow">Dry-run History</p><h2>Recent selector previews</h2></div><div className="queue-actions"><span className="badge">{dryRunHistory.length} loaded / {dryRunSourceAudit ? dryRunSourceAudit.totalRecords : "?"} in SQLite</span><button className="secondary-action" type="button" onClick={() => void refreshDryRunHistory()}>Refresh & reconcile</button><button className="secondary-action" type="button" onClick={() => void loadAllDryRunHistory()}>{dryRunHistoryAllLoaded ? "Reload all history" : "Load all history"}</button><button className="secondary-action" type="button" onClick={() => { setDiagnosticExportMessage(""); void exportDryRunDiagnostics(); }}>Export complete diagnostics JSON to Downloads</button></div></div>{diagnosticExportMessage && <div className={`status-message ${diagnosticExportMessage.startsWith("Không thể") || diagnosticExportMessage.startsWith("Không xuất") ? "warning" : "success"}`} role="status"><strong>{diagnosticExportMessage.startsWith("Không thể") || diagnosticExportMessage.startsWith("Không xuất") ? "Export needs attention" : "Export result"}</strong><span>{diagnosticExportMessage}</span></div>}<p className="muted-text">Lịch sử mặc định hiển thị 100 bản ghi gần nhất để giao diện chạy nhanh. Chọn “Load all history” để xem toàn bộ; xuất báo cáo luôn đọc lại toàn bộ SQLite và chỉ tạo tệp khi số bản ghi, ID và mốc thời gian khớp kiểm kê. Chức năng chỉ đọc, không sửa hoặc xóa lịch sử. Tệp có thể chứa URL và ID tài khoản; kiểm tra trước khi chia sẻ.</p>
              <div className="queue-list">
                {dryRunHistory.map((item) => <div className="queue-row" key={item.id}><div>
                  <strong>{item.platformName} — {item.missingChecks.length ? "Needs selector review" : "Preview ready"}</strong>
                  <span>{item.createdAt ? new Date(item.createdAt).toLocaleString() : "Time unknown"} · Account {item.accountId}</span>
                  <span>Planned fields: {item.plannedFields.join(", ") || "none"}</span>
                  <span>Planned selector: {item.plannedSelector || "none"}</span>
                  <span>Missing checks: {item.missingChecks.join(", ") || "none"}</span>
                  <a href={item.currentUrl} target="_blank" rel="noreferrer">{item.currentUrl || "URL unavailable"}</a>
                </div></div>)}
                {!dryRunHistory.length && <p className="muted-text">Chưa có lịch sử. Chạy Dry-run Preview từ extension khi Desktop đang mở.</p>}
              </div>

              <div className="queue-list">
                {selectorRecipes.map((recipe) => (
                  <div className="queue-row recipe-row selector-recipe-card" key={recipe.platformId}>
                    <div>
                      <strong>{recipe.platformName}</strong>
                      <span>{recipe.platformId} / updated {recipe.updatedAt ? new Date(Number.isNaN(Number(recipe.updatedAt)) ? recipe.updatedAt : Number(recipe.updatedAt) * 1000).toLocaleString() : "never"}</span>
                      <label className="full-span">
                        Field selectors JSON
                        <textarea
                          rows={7}
                          value={recipe.fieldSelectorsJson}
                          onChange={(event) => updateSelectorRecipe(recipe.platformId, { fieldSelectorsJson: event.target.value })}
                        />
                      </label>
                      <label className="full-span">
                        Submit selectors
                        <textarea
                          rows={4}
                          value={recipe.submitSelectors}
                          onChange={(event) => updateSelectorRecipe(recipe.platformId, { submitSelectors: event.target.value })}
                        />
                      </label>
                      <label className="full-span">
                        Verify selectors
                        <textarea
                          rows={3}
                          value={recipe.verifySelectors}
                          onChange={(event) => updateSelectorRecipe(recipe.platformId, { verifySelectors: event.target.value })}
                        />
                      </label>
                      <label className="full-span">
                        Required fields
                        <textarea
                          rows={2}
                          value={recipe.requiredFields}
                          onChange={(event) => updateSelectorRecipe(recipe.platformId, { requiredFields: event.target.value })}
                        />
                      </label>
                    </div>
                    <div className="queue-actions">
                      <label className="checkbox-row">
                        <input
                          type="checkbox"
                          checked={recipe.requiresCaptchaToken}
                          onChange={(event) => updateSelectorRecipe(recipe.platformId, { requiresCaptchaToken: event.target.checked })}
                        />
                        Require CAPTCHA token
                      </label>
                      <button className="secondary-action" type="button" onClick={() => saveSelectorRecipe(recipe)}>Save Recipe</button>
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </section>
        )}

        {activeModule === "Money Sites" && (
          <section className="single-panel">
            <form className="panel form-panel" onSubmit={saveMoneySiteForm}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Money Site</p>
                  <h2>Local SQLite record</h2>
                </div>
                <button className="primary-action" type="submit">Save Money Site</button>
              </div>
              <div className="form-grid">
                <label>
                  Domain
                  <input value={moneySite.domain} onChange={(event) => setMoneySite({ ...moneySite, domain: event.target.value })} />
                </label>
                <label>
                  Homepage URL
                  <input value={moneySite.homepageUrl} onChange={(event) => setMoneySite({ ...moneySite, homepageUrl: event.target.value })} />
                </label>
                <label>
                  Sitemap URL
                  <input value={moneySite.sitemapUrl} onChange={(event) => setMoneySite({ ...moneySite, sitemapUrl: event.target.value })} />
                </label>
                <label>
                  Language
                  <input value={moneySite.language} onChange={(event) => setMoneySite({ ...moneySite, language: event.target.value })} />
                </label>
                <label>
                  Target Country
                  <input value={moneySite.targetCountry} onChange={(event) => setMoneySite({ ...moneySite, targetCountry: event.target.value })} />
                </label>
                <label>
                  Industry
                  <input value={moneySite.industry} onChange={(event) => setMoneySite({ ...moneySite, industry: event.target.value })} />
                </label>
              </div>
            </form>
          </section>
        )}

        {activeModule === "Entity Profile" && (
          <section className="single-panel">
            <form className="panel form-panel entity-profile-form" onSubmit={saveEntityProfileForm}>
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Entity Profile Builder</p>
                  <h2>SEO / EEAT identity source</h2>
                </div>
                <button className="primary-action" type="submit">Save Entity Profile</button>
              </div>

              <div className="form-grid">
                <label>
                  Profile Type
                  <select value={entityProfile.profileType} onChange={(event) => updateEntityProfile({ profileType: event.target.value as EntityProfileRecord["profileType"] })}>
                    <option value="organization">organization</option>
                    <option value="brand">brand</option>
                    <option value="person">person</option>
                    <option value="local_business">local business</option>
                  </select>
                </label>
                <label>
                  Brand Name
                  <input value={entityProfile.brandName} onChange={(event) => updateEntityProfile({ brandName: event.target.value })} />
                </label>
                <label>
                  Legal Name
                  <input value={entityProfile.legalName} onChange={(event) => updateEntityProfile({ legalName: event.target.value })} />
                </label>
                <label>
                  Topical Niche
                  <input value={entityProfile.topicalNiche} onChange={(event) => updateEntityProfile({ topicalNiche: event.target.value })} />
                </label>
                <label>
                  Founder Name
                  <input value={entityProfile.founderName} onChange={(event) => updateEntityProfile({ founderName: event.target.value })} />
                </label>
                <label>
                  Author Name
                  <input value={entityProfile.authorName} onChange={(event) => updateEntityProfile({ authorName: event.target.value })} />
                </label>
                <label>
                  Email
                  <input value={entityProfile.email} onChange={(event) => updateEntityProfile({ email: event.target.value })} />
                </label>
                <label>
                  Phone
                  <input value={entityProfile.phone} onChange={(event) => updateEntityProfile({ phone: event.target.value })} />
                </label>
                <label className="full-span">
                  Address / NAP
                  <input value={entityProfile.address} onChange={(event) => updateEntityProfile({ address: event.target.value })} />
                </label>
                <label className="full-span">
                  Short Description
                  <textarea rows={2} value={entityProfile.shortDescription} onChange={(event) => updateEntityProfile({ shortDescription: event.target.value })} />
                </label>
                <label className="full-span">
                  Full Description
                  <textarea rows={4} value={entityProfile.fullDescription} onChange={(event) => updateEntityProfile({ fullDescription: event.target.value })} />
                </label>
                <label className="full-span">
                  SameAs URLs
                  <textarea rows={3} value={entityProfile.sameAsUrls} onChange={(event) => updateEntityProfile({ sameAsUrls: event.target.value })} />
                </label>
                <label className="full-span">
                  Avatar / Logo Image URL or local file path
                  <input value={entityProfile.avatarImageUrl} onChange={(event) => updateEntityProfile({ avatarImageUrl: event.target.value })} placeholder="https://example.com/logo.png hoặc C:\\Users\\Admin\\Downloads\\logo.png" />
                </label>
                <label className="full-span">
                  Banner / Cover Image URL or local file path · recommended 1200x630px
                  <input value={entityProfile.bannerImageUrl} onChange={(event) => updateEntityProfile({ bannerImageUrl: event.target.value })} placeholder="https://example.com/entity-banner-1200x630.jpg hoặc C:\\Users\\Admin\\Downloads\\banner.jpg" />
                </label>
                <label>
                  Target Keywords
                  <textarea rows={3} value={entityProfile.targetKeywords} onChange={(event) => updateEntityProfile({ targetKeywords: event.target.value })} />
                </label>
                <label>
                  Expertise Proof
                  <textarea rows={3} value={entityProfile.expertiseProof} onChange={(event) => updateEntityProfile({ expertiseProof: event.target.value })} />
                </label>
                <label className="full-span">
                  Trust Signals
                  <textarea rows={3} value={entityProfile.trustSignals} onChange={(event) => updateEntityProfile({ trustSignals: event.target.value })} />
                </label>
              </div>
            </form>
          </section>
        )}

        {activeModule === "Entity Builder" && (
          <section className="single-panel entity-builder-vn">
            <section className="entity-command-hero">
              <div className="entity-command-title">
                <div>
                  <p className="eyebrow">ONE-CLICK ENTITY CAMPAIGN</p>
                  <h2>Tạo và theo dõi toàn bộ Entity</h2>
                  <p>Chọn dữ liệu, platform và nhấn một nút. Tool sẽ điều phối account, NAP/EEAT, media, evidence và indexing.</p>
                </div>
                <button className="primary-action entity-launch-action" type="button" disabled={campaignLaunching} onClick={() => void startFullProvisioningCampaign()}>
                  <Play size={18} />
                  {campaignLaunching ? "Đang khởi tạo..." : `Tạo toàn bộ Entity (${campaignPlans.length})`}
                </button>
              </div>

              <div className="campaign-setup-strip">
                <button type="button" className="setup-field setup-field-button" onClick={() => setActiveModule("Money Sites")}>
                  <span>Money Site</span><strong>{moneySite.domain || "Chưa thiết lập"}</strong>
                </button>
                <button type="button" className="setup-field setup-field-button" onClick={() => setActiveModule("Entity Profile")}>
                  <span>Entity Profile</span><strong>{entityProfile.brandName || "Chưa thiết lập"}</strong>
                </button>
                <div className="setup-field"><span>Platform đã chọn</span><strong>{campaignPlans.length} platform</strong></div>
                <div className="setup-field"><span>Số luồng</span><strong>1 luồng ổn định</strong></div>
                <label className="setup-field">
                  <span>Proxy strategy</span>
                  <select value={selectedProxyId} onChange={(event) => setSelectedProxyId(event.target.value)}>
                    <option value="">Direct — IP máy tính</option>
                    {proxyRecords.filter((item) => item.isEnabled).map((proxy) => <option key={proxy.id} value={proxy.id}>{proxy.name}</option>)}
                  </select>
                </label>
                <div className="setup-field"><span>CAPTCHA</span><strong>{settings.find((item) => item.settingType === "captcha" && item.isEnabled)?.provider || "Chưa bật"}</strong></div>
                <label className="setup-field">
                  <span>Browser</span>
                  <select value={browserVisible ? "manual" : "preview"} onChange={(event) => setBrowserVisible(event.target.value === "manual")}>
                    <option value="preview">Theo dõi trong Tool</option>
                    <option value="manual">Mở cửa sổ khi cần</option>
                  </select>
                </label>
              </div>
            </section>

            <section className="campaign-live-grid">
              <article className="panel campaign-overview-card">
                <div className="campaign-progress-heading">
                  <div>
                    <p className="eyebrow">TIẾN ĐỘ TỔNG</p>
                    <h2>{provisioningCampaigns[0]?.name || `${entityProfile.brandName || moneySite.domain} — sẵn sàng chạy`}</h2>
                  </div>
                  <strong>{provisioningCampaigns[0] ? `${Math.round((provisioningJobs.filter((job) => job.campaignId === provisioningCampaigns[0].id && job.status === "completed").length / Math.max(provisioningCampaigns[0].totalJobs, 1)) * 100)}%` : "0%"}</strong>
                </div>
                <div className="campaign-progress-track"><span style={{ width: `${provisioningCampaigns[0] ? Math.round((provisioningJobs.filter((job) => job.campaignId === provisioningCampaigns[0].id && job.status === "completed").length / Math.max(provisioningCampaigns[0].totalJobs, 1)) * 100) : 0}%` }} /></div>
                <div className="campaign-kpis">
                  <span><b>{provisioningJobs.filter((job) => job.status === "completed").length}</b> hoàn thành</span>
                  <span><b>{provisioningJobs.filter((job) => job.status === "running").length}</b> đang chạy</span>
                  <span><b>{provisioningJobs.filter((job) => job.status === "queued").length}</b> đang chờ</span>
                  <span><b>{provisioningJobs.filter((job) => job.status === "waiting_user").length}</b> cần xử lý</span>
                  <span><b>{provisioningJobs.filter((job) => job.status === "failed").length}</b> thất bại</span>
                </div>
              </article>

              <article className="panel worker-health-card">
                <div className="worker-health-top"><span className={`worker-health-dot ${browserWorker?.status || "stopped"}`} /><div><span>Browser Worker</span><strong>{browserWorker?.status === "ready" ? "Đang hoạt động" : browserWorker?.status === "starting" ? "Đang khởi động" : browserWorker?.status === "failed" ? "Có lỗi" : "Đang nghỉ"}</strong></div></div>
                <p>{browserWorker?.message || "Worker sẽ tự khởi động khi campaign bắt đầu."}</p>
                <small>{browserWorker?.heartbeatAt ? `Cập nhật ${new Date(browserWorker.heartbeatAt).toLocaleTimeString("vi-VN")} · ${browserWorker.activeSessions} phiên` : "Chưa có heartbeat"}</small>
              </article>
            </section>

            <article className="panel platform-live-panel">
              <div className="panel-header"><div><p className="eyebrow">PLATFORM ĐANG XỬ LÝ</p><h2>Trạng thái theo thời gian thực</h2></div><span className="badge">{campaignPlans.length} platform</span></div>
              <div className="platform-live-table">
                <div className="platform-live-row platform-live-head"><span>Platform</span><span>Bước hiện tại</span><span>Trạng thái</span><span>Kết quả</span></div>
                {campaignPlans.map((plan) => {
                  const job = provisioningJobs.find((item) => item.platformId === plan.platformId);
                  const account = accounts.find((item) => item.platformId === plan.platformId);
                  return <button type="button" className="platform-live-row" key={plan.platformId} onClick={() => selectExecutionPlatform(plan.platformId)}>
                    <strong>{plan.platformName}</strong>
                    <span>{job ? job.stage.replace(/_/g, " ") : "Sẵn sàng"}</span>
                    <em className={`live-status ${job?.status || "queued"}`}>{job ? job.status.replace(/_/g, " ") : "Chưa chạy"}</em>
                    <span>{account?.evidenceUrl ? <a href={account.evidenceUrl} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>Profile URL</a> : "—"}</span>
                  </button>;
                })}
              </div>
            </article>

            <details className="panel advanced-builder-tools">
              <summary><ListChecks size={18} /> Tùy chọn và chi tiết nâng cao</summary>
              <div className="builder-panel-toggles">
                {([ ["guide", "Hướng dẫn"], ["campaign", "Thiết lập chi tiết"], ["accounts", `Tài khoản (${accounts.length})`], ["plans", "Kế hoạch platform"], ["activity", `Queue & log (${automationQueue.length})`] ] as Array<[BuilderPanelId, string]>).map(([panel, label]) => (
                  <label className={builderPanels[panel] ? "builder-panel-toggle active" : "builder-panel-toggle"} key={panel}><input type="checkbox" checked={builderPanels[panel]} onChange={() => toggleBuilderPanel(panel)} /><span>{label}</span></label>
                ))}
              </div>
            </details>

            {builderPanels.guide && (
            <article className="panel builder-guide">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">HƯỚNG DẪN BẮT ĐẦU</p>
                  <h2>Cách kiểm tra Entity Builder lần đầu</h2>
                </div>
                <span className="badge">Dữ liệu lưu trên máy này</span>
              </div>
              <ol className="builder-guide-steps">
                <li><strong>Kiểm tra hồ sơ thương hiệu:</strong> mở mục <b>Entity Profile</b> ở thanh bên và điền tên thương hiệu, tên người đại diện/chuyên gia cùng thông tin chứng minh uy tín; sau đó lưu hồ sơ.</li>
                <li><strong>Chọn các nền tảng trong campaign:</strong> tick đúng bộ platform muốn tạo cho Money Site và sắp xếp theo mức ưu tiên.</li>
                <li><strong>Nhấn “Tạo toàn bộ Entity”:</strong> Desktop tạo job tuần tự, mở platform đầu tiên và lưu checkpoint vào SQLite.</li>
                <li><strong>Xử lý cổng bảo mật nếu xuất hiện:</strong> hoàn tất CAPTCHA/email/OTP/OAuth, sau đó mở extension và bấm Chạy tự động toàn bộ để tiếp tục profile, media, evidence và indexing.</li>
              </ol>
              <p className="muted-text">Khuyến nghị: hãy thử với website do bạn quản lý hoặc môi trường thử nghiệm. Không nhập mật khẩu hay mã CAPTCHA vào ghi chú.</p>
            </article>
            )}

            <section className="metrics-grid">
              <article className="metric-card good">
                <span>Tài khoản đã lưu</span>
                <strong>{accounts.length}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Đã xác minh</span>
                <strong>{accounts.filter((account) => account.status === "verified").length}</strong>
              </article>
              <article className="metric-card warning">
                <span>Cần kiểm tra thủ công</span>
                <strong>{accounts.filter((account) => account.status === "needs_manual_review").length}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Việc cần xử lý</span>
                <strong>{automationQueue.length}</strong>
              </article>
            </section>

            {builderPanels.campaign && (
            <article className="panel campaign-runner-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">ENTITY ACCOUNT CAMPAIGN RUNNER</p>
                  <h2>Chạy chiến dịch tạo entity cho money site</h2>
                  <p className="muted-text">Chọn platform, kiểm tra dữ liệu sẽ điền, rồi tạo account record + hàng đợi thao tác. Đây là bước điều phối chiến dịch; extension sẽ xử lý dry-run, fill text, upload media và auto-sync validation trên từng website.</p>
                </div>
                <span className="badge">{campaignPlans.length} platform selected</span>
              </div>

              <div className="provisioning-launch-card">
                <div>
                  <p className="eyebrow">FULL ACCOUNT PROVISIONING</p>
                  <strong>Một nút: worker → tài khoản → NAP/EEAT → media → evidence → indexing</strong>
                  <span>Playwright Worker điều khiển Chromium trực tiếp và giữ Browser Identity. Extension chỉ còn là phương án dự phòng.</span>
                </div>
                <button className="primary-action" type="button" disabled={campaignLaunching} onClick={() => void startFullProvisioningCampaign()}>
                  {campaignLaunching ? "Đang tạo hàng đợi..." : `Tạo toàn bộ Entity (${campaignPlans.length})`}
                </button>
              </div>

              <div className="managed-browser-grid">
                <section className="managed-browser-card">
                  <div className="panel-header"><div><p className="eyebrow">BROWSER CONTROL CENTER</p><h3>Playwright Worker Pool</h3></div><span className="badge">{browserSessions.filter((item) => item.status === "running").length} running</span></div>
                  <div className={`status-message ${browserWorker?.status === "failed" ? "warning" : "success"}`} role="status">
                    <strong>{browserWorker ? `Worker ${browserWorker.status}` : "Worker chưa khởi động"}</strong>
                    <span>{browserWorker?.message || "Worker sẽ tự khởi động khi bắt đầu campaign."}</span>
                    {browserWorker?.heartbeatAt && <small>Heartbeat: {new Date(browserWorker.heartbeatAt).toLocaleTimeString("vi-VN")} · {browserWorker.activeSessions} phiên</small>}
                  </div>
                  <label className="checkbox-row"><input type="checkbox" checked={browserVisible} onChange={(event) => setBrowserVisible(event.target.checked)} /><span>Hiển thị browser khi khởi chạy</span></label>
                  <label>Proxy cho campaign<select value={selectedProxyId} onChange={(event) => setSelectedProxyId(event.target.value)}><option value="">Direct — IP máy tính</option>{proxyRecords.filter((item) => item.isEnabled).map((proxy) => <option key={proxy.id} value={proxy.id}>{proxy.name} · {proxy.status} {proxy.exitIp ? `· ${proxy.exitIp}` : ""}</option>)}</select></label>
                  <p className="muted-text">Mỗi entity/project dùng Browser Identity bền vững. Proxy giữ cố định trong phiên; Gmail dùng OAuth và không lưu mật khẩu Google.</p>
                  {provisioningJobs.find((job) => ["running", "waiting_user"].includes(job.status)) && (() => {
                    const job = provisioningJobs.find((item) => ["running", "waiting_user"].includes(item.status))!;
                    return <div className={`status-message ${job.status === "waiting_user" ? "warning" : "success"}`} role="status"><strong>{job.platformName} · {job.stage}</strong><span>{job.lastMessage}</span></div>;
                  })()}
                  <div className="browser-session-list">{browserSessions.slice(0, 6).map((session) => <div className="browser-session-row worker-session-card" key={session.id}>{browserPreviews[session.id] && <img className="worker-preview" src={browserPreviews[session.id]} alt={`Preview ${session.platformId}`} />}<div><strong>{session.platformId}</strong><span>{session.status} · {session.visibility}</span><small>{session.lastMessage}</small></div>{session.status === "running" && <div className="session-actions"><button className="secondary-action" type="button" onClick={() => void refreshBrowserPreview(session.id)}>Xem preview</button><button className="secondary-action" type="button" onClick={() => void stopBrowser(session.id)}>Dừng</button></div>}</div>)}</div>
                </section>

                <section className="managed-browser-card">
                  <div className="panel-header"><div><p className="eyebrow">PROXY MANAGER</p><h3>Thêm và kiểm tra proxy</h3></div><span className="badge">{proxyRecords.filter((item) => item.status === "healthy").length} healthy</span></div>
                  <div className="proxy-form-grid">
                    <input placeholder="Tên proxy" value={proxyDraft.name} onChange={(event) => setProxyDraft({ ...proxyDraft, name: event.target.value })} />
                    <select value={proxyDraft.protocol} onChange={(event) => setProxyDraft({ ...proxyDraft, protocol: event.target.value })}><option value="http">HTTP</option><option value="https">HTTPS</option><option value="socks5">SOCKS5</option></select>
                    <input placeholder="Host / IP" value={proxyDraft.host} onChange={(event) => setProxyDraft({ ...proxyDraft, host: event.target.value })} />
                    <input placeholder="Port" inputMode="numeric" value={proxyDraft.port} onChange={(event) => setProxyDraft({ ...proxyDraft, port: event.target.value })} />
                    <input placeholder="Username (nếu có)" value={proxyDraft.username} onChange={(event) => setProxyDraft({ ...proxyDraft, username: event.target.value })} />
                    <input placeholder="Password (lưu Credential Manager)" type="password" value={proxyDraft.password} onChange={(event) => setProxyDraft({ ...proxyDraft, password: event.target.value })} />
                    <input placeholder="Quốc gia: VN, US..." value={proxyDraft.countryCode} onChange={(event) => setProxyDraft({ ...proxyDraft, countryCode: event.target.value })} />
                    <button className="primary-action" type="button" onClick={() => void saveProxy()}>Lưu proxy</button>
                  </div>
                  <div className="browser-session-list">{proxyRecords.map((proxy) => <div className="browser-session-row" key={proxy.id}><div><strong>{proxy.name} · {proxy.protocol}://{proxy.host}:{proxy.port}</strong><span>{proxy.status} {proxy.exitIp ? `· ${proxy.exitIp}` : ""} {proxy.latencyMs ? `· ${proxy.latencyMs}ms` : ""}</span><small>{proxy.lastError || (proxy.hasPassword ? "Credential bảo mật đã lưu" : "Không dùng mật khẩu")}</small></div><button className="secondary-action" type="button" onClick={() => void testProxy(proxy.id)}>Kiểm tra</button></div>)}</div>
                </section>
              </div>

              {provisioningCampaigns[0] && (
                <div className="provisioning-progress">
                  <div className="provisioning-progress-head">
                    <strong>{provisioningCampaigns[0].name}</strong>
                    <span>{provisioningJobs.filter((job) => job.campaignId === provisioningCampaigns[0].id && job.status === "completed").length}/{provisioningCampaigns[0].totalJobs} hoàn thành</span>
                  </div>
                  <div className="provisioning-job-list">
                    {provisioningJobs.filter((job) => job.campaignId === provisioningCampaigns[0].id).map((job) => (
                      <div className={`provisioning-job ${job.status}`} key={job.id}>
                        <b>{job.position + 1}</b>
                        <div><strong>{job.platformName}</strong><span>{job.stage.replace(/_/g, " ")} · {job.lastMessage}</span></div>
                        <em>{job.status}</em>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="campaign-runner-grid">
                <div>
                  <div className="queue-actions campaign-actions">
                    <button className="primary-action" type="button" onClick={() => void startEntityCampaign()}>Tạo campaign account records</button>
                    <button className="secondary-action" type="button" onClick={() => setCampaignPlatformIds(starterCampaignPlatformIds)}>Chọn bộ starter</button>
                    <button className="secondary-action" type="button" onClick={() => setCampaignPlatformIds(accountCreationPlan.slice(0, 8).map((plan) => plan.platformId))}>Chọn top authority</button>
                  </div>
                  <div className="campaign-platform-picker">
                    {accountCreationPlan.map((plan) => (
                      <label className="checkbox-row campaign-platform-option" key={plan.platformId}>
                        <input
                          type="checkbox"
                          checked={campaignPlatformIds.includes(plan.platformId)}
                          onChange={() => toggleCampaignPlatform(plan.platformId)}
                        />
                        <span>{plan.platformName}</span>
                        <em>{plan.entityValue} / {plan.authorityScore}</em>
                      </label>
                    ))}
                  </div>
                </div>

                <div className="campaign-data-preview">
                  <strong>Dữ liệu sẽ dùng để điền profile/NAP/EEAT</strong>
                  <div className="data-table-wrap">
                    <table className="data-table">
                      <tbody>
                        {campaignDataRows.map(([label, value]) => (
                          <tr key={label}>
                            <td><strong>{label}</strong></td>
                            <td>{value ? <span>{value}</span> : <span className="muted-text">Chưa nhập</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>

              <div className="workflow-step-list campaign-step-list">
                <span>1. Account planned</span>
                <span>2. Open platform</span>
                <span>3. Dry-run selector</span>
                <span>4. Fill NAP/profile text</span>
                <span>5. Upload avatar/banner</span>
                <span>6. Save profile</span>
                <span>7. Capture evidence URL</span>
              </div>
            </article>
            )}

            <article className="panel campaign-workspace-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">CAMPAIGN EXECUTION WORKSPACE</p>
                  <h2>Workspace thao tác từng platform</h2>
                  <p className="muted-text">Bấm vào từng platform để xem việc cần làm ngay, mở website, lấy endpoint cho extension, theo dõi validation và lưu URL bằng chứng sau khi profile đã lưu.</p>
                </div>
                <span className="badge">{activeExecutionPlan?.platformName ?? "Chưa chọn"}</span>
              </div>

              {activeExecutionPlan ? (
                <div className="campaign-workspace-grid">
                  <div className="campaign-workspace-tabs">
                    {campaignPlans.map((plan) => {
                      const account = accounts.find((item) => item.platformId === plan.platformId);
                      const validation = platformValidation.find((item) => item.platformId === plan.platformId)
                        ?? validationPack.find((item) => item.platformId === plan.platformId);

                      return (
                        <button
                          className={plan.platformId === activeExecutionPlan.platformId ? "campaign-workspace-tab active" : "campaign-workspace-tab"}
                          key={plan.platformId}
                          type="button"
                          onClick={() => selectExecutionPlatform(plan.platformId)}
                        >
                          <strong>{plan.platformName}</strong>
                          <span>{account ? ({ planned: "Đã lên kế hoạch", created: "Đã tạo", needs_manual_review: "Cần kiểm tra", failed: "Thất bại", verified: "Đã xác minh" } as Record<AccountStatus, string>)[account.status] : "Chưa có record"}</span>
                          <em>{validation?.certifiedAt ? "CERTIFIED" : validation ? validationStatusLabels[validation.status] : "Chưa test"}</em>
                        </button>
                      );
                    })}
                  </div>

                  <div className="campaign-workspace-detail">
                    <div className="workspace-summary">
                      <div>
                        <p className="eyebrow">{activeExecutionPlan.platformType} / {activeExecutionPlan.entityValue}</p>
                        <h3>{activeExecutionPlan.platformName}</h3>
                        <span className="muted-text">@{activeExecutionPlan.recommendedUsername} · authority {activeExecutionPlan.authorityScore}</span>
                      </div>
                      {activePlatformGuide?.primaryUrl && (
                        <button
                          className="primary-action open-platform-action"
                          type="button"
                          disabled={openingPlatformUrl}
                          onClick={() => void openExternalPlatformUrl(activePlatformGuide.primaryUrl, activeExecutionPlan.platformName)}
                        >
                          {openingPlatformUrl ? "Đang mở trình duyệt..." : "Mở trang cần thao tác"}
                        </button>
                      )}
                    </div>

                    {externalOpenMessage && (
                      <div className={externalOpenMessage.startsWith("Không") ? "external-open-feedback error" : "external-open-feedback"} role="status">
                        <strong>{openingPlatformUrl ? "ĐANG XỬ LÝ" : "TRẠNG THÁI MỞ TRANG"}</strong>
                        <span>{externalOpenMessage}</span>
                      </div>
                    )}

                    <div className="one-click-orchestrator-card">
                      <div>
                        <p className="eyebrow">ONE-CLICK AUTOMATION ORCHESTRATOR</p>
                        <strong>Tự chạy dry-run → lưu NAP/EEAT → upload media → xác minh evidence</strong>
                        <span>Desktop chuẩn bị queue, mở Managed Chromium và tự đánh thức Bridge. Không cần mở hoặc bấm extension thủ công.</span>
                        <span><b>{indexingQueueCount}</b> URL đang chờ trong Indexing Queue. Evidence công khai mới sẽ được tự đưa vào queue sau khi xác minh.</span>
                      </div>
                      <button className="primary-action" type="button" disabled={orchestratorStarting} onClick={() => void startOneClickOrchestrator()}>
                        {orchestratorStarting ? "Đang chuẩn bị phiên chạy..." : `Chạy tự động ${activeExecutionPlan.platformName}`}
                      </button>
                    </div>

                    {activePlatformGuide && (
                      <details className="workspace-disclosure platform-guided-runner">
                        <summary>Hướng dẫn thao tác riêng cho {activeExecutionPlan.platformName}</summary>
                        <div className="guided-runner-header">
                          <div>
                            <p className="eyebrow">PLATFORM-SPECIFIC GUIDED RUNNER</p>
                            <strong>{activePlatformGuide.profileArea}</strong>
                          </div>
                          <button className="secondary-action" type="button" onClick={() => setActiveModule("Selector Recipes")}>Mở Fix Loop</button>
                        </div>
                        <div className="guided-url-list">
                          <span>URL nên mở:</span>
                          {activePlatformGuide.secondaryUrls.map((url) => (
                            <button className="guided-url-button" type="button" key={url} onClick={() => void openExternalPlatformUrl(url, activeExecutionPlan.platformName)}>{url}</button>
                          ))}
                        </div>
                        <ol className="guided-step-list">
                          <li><strong>Dry-run:</strong> mở đúng URL ở trên, bật extension và bấm Chạy thử Selector Recipe.</li>
                          <li><strong>Text/NAP/EEAT:</strong> {activePlatformGuide.textStep}</li>
                          <li><strong>Avatar/banner:</strong> {activePlatformGuide.mediaStep}</li>
                          <li><strong>Lưu trên platform:</strong> {activePlatformGuide.saveStep}</li>
                          <li><strong>Evidence:</strong> {activePlatformGuide.evidenceStep}</li>
                        </ol>
                        <div className="guided-warning-list">
                          {activePlatformGuide.warnings.map((warning) => (
                            <span key={warning}>{warning}</span>
                          ))}
                        </div>
                      </details>
                    )}

                    <div className={activeExecutionValidation?.certifiedAt ? "platform-certification-card certified" : "platform-certification-card"}>
                      <div className="certification-card-header">
                        <div>
                          <p className="eyebrow">FIRST END-TO-END PLATFORM CERTIFICATION</p>
                          <strong>{activeExecutionValidation?.certifiedAt ? "CERTIFIED" : activeCertificationReady ? "Sẵn sàng chứng nhận" : "Đang kiểm thử thực tế"}</strong>
                        </div>
                        <span>{activeExecutionValidation?.certifiedAt ? new Date(activeExecutionValidation.certifiedAt).toLocaleString("vi-VN") : "Thứ tự: Medium → About.me → Tumblr"}</span>
                      </div>
                      <div className="certification-gate-list">
                        {activeCertificationGates.map((gate, index) => (
                          <div className={gate.passed ? "certification-gate passed" : "certification-gate"} key={gate.label}>
                            <b>{gate.passed ? "✓" : index + 1}</b>
                            <span>{gate.label}</span>
                          </div>
                        ))}
                      </div>
                      <p className="muted-text">Desktop chỉ cho phép chứng nhận khi SQLite xác nhận đủ các bước và account đã verified có evidence URL bắt đầu bằng http:// hoặc https://.</p>
                      <button
                        className="primary-action"
                        type="button"
                        disabled={!activeCertificationReady || Boolean(activeExecutionValidation?.certifiedAt)}
                        onClick={() => void certifyActivePlatform()}
                      >
                        {activeExecutionValidation?.certifiedAt ? "Platform đã certified" : "Chứng nhận platform"}
                      </button>
                    </div>

                    <details className="workspace-disclosure" open>
                      <summary>Việc cần làm ngay — checklist của {activeExecutionPlan.platformName}</summary>
                    <div className="workspace-task-list">
                      {[
                        ["Account record", Boolean(activeExecutionAccount), "Tạo/lưu account record trước khi thao tác."],
                        ["Dry-run selector", Boolean(activeExecutionValidation && activeExecutionValidation.status !== "not_tested"), "Extension kiểm tra đúng trường trước khi điền."],
                        ["Text/NAP saved", Boolean(activeExecutionValidation && ["text_saved", "media_uploaded"].includes(activeExecutionValidation.status)), "Lưu brand, NAP, author, bio, homepage và social links."],
                        ["Avatar/banner", Boolean(activeExecutionValidation?.status === "media_uploaded"), "Upload logo/avatar và banner nếu platform hỗ trợ."],
                        ["Evidence URL", Boolean(activeEvidenceUrl.trim()), "Dán URL profile đã tạo/lưu thành công."],
                        ["Verified", activeExecutionAccount?.status === "verified", "Đánh dấu hoàn tất khi profile đã lưu và có bằng chứng."]
                      ].map(([label, done, hint]) => (
                        <div className={done ? "workspace-task-row workspace-task-done" : "workspace-task-row"} key={String(label)}>
                          <strong>{done ? "OK" : "TODO"}</strong>
                          <span>{label}</span>
                          <em>{hint}</em>
                        </div>
                      ))}
                    </div>
                    </details>

                    <details className="workspace-disclosure">
                      <summary>Công cụ extension và trạng thái kỹ thuật</summary>
                    <div className="workspace-endpoint-box">
                      <strong>Payload cho extension</strong>
                      <code>Preview: http://127.0.0.1:17321/account/submit-verify/preview?platformId={activeExecutionPlan.platformId}</code>
                      <code>Submit/verify: http://127.0.0.1:17321/account/submit-verify/next</code>
                      <code>Validation sync: http://127.0.0.1:17321/platform-validation/sync</code>
                      <button className="secondary-action" type="button" onClick={() => void prepareExtensionPayload(activeExecutionPlan)}>Lấy payload cho extension</button>
                    </div>

                    <div className="workspace-validation-card">
                      <strong>Trạng thái validation</strong>
                      <span>{activeExecutionValidation ? validationStatusLabels[activeExecutionValidation.status] : "Chưa có dữ liệu validation"}</span>
                      <small>{activeExecutionValidation?.lastTestedUrl || "Chưa có URL test gần nhất"}</small>
                      {activeExecutionValidation?.notes && <p>{activeExecutionValidation.notes}</p>}
                    </div>
                    </details>

                    <div className="workspace-evidence-actions">
                      <label>
                        Evidence URL sau khi profile đã lưu
                        <input
                          placeholder="https://platform.com/profile/brand"
                          type="url"
                          value={activeEvidenceUrl}
                          onChange={(event) => setExecutionEvidenceUrl(event.target.value)}
                        />
                      </label>
                      <div className="queue-actions">
                        <button className="secondary-action" type="button" onClick={() => void saveAccountFromPlan(activeExecutionPlan)}>Lưu account record</button>
                        <button className="primary-action" type="button" onClick={() => void markExecutionComplete()}>Đánh dấu hoàn tất + lưu evidence</button>
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="empty-state">
                  <strong>Chưa có platform nào trong campaign</strong>
                  <p>Chọn platform ở Campaign Runner để mở workspace thao tác từng nền tảng.</p>
                </div>
              )}
            </article>

            {builderPanels.accounts && (
            <article className="panel saved-account-panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">SỔ THEO DÕI</p>
                  <h2>Tài khoản đã lưu</h2>
                  <p className="muted-text">Đây là các bản ghi nội bộ trong ứng dụng, không phải danh sách tài khoản đã được tạo trên các nền tảng.</p>
                </div>
                <span className="badge">{accounts.length} bản ghi</span>
              </div>
              {accounts.length === 0 ? (
                <div className="empty-state">
                  <strong>Chưa có bản ghi tài khoản nào</strong>
                  <p>Cuộn xuống phần “Kế hoạch nền tảng”, chọn một nền tảng phù hợp rồi nhấn “Lưu bản ghi tài khoản”. Sau khi lưu thành công, bản ghi sẽ xuất hiện tại đây.</p>
                </div>
              ) : (
                <div className="saved-account-list">
                  {accounts.map((account) => (
                    <div className="saved-account-row" key={account.id}>
                      <div>
                        <strong>{account.platformName}</strong>
                        <span>@{account.recommendedUsername}</span>
                        <span>{({ planned: "Đã lên kế hoạch", created: "Đã tạo", needs_manual_review: "Cần kiểm tra thủ công", failed: "Thất bại", verified: "Đã xác minh" } as Record<AccountStatus, string>)[account.status]}</span>
                      </div>
                      <div>
                        {account.evidenceUrl ? <a href={account.evidenceUrl} target="_blank" rel="noreferrer">Mở URL bằng chứng</a> : <span className="muted-text">Chưa có URL bằng chứng</span>}
                        <span className="muted-text">Cập nhật: {new Date(account.updatedAt).toLocaleString("vi-VN")}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </article>
            )}

            {builderPanels.plans && (
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">KẾ HOẠCH TẠO HỒ SƠ</p>
                  <h2>Kế hoạch nền tảng cho {entityProfile.brandName}</h2>
                  <p className="muted-text">Mỗi thẻ là một đề xuất để bạn xem xét. Ứng dụng không tự tạo tài khoản thật chỉ bằng việc lưu bản ghi.</p>
                </div>
                <span className="badge">Kế hoạch đề xuất</span>
              </div>

              <div className="account-plan-list">
                {accountCreationPlan.map((item) => {
                  const account = accounts.find((savedAccount) => savedAccount.platformId === item.platformId);

                  return (
                  <article className="account-plan-card" key={item.id}>
                    <div className="platform-card-header">
                      <div>
                        <p className="eyebrow">{item.platformType} / {item.entityValue}</p>
                        <h2>{item.platformName}</h2>
                        <span className="muted-text">Tên tài khoản gợi ý: @{item.recommendedUsername}</span>
                      </div>
                      <div className="authority-score">
                        <span>{{ high: "Ưu tiên cao", medium: "Ưu tiên vừa", low: "Ưu tiên thấp" }[item.priority]}</span>
                        <strong>{item.authorityScore}</strong>
                      </div>
                    </div>

                    {account && (
                      <div className={`account-status status-${account.status}`}>
                        <strong>{({ planned: "Đã lên kế hoạch", created: "Đã tạo", needs_manual_review: "Cần kiểm tra thủ công", failed: "Thất bại", verified: "Đã xác minh" } as Record<AccountStatus, string>)[account.status]}</strong>
                        <span>Cập nhật {new Date(account.updatedAt).toLocaleString("vi-VN")}</span>
                      </div>
                    )}

                    <p className="platform-notes">{item.profileAngle}</p>

                    <div className="platform-meta">
                      <span>{{ auto: "Tự động", semi_auto: "Bán tự động", manual_review: "Kiểm tra thủ công" }[item.automationMode]}</span>
                      <span>{{ easy: "Dễ", medium: "Trung bình", hard: "Khó" }[item.difficulty]}</span>
                      <span>Tài liệu cần có: {item.requiredAssets.join(" + ")}</span>
                    </div>

                    <div className="workflow-step-list">
                      {item.workflowSteps.map((step) => (
                        <span key={step}>{step}</span>
                      ))}
                    </div>

                    {account ? (
                      <div className="account-edit-grid">
                        <label>
                          Trạng thái
                          <select value={account.status} onChange={(event) => updateAccount(account.id, { status: event.target.value as AccountStatus })}>
                            {accountStatuses.map((status) => (
                              <option key={status} value={status}>{({ planned: "Đã lên kế hoạch", created: "Đã tạo", needs_manual_review: "Cần kiểm tra thủ công", failed: "Thất bại", verified: "Đã xác minh" } as Record<AccountStatus, string>)[status]}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          URL bằng chứng
                          <input placeholder="https://..." value={account.evidenceUrl} onChange={(event) => updateAccount(account.id, { evidenceUrl: event.target.value })} />
                        </label>
                        <label className="full-span">
                          Ghi chú (không nhập mật khẩu hoặc mã xác thực)
                          <textarea rows={2} value={account.notes} onChange={(event) => updateAccount(account.id, { notes: event.target.value })} />
                        </label>
                      </div>
                    ) : (
                      <button className="secondary-action" type="button" onClick={() => saveAccountFromPlan(item)}>Lưu bản ghi tài khoản</button>
                    )}
                  </article>
                  );
                })}
              </div>
            </article>
            )}

            {builderPanels.activity && (
            <section className="entity-builder-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">HÀNG ĐỢI TỰ ĐỘNG HÓA</p>
                    <h2>Các bước đang chờ xử lý</h2>
                  </div>
                  <span className="badge">{automationQueue.filter((item) => item.status !== "resolved").length} mục đang mở</span>
                </div>

                {automationQueue.length === 0 ? (
                  <div className="empty-state"><strong>Chưa có việc nào trong hàng đợi.</strong><p>Hàng đợi chỉ xuất hiện khi một bản ghi cần thao tác thủ công hoặc xử lý tích hợp.</p></div>
                ) : (
                  <div className="queue-list">
                    {automationQueue.map((item) => (
                      <div className="queue-row" key={item.id}>
                        <div>
                          <strong>{item.platformName}</strong>
                          <span>{({ captcha: "CAPTCHA", email: "Xác minh email", manual_review: "Kiểm tra thủ công", evidence: "Bổ sung bằng chứng", submit_verify: "Gửi và xác minh" } as Record<AutomationGateType, string>)[item.gateType]} / {item.payload}</span>
                          {item.gateType === "captcha" && (
                            <textarea aria-label="Nội dung CAPTCHA" rows={4} value={item.payload} onChange={(event) => updateQueueItem(item.id, { payload: event.target.value })} />
                          )}
                        </div>
                        <div className="queue-actions">
                          <select aria-label="Trạng thái hàng đợi" value={item.status} onChange={(event) => updateQueueItem(item.id, { status: event.target.value as AutomationQueueStatus })}>
                            {queueStatuses.map((status) => (
                              <option key={status} value={status}>{({ queued: "Trong hàng đợi", waiting: "Đang chờ", resolved: "Đã xử lý", failed: "Thất bại" } as Record<AutomationQueueStatus, string>)[status]}</option>
                            ))}
                          </select>
                          {item.gateType === "captcha" && <button className="secondary-action" type="button" onClick={() => executeCaptchaQueueItem(item)}>Gửi yêu cầu CAPTCHA</button>}
                          {item.gateType === "captcha" && <button className="secondary-action" type="button" onClick={() => pollCaptchaQueueItem(item)}>Kiểm tra kết quả</button>}
                          {item.gateType === "captcha" && <button className="secondary-action" type="button" onClick={() => prepareCaptchaInjection(item)}>Chuẩn bị dữ liệu cầu nối</button>}
                          {item.gateType === "submit_verify" && <button className="secondary-action" type="button" onClick={() => completeSubmitVerify(item, true)}>Đánh dấu đã xác minh</button>}
                          {item.gateType === "submit_verify" && <button className="secondary-action danger-action" type="button" onClick={() => completeSubmitVerify(item, false)}>Đánh dấu gửi thất bại</button>}
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {captchaBridgePayload && (
                  <div className="bridge-preview">
                    <div>
                      <p className="eyebrow">CẦU NỐI TRÌNH DUYỆT / TIỆN ÍCH</p>
                      <strong>{captchaBridgePayload.platformName}</strong>
                      <span>{captchaBridgePayload.action} → {captchaBridgePayload.nextStep}</span>
                    </div>
                    <code>{captchaBridgePayload.tokenField}: {maskToken(captchaBridgePayload.solutionToken)}</code>
                    <p className="muted-text">Tiện ích trình duyệt có thể lấy dữ liệu tại http://127.0.0.1:17321/captcha/injection/next. Chỉ dùng JSON thủ công để kiểm thử dự phòng.</p>
                    <textarea aria-label="Dữ liệu cầu nối CAPTCHA" readOnly rows={7} value={JSON.stringify(captchaBridgePayload, null, 2)} />
                    <div className="queue-actions">
                      <button className="secondary-action" type="button" onClick={() => completeCaptchaInjection(true)}>Đánh dấu đã gửi</button>
                      <button className="secondary-action danger-action" type="button" onClick={() => completeCaptchaInjection(false)}>Đánh dấu thất bại</button>
                    </div>
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">LỊCH SỬ QUY TRÌNH</p>
                    <h2>Hoạt động tài khoản gần đây</h2>
                  </div>
                  <span className="badge">{workflowRuns.length} sự kiện</span>
                </div>

                {workflowRuns.length === 0 ? (
                  <div className="empty-state"><strong>Chưa có hoạt động nào.</strong><p>Hoạt động sẽ được ghi lại sau khi bạn lưu bản ghi hoặc cập nhật trạng thái.</p></div>
                ) : (
                  <div className="workflow-history">
                    {workflowRuns.slice(0, 12).map((run) => (
                      <div className="history-row" key={run.id}>
                        <div>
                          <strong>{run.platformName}</strong>
                          <span>{run.action} / {run.message}</span>
                        </div>
                        <em>{run.status}</em>
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </section>
            )}
          </section>
        )}

        {activeModule === "Entity Care" && (
          <section className="single-panel">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Entity Care</p>
                  <h2>Entity health and maintenance checklist</h2>
                  <p className="muted-text">A practical review of saved local records. Checks indicate completeness, not external rankings or verification.</p>
                </div>
                <span className="badge">{[
                  entityProfile.brandName,
                  entityProfile.shortDescription,
                  entityProfile.fullDescription,
                  entityProfile.authorName,
                  entityProfile.expertiseProof,
                  entityProfile.trustSignals
                ].filter((v) => v.trim()).length}/6 profile signals</span>
              </div>

              <div className="metrics-grid">
                <article className="metric-card good">
                  <span>Profile signals present</span>
                  <strong>{[entityProfile.brandName, entityProfile.shortDescription, entityProfile.fullDescription, entityProfile.authorName, entityProfile.expertiseProof, entityProfile.trustSignals].filter((v) => v.trim()).length}/6</strong>
                </article>
                <article className="metric-card neutral">
                  <span>Platform targets</span>
                  <strong>{platforms.length}</strong>
                </article>
                <article className="metric-card good">
                  <span>Evidence verified by you</span>
                  <strong>{evidenceRecords.filter((v) => v.status === "verified").length}</strong>
                </article>
                <article className="metric-card warning">
                  <span>Items needing review</span>
                  <strong>{evidenceRecords.filter((v) => v.status !== "verified").length + [entityProfile.brandName, entityProfile.shortDescription, entityProfile.fullDescription, entityProfile.authorName, entityProfile.expertiseProof, entityProfile.trustSignals].filter((v) => !v.trim()).length}</strong>
                </article>
              </div>

              <div className="panel-header">
                <div>
                  <p className="eyebrow">Maintenance checks</p>
                  <h2>Recommended next actions</h2>
                </div>
              </div>
              <div className="data-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Check</th><th>Current state</th><th>Recommendation</th><th>Action</th></tr></thead>
                  <tbody>
                    <tr>
                      <td>Brand identity</td>
                      <td>{entityProfile.brandName.trim() && entityProfile.shortDescription.trim() ? "Basic details present" : "Missing basic details"}</td>
                      <td>Keep the brand name and short description consistent across profiles.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Entity Profile")}>Review profile</button></td>
                    </tr>
                    <tr>
                      <td>Full description</td>
                      <td>{entityProfile.fullDescription.trim() ? "Present" : "Missing"}</td>
                      <td>Add a clear, factual description of the organization, service, or project.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Entity Profile")}>Complete</button></td>
                    </tr>
                    <tr>
                      <td>Expertise and author</td>
                      <td>{entityProfile.authorName.trim() && entityProfile.expertiseProof.trim() ? "Author and proof present" : "Needs attention"}</td>
                      <td>Add an accurate author identity and first-hand work, credentials, or case-study evidence.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Entity Profile")}>Review expertise</button></td>
                    </tr>
                    <tr>
                      <td>Trust signals</td>
                      <td>{entityProfile.trustSignals.trim() ? "Present in profile" : "Missing"}</td>
                      <td>Document appropriate ownership, contact, and trust information.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Entity Profile")}>Review trust</button></td>
                    </tr>
                    <tr>
                      <td>Supporting evidence</td>
                      <td>{evidenceRecords.length} saved / {evidenceRecords.filter((v) => v.status === "verified").length} marked verified</td>
                      <td>Save source URLs and only mark evidence verified after you personally review it.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Evidence Bank")}>Open Evidence Bank</button></td>
                    </tr>
                    <tr>
                      <td>Platform coverage</td>
                      <td>{platforms.length} platforms / {accounts.length} account records</td>
                      <td>Prioritize relevant platforms and track only accounts you actually control.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Platform Library")}>Review platforms</button></td>
                    </tr>
                    <tr>
                      <td>Money-site consistency</td>
                      <td>{moneySite.domain ? moneySite.domain : "No domain recorded"}</td>
                      <td>Check that public profiles link to the correct official website and consistent brand details.</td>
                      <td><button className="secondary-action" type="button" onClick={() => setActiveModule("Money Sites")}>Review money site</button></td>
                    </tr>
                  </tbody>
                </table>
              </div>
              <p className="muted-text">Entity Care uses data already stored in this desktop app. It does not crawl the web, monitor external sites in the background, or independently confirm that profile details are true.</p>
            </article>
          </section>
        )}

        {activeModule === "EEAT Planner" && (
          <section className="single-panel"><article className="panel">
            <div className="panel-header"><div><p className="eyebrow">EEAT Planner</p><h2>Readiness from saved local records</h2></div><span className="badge">Local data</span></div>
            <div className="metrics-grid">
              <article className="metric-card good"><span>Profile fields present</span><strong>{[entityProfile.brandName, entityProfile.shortDescription, entityProfile.fullDescription, entityProfile.authorName, entityProfile.expertiseProof, entityProfile.trustSignals].filter((v) => v.trim()).length}/6</strong></article>
              <article className="metric-card neutral"><span>Platforms</span><strong>{platforms.length}</strong></article>
              <article className="metric-card neutral"><span>Evidence records</span><strong>{evidenceRecords.length}</strong></article>
              <article className="metric-card warning"><span>Evidence needs review</span><strong>{evidenceRecords.filter((v) => v.status !== "verified").length}</strong></article>
            </div><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Signal</th><th>Saved source</th><th>Status</th><th>Next step</th></tr></thead><tbody>
              <tr><td>Experience</td><td>Evidence Bank / Expertise proof</td><td>{entityProfile.expertiseProof.trim() ? "Profile data present" : "Missing"}</td><td>Add first-hand case studies or project evidence.</td></tr>
              <tr><td>Expertise</td><td>{entityProfile.authorName || "Author not set"}</td><td>{entityProfile.authorName.trim() && entityProfile.topicalNiche.trim() ? "Profile data present" : "Needs profile data"}</td><td>Complete author and topical niche in Entity Profile.</td></tr>
              <tr><td>Authoritativeness</td><td>{platforms.filter((v) => v.authorityScore >= 80).length} platforms with authority ≥ 80</td><td>{platforms.length ? "Catalog available" : "No platforms"}</td><td>Prioritize relevant platforms and add evidence URLs.</td></tr>
              <tr><td>Trust</td><td>{entityProfile.trustSignals || "Trust signals not set"}</td><td>{entityProfile.trustSignals.trim() ? "Profile data present" : "Missing"}</td><td>Complete contact and ownership details.</td></tr>
            </tbody></table></div><p className="muted-text">These are completeness indicators for local records, not a Google ranking or independent EEAT score.</p><button className="secondary-action" type="button" onClick={() => setActiveModule("Entity Profile")}>Complete Entity Profile</button>
          </article></section>
        )}

        {activeModule === "Entity Graph" && (
          <section className="single-panel"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Entity Graph</p><h2>Relationships from saved records</h2></div><span className="badge">{1 + platforms.length + accounts.length + evidenceRecords.length} nodes</span></div>
            <div className="graph-root"><strong>{entityProfile.brandName || "Unnamed entity"}</strong><span>Primary entity · {entityProfile.profileType}</span><small>{moneySite.domain}</small></div>
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>From</th><th>Relationship</th><th>To</th><th>Status</th></tr></thead><tbody>
              <tr><td>{entityProfile.brandName}</td><td>owns / represents</td><td>{moneySite.domain}</td><td>Money-site record</td></tr>
              {platforms.map((v) => <tr key={v.id}><td>{entityProfile.brandName}</td><td>has profile target</td><td>{v.name}</td><td>{accounts.some((a) => a.platformId === v.id) ? "Account record exists" : "Planning only"}</td></tr>)}
              {accounts.map((v) => <tr key={v.id}><td>{v.platformName}</td><td>account on</td><td>{v.recommendedUsername}</td><td>{v.status}</td></tr>)}
              {evidenceRecords.map((v) => <tr key={v.id}><td>{platforms.find((p) => p.id === v.relatedPlatformId)?.name || entityProfile.brandName}</td><td>supported by evidence</td><td><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a></td><td>{v.status}</td></tr>)}
            </tbody></table></div><p className="muted-text">Relationships are shown as a table in this version; no external identity graph has been queried.</p>
          </article></section>
        )}

        {activeModule === "Evidence Bank" && (
          <section className="single-panel"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Evidence Bank</p><h2>Source records supporting entity claims</h2></div><span className="badge">{evidenceRecords.length} records</span></div>
            <form className="form-grid evidence-form" onSubmit={async (event) => { event.preventDefault(); if (!evidenceDraft.title.trim() || !evidenceDraft.url.trim()) return; const record: EvidenceRecord = { ...evidenceDraft, id: "evidence-" + Date.now(), createdAt: new Date().toISOString() }; try { const saved = await invoke<EvidenceRecord>("save_evidence_record", { record }); setEvidenceRecords((current) => [saved, ...current.filter((v) => v.id !== saved.id)]); setEvidenceDraft({ title: "", evidenceType: "profile", url: "", relatedPlatformId: "", notes: "", status: "needs_review" }); setStatusMessage("Evidence saved to local SQLite."); } catch (error) { setStatusMessage("Could not save evidence: " + String(error)); } }}>
              <label>Evidence title<input required value={evidenceDraft.title} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, title: e.target.value })} placeholder="Official company profile" /></label>
              <label>Evidence type<select value={evidenceDraft.evidenceType} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, evidenceType: e.target.value })}><option value="profile">Profile</option><option value="case_study">Case study</option><option value="press">Press / media</option><option value="credential">Credential</option><option value="contact">Contact / NAP</option><option value="other">Other</option></select></label>
              <label>Source URL<input required type="url" value={evidenceDraft.url} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, url: e.target.value })} placeholder="https://..." /></label>
              <label>Related platform<select value={evidenceDraft.relatedPlatformId} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, relatedPlatformId: e.target.value })}><option value="">Primary entity / general</option>{platforms.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
              <label>Review status<select value={evidenceDraft.status} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, status: e.target.value })}><option value="needs_review">Needs review</option><option value="verified">Verified by me</option><option value="rejected">Rejected</option></select></label>
              <label className="full-span">Notes<textarea rows={2} value={evidenceDraft.notes} onChange={(e) => setEvidenceDraft({ ...evidenceDraft, notes: e.target.value })} placeholder="What does this source support?" /></label><div><button className="primary-action" type="submit">Save Evidence</button></div>
            </form><div className="data-table-wrap"><table className="data-table"><thead><tr><th>Title</th><th>Type</th><th>Platform</th><th>Status</th><th>Added</th></tr></thead><tbody>
              {evidenceRecords.map((v) => <tr key={v.id}><td><a href={v.url} target="_blank" rel="noreferrer">{v.title}</a><small>{v.notes}</small></td><td>{v.evidenceType.replace("_", " ")}</td><td>{platforms.find((p) => p.id === v.relatedPlatformId)?.name || "Primary entity"}</td><td>{v.status.replace("_", " ")}</td><td>{new Date(v.createdAt).toLocaleDateString()}</td></tr>)}
              {!evidenceRecords.length && <tr><td colSpan={5}>No evidence records yet. Add a source above; records are saved locally.</td></tr>}
            </tbody></table></div>
          </article></section>
        )}

        {activeModule === "Reports" && (
          <section className="single-panel"><article className="panel"><div className="panel-header"><div><p className="eyebrow">Reports</p><h2>Snapshot of local project data</h2></div><button className="primary-action" type="button" onClick={() => { const rows = [["Platform","Authority","Difficulty","Automation","Accounts","Evidence","Dry-run records"], ...platforms.map((p) => [p.name,String(p.authorityScore),p.difficulty,p.automationMode,String(accounts.filter((a) => a.platformId === p.id).length),String(evidenceRecords.filter((e) => e.relatedPlatformId === p.id).length),String(dryRunHistory.filter((d) => d.platformId === p.id).length)])]; const csv = rows.map((row) => row.map((cell) => String(cell).replace(/"/g, '""')).map((cell) => '"' + cell + '"').join(",")).join("\r\n"); const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" })); const anchor = document.createElement("a"); anchor.href = url; anchor.download = "entitymanager-report.csv"; anchor.click(); URL.revokeObjectURL(url); }}>Export CSV</button></div>
            <div className="metrics-grid"><article className="metric-card good"><span>Platforms</span><strong>{platforms.length}</strong></article><article className="metric-card neutral"><span>Accounts</span><strong>{accounts.length}</strong></article><article className="metric-card neutral"><span>Evidence</span><strong>{evidenceRecords.length}</strong></article><article className="metric-card warning"><span>Dry-run checks</span><strong>{dryRunHistory.length}</strong></article></div>
            <div className="data-table-wrap"><table className="data-table"><thead><tr><th>Platform</th><th>Authority</th><th>Accounts</th><th>Evidence</th><th>Dry-run</th></tr></thead><tbody>{platforms.map((p) => <tr key={p.id}><td>{p.name}</td><td>{p.authorityScore}</td><td>{accounts.filter((a) => a.platformId === p.id).length}</td><td>{evidenceRecords.filter((e) => e.relatedPlatformId === p.id).length}</td><td>{dryRunHistory.filter((d) => d.platformId === p.id).length}</td></tr>)}</tbody></table></div>
            <p className="muted-text">Counts reflect local records. CSV does not claim external ranking or performance.</p>
          </article></section>
        )}

        {activeModule === "API Integrations" && (
          <section className="single-panel"><article className="panel"><div className="panel-header"><div><p className="eyebrow">API Integrations</p><h2>Provider configuration and test status</h2></div><button className="secondary-action" type="button" onClick={() => setActiveModule("Settings")}>Open full settings</button></div>
            <div className="settings-grid">{settings.map((v) => <div className="setting-card" key={v.settingType}><h3>{v.provider}</h3><div className="platform-meta"><span>{v.settingType}</span><span>{v.isEnabled ? "enabled" : "disabled"}</span><span>{v.keyStatus}</span></div><p className="platform-notes">{adapterResults[v.settingType]?.message || (v.lastTestAt ? "Last tested " + new Date(v.lastTestAt).toLocaleString() : "Not tested yet")}</p><div className="settings-actions"><button className="secondary-action" type="button" onClick={() => testSetting(v)}>Dry-run Test</button><button className="secondary-action" type="button" onClick={() => setActiveModule("Settings")}>Configure</button></div></div>)}</div>
            <p className="muted-text">Provider status comes from local configuration; dry-run does not guarantee live API access.</p>
          </article></section>
        )}
        {activeModule === "Settings" && (
          <section className="single-panel">
            <article className="panel form-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>Encrypted provider keys and live adapter tests</h2>
              </div>
            </div>
            <div className="setting-card gmail-oauth-card">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Gmail verification</p>
                  <h3>Google OAuth · Medium email worker</h3>
                </div>
                <span className={`badge ${gmailOAuth.connected ? "good" : "warning"}`}>{gmailOAuth.connected ? "Connected" : gmailOAuth.configured ? "configured" : "thiếu Client Secret"}</span>
              </div>
              <p className="platform-notes">OAuth không lưu mật khẩu Gmail. Trang cấp quyền luôn mở bằng Chrome/Edge mặc định của Windows vì Google chặn đăng nhập trong Chrome for Testing. Anh chấp thuận quyền đọc một lần; refresh token được giữ trong Windows Credential Manager và worker kiểm tra email Medium mỗi 20 giây.</p>
              <label className="oauth-file-import">
                <span>Nhập nhanh file OAuth JSON tải từ Google Cloud</span>
                <input type="file" accept="application/json,.json" onChange={(event) => {
                  void importGmailOAuthJson(event.currentTarget.files?.[0]);
                  event.currentTarget.value = "";
                }} />
                <small>Tool chỉ đọc client_id/client_secret rồi lưu secret vào Windows Credential Manager; không lưu lại file JSON.</small>
              </label>
              <div className="settings-grid">
                <label>
                  Google OAuth Client ID
                  <input value={gmailOAuthDraft.clientId} placeholder="...apps.googleusercontent.com" onChange={(event) => setGmailOAuthDraft((current) => ({ ...current, clientId: event.target.value }))} />
                </label>
                <label>
                  Google OAuth Client Secret
                  <input type="password" value={gmailOAuthDraft.clientSecret} placeholder={gmailOAuth.configured ? "Đã lưu an toàn — để trống nếu không đổi" : "Nhập client secret lần đầu"} onChange={(event) => setGmailOAuthDraft((current) => ({ ...current, clientSecret: event.target.value }))} />
                </label>
              </div>
              <div className="platform-meta">
                <span>{gmailOAuth.accountEmail || "Chưa có Gmail được cấp quyền"}</span>
                <span>{gmailOAuth.lastCheckedAt ? `checked ${new Date(Number(gmailOAuth.lastCheckedAt) * 1000).toLocaleString("vi-VN")}` : "chưa kiểm tra email"}</span>
              </div>
              <p className="platform-notes">{gmailOAuth.lastMessage}</p>
              <div className="status-message" role="status">
                <strong>Thứ tự hoạt động bắt buộc</strong>
                <span>1) Lưu JSON → 2) Kết nối và hoàn tất trang Google → 3) Kiểm tra Gmail API → 4) Chạy campaign Medium → 5) Kiểm tra email Medium. Nút Medium không tạo email; nó chỉ xử lý checkpoint đang chờ.</span>
              </div>
              {gmailActionMessage && <div className={`status-message ${gmailOAuth.connected ? "success" : gmailOAuth.status === "error" ? "warning" : ""}`} role="status"><strong>Tiến trình Gmail OAuth</strong><span>{gmailActionMessage}</span></div>}
              <div className="settings-actions">
                <button className="secondary-action" type="button" onClick={() => void saveGmailOAuthConfig()}>1. Lưu OAuth</button>
                <button className="primary-action" type="button" disabled={Boolean(gmailActionRunning)} onClick={() => void connectGmailOAuth()}>{gmailActionRunning === "oauth" ? "Đang mở Google..." : "2. Kết nối Gmail"}</button>
                {gmailOAuth.authorizationUrl && <button className="secondary-action" type="button" onClick={() => void openGmailAuthorizationPage()}>Mở trang Google OAuth</button>}
                <button className="secondary-action" type="button" onClick={() => void refreshGmailOAuthStatus()}>Làm mới trạng thái</button>
                <button className="secondary-action" type="button" disabled={Boolean(gmailActionRunning)} onClick={() => void testGmailConnection()}>{gmailActionRunning === "test" ? "Đang kiểm tra Gmail..." : "3. Kiểm tra Gmail API"}</button>
                <button className="secondary-action" type="button" disabled={Boolean(gmailActionRunning)} onClick={() => void checkMediumVerificationNow()}>{gmailActionRunning === "medium" ? "Đang kiểm tra Medium..." : "5. Kiểm tra Medium ngay"}</button>
              </div>
              {gmailOAuth.authorizationUrl && <details><summary>URL OAuth dự phòng</summary><textarea readOnly rows={4} value={gmailOAuth.authorizationUrl} onFocus={(event) => event.currentTarget.select()} /></details>}
            </div>
            <div className="setting-card">
              <div className="panel-header">
                <div><p className="eyebrow">Managed Browser Control Center</p><h3>Điều khiển Chromium tập trung</h3></div>
                <span className="badge">{browserSessions.filter((session) => session.status === "running").length} running</span>
              </div>
              <p className="platform-notes">Chromium chạy bằng profile riêng và có thể ẩn trong khi worker tiếp tục. Managed Chromium dùng cho Medium và các platform; riêng Google OAuth luôn mở bằng trình duyệt Windows thông thường để tránh lỗi “browser or app may not be secure”.</p>
              <div className="settings-actions">
                <button className="primary-action" type="button" onClick={() => void launchBrowserControl(true)}>Mở Chromium quản lý</button>
                <button className="secondary-action" type="button" onClick={() => void launchBrowserControl(false)}>Khởi chạy ẩn</button>
                <button className="secondary-action" type="button" onClick={() => void setAllBrowserVisibility(true)}>Hiện tất cả</button>
                <button className="secondary-action" type="button" onClick={() => void setAllBrowserVisibility(false)}>Ẩn tất cả</button>
              </div>
              <div className="browser-session-list">
                {browserSessions.filter((session) => session.status === "running").length === 0 && <p className="muted-text">Chưa có Chromium nào đang chạy.</p>}
                {browserSessions.filter((session) => session.status === "running").map((session) => (
                  <div className="browser-session-row" key={session.id}>
                    <div><strong>{session.platformId}</strong><span>{session.visibility} · PID {session.processId}</span><small>{session.currentUrl}</small></div>
                    <div className="session-actions">
                      <button className="secondary-action" type="button" onClick={() => void setBrowserVisibility(session.id, session.visibility !== "visible")}>{session.visibility === "visible" ? "Ẩn" : "Hiện"}</button>
                      <button className="secondary-action" type="button" onClick={() => void stopBrowser(session.id)}>Dừng</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="setting-card">
              <div className="panel-header">
                <div><p className="eyebrow">Persistent Identity Storage</p><h3>Browser Identity & dung lượng</h3></div>
                <span className={`badge ${browserStorage?.safetyStatus === "healthy" ? "good" : "warning"}`}>{browserStorage?.safetyStatus ?? "loading"}</span>
              </div>
              <p className="platform-notes">Một identity dùng chung phiên đăng nhập cho các platform của cùng entity. Tool giữ cookie/Local Storage để chăm sóc lâu dài; không tạo một profile Chromium mới cho từng platform.</p>
              {browserStorage && <>
                <div className="settings-grid">
                  <label>Trần tổng dung lượng (GB)<input type="number" min="10" step="10" defaultValue={Math.round(browserStorage.policy.maxTotalBytes / 1024 ** 3)} onBlur={(event) => void saveStorageLimit(Number(event.currentTarget.value))} /></label>
                  <label>Dự phòng ổ đĩa tối thiểu<input readOnly value={`${formatStorage(browserStorage.policy.minFreeBytes)} hoặc ${browserStorage.policy.minFreePercent}%`} /></label>
                  <label>Đang dùng<input readOnly value={`${formatStorage(browserStorage.totalProfileBytes)} / ${formatStorage(browserStorage.policy.maxTotalBytes)}`} /></label>
                  <label>Ổ đĩa còn trống<input readOnly value={`${formatStorage(browserStorage.freeDiskBytes)} / ${formatStorage(browserStorage.diskCapacityBytes)}`} /></label>
                </div>
                <p className="platform-notes">{browserStorage.message}</p>
                <div className="settings-actions"><button className="secondary-action" type="button" disabled={Boolean(storageBusy)} onClick={() => void refreshBrowserStorage()}>{storageBusy === "refresh" ? "Đang đo..." : "Đo lại dung lượng"}</button></div>
                <div className="browser-session-list">
                  {browserStorage.identities.map((identity) => <div className="browser-session-row" key={identity.id}>
                    <div><strong>{identity.name} {identity.isPinned ? "· pinned" : ""}</strong><span>{identity.status} · {formatStorage(identity.sizeBytes)} · giữ {identity.retentionDays} ngày</span><small>{identity.email || identity.id}</small></div>
                    <div className="session-actions">
                      {identity.status === "archived" ? <button className="secondary-action" type="button" disabled={Boolean(storageBusy)} onClick={() => void maintainBrowserIdentity("restore_browser_identity", identity.id)}>Khôi phục</button> : <>
                        <button className="secondary-action" type="button" disabled={Boolean(storageBusy)} onClick={() => void maintainBrowserIdentity("cleanup_browser_identity", identity.id)}>Dọn cache</button>
                        <button className="secondary-action" type="button" disabled={Boolean(storageBusy) || identity.isPinned} title={identity.isPinned ? "Identity chính đang được ghim để tránh archive nhầm" : "Nén profile khi dự án tạm nghỉ"} onClick={() => void maintainBrowserIdentity("archive_browser_identity", identity.id)}>Archive</button>
                      </>}
                    </div>
                  </div>)}
                </div>
              </>}
            </div>
            <div className="setting-card">
              <div className="panel-header"><div><p className="eyebrow">System Diagnostics</p><h3>Kiểm tra nền tảng tự động hóa</h3></div><button className="secondary-action" type="button" disabled={diagnosticsRunning} onClick={() => void runSystemDiagnostics()}>{diagnosticsRunning ? "Đang kiểm tra..." : "Chạy kiểm tra toàn bộ"}</button></div>
              <p className="platform-notes">Kiểm tra SQLite, Bridge, extension đóng gói, Chromium, Credential Manager, Gmail OAuth, browser session, Medium checkpoint và Indexing Queue. Các dịch vụ bên ngoài chưa có chiến dịch/live key sẽ được ghi “not tested”, không báo thành công giả.</p>
              {systemDiagnostics.length > 0 && <div className="browser-session-list">{systemDiagnostics.map((check) => <div className="browser-session-row" key={check.id}><div><strong>{check.label}</strong><span>{check.status}</span><small>{check.message}</small></div></div>)}</div>}
            </div>
            <div className="settings-grid">
              {settings.map((setting) => (
                <div className="setting-card" key={setting.settingType}>
                  <label>
                    Provider
                    <input value={setting.provider} onChange={(event) => updateSetting(setting.settingType, { provider: event.target.value })} />
                  </label>
                  <label>
                    Secret Key
                    <input
                      type="password"
                      value={setting.keyStatus === "masked" || setting.keyStatus === "secure" ? "" : setting.apiKey}
                      placeholder={setting.keyStatus === "masked" || setting.keyStatus === "secure" ? `Stored securely as ${setting.apiKey}` : `${setting.settingType} API key`}
                      onChange={(event) => updateSetting(setting.settingType, { apiKey: event.target.value })}
                    />
                  </label>
                  <div className="platform-meta">
                    <span>{setting.settingType}</span>
                    <span>{setting.keyStatus}</span>
                    <span>{setting.lastTestAt ? `tested ${new Date(setting.lastTestAt).toLocaleString()}` : "not tested"}</span>
                  </div>
                  {adapterResults[setting.settingType] && (
                    <p className="platform-notes">{adapterResults[setting.settingType].message}</p>
                  )}
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={setting.isEnabled}
                      onChange={(event) => updateSetting(setting.settingType, { isEnabled: event.target.checked })}
                    />
                    Enable {setting.settingType}
                  </label>
                  <div className="settings-actions">
                    <button className="secondary-action" type="button" onClick={() => saveSetting(setting)}>Save</button>
                    <button className="secondary-action" type="button" onClick={() => testSetting(setting)}>Dry-run Test</button>
                    <button className="secondary-action" type="button" onClick={() => testLiveSetting(setting)}>Live Test</button>
                  </div>
                </div>
              ))}
            </div>
          </article>
          </section>
        )}
      </section>
    </main>
  );
}

function buildProfileAngle(platform: PlatformLibraryRecord, profile: EntityProfileRecord): string {
  if (platform.entityValue === "author") {
    return `Position ${profile.authorName || profile.founderName} as the expert voice for ${profile.topicalNiche}.`;
  }

  if (platform.entityValue === "local") {
    return `Reinforce NAP consistency for ${profile.brandName} using address, phone, and official website data.`;
  }

  if (platform.entityValue === "media") {
    return `Use branded visuals and proof assets to make ${profile.brandName} recognizable across media platforms.`;
  }

  if (platform.entityValue === "authority") {
    return `Build high-trust authority proof around ${profile.legalName || profile.brandName} with clear ownership and expertise signals.`;
  }

  return `Create a consistent ${profile.profileType} profile for ${profile.brandName} and connect it back to the money site.`;
}

function requiredAssetsForPlatform(platform: PlatformLibraryRecord): string[] {
  const assets = ["brand bio", "logo"];

  if (platform.entityValue === "author") {
    assets.push("author bio");
  }

  if (platform.entityValue === "local") {
    assets.push("NAP");
  }

  if (["media", "video", "audio", "portfolio"].includes(platform.type)) {
    assets.push("media asset");
  }

  return assets;
}

function workflowStepsForPlatform(platform: PlatformLibraryRecord): string[] {
  const steps = ["Prepare profile data", "Create or review account", "Add brand/EEAT details", "Attach evidence URL"];

  if (platform.requiresCaptcha) {
    steps.splice(2, 0, "Solve CAPTCHA/manual gate");
  }

  if (platform.automationMode === "manual_review") {
    steps.push("Manual QA before publishing");
  }

  return steps;
}

function upsertById<T extends { id: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.id === next.id);

  if (!exists) {
    return [next, ...items];
  }

  return items.map((item) => (item.id === next.id ? next : item));
}

function upsertByPlatformId<T extends { platformId: string }>(items: T[], next: T): T[] {
  const exists = items.some((item) => item.platformId === next.platformId);

  if (!exists) {
    return [next, ...items];
  }

  return items.map((item) => (item.platformId === next.platformId ? next : item));
}

function maskToken(token: string): string {
  if (token.length <= 12) {
    return "stored token";
  }

  return `${token.slice(0, 6)}...${token.slice(-6)}`;
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
