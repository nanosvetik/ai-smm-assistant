import "./lib/loadEnv.js";

const { createApp } = await import("./app.js");
const { startTelegramBot } = await import("./telegram/bot.js");

const PORT = process.env.PORT ? Number(process.env.PORT) : 3000;
createApp().listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});

startTelegramBot().catch((err) => console.error("[telegram] bot crashed:", err));
