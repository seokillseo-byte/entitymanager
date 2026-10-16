import { cp, mkdir, rm } from "node:fs/promises";
import { resolve } from "node:path";

const source = resolve("apps/extension/dist");
const destination = resolve("apps/desktop/src-tauri/resources/extension");

await rm(destination, { recursive: true, force: true });
await mkdir(destination, { recursive: true });
await cp(source, destination, { recursive: true });
console.log(`Staged managed-browser extension at ${destination}`);
