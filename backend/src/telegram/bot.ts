import { ApprovalError, approveRequest, rejectRequest } from "../admin/approval.js";
import {
  answerCallbackQuery,
  editMessageText,
  getUpdates,
  isFromAdmin,
  isTelegramConfigured,
  type TelegramUpdate,
} from "../lib/telegram.js";

let offset = 0;
let running = false;

async function handleUpdate(update: TelegramUpdate) {
  const cb = update.callback_query;
  if (!cb?.data || !cb.message) {
    console.log("[telegram] update without callback data, ignoring");
    return;
  }

  // Проверка до разбора данных: нажатие кнопки выдаёт доступ к сервису, и
  // выполнять его можно только по команде оператора.
  if (!isFromAdmin(cb)) {
    console.warn(`[telegram] callback from non-admin ${cb.from?.id ?? "unknown"}, ignoring`);
    return;
  }

  const [action, requestId] = cb.data.split(":");
  if (!requestId || (action !== "approve" && action !== "reject")) {
    console.log(`[telegram] unrecognized callback_data: ${cb.data}`);
    return;
  }
  console.log(`[telegram] handling ${action} for request ${requestId}`);

  try {
    if (action === "approve") {
      const { request, link, expiresAt, delivered } = await approveRequest(requestId);
      await answerCallbackQuery(cb.id, "Одобрено");
      // Ссылка печатается в обеих ветках, как и в CLI-скрипте одобрения.
      // Успешная отправка означает только то, что письмо принял почтовый API:
      // оно уже ложилось в «Спам», и тогда единственным рабочим экземпляром
      // ссылки оказывался тот, что у оператора. Первая строка при этом разная —
      // «ушло само» и «отправь руками» должны различаться с одного взгляда,
      // иначе оператор перестанет замечать отказы доставки.
      const deliveryLine = delivered
        ? `Ссылка отправлена клиенту на ${request.contactValue}.\nКопия на случай, если письмо не дойдёт:\n${link}`
        : `Отправьте ссылку клиенту вручную (${request.contactValue}):\n${link}`;
      await editMessageText(
        cb.message.chat.id,
        cb.message.message_id,
        `✅ Одобрено: ${request.contactValue}\n\n${deliveryLine}\nДействует до: ${expiresAt.toISOString()}`
      );
    } else {
      const { request } = await rejectRequest(requestId);
      await answerCallbackQuery(cb.id, "Отклонено");
      await editMessageText(cb.message.chat.id, cb.message.message_id, `❌ Отклонено: ${request.contactValue}`);
    }
    console.log(`[telegram] ${action} succeeded for ${requestId}`);
  } catch (err) {
    console.error(`[telegram] ${action} FAILED for ${requestId}:`, err);
    const message = err instanceof ApprovalError ? err.message : "Ошибка обработки заявки";
    await answerCallbackQuery(cb.id, message).catch((e) => console.error("[telegram] answerCallbackQuery also failed:", e));
  }
}

// Long polling, не webhook — не требует публичного HTTPS-домена, подходит и
// для локальной разработки, и для self-hosted прода без лишней инфраструктуры.
export async function startTelegramBot() {
  if (!isTelegramConfigured()) {
    console.log("[telegram] TELEGRAM_BOT_TOKEN/TELEGRAM_ADMIN_CHAT_ID не заданы — уведомления отключены");
    return;
  }
  if (running) return;
  running = true;
  console.log("[telegram] bot polling started");

  while (running) {
    try {
      const updates = await getUpdates(offset);
      for (const update of updates) {
        offset = update.update_id + 1;
        await handleUpdate(update);
      }
    } catch (err) {
      console.error("[telegram] polling error:", err);
      await new Promise((resolve) => setTimeout(resolve, 5000));
    }
  }
}
