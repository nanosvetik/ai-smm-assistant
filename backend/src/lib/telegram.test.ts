import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { isFromAdmin } from "./telegram.js";

const ADMIN = 424242;
const outsider = 999999;

const callback = (fromId: number, chatId: number) => ({
  id: "cb-1",
  data: "approve:some-request-id",
  from: { id: fromId },
  message: { message_id: 10, chat: { id: chatId } },
});

describe("isFromAdmin", () => {
  beforeEach(() => {
    process.env.TELEGRAM_ADMIN_CHAT_ID = String(ADMIN);
  });

  afterEach(() => {
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
  });

  it("пропускает нажатие оператора", () => {
    expect(isFromAdmin(callback(ADMIN, ADMIN))).toBe(true);
  });

  it("отклоняет нажатие постороннего", () => {
    // Кнопка выдаёт доступ к сервису: посторонний, добравшийся до бота, не
    // должен уметь одобрить собственную заявку.
    expect(isFromAdmin(callback(outsider, ADMIN))).toBe(false);
  });

  it("отклоняет нажатие из чужого чата", () => {
    expect(isFromAdmin(callback(ADMIN, outsider))).toBe(false);
  });

  it("отклоняет апдейт без отправителя", () => {
    expect(isFromAdmin({ id: "cb-2", data: "approve:x", message: { message_id: 1, chat: { id: ADMIN } } })).toBe(false);
  });

  it("отклоняет всё, если оператор не задан", () => {
    delete process.env.TELEGRAM_ADMIN_CHAT_ID;
    expect(isFromAdmin(callback(ADMIN, ADMIN))).toBe(false);
  });
});
