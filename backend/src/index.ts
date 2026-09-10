import "./lib/loadEnv.js";

const { createApp } = await import("./app.js");
const { startTelegramBot } = await import("./telegram/bot.js");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;

// Адрес привязки настраивается, потому что у запусков разные требования. В
// Docker-сборке к API обращается nginx из соседнего контейнера, поэтому по
// умолчанию слушаются все интерфейсы. На сервере, где приложение стоит за
// веб-сервером на той же машине, HOST=127.0.0.1 обязателен: иначе порт API
// открыт напрямую в интернет в обход TLS, и сессионная кука уходит открытым
// текстом.
const HOST = process.env.HOST ?? "0.0.0.0";

createApp().listen(PORT, HOST, () => {
  console.log(`Backend listening on ${HOST}:${PORT}`);
});

startTelegramBot().catch((err) => console.error("[telegram] bot crashed:", err));
