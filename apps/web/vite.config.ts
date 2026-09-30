/**
 * Build da interface. O resultado (`dist/`) é embutido no executável do servidor
 * (`apps/servidor/scripts/empacotar.ts`). Em desenvolvimento, o Vite (porta 5173) repassa `/api` e
 * `/ws` ao servidor (`bun run servidor -- --dev`, porta 47800).
 */
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const SERVIDOR = "127.0.0.1:47800";

export default defineConfig({
  plugins: [react()],
  build: {
    // Chrome/Edge 109: última versão para Windows 7/8.1; margem para máquinas de laboratório antigas.
    target: ["chrome109", "edge109", "firefox115"],
    outDir: "dist",
    assetsDir: "assets",
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": `http://${SERVIDOR}`,
      "/ws": { target: `ws://${SERVIDOR}`, ws: true },
    },
  },
});
