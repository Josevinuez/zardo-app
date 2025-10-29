import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tsconfigPaths from "vite-tsconfig-paths";

if (
  process.env.HOST &&
  (!process.env.SHOPIFY_APP_URL || process.env.SHOPIFY_APP_URL === process.env.HOST)
) {
  process.env.SHOPIFY_APP_URL = process.env.HOST;
  delete process.env.HOST;
}

const appUrl = process.env.SHOPIFY_APP_URL || "http://localhost:5173";
const parsedUrl = new URL(appUrl.startsWith("http") ? appUrl : `https://${appUrl}`);
const host = parsedUrl.hostname;
const isLocalhost = host === "localhost";
const frontendPort = Number(process.env.FRONTEND_PORT || parsedUrl.port || 5173);
const backendPort = Number(process.env.BACKEND_PORT || process.env.API_PORT || 3000);
const clientBuildDir = process.env.CLIENT_BUILD_DIR ?? "build/client";

export default defineConfig({
  plugins: [react(), tsconfigPaths()],
  server: {
    host: "0.0.0.0",
    port: frontendPort,
    hmr: isLocalhost
      ? {
          protocol: "ws",
          host: "localhost",
          port: frontendPort,
          clientPort: frontendPort,
        }
      : {
          protocol: "wss",
          host,
          port: frontendPort,
          clientPort: 443,
        },
    proxy: {
      "/api": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: false,
        secure: false,
      },
      "/auth": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: false,
        secure: false,
      },
      "/webhooks": {
        target: `http://localhost:${backendPort}`,
        changeOrigin: false,
        secure: false,
      },
    },
  },
  define: {
    __SHOPIFY_API_KEY__: JSON.stringify(process.env.SHOPIFY_API_KEY ?? ""),
    __APP_PUBLIC_ENV__: JSON.stringify({
      SUPABASE_URL: process.env.SUPABASE_URL ?? "",
      SUPABASE_ANON_KEY: process.env.SUPABASE_ANON_KEY ?? "",
    }),
  },
  build: {
    outDir: clientBuildDir,
    emptyOutDir: false,
    manifest: true,
    assetsInlineLimit: 0,
  },
});
