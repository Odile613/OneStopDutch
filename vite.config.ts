import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The audio library is copied from public/ as-is; it is much larger than
    // the app bundle and does not benefit from inlining.
    assetsInlineLimit: 0,
  },
  server: {
    // In development the AI backend is the Python FastAPI app on port 8000.
    // In production the same /api paths are served by a Netlify Function.
    proxy: {
      "/api": {
        target: "http://localhost:8000",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ""),
      },
    },
  },
});
