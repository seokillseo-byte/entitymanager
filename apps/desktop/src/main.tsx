import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, Brain, Database, FileCheck2, GitBranch, Globe2, KeyRound, LayoutDashboard, Library, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { buildProviderConfig, testIntegrationAdapter } from "@entitymanager/integrations";
import { calculateEntityReadiness } from "@entitymanager/shared";
import type { AccountCreationPlanItem, AccountPlanPriority, AccountRecord, AccountStatus, AccountSubmitVerifyResult, AutomationGateType, AutomationQueueItem, AutomationQueueStatus, AutomationMode, CaptchaInjectionPayload, CaptchaInjectionResult, DashboardMetric, EntityModule, EntityProfileRecord, IntegrationAdapterResult, IntegrationType, PlatformDifficulty, PlatformLibraryRecord, PlatformType, ProviderKeyStatus, SelectorRecipeRecord, DryRunHistoryRecord, WorkflowRunRecord, WorkflowRunStatus } from "@entitymanager/shared";
import { demoEntityProfileSeed, demoProjectSeed, platformLibrarySeed } from "@entitymanager/shared/seed";
import { createWorkflowTask, WORKFLOW_STATUSES } from "@entitymanager/workflow";
import { calculateSelectorHealthTrends } from "./selectorHealth.mjs";
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

function App() {
  const [activeModule, setActiveModule] = useState<EntityModule>("Overview");
  const [moneySite, setMoneySite] = useState<MoneySiteForm>(fallbackMoneySite);
  const [settings, setSettings] = useState<IntegrationSettingForm[]>(fallbackSettings);
  const [platforms, setPlatforms] = useState<PlatformLibraryRecord[]>(fallbackPlatforms);
  const [selectorRecipes, setSelectorRecipes] = useState<SelectorRecipeRecord[]>([]);
  const [dryRunHistory, setDryRunHistory] = useState<DryRunHistoryRecord[]>([]);
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
  const [statusMessage, setStatusMessage] = useState("SQLite local data ready");

  useEffect(() => {
    void loadLocalData();
    void startExtensionBridge();
  }, []);

  const readiness = useMemo(() => calculateEntityReadiness(demoProjectSeed.readinessInput), []);
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
      const [storedMoneySite, storedSettings, storedPlatforms, storedRecipes, storedEntityProfile, storedAccounts, storedRuns, storedQueue, storedDryRunHistory] = await Promise.all([
        invoke<MoneySiteForm>("get_money_site"),
        invoke<IntegrationSettingForm[]>("get_integration_settings"),
        invoke<PlatformLibraryRecord[]>("get_platforms"),
        invoke<SelectorRecipeRecord[]>("get_selector_recipes"),
        invoke<EntityProfileRecord>("get_entity_profile"),
        invoke<AccountRecord[]>("get_accounts"),
        invoke<WorkflowRunRecord[]>("get_workflow_runs"),
        invoke<AutomationQueueItem[]>("get_automation_queue"),
        invoke<DryRunHistoryRecord[]>("get_dry_run_history")
      ]);

      setMoneySite(storedMoneySite);
      setSettings(storedSettings);
      setPlatforms(storedPlatforms);
      setSelectorRecipes(storedRecipes);
      setEntityProfile(storedEntityProfile);
      setAccounts(storedAccounts);
      setWorkflowRuns(storedRuns);
      setAutomationQueue(storedQueue);
      setDryRunHistory(storedDryRunHistory);
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
      setDryRunHistory(records);
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
                  <strong>{metric.label === "Entity Readiness" ? `${readiness}%` : metric.value}</strong>
                </article>
              ))}
            </section>

            <section className="main-grid">
              <article className="panel wide">
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

              <article className="panel wide">
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

              <div className="platform-library">
                {filteredPlatforms.map((platform) => (
                  <article className="platform-card" key={platform.id}>
                    <div className="platform-card-header">
                      <div>
                        <p className="eyebrow">{platform.type} / {platform.entityValue}</p>
                        <h2>{platform.name}</h2>
                        <a href={platform.homepageUrl}>{platform.homepageUrl}</a>
                      </div>
                      <div className="authority-score">
                        <span>Authority</span>
                        <strong>{platform.authorityScore}</strong>
                      </div>
                    </div>

                    <p className="platform-notes">{platform.notes}</p>

                    <div className="platform-meta">
                      <span>{platform.difficulty}</span>
                      <span>{platform.automationMode.replace("_", " ")}</span>
                      <span>{platform.requiresCaptcha ? "CAPTCHA" : "No CAPTCHA"}</span>
                      <span>{platform.requiresEmail ? "Email required" : "No email"}</span>
                    </div>

                    <div className="platform-edit-grid">
                      <label>
                        Authority
                        <input
                          type="number"
                          min="0"
                          max="100"
                          value={platform.authorityScore}
                          onChange={(event) => updatePlatform(platform.id, { authorityScore: Number(event.target.value) })}
                        />
                      </label>
                      <label>
                        Automation
                        <select
                          value={platform.automationMode}
                          onChange={(event) => updatePlatform(platform.id, { automationMode: event.target.value as AutomationMode })}
                        >
                          <option value="auto">auto</option>
                          <option value="semi_auto">semi auto</option>
                          <option value="manual_review">manual review</option>
                        </select>
                      </label>
                      <button className="secondary-action" type="button" onClick={() => savePlatform(platform)}>Save Platform</button>
                    </div>
                  </article>
                ))}
              </div>
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
