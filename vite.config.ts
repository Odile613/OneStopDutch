import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The audio library is copied from public/ as-is; it is much larger than
    // the app bundle and does not benefit from inlining.
    assetsInlineLimit: 0,
  },
});
