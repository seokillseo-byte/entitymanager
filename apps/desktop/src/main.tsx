import React from "react";
import ReactDOM from "react-dom/client";
import { Activity, Bot, Brain, Database, FileCheck2, GitBranch, Globe2, KeyRound, LayoutDashboard, Library, Settings, ShieldCheck, Sparkles } from "lucide-react";
import type { DashboardMetric, EntityModule } from "@entitymanager/shared";
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
  { label: "Entity Readiness", value: "74%", tone: "good" },
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

function App() {
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
              <button className={module === "Overview" ? "nav-item active" : "nav-item"} key={module}>
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
            <h1>Entity Builder + Entity Care + EEAT Planner</h1>
          </div>
          <button className="primary-action">
            <Sparkles size={18} />
            New Money Site
          </button>
        </header>

        <section className="metrics-grid">
          {metrics.map((metric) => (
            <article className={`metric-card ${metric.tone}`} key={metric.label}>
              <span>{metric.label}</span>
              <strong>{metric.value}</strong>
            </article>
          ))}
        </section>

        <section className="main-grid">
          <article className="panel wide">
            <div className="panel-header">
              <div>
                <p className="eyebrow">Entity Readiness</p>
                <h2>Input data quality before automation</h2>
              </div>
              <span className="badge">SQLite local</span>
            </div>
            <div className="readiness">
              <div className="score-ring">74%</div>
              <div className="readiness-list">
                <div><strong>Brand/NAP</strong><span>Ready for profile creation</span></div>
                <div><strong>Author/Expert</strong><span>Needs credentials and profile URLs</span></div>
                <div><strong>Content Source</strong><span>Add sitemap or WordPress API</span></div>
                <div><strong>API Integrations</strong><span>AI/CAPTCHA/email keys not configured</span></div>
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
        </section>
      </section>
    </main>
  );
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
