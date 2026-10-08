import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, Brain, Database, FileCheck2, GitBranch, Globe2, KeyRound, LayoutDashboard, Library, Settings, ShieldCheck, Sparkles } from "lucide-react";
import { invoke } from "@tauri-apps/api/core";
import { calculateEntityReadiness } from "@entitymanager/shared";
import type { AutomationMode, DashboardMetric, EntityModule, PlatformDifficulty, PlatformLibraryRecord, PlatformType } from "@entitymanager/shared";
import { demoProjectSeed, platformLibrarySeed } from "@entitymanager/shared/seed";
import { createWorkflowTask, WORKFLOW_STATUSES } from "@entitymanager/workflow";
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
  settingType: string;
  provider: string;
  apiKey: string;
  isEnabled: boolean;
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
  isEnabled: integration.isEnabled
}));

const fallbackPlatforms: PlatformLibraryRecord[] = platformLibrarySeed;

const platformTypes: PlatformTypeFilter[] = ["all", "social", "blog", "forum", "citation", "profile", "media", "document", "video", "audio", "portfolio", "qa", "local"];
const automationModes: AutomationModeFilter[] = ["all", "auto", "semi_auto", "manual_review"];
const difficulties: DifficultyFilter[] = ["all", "easy", "medium", "hard"];

function App() {
  const [activeModule, setActiveModule] = useState<EntityModule>("Overview");
  const [moneySite, setMoneySite] = useState<MoneySiteForm>(fallbackMoneySite);
  const [settings, setSettings] = useState<IntegrationSettingForm[]>(fallbackSettings);
  const [platforms, setPlatforms] = useState<PlatformLibraryRecord[]>(fallbackPlatforms);
  const [platformTypeFilter, setPlatformTypeFilter] = useState<PlatformTypeFilter>("all");
  const [automationModeFilter, setAutomationModeFilter] = useState<AutomationModeFilter>("all");
  const [difficultyFilter, setDifficultyFilter] = useState<DifficultyFilter>("all");
  const [statusMessage, setStatusMessage] = useState("SQLite local data ready");

  useEffect(() => {
    void loadLocalData();
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

  async function loadLocalData() {
    try {
      const [storedMoneySite, storedSettings, storedPlatforms] = await Promise.all([
        invoke<MoneySiteForm>("get_money_site"),
        invoke<IntegrationSettingForm[]>("get_integration_settings"),
        invoke<PlatformLibraryRecord[]>("get_platforms")
      ]);

      setMoneySite(storedMoneySite);
      setSettings(storedSettings);
      setPlatforms(storedPlatforms);
      setStatusMessage("Loaded from local SQLite");
    } catch {
      setStatusMessage("Preview mode using seed data");
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

        {activeModule === "Settings" && (
          <section className="single-panel">
            <article className="panel form-panel">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Settings</p>
                <h2>API keys stored in local SQLite</h2>
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
                    API Key
                    <input
                      type="password"
                      value={setting.apiKey}
                      placeholder={`${setting.settingType} API key`}
                      onChange={(event) => updateSetting(setting.settingType, { apiKey: event.target.value })}
                    />
                  </label>
                  <label className="checkbox-row">
                    <input
                      type="checkbox"
                      checked={setting.isEnabled}
                      onChange={(event) => updateSetting(setting.settingType, { isEnabled: event.target.checked })}
                    />
                    Enable {setting.settingType}
                  </label>
                  <button className="secondary-action" type="button" onClick={() => saveSetting(setting)}>Save</button>
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

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
