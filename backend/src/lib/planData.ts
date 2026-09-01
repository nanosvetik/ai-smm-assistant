// Структурированный JSON-блок из ответа content-planner (см.
// prompts/content-planner.md, "Структурированный JSON-блок") — код читает
// его отдельно от человекочитаемого текста документа, чтобы строить сетку
// в кабинете и выгрузку в таблицу на надёжных данных, а не разбором вольного
// markdown. Тот же принцип, что и parseFrontmatter в frontmatter.ts: модель
// может дописать текст до/после блока, поэтому ищем и валидируем, а не
// доверяем позиции в строке.

export type Platform = "telegram" | "vk";

export interface PlanPost {
  day: number;
  platform: Platform;
  theme: string;
  title: string;
  pattern: string | null;
}

export interface PlanReelsIdea {
  theme: string;
  hook: string;
  needsReferences: boolean;
  pattern: string | null;
}

export interface PlanData {
  posts: PlanPost[];
  reels: PlanReelsIdea[];
}

function isPlanPost(value: unknown): value is PlanPost {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.day === "number" &&
    (v.platform === "telegram" || v.platform === "vk") &&
    typeof v.theme === "string" &&
    typeof v.title === "string" &&
    (v.pattern === null || typeof v.pattern === "string")
  );
}

function isPlanReelsIdea(value: unknown): value is PlanReelsIdea {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.theme === "string" &&
    typeof v.hook === "string" &&
    typeof v.needsReferences === "boolean" &&
    (v.pattern === null || typeof v.pattern === "string")
  );
}

// Перебираем все ```json-блоки по порядку (не только первый) — та же защита
// от decoy-разделителей, что и в findFrontmatterBlocks, на случай если модель
// вставит другой ```json где-то ещё в тексте до настоящего блока плана.
export function parsePlanData(document: string): PlanData | null {
  const blocks = [...document.matchAll(/```json\s*\n([\s\S]*?)\n```/g)];
  for (const block of blocks) {
    try {
      const parsed = JSON.parse(block[1]);
      if (!parsed || typeof parsed !== "object") continue;
      const posts = (parsed as Record<string, unknown>).posts;
      const reels = (parsed as Record<string, unknown>).reels;
      if (!Array.isArray(posts) || !Array.isArray(reels)) continue;
      if (!posts.every(isPlanPost) || !reels.every(isPlanReelsIdea)) continue;
      return { posts, reels };
    } catch {
      continue;
    }
  }
  return null;
}
