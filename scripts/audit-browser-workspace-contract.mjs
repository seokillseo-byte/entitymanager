import { readFile } from "node:fs/promises";

const config = JSON.parse(await readFile("apps/desktop/src-tauri/tauri.conf.json", "utf8"));
const mainSource = await readFile("apps/desktop/src/main.tsx", "utf8");
const rustSource = await readFile("apps/desktop/src-tauri/src/lib.rs", "utf8");

const workspace = config.app?.windows?.find((window) => window.label === "browser-workspace");
if (!workspace) throw new Error("browser-workspace must be declared as a static Tauri window.");
if (workspace.url !== "index.html") throw new Error("browser-workspace must load the exact index.html asset without query/hash routing.");
if (workspace.visible !== false) throw new Error("browser-workspace must start hidden and be shown only when requested.");
if (!mainSource.includes('getCurrentWebviewWindow().label === "browser-workspace"')) {
  throw new Error("Desktop must select BrowserWorkspace by Tauri window label.");
}
if (!rustSource.includes('tauri::WebviewUrl::App("index.html".into())')) {
  throw new Error("Dynamic Browser Workspace fallback must load exact index.html.");
}
if (/index\.html[?#]browser-workspace/.test(rustSource)) {
  throw new Error("Browser Workspace app URL must not contain query/hash routing.");
}

console.log("Browser Workspace contract OK: static exact index.html + label-based routing.");
