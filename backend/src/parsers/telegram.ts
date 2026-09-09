import * as cheerio from "cheerio";
import { proxiedFetch } from "../lib/outboundProxy.js";
import type { ParsedPost, ProfileHeader } from "./types.js";

// Разбираем публичное веб-превью канала, а не Bot API: свой канал клиента и
// канал конкурента должны читаться одинаково, а в чужом канале бот не админ и
// доступа к API у него нет.
function extractChannel(url: string): string {
  const cleaned = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^t\.me\//, "")
    .replace(/^s\//, "");
  return cleaned.split(/[/?]/)[0];
}

// t.me/s/ отображает просмотры сокращённо ("16.4M", "23K") — разворачиваем в число.
function parseViewCount(raw: string): number | undefined {
  const match = raw.trim().match(/^([\d.]+)([KM]?)$/i);
  if (!match) return undefined;
  const value = Number(match[1]);
  const multiplier = { K: 1_000, M: 1_000_000, "": 1 }[match[2].toUpperCase()] ?? 1;
  return Math.round(value * multiplier);
}

export async function fetchTelegramPosts(channelUrl: string, limit = 20): Promise<ParsedPost[]> {
  const channel = extractChannel(channelUrl);
  const res = await proxiedFetch(`https://t.me/s/${channel}`);
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
    const viewsRaw = wrapper.find(".tgme_widget_message_views").first().text();
    posts.push({
      text,
      date: new Date(dateAttr),
      url: `https://t.me/${postId}`,
      engagement: { views: viewsRaw ? parseViewCount(viewsRaw) : undefined },
    });
  });

  // Страница превью отдаёт посты в порядке от старых к новым — разворачиваем,
  // чтобы порядок совпадал с VK wall.get (там новые уже первыми).
  return posts.slice(-limit).reverse();
}

// У Telegram-канала нет обложки, только круглый аватар — в отличие от
// ВК-сообщества. Отдельного поля в ответе нет: аватар приходится доставать из
// разметки превью, потому что API для чужого канала недоступно.
export async function fetchTelegramProfileHeader(channelUrl: string): Promise<ProfileHeader> {
  const channel = extractChannel(channelUrl);
  const res = await proxiedFetch(`https://t.me/s/${channel}`);
  if (!res.ok) {
    throw new Error(`Telegram preview request failed (${res.status}) for channel "${channel}"`);
  }
  const html = await res.text();
  const $ = cheerio.load(html);

  return {
    name: $(".tgme_channel_info_header_title").first().text().trim() || undefined,
    avatarUrl: $(".tgme_page_photo_image img").first().attr("src"),
    description: $(".tgme_channel_info_description").first().text().trim() || undefined,
  };
}
