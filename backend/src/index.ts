import express from "express";
import cookieParser from "cookie-parser";
import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { accessRouter } from "./routes/access.js";
import { onboardingRouter } from "./routes/onboarding.js";
import { agentsRouter } from "./routes/agents.js";
import { reelsReferencesRouter } from "./routes/reelsReferences.js";
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

app.use("/api", accessRouter);
app.use("/api", onboardingRouter);
app.use("/api", agentsRouter);
app.use("/api", reelsReferencesRouter);

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

startTelegramBot().catch((err) => console.error("[telegram] bot crashed:", err));
