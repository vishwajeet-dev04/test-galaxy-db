import { readFileSync } from "node:fs";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { VitePWA } from "vite-plugin-pwa";

/** Manifest and <meta name="theme-color"> need literal colours; read them from the @theme tokens. */
function themeColor(token: string): string {
  const css = readFileSync(new URL("./src/index.css", import.meta.url), "utf8");
  const match = css.match(new RegExp(`--color-${token}:\\s*([^;]+);`));
  if (!match) throw new Error(`Theme token --color-${token} not found in src/index.css`);
  return match[1].trim();
}

const THEME_COLOR = themeColor("galaxy-navy");
const BACKGROUND_COLOR = themeColor("galaxy-surface");

function themeColorMeta(): Plugin {
  return {
    name: "galaxy-theme-color-meta",
    transformIndexHtml: () => [
      { tag: "meta", attrs: { name: "theme-color", content: THEME_COLOR }, injectTo: "head" },
    ],
  };
}

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    themeColorMeta(),
    VitePWA({
      // "prompt": a new deploy waits for the user's Reload click instead of swapping code mid-session.
      registerType: "prompt",
      manifest: {
        id: "/",
        name: "Galaxy Sales Performance Tracker",
        short_name: "Galaxy",
        description: "Individual Contributor's Performance Tracker FY 26-27",
        start_url: "/",
        scope: "/",
        display: "standalone",
        orientation: "any",
        theme_color: THEME_COLOR,
        background_color: BACKGROUND_COLOR,
        icons: [
          { src: "pwa-64x64.png", sizes: "64x64", type: "image/png" },
          { src: "pwa-192x192.png", sizes: "192x192", type: "image/png" },
          { src: "pwa-512x512.png", sizes: "512x512", type: "image/png" },
          { src: "maskable-icon-512x512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      workbox: {
        // App shell only. API responses are role-scoped (an IC sees only their own deals) and change
        // on every Sync, so they are never cached: a shared device must not replay another login's data.
        globPatterns: ["**/*.{js,css,html,ico,png,svg,webp,woff2}"],
        globIgnores: ["avatars/**", "data/**", "SanjayPatodia.png"],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//, /^\/data\//],
        cleanupOutdatedCaches: true,
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.googleapis.com",
            handler: "StaleWhileRevalidate",
            options: { cacheName: "google-fonts-css" },
          },
          {
            urlPattern: ({ url }) => url.origin === "https://fonts.gstatic.com",
            handler: "CacheFirst",
            options: {
              cacheName: "google-fonts-files",
              cacheableResponse: { statuses: [0, 200] },
              expiration: { maxEntries: 20, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
          {
            urlPattern: ({ url, sameOrigin }) => sameOrigin && url.pathname.startsWith("/avatars/"),
            handler: "CacheFirst",
            options: {
              cacheName: "avatars",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
      // Keep `npm run dev` (5173 → /api on 8080) free of a service worker.
      devOptions: { enabled: false },
    }),
  ],
  server: {
    // Sync writes quota_data.json here; a full reload would dump Admin back to Overview.
    watch: {
      ignored: ["**/public/data/**"],
    },
    proxy: {
      "/api": {
        // Local Galaxy API. Vite proxies /api here (scripts/run_backend.ps1).
        target: "http://127.0.0.1:8080",
        changeOrigin: true,
      },
    },
  },
});
