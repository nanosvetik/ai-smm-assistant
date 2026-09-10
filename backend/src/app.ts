import express from "express";
import cookieParser from "cookie-parser";
import { accessRouter } from "./routes/access.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { agentsRouter } from "./routes/agents.js";
import { reelsReferencesRouter } from "./routes/reelsReferences.js";
import { resultsRouter } from "./routes/results.js";
import { staticSecurityHeaders } from "./lib/uploads.js";
import { UPLOAD_ROOT, WORKSPACE_ROOT } from "./lib/paths.js";

// Сборка приложения отделена от запуска: тесты поднимают его на случайном
// порту, не трогая ни настоящую базу, ни телеграм-бота.
export function createApp() {
  const app = express();
  app.use(express.json());
  app.use(cookieParser());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  // Раздача сгенерированных картинок и видео. Эти файлы должны открываться по
  // прямой ссылке — из письма и со страницы результатов, поэтому доступ к ним
  // не закрыт сессией (последствия описаны в docs/security.md).
  app.use("/media", express.static(WORKSPACE_ROOT, { setHeaders: staticSecurityHeaders }));

  // Зеркальная раздача референсов, загруженных клиентом: без неё интерфейс не
  // покажет превью только что добавленного файла. Заголовки здесь обязательны —
  // содержимое пришло от клиента и лежит на том же домене, что и сервис.
  app.use("/uploads", express.static(UPLOAD_ROOT, { setHeaders: staticSecurityHeaders }));

  // Порядок обязателен: публичные роутеры идут раньше защищённых. Три нижних
  // подключают проверку сессии через use() без пути — такой обработчик
  // перехватывает любой дошедший запрос и отвечает 401 сам, не передавая его
  // дальше. Публичный маршрут, оказавшийся ниже, просто перестанет
  // существовать (docs/security.md).
  app.use("/api", accessRouter);
  app.use("/api", resultsRouter);
  app.use("/api", onboardingRouter);
  app.use("/api", agentsRouter);
  app.use("/api", reelsReferencesRouter);

  return app;
}
