import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accessRouter } from "./routes/access.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { agentsRouter } from "./routes/agents.js";
import { reelsReferencesRouter } from "./routes/reelsReferences.js";
import { resultsRouter } from "./routes/results.js";
import { startTelegramBot } from "./telegram/bot.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const app = express();
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Раздача сгенерированных картинок (workspace/06-images/...) — на деве, вместо
// nginx/Caddy, которые в проде возьмут эту роль на себя (раздел 7
// спецификации). Тот же __dirname-паттерн, что уже используется в этом файле
// для .env (два уровня вверх от backend/src — корень проекта).
app.use("/media", express.static(path.join(__dirname, "..", "..", "workspace")));

// Раздача референсов клиента (workspace-у зеркально) — нужна, чтобы фронтенд
// мог показать превью загруженных фото на странице «Рилсы» (см.
// ReelsReferenceUpload.tsx). Публичные URL для референсов и так заложены
// разделом 7 спецификации, тот же принцип, что и для сгенерированного медиа.
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(__dirname, "..", "..", "uploads");
app.use("/uploads", express.static(UPLOAD_ROOT));

// resultsRouter — до онбординга/agents/reels-references: те три регистрируют
// requireSession через router.use() без пути, который матчит любой путь,
// прошедший внутрь роутера, и отвечает 401 сам, не вызывая next() — если бы
// resultsRouter стоял после них, запрос на /results/:token (без сессии,
// намеренно — это публичная read-only ссылка) до него бы просто не доходил.
app.use("/api", accessRouter);
app.use("/api", resultsRouter);
app.use("/api", onboardingRouter);
app.use("/api", agentsRouter);
app.use("/api", reelsReferencesRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

startTelegramBot().catch((err) => console.error("[telegram] bot crashed:", err));
