import { Router } from "express";
import { z } from "zod";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, accessRequests, sessions } from "../db/schema.js";
import { generateId, generateToken, SESSION_TTL_MS } from "../lib/tokens.js";
import { isTelegramConfigured, sendAdminMessage } from "../lib/telegram.js";

export const accessRouter = Router();

// Канал связи только почтовый, поэтому проверяется именно формат адреса, а не
// «строка непустая»: раньше сюда мог прийти и юзернейм телеграма.
const accessRequestSchema = z.object({
  email: z.string().trim().email().max(200),
  // Имя необязательно и собирается только чтобы обращаться к человеку по
  // имени — никаких других персональных данных лендинг не запрашивает.
  name: z.string().trim().min(1).max(100).optional(),
});

// Публичный эндпоинт лендинга. Ничего не выдаёт сразу: заявка ждёт ручного
// подтверждения оператором — автоматической выдачи доступа в продукте нет.
accessRouter.post("/access-requests", async (req, res) => {
  const parsed = accessRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const id = generateId();
  await db.insert(accessRequests).values({
    id,
    contactType: "email",
    contactValue: parsed.data.email,
    name: parsed.data.name ?? null,
    status: "pending",
    createdAt: new Date(),
  });

  const namePrefix = parsed.data.name ? `${parsed.data.name} · ` : "";
  if (isTelegramConfigured()) {
    sendAdminMessage(
      `Новая заявка на демо-доступ\n${namePrefix}${parsed.data.email}`,
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

// Обмен ссылки на сессию. Открытие страницы ссылку **не** сжигает — она
// помечается использованной только после успешной отправки анкеты. Причина:
// почтовые антивирусы и предпросмотр в почтовых клиентах ходят по ссылкам
// сами, раньше человека. Пока ссылка сгорала на первом GET, такой заход
// убивал её, и живой клиент получал «уже использована», ничего не сделав.
// Ограничение по времени работает независимо и осталось прежним.
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
