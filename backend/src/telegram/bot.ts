import { ApprovalError, approveRequest, rejectRequest } from "../admin/approval.js";
import { answerCallbackQuery, editMessageText, getUpdates, isTelegramConfigured, type TelegramUpdate } from "../lib/telegram.js";

let offset = 0;
let running = false;

async function handleUpdate(update: TelegramUpdate) {
  console.log("[telegram] update:", JSON.stringify(update));
  const cb = update.callback_query;
  if (!cb?.data || !cb.message) {
    console.log("[telegram] update has no callback_query.data/message, ignoring");
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
      const deliveryLine = delivered
        ? `Ссылка отправлена клиенту на ${request.contactValue}.`
        : `Отправьте ссылку клиенту вручную (${request.contactType}:${request.contactValue}):\n${link}`;
      await editMessageText(
        cb.message.chat.id,
        cb.message.message_id,
        `✅ Одобрено: ${request.contactType}:${request.contactValue}\n\n${deliveryLine}\nДействует до: ${expiresAt.toISOString()}`
      );
    } else {
      const { request } = await rejectRequest(requestId);
      await answerCallbackQuery(cb.id, "Отклонено");
      await editMessageText(cb.message.chat.id, cb.message.message_id, `❌ Отклонено: ${request.contactType}:${request.contactValue}`);
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
