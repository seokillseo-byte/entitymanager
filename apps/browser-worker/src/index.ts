import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium, type BrowserContext, type Page } from "playwright-core";

const args = new Map<string, string>();
for (let index = 2; index < process.argv.length; index += 2) {
  const key = process.argv[index]?.replace(/^--/, "");
  const value = process.argv[index + 1];
  if (key && value) args.set(key, value);
}
const port = Number(args.get("port") || "0");
const token = args.get("token") || "";
const executablePath = args.get("chromium") || "";
const protocolVersion = "1.1";
const startedAt = new Date().toISOString();
if (!port || !token || !executablePath) {
  process.stderr.write("Required arguments: --port, --token, --chromium\n");
  process.exit(2);
}

type WorkerSession = {
  id: string; context: BrowserContext; page: Page;
  status: "ready" | "running" | "failed" | "stopped";
  visible: boolean; currentUrl: string; title: string;
  lastMessage: string; lastHeartbeatAt: string;
  currentStep: string; paused: boolean; actionLog: ActionResult[];
};
type StartSessionRequest = {
  sessionId: string; profileDirectory: string; url: string; visible: boolean;
  proxy?: { server: string; username?: string; password?: string };
};
type BrowserAction = {
  id: string;
  kind: "navigate" | "click" | "fill" | "upload" | "waitFor" | "extract" | "inspectCaptcha" | "injectCaptcha" | "checkpoint";
  selectors?: string[];
  attribute?: string;
  value?: string;
  url?: string;
  timeoutMs?: number;
  retries?: number;
  optional?: boolean;
};
type BrowserActionBatch = { actions: BrowserAction[]; stopOnError?: boolean };
type ActionResult = {
  id: string; kind: BrowserAction["kind"];
  status: "completed" | "skipped" | "failed" | "needs_attention";
  selector: string; value: string; message: string;
  startedAt: string; completedAt: string;
};
const sessions = new Map<string, WorkerSession>();

function json(response: ServerResponse, status: number, body: unknown): void {
  response.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  response.end(JSON.stringify(body));
}
async function readJson<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as T;
}
function publicSession(session: WorkerSession) {
  return { id: session.id, status: session.status, visible: session.visible, currentUrl: session.currentUrl,
    title: session.title, lastMessage: session.lastMessage, lastHeartbeatAt: session.lastHeartbeatAt,
    currentStep: session.currentStep, paused: session.paused, actionLog: session.actionLog.slice(-25) };
}

async function firstUsableSelector(page: Page, selectors: string[], timeoutMs: number, allowHidden = false): Promise<string | null> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    for (const selector of selectors) {
      const locator = page.locator(selector).first();
      if (await locator.count().catch(() => 0) && (allowHidden || await locator.isVisible().catch(() => false))) return selector;
    }
    await page.waitForTimeout(250);
  }
  return null;
}

async function executeAction(session: WorkerSession, action: BrowserAction): Promise<ActionResult> {
  const startedAt = new Date().toISOString();
  const timeoutMs = Math.min(Math.max(action.timeoutMs || 8_000, 500), 45_000);
  const attempts = Math.min(Math.max((action.retries || 0) + 1, 1), 4);
  let lastError = "";
  session.currentStep = action.id;
  session.lastMessage = `Đang chạy ${action.id}.`;
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    try {
      if (session.paused) throw new Error("session_paused");
      let selector = "";
      let value = "";
      if (action.kind === "navigate") {
        if (!action.url || !/^https?:\/\//i.test(action.url)) throw new Error("invalid_navigation_url");
        await session.page.goto(action.url, { waitUntil: "domcontentloaded", timeout: timeoutMs });
        value = session.page.url();
      } else if (action.kind === "checkpoint") {
        value = session.page.url();
      } else if (action.kind === "inspectCaptcha") {
        const captcha = await session.page.evaluate(() => {
          const recaptcha = document.querySelector<HTMLElement>("[data-sitekey], .g-recaptcha");
          const recaptchaFrame = document.querySelector<HTMLIFrameElement>("iframe[src*='recaptcha']");
          const hcaptchaFrame = document.querySelector<HTMLIFrameElement>("iframe[src*='hcaptcha']");
          const turnstile = document.querySelector<HTMLElement>(".cf-turnstile, [data-sitekey][data-callback]");
          const frameKey = (source: string) => {
            try { return new URL(source).searchParams.get("k") || new URL(source).searchParams.get("sitekey") || ""; } catch { return ""; }
          };
          if (hcaptchaFrame) return { found: true, type: "hcaptcha", websiteKey: frameKey(hcaptchaFrame.src) || recaptcha?.dataset.sitekey || "" };
          if (turnstile) return { found: true, type: "turnstile", websiteKey: turnstile.dataset.sitekey || "" };
          if (recaptcha || recaptchaFrame) return { found: true, type: "recaptcha_v2", websiteKey: recaptcha?.dataset.sitekey || frameKey(recaptchaFrame?.src || "") };
          return { found: false, type: "", websiteKey: "" };
        });
        value = JSON.stringify({ ...captcha, websiteUrl: session.page.url() });
      } else if (action.kind === "injectCaptcha") {
        if (!action.value) throw new Error("captcha_token_missing");
        const injected = await session.page.evaluate((token) => {
          const fields = [...document.querySelectorAll<HTMLTextAreaElement>("textarea[name='g-recaptcha-response'], textarea[name='h-captcha-response'], input[name='cf-turnstile-response']")];
          for (const field of fields) {
            field.value = token;
            field.dispatchEvent(new Event("input", { bubbles: true }));
            field.dispatchEvent(new Event("change", { bubbles: true }));
          }
          return fields.length;
        }, action.value);
        if (!injected) throw new Error("captcha_response_field_not_found");
        value = String(injected);
      } else {
        selector = await firstUsableSelector(session.page, action.selectors || [], timeoutMs, action.kind === "upload") || "";
        if (!selector) throw new Error("selector_not_found");
        const locator = session.page.locator(selector).first();
        if (action.kind === "click") {
          await locator.click({ timeout: timeoutMs });
        } else if (action.kind === "fill") {
          await locator.fill(action.value || "", { timeout: timeoutMs });
        } else if (action.kind === "upload") {
          const source = action.value || "";
          let uploadPath = source;
          if (source.startsWith("data:")) {
            const match = source.match(/^data:([^;,]+)?;base64,(.+)$/);
            if (!match) throw new Error("invalid_data_image");
            const bytes = Buffer.from(match[2], "base64");
            if (bytes.length > 10 * 1024 * 1024) throw new Error("image_too_large");
            uploadPath = join(tmpdir(), `entitymanager-${session.id}-${Date.now()}.png`);
            await writeFile(uploadPath, bytes);
          } else if (/^https?:\/\//i.test(source)) {
            const response = await fetch(source, { signal: AbortSignal.timeout(timeoutMs) });
            if (!response.ok) throw new Error(`image_fetch_failed_${response.status}`);
            const bytes = Buffer.from(await response.arrayBuffer());
            if (bytes.length > 10 * 1024 * 1024) throw new Error("image_too_large");
            const contentType = response.headers.get("content-type") || "image/png";
            const extension = contentType.includes("jpeg") ? "jpg" : contentType.includes("webp") ? "webp" : "png";
            uploadPath = join(tmpdir(), `entitymanager-${session.id}-${Date.now()}.${extension}`);
            await writeFile(uploadPath, bytes);
          }
          if (!uploadPath) throw new Error("image_source_missing");
          await locator.setInputFiles(uploadPath, { timeout: timeoutMs });
        } else if (action.kind === "waitFor") {
          await locator.waitFor({ state: "visible", timeout: timeoutMs });
        } else if (action.kind === "extract") {
          value = (action.attribute ? await locator.getAttribute(action.attribute) : null)
            || await locator.getAttribute("href")
            || await locator.inputValue().catch(() => "")
            || (await locator.textContent())?.trim()
            || "";
        }
      }
      session.currentUrl = session.page.url();
      session.title = await session.page.title().catch(() => session.title);
      session.lastHeartbeatAt = new Date().toISOString();
      return { id: action.id, kind: action.kind, status: "completed", selector, value,
        message: attempt > 1 ? `Hoàn tất sau ${attempt} lần thử.` : "Hoàn tất.", startedAt, completedAt: session.lastHeartbeatAt };
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      if (attempt < attempts) await session.page.waitForTimeout(500 * attempt);
    }
  }
  const completedAt = new Date().toISOString();
  return { id: action.id, kind: action.kind, status: action.optional ? "skipped" : "failed", selector: "", value: "",
    message: lastError || "action_failed", startedAt, completedAt };
}

async function executeActions(sessionId: string, batch: BrowserActionBatch) {
  const session = sessions.get(sessionId);
  if (!session || session.status !== "running") throw new Error("session_not_running");
  if (!Array.isArray(batch.actions) || batch.actions.length > 40) throw new Error("invalid_action_batch");
  const results: ActionResult[] = [];
  for (const action of batch.actions) {
    const result = await executeAction(session, action);
    results.push(result);
    session.actionLog.push(result);
    if (session.actionLog.length > 100) session.actionLog.splice(0, session.actionLog.length - 100);
    session.lastMessage = `${action.id}: ${result.message}`;
    if (result.status === "failed" && batch.stopOnError !== false) break;
  }
  session.currentStep = "";
  session.lastHeartbeatAt = new Date().toISOString();
  return { session: publicSession(session), results, currentUrl: session.page.url() };
}

async function startSession(input: StartSessionRequest) {
  const existing = sessions.get(input.sessionId);
  if (existing && existing.status !== "stopped") return publicSession(existing);
  const context = await chromium.launchPersistentContext(input.profileDirectory, {
    executablePath, headless: !input.visible,
    viewport: input.visible ? null : { width: 1280, height: 900 }, proxy: input.proxy || undefined,
    args: input.visible
      ? ["--no-first-run", "--no-default-browser-check", "--window-position=80,80", "--window-size=1280,900"]
      : ["--no-first-run", "--no-default-browser-check"]
  });
  const page = context.pages()[0] || await context.newPage();
  const session: WorkerSession = { id: input.sessionId, context, page, status: "ready", visible: input.visible,
    currentUrl: "about:blank", title: "", lastMessage: "Playwright persistent context is ready.", lastHeartbeatAt: new Date().toISOString(),
    currentStep: "", paused: false, actionLog: [] };
  sessions.set(input.sessionId, session);
  page.on("framenavigated", async (frame) => {
    if (frame !== page.mainFrame()) return;
    session.currentUrl = page.url();
    session.title = await page.title().catch(() => session.title);
    session.lastHeartbeatAt = new Date().toISOString();
  });
  page.on("close", () => { session.status = "stopped"; session.lastMessage = "Browser page closed."; session.lastHeartbeatAt = new Date().toISOString(); });
  context.on("close", () => { session.status = "stopped"; session.lastMessage = "Browser context closed."; session.lastHeartbeatAt = new Date().toISOString(); });
  session.status = "running";
  session.lastMessage = "Navigating through Playwright worker.";
  await page.goto(input.url, { waitUntil: "domcontentloaded", timeout: 45_000 });
  session.currentUrl = page.url(); session.title = await page.title().catch(() => "");
  session.lastMessage = "Page ready and controlled by Playwright."; session.lastHeartbeatAt = new Date().toISOString();
  return publicSession(session);
}
async function stopSession(sessionId: string) {
  const session = sessions.get(sessionId); if (!session) throw new Error("Worker session not found.");
  await session.context.close(); session.status = "stopped"; session.lastMessage = "Stopped by Desktop.";
  session.lastHeartbeatAt = new Date().toISOString(); return publicSession(session);
}

const server = createServer(async (request, response) => {
  try {
    if (request.headers.authorization !== `Bearer ${token}`) return json(response, 401, { error: "unauthorized" });
    const url = new URL(request.url || "/", `http://127.0.0.1:${port}`);
    if (request.method === "GET" && url.pathname === "/v1/health") return json(response, 200, {
      ok: true, protocolVersion, pid: process.pid, startedAt, heartbeatAt: new Date().toISOString(),
      activeSessions: [...sessions.values()].filter((item) => item.status === "running").length
    });
    if (request.method === "POST" && url.pathname === "/v1/shutdown") {
      json(response, 202, { ok: true });
      setImmediate(() => void shutdown());
      return;
    }
    if (request.method === "GET" && url.pathname === "/v1/sessions") return json(response, 200, [...sessions.values()].map(publicSession));
    if (request.method === "POST" && url.pathname === "/v1/sessions") return json(response, 201, await startSession(await readJson<StartSessionRequest>(request)));
    const preview = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/preview$/);
    if (request.method === "GET" && preview) {
      const session = sessions.get(decodeURIComponent(preview[1]));
      if (!session || session.status !== "running") return json(response, 404, { error: "session_not_running" });
      const image = await session.page.screenshot({ type: "jpeg", quality: 55 }); session.lastHeartbeatAt = new Date().toISOString();
      return json(response, 200, { sessionId: session.id, capturedAt: session.lastHeartbeatAt, imageBase64: image.toString("base64") });
    }
    const actions = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/actions$/);
    if (request.method === "POST" && actions) {
      return json(response, 200, await executeActions(decodeURIComponent(actions[1]), await readJson<BrowserActionBatch>(request)));
    }
    const pause = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/(pause|resume)$/);
    if (request.method === "POST" && pause) {
      const session = sessions.get(decodeURIComponent(pause[1]));
      if (!session || session.status !== "running") return json(response, 404, { error: "session_not_running" });
      session.paused = pause[2] === "pause";
      session.lastMessage = session.paused ? "Automation paused." : "Automation resumed.";
      session.lastHeartbeatAt = new Date().toISOString();
      return json(response, 200, publicSession(session));
    }
    const stop = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/stop$/);
    if (request.method === "POST" && stop) return json(response, 200, await stopSession(decodeURIComponent(stop[1])));
    return json(response, 404, { error: "not_found" });
  } catch (error) { return json(response, 500, { error: error instanceof Error ? error.message : String(error) }); }
});
const timer = setInterval(() => { const now = new Date().toISOString(); for (const item of sessions.values()) if (item.status === "running") item.lastHeartbeatAt = now; }, 2_000);
async function shutdown() { clearInterval(timer); await Promise.allSettled([...sessions.values()].map((item) => item.context.close())); server.close(() => process.exit(0)); }
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
server.listen(port, "127.0.0.1", () => process.stdout.write(`ENTITYMANAGER_BROWSER_WORKER_READY ${port}\n`));
