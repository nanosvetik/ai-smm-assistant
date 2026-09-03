import { randomBytes, randomUUID } from "node:crypto";

export function generateToken(): string {
  return randomBytes(32).toString("base64url");
}

export function generateId(): string {
  return randomUUID();
}

export const ONBOARDING_LINK_TTL_MS = 48 * 60 * 60 * 1000; // 48h, см. раздел 2 спецификации
export const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24h
// Read-only ссылка на результаты — живёт заметно дольше онбординговой и не
// сгорает при использовании (см. раздел 2 спецификации: клиент может
// вернуться посмотреть или переслать её кому-то ещё).
export const RESULTS_LINK_TTL_MS = 90 * 24 * 60 * 60 * 1000; // 90 дней
