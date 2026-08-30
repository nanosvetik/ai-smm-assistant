import { fetchTelegramPosts, fetchTelegramProfileHeader } from "./telegram.js";
import { fetchVkPosts, fetchVkProfileHeader } from "./vk.js";
import type { ParsedPost, ProfileHeader } from "./types.js";

export type { ParsedPost, ProfileHeader };

export function fetchPosts(platform: "telegram" | "vk", url: string, limit = 20): Promise<ParsedPost[]> {
  return platform === "telegram" ? fetchTelegramPosts(url, limit) : fetchVkPosts(url, limit);
}

export function fetchProfileHeader(platform: "telegram" | "vk", url: string): Promise<ProfileHeader> {
  return platform === "telegram" ? fetchTelegramProfileHeader(url) : fetchVkProfileHeader(url);
}
