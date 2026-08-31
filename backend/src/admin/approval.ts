import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, accessRequests, clients } from "../db/schema.js";
import { generateId, generateToken, ONBOARDING_LINK_TTL_MS } from "../lib/tokens.js";

export class ApprovalError extends Error {}

// Общая логика для CLI-скриптов (npm run admin:approve) и Telegram-бота
// (кнопка "Одобрить" в уведомлении) — один путь принятия решения, не два.
export async function approveRequest(requestId: string) {
  const [request] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
  if (!request) throw new ApprovalError(`No access request with id ${requestId}`);
  if (request.status !== "pending") {
    throw new ApprovalError(`Request ${requestId} is already ${request.status}`);
  }

  const now = new Date();
  const clientId = generateId();
  await db.insert(clients).values({
    id: clientId,
    contactType: request.contactType,
    contactValue: request.contactValue,
    createdAt: now,
  });

  const token = generateToken();
  const expiresAt = new Date(now.getTime() + ONBOARDING_LINK_TTL_MS);
  await db.insert(accessLinks).values({
    token,
    clientId,
    kind: "onboarding",
    expiresAt,
    createdAt: now,
  });

  await db
    .update(accessRequests)
    .set({ status: "approved", clientId, reviewedAt: now })
    .where(eq(accessRequests.id, requestId));

  // BASE_URL — публичный origin, который видит пользователь (фронтенд), не
  // бэкенд напрямую: /api/access/:token отдаёт голый JSON, не HTML — ссылка
  // должна вести на экран, который сам вызовет эту ручку и покажет результат.
  // В деве это порт Vite (5173), не бэкенда (3000); в проде — один домен на
  // оба сервиса через nginx/Caddy (раздел 7 спецификации), тот же BASE_URL.
  const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
  return { request, link: `${baseUrl}/onboarding/${token}`, expiresAt };
}

export async function rejectRequest(requestId: string) {
  const [request] = await db.select().from(accessRequests).where(eq(accessRequests.id, requestId)).limit(1);
  if (!request) throw new ApprovalError(`No access request with id ${requestId}`);
  if (request.status !== "pending") {
    throw new ApprovalError(`Request ${requestId} is already ${request.status}`);
  }

  await db
    .update(accessRequests)
    .set({ status: "rejected", reviewedAt: new Date() })
    .where(eq(accessRequests.id, requestId));

  return { request };
}
