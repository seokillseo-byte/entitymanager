import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import path from "node:path";

const root = process.cwd();
const runtime = path.join(root, "apps", "desktop", "src-tauri", "resources");
const nodeExecutable = path.join(runtime, "browser-worker", process.platform === "win32" ? "node.exe" : "node");
const workerBundle = path.join(runtime, "browser-worker", "worker.cjs");
const chromiumExecutable = path.join(runtime, "chromium", process.platform === "win32" ? "chrome.exe" : "chrome");

for (const required of [nodeExecutable, workerBundle, chromiumExecutable]) {
  assert.ok(existsSync(required), `Staged runtime file is missing: ${required}`);
}

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const selected = typeof address === "object" && address ? address.port : 0;
    server.close(() => resolve(selected));
  });
});
const token = "entitymanager-staged-runtime-smoke-test";
let stderr = "";
const child = spawn(nodeExecutable, [path.basename(workerBundle), "--port", String(port), "--token", token, "--chromium", chromiumExecutable], {
  cwd: path.dirname(workerBundle),
  env: { ...process.env, NODE_PATH: path.join(path.dirname(workerBundle), "runtime-modules") },
  stdio: ["ignore", "pipe", "pipe"], windowsHide: true
});
child.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

try {
  let response;
  for (let attempt = 0; attempt < 120; attempt += 1) {
    if (child.exitCode !== null) throw new Error(`Staged Browser Worker exited with ${child.exitCode}: ${stderr}`);
    try {
      response = await fetch(`http://127.0.0.1:${port}/v1/health`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) break;
    } catch { /* cold start */ }
    await delay(250);
  }
  assert.ok(response?.ok, `Staged Browser Worker did not become healthy: ${stderr}`);
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.protocolVersion, "1.0");
  process.stdout.write(`Staged portable Browser Worker heartbeat OK (PID ${health.pid}).\n`);
} finally {
  child.kill("SIGTERM");
}
