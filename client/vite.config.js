import { dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  // Pinned so `vite build --config client/vite.config.js` works from the repo
  // root, which is where Railway (and npm run build) invokes it.
  root: dirname(fileURLToPath(import.meta.url)),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // In dev the API stays on the Express server; in production both are the
    // same origin, so the client always calls relative /api paths.
    proxy: { "/api": { target: "http://localhost:8080", changeOrigin: true } },
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
