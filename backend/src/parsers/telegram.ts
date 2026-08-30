import * as cheerio from "cheerio";
import type { ParsedPost } from "./types.js";

// Публичное веб-превью, не Bot API — свой канал разбираем так же, как чужой
// канал конкурента, у которого бот не является админом. См. раздел 3
// спецификации, Шаг 1.
function extractChannel(url: string): string {
  const cleaned = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^t\.me\//, "")
    .replace(/^s\//, "");
  return cleaned.split(/[/?]/)[0];
}

export async function fetchTelegramPosts(channelUrl: string, limit = 20): Promise<ParsedPost[]> {
  const channel = extractChannel(channelUrl);
  const res = await fetch(`https://t.me/s/${channel}`);
  if (!res.ok) {
    throw new Error(`Telegram preview request failed (${res.status}) for channel "${channel}"`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  const posts: ParsedPost[] = [];
  $(".tgme_widget_message_wrap .tgme_widget_message").each((_, el) => {
    const wrapper = $(el);
    const postId = wrapper.attr("data-post");
    const text = wrapper.find(".tgme_widget_message_text").first().text().trim();
    const dateAttr = wrapper.find("time").first().attr("datetime");
    if (!text || !postId || !dateAttr) return;
    posts.push({ text, date: new Date(dateAttr), url: `https://t.me/${postId}` });
  });

  // Страница превью отдаёт посты в порядке от старых к новым — разворачиваем,
  // чтобы порядок совпадал с VK wall.get (там новые уже первыми).
  return posts.slice(-limit).reverse();
}
