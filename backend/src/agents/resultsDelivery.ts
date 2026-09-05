import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, clients, copywriterPosts, reelsScripts, socialLinks } from "../db/schema.js";
import { generateResultsLink } from "../admin/resultsLink.js";
import { formatExpiryDate, isEmailConfigured, sendMail } from "../lib/email.js";
import { isTelegramConfigured, sendAdminMessage } from "../lib/telegram.js";

type Platform = "telegram" | "vk";

async function hasCopywriterPost(clientId: string, platform: Platform): Promise<boolean> {
  const [row] = await db
    .select({ id: copywriterPosts.id })
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
    .limit(1);
  return row != null;
}

async function hasReelsScript(clientId: string): Promise<boolean> {
  const [row] = await db.select({ id: reelsScripts.id }).from(reelsScripts).where(eq(reelsScripts.clientId, clientId)).limit(1);
  return row != null;
}

// Вызывается «на удачу» после каждого сохранения поста/сценария (см.
// routes/agents.ts, POST copywriter/reels-writer) — не часть основного
// ответа клиенту (fire-and-forget, ошибки только логируются). Идемпотентно:
// если results-ссылка для клиента уже существует, ничего не делает — вызов
// на 5-й клик подряд не создаёт 5 ссылок и не шлёт 5 писем.
export async function ensureResultsLinkSent(clientId: string): Promise<void> {
  const [existing] = await db
    .select({ token: accessLinks.token })
    .from(accessLinks)
    .where(and(eq(accessLinks.clientId, clientId), eq(accessLinks.kind, "results")))
    .limit(1);
  if (existing) return;

  const own = await db
    .select({ platform: socialLinks.platform })
    .from(socialLinks)
    .where(and(eq(socialLinks.clientId, clientId), eq(socialLinks.role, "own")));
  const platforms = [...new Set(own.map((r) => r.platform))] as Platform[];
  // Вакуумная истина на пустом массиве — тот же класс бага, что уже чинили
  // на фронтенде (DashboardScreen.tsx, isDone()): без явной проверки клиент
  // без единой own-ссылки считался бы «готовым» сразу.
  if (platforms.length === 0) return;

  const postsReady = await Promise.all(platforms.map((p) => hasCopywriterPost(clientId, p)));
  if (!postsReady.every(Boolean)) return;
  if (platforms.includes("vk") && !(await hasReelsScript(clientId))) return;

  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) return;

  const { link, expiresAt } = await generateResultsLink(clientId);

  if (isEmailConfigured()) {
    await sendMail(
      client.contactValue,
      "Ваш демо-контент готов",
      `Здравствуйте${client.name ? `, ${client.name}` : ""}!\n\nГотовый демо-контент — посты, картинка и сценарий Reels под ваш голос и метод — можно посмотреть здесь:\n${link}\n\nСсылка не одноразовая и действует до ${formatExpiryDate(expiresAt)} — возвращайтесь к ней в любой момент и смело пересылайте друзьям, коллегам, куда угодно, где это может быть интересно.`
    );
    return;
  }

  // SMTP не настроен — сообщаем оператору, чтобы переслать вручную, тем же
  // принципом, что и фолбэк в approval.ts для одобрения заявки.
  if (isTelegramConfigured()) {
    sendAdminMessage(
      `Демо-контент готов у клиента ${client.contactValue}${client.name ? ` (${client.name})` : ""}\n\nСсылка на результаты (перешлите клиенту вручную):\n${link}\nДействует до: ${expiresAt.toISOString()}`
    ).catch((err) => console.error("[results] failed to notify admin:", err));
  }
}
