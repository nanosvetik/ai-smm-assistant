import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, accessRequests, sessions } from "../db/schema.js";
import { generateId, generateToken, SESSION_TTL_MS } from "../lib/tokens.js";
import { isTelegramConfigured, sendAdminMessage } from "../lib/telegram.js";

export const accessRouter = Router();

const accessRequestSchema = z.object({
  contactType: z.enum(["email", "telegram", "vk"]),
  contactValue: z.string().trim().min(1).max(200),
  // Необязательные лид-данные (решение сессии 2026-09-03) — не полные перс.
  // данные, максимум имя для будущей связи/предложений.
  name: z.string().trim().min(1).max(100).optional(),
});

// Публичный эндпоинт с лендинга ("Получить демо-доступ"). Ничего не выдаёт
// сразу — заявка ждёт ручного подтверждения оператором, см. раздел 2
// Project Specification v2.md.
accessRouter.post("/access-requests", async (req, res) => {
  const parsed = accessRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const id = generateId();
  await db.insert(accessRequests).values({
    id,
    contactType: parsed.data.contactType,
    contactValue: parsed.data.contactValue,
    name: parsed.data.name ?? null,
    status: "pending",
    createdAt: new Date(),
  });

  const namePrefix = parsed.data.name ? `${parsed.data.name} · ` : "";
  if (isTelegramConfigured()) {
    sendAdminMessage(
      `Новая заявка на демо-доступ\n${namePrefix}[${parsed.data.contactType}] ${parsed.data.contactValue}`,
      [
        [
          { text: "✅ Одобрить", callback_data: `approve:${id}` },
          { text: "❌ Отклонить", callback_data: `reject:${id}` },
        ],
      ]
    ).catch((err) => console.error("[telegram] failed to notify admin:", err));
  }

  res.status(201).json({ id, status: "pending" });
});

// Обмен одноразовой ссылки на сессию. Сгорает по факту первого успешного
// использования, не по IP (см. раздел 2 спецификации — там объяснено почему).
accessRouter.get("/access/:token", async (req, res) => {
  const { token } = req.params;

  const [link] = await db.select().from(accessLinks).where(eq(accessLinks.token, token)).limit(1);

  if (!link || link.kind !== "onboarding") {
    res.status(404).json({ error: "link_not_found" });
    return;
  }
  if (link.usedAt) {
    res.status(410).json({ error: "link_already_used" });
    return;
  }
  if (link.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "link_expired" });
    return;
  }

  const now = new Date();
  await db.update(accessLinks).set({ usedAt: now }).where(eq(accessLinks.token, token));

  const sessionToken = generateToken();
  const sessionExpiresAt = new Date(now.getTime() + SESSION_TTL_MS);
  await db.insert(sessions).values({
    token: sessionToken,
    clientId: link.clientId,
    createdAt: now,
    expiresAt: sessionExpiresAt,
  });

  res.cookie("session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    expires: sessionExpiresAt,
  });

  res.json({ status: "ok", expiresAt: sessionExpiresAt.toISOString() });
});
