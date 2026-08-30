import type { ParsedPost, ProfileHeader } from "./types.js";

const VK_API_VERSION = "5.199";

interface VkWallGetResponse {
  response?: {
    items: Array<{
      id: number;
      owner_id: number;
      text: string;
      date: number;
      views?: { count: number };
      likes?: { count: number };
      reposts?: { count: number };
    }>;
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
      engagement: {
        views: item.views?.count,
        likes: item.likes?.count,
        reposts: item.reposts?.count,
      },
    }));
}

interface VkCover {
  enabled: number;
  images: Array<{ url: string; width: number; height: number }>;
}

interface VkGroupsGetByIdResponse {
  response?: {
    groups: Array<{
      name: string;
      description?: string;
      photo_max?: string;
      cover?: VkCover;
    }>;
  };
  error?: { error_code: number; error_msg: string };
}

// Обложка нужна только для превью в vision-анализе — берём среднеразмерный
// вариант (не самый большой из images, экономим токены на бессмысленном
// разрешении), с фолбэком на самый маленький, если меньше подходящих нет.
function pickCoverUrl(cover: VkCover | undefined): string | undefined {
  if (!cover?.enabled || cover.images.length === 0) return undefined;
  const midSized = cover.images.filter((img) => img.width <= 800);
  return (midSized.at(-1) ?? cover.images[0]).url;
}

export async function fetchVkProfileHeader(communityUrl: string): Promise<ProfileHeader> {
  const token = process.env.VK_SERVICE_TOKEN;
  if (!token) throw new Error("VK_SERVICE_TOKEN is not set");

  const domain = extractDomain(communityUrl);
  const params = new URLSearchParams({
    group_id: domain,
    fields: "cover,description,photo_max",
    v: VK_API_VERSION,
    access_token: token,
  });

  const res = await fetch(`https://api.vk.com/method/groups.getById?${params}`);
  const json = (await res.json()) as VkGroupsGetByIdResponse;
  if (json.error) {
    throw new Error(`VK API groups.getById failed (${json.error.error_code}): ${json.error.error_msg}`);
  }

  const group = json.response?.groups[0];
  return {
    name: group?.name,
    avatarUrl: group?.photo_max,
    coverUrl: pickCoverUrl(group?.cover),
    description: group?.description,
  };
}
