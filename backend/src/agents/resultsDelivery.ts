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

// Вызовы по одному клиенту выстраиваются в очередь. Проверка «ссылка уже
// есть» и её создание — два отдельных обращения к базе, между которыми
// параллельный вызов успевает пройти ту же проверку: клиент, сгенерировавший
// последний пост в двух вкладках, получал два письма с двумя разными
// действующими ссылками. Сервис однопроцессный (SQLite на одном сервере, см.
// docs/decision-log.md), поэтому очереди в памяти достаточно; при переходе на
// несколько процессов понадобится уникальный индекс на (client_id, kind).
const pendingByClient = new Map<string, Promise<void>>();

export function ensureResultsLinkSent(clientId: string): Promise<void> {
  const previous = pendingByClient.get(clientId) ?? Promise.resolve();
  const next = previous.then(() => deliverResultsLink(clientId));

  // В очереди лежит заведомо не падающий промис: сбой одной доставки не должен
  // отменять следующую и не должен всплывать как необработанный — вызывающая
  // сторона получает исходный next и обрабатывает ошибку сама.
  const settled = next.catch(() => {});
  pendingByClient.set(clientId, settled);
  settled.then(() => {
    if (pendingByClient.get(clientId) === settled) pendingByClient.delete(clientId);
  });

  return next;
}

// Вызывается «на удачу» после каждого сохранения поста/сценария и после
// run-all (см. routes/agents.ts) — не часть основного ответа клиенту
// (fire-and-forget, ошибки только логируются). Идемпотентно: если
// results-ссылка для клиента уже существует, ничего не делает — вызов на 5-й
// клик подряд не создаёт 5 ссылок и не шлёт 5 писем.
async function deliverResultsLink(clientId: string): Promise<void> {
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

  // Ошибка отправки не должна прерывать функцию: ссылка в БД уже создана, а
  // значит следующий вызов выйдет по проверке `existing` в самом начале и
  // второй попытки не будет никогда. Без перехвата один сбой почты (адрес в
  // чёрном списке сервиса после отписки, недоступность API) означал бы, что
  // клиент не получит результат вообще, а оператор узнал бы об этом только из
  // логов — вызывают эту функцию fire-and-forget.
  let delivered = false;
  if (isEmailConfigured()) {
    try {
      await sendMail(
        client.contactValue,
        "Ваш демо-контент готов",
        `Здравствуйте${client.name ? `, ${client.name}` : ""}!\n\nГотовый демо-контент — посты, картинка и сценарий Reels под ваш голос и метод — можно посмотреть здесь:\n${link}\n\nСсылка не одноразовая и действует до ${formatExpiryDate(expiresAt)} — возвращайтесь к ней в любой момент и смело пересылайте друзьям, коллегам, куда угодно, где это может быть интересно.`
      );
      delivered = true;
    } catch (err) {
      console.error("[results] email delivery failed:", err);
    }
  }
  // Оператору сообщаем всегда, а не только при сбое отправки. Раньше
  // уведомление уходило лишь тогда, когда письмо не удалось отдать почтовому
  // сервису, — но письмо, попавшее в «Спам», сервис считает доставленным.
  // Получался беззвучный отказ с обеих сторон: клиент не знал, что работа
  // закончена, оператор не знал, что клиент не знает.
  if (isTelegramConfigured()) {
    const mailLine = delivered
      ? "Письмо отправлено. Оно может попасть в «Спам» — если клиент молчит, перешлите ссылку сами:"
      : "Письмо клиенту не ушло — перешлите ссылку вручную:";
    sendAdminMessage(
      `Демо-контент готов у клиента ${client.contactValue}${client.name ? ` (${client.name})` : ""}\n\n${mailLine}\n${link}\nДействует до: ${formatExpiryDate(expiresAt)}`
    ).catch((err) => console.error("[results] failed to notify admin:", err));
  }
}
