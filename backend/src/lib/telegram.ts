const API_BASE = "https://api.telegram.org";

function botToken(): string | undefined {
  return process.env.TELEGRAM_BOT_TOKEN;
}

export function isTelegramConfigured(): boolean {
  return Boolean(process.env.TELEGRAM_BOT_TOKEN && process.env.TELEGRAM_ADMIN_CHAT_ID);
}

async function callTelegram<T>(method: string, body: Record<string, unknown>): Promise<T> {
  const token = botToken();
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN is not set");

  const res = await fetch(`${API_BASE}/bot${token}/${method}`, {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  const json = (await res.json()) as { ok: boolean; result?: T; description?: string };
  if (!json.ok) {
    throw new Error(`Telegram API ${method} failed: ${json.description}`);
  }
  return json.result as T;
}

export interface InlineKeyboardButton {
  text: string;
  callback_data: string;
}

export function sendAdminMessage(text: string, buttons?: InlineKeyboardButton[][]) {
  const chatId = process.env.TELEGRAM_ADMIN_CHAT_ID;
  if (!chatId) throw new Error("TELEGRAM_ADMIN_CHAT_ID is not set");

  return callTelegram<{ message_id: number }>("sendMessage", {
    chat_id: Number(chatId),
    text,
    reply_markup: buttons ? { inline_keyboard: buttons } : undefined,
  });
}

export function editMessageText(chatId: number, messageId: number, text: string) {
  return callTelegram("editMessageText", {
    chat_id: chatId,
    message_id: messageId,
    text,
  });
}

export function answerCallbackQuery(callbackQueryId: string, text?: string) {
  return callTelegram("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text,
  });
}

export interface TelegramUpdate {
  update_id: number;
  callback_query?: {
    id: string;
    data?: string;
    message?: { message_id: number; chat: { id: number } };
  };
}

export function getUpdates(offset: number) {
  // allowed_updates ДОЛЖЕН передаваться явно на каждый вызов — иначе Telegram
  // применяет ограничение, заданное самым первым getUpdates-вызовом за всю
  // историю этого бота (в т.ч. до этого проекта), и молча не доставляет
  // остальные типы. На практике так и оказалось: у переиспользуемого бота
  // с прошлого раза стояло allowed_updates=["message"], из-за чего нажатия
  // инлайн-кнопок (callback_query) не долетали вообще без каких-либо ошибок.
  return callTelegram<TelegramUpdate[]>("getUpdates", {
    offset,
    timeout: 25,
    allowed_updates: ["message", "callback_query"],
  });
}
