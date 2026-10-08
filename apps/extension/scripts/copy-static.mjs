import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const files = ["manifest.json", "popup.html", "popup.css"];
const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const distRoot = join(packageRoot, "dist");

await mkdir(distRoot, { recursive: true });

for (const file of files) {
  const destination = join(distRoot, file);
  await mkdir(dirname(destination), { recursive: true });
  await copyFile(join(packageRoot, file), destination);
}
