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
      // Сгенерированные картинки (workspace/06-images/...) — та же
      // same-origin логика, что и /api, см. index.ts на бэкенде.
      "/media": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
      // Референсы клиента (uploads/...) — та же логика, что и /media. Без
      // этого прокси браузер стучится в сам Vite-сервер вместо бэкенда,
      // <img> получает не картинку, а страницу фронтенда (или 404).
      "/uploads": {
        target: "http://localhost:3000",
        changeOrigin: true,
      },
    },
  },
});
