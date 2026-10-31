import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          auth: ["@supabase/supabase-js"],
          react: ["react", "react-dom"],
        },
      },
    },
  },
  server: { proxy: { "/api": "http://127.0.0.1:3000" } },
});
