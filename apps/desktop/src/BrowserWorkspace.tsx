import { useCallback, useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Maximize2, Pause, Play, RefreshCw, Square } from "lucide-react";
import type { BrowserSessionRecord, ProvisioningJobRecord } from "@entitymanager/shared";

interface BrowserWorkerStatus {
  status: "starting" | "ready" | "failed" | "stopped";
  heartbeatAt: string;
  activeSessions: number;
  message: string;
}

type WorkspaceSlot = {
  session: BrowserSessionRecord | null;
  job: ProvisioningJobRecord | null;
};

function timeLabel(value: string) {
  if (!value) return "chưa có";
  return new Date(value).toLocaleTimeString("vi-VN");
}

export default function BrowserWorkspace() {
  const [slotCount, setSlotCount] = useState(1);
  const [sessions, setSessions] = useState<BrowserSessionRecord[]>([]);
  const [jobs, setJobs] = useState<ProvisioningJobRecord[]>([]);
  const [worker, setWorker] = useState<BrowserWorkerStatus | null>(null);
  const [previews, setPreviews] = useState<Record<string, string>>({});
  const [expandedId, setExpandedId] = useState("");
  const [lastRefresh, setLastRefresh] = useState("");
  const [workspaceError, setWorkspaceError] = useState("");

  const refresh = useCallback(async () => {
    try {
      const [nextSessions, nextJobs, nextWorker, nextSlots] = await Promise.all([
        invoke<BrowserSessionRecord[]>("get_browser_sessions"),
        invoke<ProvisioningJobRecord[]>("get_provisioning_jobs"),
        invoke<BrowserWorkerStatus>("get_browser_worker_status").catch(() => null),
        invoke<number>("get_browser_workspace_slots")
      ]);
      setSlotCount(Math.max(1, Math.min(6, nextSlots)));
      const running = nextSessions
        .filter((item) => item.status === "running")
        .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setSessions(running);
      setJobs(nextJobs);
      setWorker(nextWorker);
      const images = await Promise.all(running.map(async (session) => {
        try {
          return [session.id, await invoke<string>("get_browser_worker_preview", { sessionId: session.id })] as const;
        } catch {
          return [session.id, ""] as const;
        }
      }));
      setPreviews((current) => ({ ...current, ...Object.fromEntries(images.filter(([, image]) => image)) }));
      setLastRefresh(new Date().toISOString());
      setWorkspaceError("");
    } catch (error) {
      setWorkspaceError(`Không đồng bộ được Browser Worker: ${String(error)}`);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const timer = window.setInterval(() => void refresh(), 1500);
    return () => window.clearInterval(timer);
  }, [refresh]);

  const slots = useMemo<WorkspaceSlot[]>(() => {
    const visibleSessions = expandedId ? sessions.filter((item) => item.id === expandedId) : sessions.slice(0, slotCount);
    const filled: WorkspaceSlot[] = visibleSessions.map((session) => ({
      session,
      job: jobs.find((item) => item.id === session.jobId) ?? null
    }));
    if (expandedId) return filled;
    while (filled.length < slotCount) filled.push({ session: null, job: null });
    return filled;
  }, [expandedId, jobs, sessions, slotCount]);

  async function stop(sessionId: string) {
    await invoke("stop_playwright_browser", { sessionId });
    await refresh();
  }

  async function control(sessionId: string, action: "pause" | "resume") {
    await invoke("control_browser_worker_session", { sessionId, action });
    await refresh();
  }

  async function clickBrowser(sessionId: string, event: React.MouseEvent<HTMLImageElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    const naturalWidth = event.currentTarget.naturalWidth;
    const naturalHeight = event.currentTarget.naturalHeight;
    const scale = Math.min(bounds.width / naturalWidth, bounds.height / naturalHeight);
    const renderedWidth = naturalWidth * scale;
    const renderedHeight = naturalHeight * scale;
    const offsetX = (bounds.width - renderedWidth) / 2;
    const offsetY = (bounds.height - renderedHeight) / 2;
    const x = (event.clientX - bounds.left - offsetX) / scale;
    const y = (event.clientY - bounds.top - offsetY) / scale;
    if (x < 0 || y < 0 || x > naturalWidth || y > naturalHeight) return;
    await invoke("send_browser_worker_click", { sessionId, x, y });
    window.setTimeout(() => void refresh(), 250);
  }

  return (
    <main className="browser-workspace-shell">
      <header className="browser-workspace-header">
        <div>
          <span>ENTITYMANAGER · BROWSER WORKSPACE</span>
          <h1>{slotCount} luồng trình duyệt trong một cửa sổ</h1>
        </div>
        <div className="browser-workspace-health">
          <i className={`worker-health-dot ${worker?.status || "stopped"}`} />
          <strong>{worker?.status === "ready" ? "Worker hoạt động" : worker?.status || "Chưa khởi động"}</strong>
          <small>{worker?.heartbeatAt ? `Heartbeat ${timeLabel(worker.heartbeatAt)}` : worker?.message || "Đang chờ campaign"}</small>
          <button type="button" onClick={() => void refresh()}><RefreshCw size={15} /> Làm mới</button>
        </div>
      </header>

      {workspaceError && <div className="browser-workspace-error" role="alert"><strong>Browser Workspace cần xử lý</strong><span>{workspaceError}</span></div>}

      <section className={`browser-worker-grid slots-${expandedId ? 1 : slotCount}`}>
        {slots.map(({ session, job }, index) => session ? (
          <article className="browser-worker-pane" key={session.id}>
            <div className="browser-worker-toolbar">
              <div><span>Luồng {index + 1}</span><strong>{job?.platformName || session.platformId}</strong></div>
              <div className="browser-worker-toolbar-actions">
                <button title="Phóng lớn/thu nhỏ" type="button" onClick={() => setExpandedId((current) => current === session.id ? "" : session.id)}><Maximize2 size={15} /></button>
                <button title="Tạm dừng automation" type="button" onClick={() => void control(session.id, "pause")}><Pause size={15} /></button>
                <button title="Tiếp tục automation" type="button" onClick={() => void control(session.id, "resume")}><Play size={15} /></button>
                <button title="Dừng worker" type="button" onClick={() => void stop(session.id)}><Square size={14} /></button>
              </div>
            </div>
            <div className="browser-surface">
              {previews[session.id]
                ? <img src={previews[session.id]} alt={`Trình duyệt ${session.platformId}`} onClick={(event) => void clickBrowser(session.id, event)} title="Bấm trực tiếp để điều khiển phiên trình duyệt này" />
                : <div className="browser-surface-empty"><RefreshCw size={24} /><strong>Đang kết nối trình duyệt…</strong><span>{session.lastMessage}</span></div>}
            </div>
            <footer className="browser-worker-footer">
              <div><b>{job?.stage.replace(/_/g, " ") || "browser"}</b><span>{job?.lastMessage || session.lastMessage}</span></div>
              <div><span>{session.proxyId ? `Proxy ${session.proxyId}` : "IP trực tiếp"}</span><small>Cập nhật {timeLabel(job?.updatedAt || session.updatedAt)}</small></div>
            </footer>
          </article>
        ) : (
          <article className="browser-worker-pane browser-worker-waiting" key={`empty-${index}`}>
            <div className="browser-worker-toolbar"><div><span>Luồng {index + 1}</span><strong>Đang chờ công việc</strong></div></div>
            <div className="browser-surface-empty"><RefreshCw size={24} /><strong>Chưa có browser session</strong><span>Ô này sẽ tự nhận platform tiếp theo từ campaign.</span></div>
          </article>
        ))}
      </section>
      <div className="browser-workspace-footer">Cập nhật gần nhất: {lastRefresh ? timeLabel(lastRefresh) : "đang tải"} · Đóng cửa sổ này không dừng campaign.</div>
    </main>
  );
}
