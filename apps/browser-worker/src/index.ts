import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
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
const protocolVersion = "1.0";
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
};
type StartSessionRequest = {
  sessionId: string; profileDirectory: string; url: string; visible: boolean;
  proxy?: { server: string; username?: string; password?: string };
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
    title: session.title, lastMessage: session.lastMessage, lastHeartbeatAt: session.lastHeartbeatAt };
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
    currentUrl: "about:blank", title: "", lastMessage: "Playwright persistent context is ready.", lastHeartbeatAt: new Date().toISOString() };
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
    const stop = url.pathname.match(/^\/v1\/sessions\/([^/]+)\/stop$/);
    if (request.method === "POST" && stop) return json(response, 200, await stopSession(decodeURIComponent(stop[1])));
    return json(response, 404, { error: "not_found" });
  } catch (error) { return json(response, 500, { error: error instanceof Error ? error.message : String(error) }); }
});
const timer = setInterval(() => { const now = new Date().toISOString(); for (const item of sessions.values()) if (item.status === "running") item.lastHeartbeatAt = now; }, 2_000);
async function shutdown() { clearInterval(timer); await Promise.allSettled([...sessions.values()].map((item) => item.context.close())); server.close(() => process.exit(0)); }
process.on("SIGINT", () => void shutdown()); process.on("SIGTERM", () => void shutdown());
server.listen(port, "127.0.0.1", () => process.stdout.write(`ENTITYMANAGER_BROWSER_WORKER_READY ${port}\n`));
