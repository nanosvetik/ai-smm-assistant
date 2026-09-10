import type { ParsedPost } from "../parsers/index.js";

// Формат постов для сообщения модели общий у нескольких агентов: анализ
// аккаунта строит на них стиль, распаковка экспертности вытаскивает метод.
// Общая функция нужна, чтобы формат не разъезжался между ними — промпты
// написаны под конкретный вид этих блоков.
function formatPlatform(platform: string, posts: ParsedPost[]): string {
  if (posts.length === 0) return `### ${platform}\nПосты не найдены.`;
  const body = posts
    .map((p) => `- [${p.date.toISOString().slice(0, 10)}] (${p.url})\n${p.text}`)
    .join("\n\n");
  return `### ${platform}\n${body}`;
}

export function buildPostsContext(
  postsByPlatform: Record<string, ParsedPost[]>,
  heading = "# Посты эксперта"
): string {
  const sections = Object.entries(postsByPlatform).map(([platform, posts]) =>
    formatPlatform(platform, posts)
  );
  return `${heading}\n\n${sections.join("\n\n")}`;
}
