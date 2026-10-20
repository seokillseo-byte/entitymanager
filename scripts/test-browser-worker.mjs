import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";

const port = await new Promise((resolve, reject) => {
  const server = createServer();
  server.once("error", reject);
  server.listen(0, "127.0.0.1", () => {
    const address = server.address();
    const selected = typeof address === "object" && address ? address.port : 0;
    server.close(() => resolve(selected));
  });
});
const token = "entitymanager-worker-contract-test";
const child = spawn(process.execPath, ["apps/browser-worker/dist/worker.cjs", "--port", String(port), "--token", token, "--chromium", "contract-test-chromium"], {
  stdio: ["ignore", "pipe", "pipe"]
});

try {
  let response;
  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      response = await fetch(`http://127.0.0.1:${port}/v1/health`, { headers: { Authorization: `Bearer ${token}` } });
      if (response.ok) break;
    } catch { /* worker is still starting */ }
    await delay(100);
  }
  assert.ok(response?.ok, "Browser Worker health endpoint did not become ready");
  const health = await response.json();
  assert.equal(health.ok, true);
  assert.equal(health.protocolVersion, "1.1");
  assert.equal(health.activeSessions, 0);
  const unauthorized = await fetch(`http://127.0.0.1:${port}/v1/health`);
  assert.equal(unauthorized.status, 401);
  process.stdout.write("Browser Worker protocol and authenticated heartbeat are valid.\n");
} finally {
  child.kill("SIGTERM");
}
