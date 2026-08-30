import type { ParsedPost } from "./types.js";

const VK_API_VERSION = "5.199";

interface VkWallGetResponse {
  response?: {
    items: Array<{ id: number; owner_id: number; text: string; date: number }>;
  };
  error?: { error_code: number; error_msg: string };
}

// domain принимает как имена пользователей, так и короткие адреса сообществ
// (vk.com/durov -> "durov", vk.com/club123 -> "club123").
function extractDomain(url: string): string {
  const cleaned = url
    .trim()
    .replace(/^https?:\/\//, "")
    .replace(/^(vk\.com|vk\.ru)\//, "");
  return cleaned.split(/[/?]/)[0];
}

export async function fetchVkPosts(communityUrl: string, count = 20): Promise<ParsedPost[]> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) throw new Error("VK_SERVICE_TOKEN is not set");

  const domain = extractDomain(communityUrl);
  const params = new URLSearchParams({
    domain,
    count: String(count),
    v: VK_API_VERSION,
    access_token: token,
  });

  const res = await fetch(`https://api.vk.com/method/wall.get?${params}`);
  const json = (await res.json()) as VkWallGetResponse;
  if (json.error) {
    throw new Error(`VK API wall.get failed (${json.error.error_code}): ${json.error.error_msg}`);
  }

  return (json.response?.items ?? [])
    .filter((item) => item.text.trim().length > 0)
    .map((item) => ({
      text: item.text,
      date: new Date(item.date * 1000),
      url: `https://vk.com/wall${item.owner_id}_${item.id}`,
    }));
}
