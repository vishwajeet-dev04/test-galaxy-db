import type { CapacitorConfig } from "@capacitor/cli";

/**
 * Android shell ships the built UI (dist) so CSS/JS always load.
 * API calls go to staging over HTTP (see src/utils/apiBase.ts) — cleartext required until HTTPS.
 */
const config: CapacitorConfig = {
  appId: "com.goapl.galaxy",
  appName: "Galaxy",
  webDir: "dist",
  server: {
    // No remote server.url — local assets fix the unstyled WebView issue.
    cleartext: true,
    allowNavigation: ["20.219.14.83"],
  },
  android: {
    allowMixedContent: true,
  },
};

export default config;
