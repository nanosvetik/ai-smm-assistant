import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// /api проксируется на бэкенд в деве тем же способом, каким прод раздаёт оба
// сервиса под одним доменом через nginx/Caddy (раздел 7 спецификации) — cookie
// сессии работает как same-origin в обоих случаях, без CORS-настройки.
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      "/api": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
