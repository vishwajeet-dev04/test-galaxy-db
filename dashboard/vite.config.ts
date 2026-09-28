import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
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
