import assert from "node:assert/strict";
import fs from "node:fs";

const ui = fs.readFileSync("apps/desktop/src/main.tsx", "utf8");
const rust = fs.readFileSync("apps/desktop/src-tauri/src/lib.rs", "utf8");
const invoked = [...ui.matchAll(/invoke(?:<[^>]+>)?\(\s*["']([^"']+)/g)].map((match) => match[1]);
const handler = rust.match(/generate_handler!\s*\[([\s\S]*?)\]\s*\)/)?.[1] ?? "";
const registered = handler.split(",").map((name) => name.trim()).filter(Boolean);
const missing = [...new Set(invoked)].filter((name) => !registered.includes(name));

assert.deepEqual(missing, [], `UI calls unregistered Tauri commands: ${missing.join(", ")}`);
console.log(`Command contract OK: ${new Set(invoked).size} UI commands are registered by Tauri.`);
