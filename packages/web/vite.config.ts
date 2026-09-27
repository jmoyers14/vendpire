import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Resolve @vendpire/domain to its TypeScript source so the shared calculation
// engine runs in the browser with no build step (esbuild transpiles it inline).
// The fs.allow entry lets Vite serve that sibling package from outside web/'s
// root.
const repoRoot = fileURLToPath(new URL("../..", import.meta.url));
const domainEntry = fileURLToPath(
  new URL("../domain/src/index.ts", import.meta.url),
);

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@vendpire/domain": domainEntry,
    },
  },
  server: {
    port: 5173,
    fs: {
      allow: [repoRoot],
    },
  },
});
