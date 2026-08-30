import { fetchTelegramPosts } from "./telegram.js";
import { fetchVkPosts } from "./vk.js";
import type { ParsedPost } from "./types.js";

export type { ParsedPost };

export function fetchPosts(platform: "telegram" | "vk", url: string, limit = 20): Promise<ParsedPost[]> {
  return platform === "telegram" ? fetchTelegramPosts(url, limit) : fetchVkPosts(url, limit);
}
