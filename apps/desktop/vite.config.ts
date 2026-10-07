import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "node:url";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@entitymanager/shared": fileURLToPath(new URL("../../packages/shared/src/index.ts", import.meta.url)),
      "@entitymanager/workflow": fileURLToPath(new URL("../../packages/workflow/src/index.ts", import.meta.url))
    }
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true
  },
  envPrefix: ["VITE_", "TAURI_"]
});
