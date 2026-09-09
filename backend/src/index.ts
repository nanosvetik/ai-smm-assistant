import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// Переменные загружаются до импорта приложения: модули читают их на верхнем
// уровне (путь к базе, ключи внешних сервисов), и статический import был бы
// выполнен раньше этой строки.
dotenv.config({ path: path.join(__dirname, "..", "..", ".env") });

const { createApp } = await import("./app.js");
const { startTelegramBot } = await import("./telegram/bot.js");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
createApp().listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

startTelegramBot().catch((err) => console.error("[telegram] bot crashed:", err));
