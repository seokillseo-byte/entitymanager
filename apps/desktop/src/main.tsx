import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, Brain, Database, Download, FileCheck2, GitBranch, Globe2, KeyRound, LayoutDashboard, Library, Puzzle, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildProviderConfig, testIntegrationAdapter } from "@entitymanager/integrations";
import { calculateEntityReadiness } from "@entitymanager/shared";
import type { AccountCreationPlanItem, AccountPlanPriority, AccountRecord, AccountStatus, AccountSubmitVerifyResult, AutomationGateType, AutomationQueueItem, AutomationQueueStatus, AutomationMode, CaptchaInjectionPayload, CaptchaInjectionResult, DashboardMetric, EntityModule, EntityProfileRecord, IntegrationAdapterResult, IntegrationType, PlatformDifficulty, PlatformLibraryRecord, PlatformType, ProviderKeyStatus, SelectorRecipeRecord, DryRunHistoryRecord, WorkflowRunRecord, WorkflowRunStatus } from "@entitymanager/shared";
import { demoEntityProfileSeed, demoProjectSeed, platformLibrarySeed } from "@entitymanager/shared/seed";
import { createWorkflowTask, WORKFLOW_STATUSES } from "@entitymanager/workflow";
import { calculateSelectorHealthTrends, normalizeDryRunHistoryRecord } from "./selectorHealth.mjs";
import "./styles.css";

const modules: EntityModule[] = [
  "Overview",
  "Money Sites",
  "Entity Profile",
  "Entity Builder",
  "Entity Care",
  "EEAT Planner",
  "Entity Graph",
  "Evidence Bank",
  "Platform Library",
  "Selector Recipes",
  "API Integrations",
  "Reports",
  "Settings"
];

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

type PlatformTypeFilter = "all" | PlatformType;
type AutomationModeFilter = "all" | AutomationMode;
type DifficultyFilter = "all" | PlatformDifficulty;
interface EvidenceRecord { id: string; title: string; evidenceType: string; url: string; relatedPlatformId: string; notes: string; status: string; createdAt: string; }
type PlatformViewMode = "compact" | "table";

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

type ReleaseAsset = { name: string; browser_download_url: string; size: number };
type LatestRelease = { name: string; tag_name: string; html_url: string; published_at: string; assets: ReleaseAsset[] };

function App() {
  const [activeModule, setActiveModule] = useState<EntityModule>("Overview");
  const [moneySite, setMoneySite] = useState<MoneySiteForm>(fallbackMoneySite);
  const [settings, setSettings] = useState<IntegrationSettingForm[]>(fallbackSettings);
  const [platforms, setPlatforms] = useState<PlatformLibraryRecord[]>(fallbackPlatforms);
  const [selectorRecipes, setSelectorRecipes] = useState<SelectorRecipeRecord[]>([]);
  const [dryRunHistory, setDryRunHistory] = useState<DryRunHistoryRecord[]>([]);
  const [evidenceRecords, setEvidenceRecords] = useState<EvidenceRecord[]>([]);
  const [evidenceDraft, setEvidenceDraft] = useState<Omit<EvidenceRecord, "id" | "createdAt">>({ title: "", evidenceType: "profile", url: "", relatedPlatformId: "", notes: "", status: "needs_review" });
  const [recipeImportJson, setRecipeImportJson] = useState("");
  const [recipeImportMessage, setRecipeImportMessage] = useState("");
  const [entityProfile, setEntityProfile] = useState<EntityProfileRecord>(fallbackEntityProfile);
  const [accounts, setAccounts] = useState<AccountRecord[]>([]);
  const [workflowRuns, setWorkflowRuns] = useState<WorkflowRunRecord[]>([]);
  const [automationQueue, setAutomationQueue] = useState<AutomationQueueItem[]>([]);
  const [captchaBridgePayload, setCaptchaBridgePayload] = useState<CaptchaInjectionPayload | null>(null);
  const [adapterResults, setAdapterResults] = useState<Record<string, IntegrationAdapterResult>>({});
  const [platformTypeFilter, setPlatformTypeFilter] = useState<PlatformTypeFilter>("all");
  const [automationModeFilter, setAutomationModeFilter] = useState<AutomationModeFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [platformViewMode, setPlatformViewMode] = useState<PlatformViewMode>("compact");
  const [statusMessage, setStatusMessage] = useState("SQLite local data ready");
  const [latestRelease, setLatestRelease] = useState<LatestRelease | null>(null);

  useEffect(() => {
    void loadLocalData();
    void startExtensionBridge();
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetch("https://api.github.com/repos/seokillseo-byte/entitymanager/releases/latest", {
      headers: { Accept: "application/vnd.github+json" },
    })
      .then((response) => {
        if (!response.ok) throw new Error(`GitHub API returned ${response.status}`);
        return response.json() as Promise<LatestRelease>;
      })
      .then((release) => {
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

  async function loadLocalData() {
    try {
      const [storedMoneySite, storedSettings, storedPlatforms, storedRecipes, storedEntityProfile, storedAccounts, storedRuns, storedQueue, storedDryRunHistory, storedEvidence] = await Promise.all([
        invoke<MoneySiteForm>("get_money_site"),
        invoke<IntegrationSettingForm[]>("get_integration_settings"),
        invoke<PlatformLibraryRecord[]>("get_platforms"),
        invoke<SelectorRecipeRecord[]>("get_selector_recipes"),
        invoke<EntityProfileRecord>("get_entity_profile"),
        invoke<AccountRecord[]>("get_accounts"),
        invoke<WorkflowRunRecord[]>("get_workflow_runs"),
        invoke<AutomationQueueItem[]>("get_automation_queue"),
        invoke<DryRunHistoryRecord[]>("get_dry_run_history"),
        invoke<EvidenceRecord[]>("get_evidence_records")
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
      setEvidenceRecords(storedEvidence);
      setStatusMessage("Loaded from local SQLite");
    } catch {
      setStatusMessage("Preview mode using seed data");
    }
  }

  async function startExtensionBridge() {
    try {
      const message = await invoke<string>("start_extension_bridge_server");
      setStatusMessage(message);
    } catch {
      setStatusMessage("Preview mode: Extension bridge server is not running.");
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

  function exportSelectorRecipes() {
    const blob = new Blob([JSON.stringify({ schemaVersion: 1, exportedAt: new Date().toISOString(), recipes: selectorRecipes }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url; anchor.download = "entitymanager-selector-recipes.json"; anchor.click();
    URL.revokeObjectURL(url);
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

  async function refreshDryRunHistory() {
    try {
      const records = await invoke<DryRunHistoryRecord[]>("get_dry_run_history");
      setDryRunHistory(records.map((record, index) => normalizeDryRunHistoryRecord(record, index)));
      setStatusMessage(`Loaded ${records.length} dry-run history records`);
    } catch {
      setStatusMessage("Could not refresh dry-run history outside the Desktop app.");
    }
  }

  function draftRecipeSuggestions(platformId: string) {
    const recipe = selectorRecipes.find((item) => item.platformId === platformId);
    const failedRuns = dryRunHistory.filter((item) => item.platformId === platformId && (item.missingChecks.length > 0 || !item.plannedSelector || item.plannedFields.length === 0));
    if (!recipe || !failedRuns.length) {
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

    const fallbackSelectors: Record<string, string[]> = {
      username: ['input[name="username"]', "input#username", 'input[autocomplete="username"]'],
      email: ['input[type="email"]', 'input[name="email"]', "input#email"],
      displayName: ['input[name="displayName"]', 'input[name="name"]', "input#displayName"],
      bio: ['textarea[name="bio"]', "textarea#bio", "textarea"],
      websiteUrl: ['input[type="url"]', 'input[name="website"]', 'input[name="url"]']
    };
    const fieldKeyMap: Record<string, string> = {
      username: "username", email: "email", displayName: "displayName", bio: "bio",
      websiteUrl: "websiteUrl", display_name: "displayName", website_url: "websiteUrl"
    };
    const submitSelectors = recipe.submitSelectors.split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
    let fieldSuggestions = 0;
    let needsSubmitSuggestion = false;

    for (const run of failedRuns) {
      const issues = [...run.missingChecks];
      if (!run.plannedSelector) issues.push("submitButton");
      if (!run.plannedFields.length) issues.push("noPlannedFields");
      for (const issue of issues) {
        if (issue === "submitButton") {
          needsSubmitSuggestion = true;
          continue;
        }
        const [rawField, problem] = issue.split(":");
        if (problem !== "selector" && problem !== undefined) continue;
        const field = fieldKeyMap[rawField];
        if (!field || !fallbackSelectors[field]) continue;
        const current = Array.isArray(selectors[field]) ? (selectors[field] as unknown[]).filter((value): value is string => typeof value === "string") : [];
        const additions = fallbackSelectors[field].filter((candidate) => !current.includes(candidate));
        if (additions.length) {
          selectors[field] = [...current, ...additions];
          fieldSuggestions += additions.length;
        }
      }
    }

    const nextSubmitSelectors = needsSubmitSuggestion
      ? [...new Set([...submitSelectors, "button[type='submit']", "input[type='submit']", "button[name='submit']"])]
      : submitSelectors;
    const drafted: SelectorRecipeRecord = {
      ...recipe,
      fieldSelectorsJson: JSON.stringify(selectors, null, 2),
      submitSelectors: nextSubmitSelectors.join("\n"),
      updatedAt: new Date().toISOString()
    };
    setSelectorRecipes((current) => current.map((item) => item.platformId === platformId ? drafted : item));
    setStatusMessage(`Drafted ${fieldSuggestions} field selector fallback(s)${needsSubmitSuggestion ? " and submit-button fallbacks" : ""} for ${recipe.platformName}. Review the editor, then click Save Recipe to persist.`);
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

  async function saveAccountFromPlan(plan: AccountCreationPlanItem) {
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

    gates.push("evidence");

    for (const gate of gates) {
      await saveQueueItem(buildQueueItem(account, gate, gate === "evidence" ? "waiting" : "queued", `${gate.replace("_", " ")} gate prepared for ${account.platformName}.`));
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

  async function completeSubmitVerify(item: AutomationQueueItem, success: boolean) {
    try {
      const result = await invoke<AccountSubmitVerifyResult>("complete_account_submit_verify", {
        request: {
          queueId: item.id,
          accountId: item.accountId,
          success,
          evidenceUrl: "",
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

        <nav className="nav-list">
          {modules.map((module) => {
            const Icon = icons[module];
            return (
              <button
                className={module === activeModule ? "nav-item active" : "nav-item"}
                key={module}
                onClick={() => setActiveModule(module)}
              >
                <Icon size={18} />
                <span>{module}</span>
              </button>
            );
          })}
        </nav>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div>
            <p className="eyebrow">Phase 1 Desktop Foundation</p>
            <h1>{activeModule}</h1>
          </div>
          <button className="primary-action" onClick={() => setActiveModule("Money Sites")}>
            <Sparkles size={18} />
            New Money Site
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
                      <p className="eyebrow">BẢN MỚI NHẤT · CHROME EXTENSION</p>
                      <h2>EntityManager Bridge</h2>
                    </div>
                    <Puzzle size={22} />
                  </div>
                  <p className="panel-description">
                    {latestRelease ? latestRelease.name : "Phiên bản mới nhất trên GitHub Releases"}
                  </p>
                  <p className="panel-hint">
                    {latestRelease ? `Tag: ${latestRelease.tag_name} · Cập nhật: ${new Date(latestRelease.published_at).toLocaleDateString()}` : "Phiên bản và tệp tải sẽ lấy từ bản phát hành mới nhất."}
                  </p>
                  <button
                    className="primary-action extension-download-action"
                    type="button"
                    onClick={() => {
                      void invoke("open_latest_release_download", { assetName: "EntityManager-Chrome-Extension.zip" }).catch((error) => setStatusMessage(`Không mở được link tải Extension: ${String(error)}`));
                    }}
                  >
                    <Download size={18} />
                    Tải Extension (.zip)
                  </button>
                  <p className="panel-hint">
                    Cài đặt: giải nén ZIP → mở chrome://extensions → bật Developer mode → chọn Load unpacked và chọn thư mục đã giải nén.
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
                      void fetch("https://api.github.com/repos/seokillseo-byte/entitymanager/releases/latest", { headers: { Accept: "application/vnd.github+json" } })
                        .then((response) => response.json() as Promise<LatestRelease>)
                        .then((release) => {
                          const asset = release.assets.find((item) => item.name.endsWith("-setup.exe"));
                          if (!asset) throw new Error("Bản phát hành mới nhất chưa có file cài đặt .exe");
                          return invoke("open_latest_release_download", { assetName: asset.name });
                        })
                        .catch((error) => setStatusMessage(`Không mở được link tải bộ cài Windows: ${String(error)}`));
                    }}
                  >
                    <Download size={18} />
                    Tải bộ cài Windows (.exe)
                  </button>
                  <p className="panel-hint">
                    Chỉ hiển thị và tải bản phát hành mới nhất; các bản cũ không được liệt kê trong Overview.{" "}
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

        {activeModule === "Selector Recipes" && (
          <section className="single-panel">
            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Selector Recipe Editor</p>
                  <h2>Platform field mapping and submit safety rules</h2>
                </div>
                <span className="badge">{selectorRecipes.length} recipes</span>
              </div>

              <div className="form-grid">
                <button className="secondary-action" type="button" onClick={exportSelectorRecipes}>Export JSON</button>
                <label className="full-span">Import recipes JSON<textarea rows={5} value={recipeImportJson} onChange={(event) => setRecipeImportJson(event.target.value)} placeholder="Paste JSON export..." /></label>
                <button className="primary-action" type="button" onClick={() => void importSelectorRecipes()}>Import JSON to SQLite</button>
                {recipeImportMessage && <p className="muted-text">{recipeImportMessage}</p>}
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
              <div className="panel-header"><div><p className="eyebrow">Dry-run History</p><h2>Recent selector previews</h2></div><div className="queue-actions"><span className="badge">{dryRunHistory.length} records</span><button className="secondary-action" type="button" onClick={() => void refreshDryRunHistory()}>Refresh history</button></div></div>
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
                  <div className="queue-row recipe-row" key={recipe.platformId}>
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
          <section className="single-panel">
            <section className="metrics-grid">
              <article className="metric-card good">
                <span>Saved Accounts</span>
                <strong>{accounts.length}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Verified</span>
                <strong>{accounts.filter((account) => account.status === "verified").length}</strong>
              </article>
              <article className="metric-card warning">
                <span>Manual Review</span>
                <strong>{accounts.filter((account) => account.status === "needs_manual_review").length}</strong>
              </article>
              <article className="metric-card neutral">
                <span>Queue Items</span>
                <strong>{automationQueue.length}</strong>
              </article>
            </section>

            <article className="panel">
              <div className="panel-header">
                <div>
                  <p className="eyebrow">Account Creation Workflow</p>
                  <h2>{entityProfile.brandName} platform rollout plan</h2>
                </div>
                <span className="badge">SQLite account records</span>
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
                        <span className="muted-text">@{item.recommendedUsername}</span>
                      </div>
                      <div className="authority-score">
                        <span>{item.priority}</span>
                        <strong>{item.authorityScore}</strong>
                      </div>
                    </div>

                    {account && (
                      <div className={`account-status status-${account.status}`}>
                        <strong>{account.status.replace(/_/g, " ")}</strong>
                        <span>Updated {new Date(account.updatedAt).toLocaleString()}</span>
                      </div>
                    )}

                    <p className="platform-notes">{item.profileAngle}</p>

                    <div className="platform-meta">
                      <span>{item.automationMode.replace("_", " ")}</span>
                      <span>{item.difficulty}</span>
                      <span>{item.requiredAssets.join(" + ")}</span>
                    </div>

                    <div className="workflow-step-list">
                      {item.workflowSteps.map((step) => (
                        <span key={step}>{step}</span>
                      ))}
                    </div>

                    {account ? (
                      <div className="account-edit-grid">
                        <label>
                          Status
                          <select value={account.status} onChange={(event) => updateAccount(account.id, { status: event.target.value as AccountStatus })}>
                            {accountStatuses.map((status) => (
                              <option key={status} value={status}>{status.replace(/_/g, " ")}</option>
                            ))}
                          </select>
                        </label>
                        <label>
                          Evidence URL
                          <input value={account.evidenceUrl} onChange={(event) => updateAccount(account.id, { evidenceUrl: event.target.value })} />
                        </label>
                        <label className="full-span">
                          Notes
                          <textarea rows={2} value={account.notes} onChange={(event) => updateAccount(account.id, { notes: event.target.value })} />
                        </label>
                      </div>
                    ) : (
                      <button className="secondary-action" type="button" onClick={() => saveAccountFromPlan(item)}>Save as Account Record</button>
                    )}
                  </article>
                  );
                })}
              </div>
            </article>

            <section className="entity-builder-grid">
              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Automation Queue</p>
                    <h2>Prepared gates for API/manual handling</h2>
                  </div>
                  <span className="badge">{automationQueue.filter((item) => item.status !== "resolved").length} open</span>
                </div>

                <div className="queue-list">
                  {automationQueue.map((item) => (
                    <div className="queue-row" key={item.id}>
                      <div>
                        <strong>{item.platformName}</strong>
                        <span>{item.gateType.replace("_", " ")} / {item.payload}</span>
                        {item.gateType === "captcha" && (
                          <textarea
                            rows={4}
                            value={item.payload}
                            onChange={(event) => updateQueueItem(item.id, { payload: event.target.value })}
                          />
                        )}
                      </div>
                      <div className="queue-actions">
                        <select value={item.status} onChange={(event) => updateQueueItem(item.id, { status: event.target.value as AutomationQueueStatus })}>
                          {queueStatuses.map((status) => (
                            <option key={status} value={status}>{status}</option>
                          ))}
                        </select>
                        {item.gateType === "captcha" && (
                          <button className="secondary-action" type="button" onClick={() => executeCaptchaQueueItem(item)}>Send CAPTCHA</button>
                        )}
                        {item.gateType === "captcha" && (
                          <button className="secondary-action" type="button" onClick={() => pollCaptchaQueueItem(item)}>Poll Result</button>
                        )}
                        {item.gateType === "captcha" && (
                          <button className="secondary-action" type="button" onClick={() => prepareCaptchaInjection(item)}>Bridge Payload</button>
                        )}
                        {item.gateType === "submit_verify" && (
                          <button className="secondary-action" type="button" onClick={() => completeSubmitVerify(item, true)}>Mark Verified</button>
                        )}
                        {item.gateType === "submit_verify" && (
                          <button className="secondary-action danger-action" type="button" onClick={() => completeSubmitVerify(item, false)}>Mark Submit Failed</button>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {captchaBridgePayload && (
                  <div className="bridge-preview">
                    <div>
                      <p className="eyebrow">Browser/Extension Bridge</p>
                      <strong>{captchaBridgePayload.platformName}</strong>
                      <span>{captchaBridgePayload.action} → {captchaBridgePayload.nextStep}</span>
                    </div>
                    <code>{captchaBridgePayload.tokenField}: {maskToken(captchaBridgePayload.solutionToken)}</code>
                    <p className="muted-text">Extension can now auto-fetch this from http://127.0.0.1:17321/captcha/injection/next. Manual JSON remains available for fallback testing.</p>
                    <textarea readOnly rows={7} value={JSON.stringify(captchaBridgePayload, null, 2)} />
                    <div className="queue-actions">
                      <button className="secondary-action" type="button" onClick={() => completeCaptchaInjection(true)}>Mark Injected</button>
                      <button className="secondary-action danger-action" type="button" onClick={() => completeCaptchaInjection(false)}>Mark Failed</button>
                    </div>
                  </div>
                )}
              </article>

              <article className="panel">
                <div className="panel-header">
                  <div>
                    <p className="eyebrow">Workflow History</p>
                    <h2>Latest account events</h2>
                  </div>
                  <span className="badge">{workflowRuns.length} runs</span>
                </div>

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
              </article>
            </section>
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
