import { describe, expect, it } from "vitest";
import { extractChannel } from "./telegram.js";
import { extractDomain } from "./vk.js";

// Ссылку клиент вставляет как есть — из адресной строки, из мобильного
// приложения, из чужого сообщения. Неопознанный адрес не просто портит один
// этап: анализ аккаунта и конкурентов обязателен, и его падение останавливает
// весь прогон.
describe("extractChannel (Telegram)", () => {
  it.each([
    ["https://t.me/durov", "durov"],
    ["t.me/durov", "durov"],
    ["https://www.t.me/durov", "durov"],
    ["https://telegram.me/durov", "durov"],
    ["https://t.me/s/durov", "durov"],
    ["https://t.me/durov?before=100", "durov"],
    ["  https://T.me/Durov/  ", "Durov"],
  ])("%s -> %s", (input, expected) => {
    expect(extractChannel(input)).toBe(expected);
  });
});

describe("extractDomain (ВК)", () => {
  it.each([
    ["https://vk.com/durov", "durov"],
    ["https://www.vk.com/club123", "club123"],
    ["https://m.vk.com/club123", "club123"],
    ["vk.ru/durov", "durov"],
    ["https://vk.com/durov?w=wall1_1", "durov"],
    ["  VK.com/Durov  ", "Durov"],
  ])("%s -> %s", (input, expected) => {
    expect(extractDomain(input)).toBe(expected);
  });
});
