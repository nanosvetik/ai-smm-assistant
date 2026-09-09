import { randomBytes, randomUUID } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateId(): string {
  return randomUUID();
}

// Двое суток на то, чтобы дойти до анкеты, и сутки на её заполнение с
// перерывами — сессия переживает закрытие вкладки.
export const ONBOARDING_LINK_TTL_MS = 48 * 60 * 60 * 1000;
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
// Ссылка на результаты живёт несопоставимо дольше и не сгорает при открытии:
// к ней возвращаются и её пересылают знакомым.
export const RESULTS_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 дней
