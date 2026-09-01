import type { AgentResult, Platform } from "./api";

// Зеркало backend/src/lib/planData.ts — тот же структурированный JSON-блок
// content-planner, но здесь только чтение уже сохранённого поля из ответа
// API, не парсинг markdown-документа заново.

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

export interface ContentPlanData {
  platforms: Platform[];
  posts: PlanPost[];
  reels: PlanReelsIdea[];
}

// null — planItems/reelsIdeas не сохранились (модель не выдала валидный JSON,
// см. backend/src/lib/planData.ts) или result ещё не пришёл. Экран в этом
// случае честно откатывается на рендер исходного документа, не подставляет
// пустую сетку.
export function parseContentPlanData(result: AgentResult | null): ContentPlanData | null {
  if (!result) return null;
  const planItemsRaw = result.planItems;
  const reelsIdeasRaw = result.reelsIdeas;
  const platformsRaw = result.platforms;
  if (typeof planItemsRaw !== "string" || typeof reelsIdeasRaw !== "string" || typeof platformsRaw !== "string") {
    return null;
  }
  try {
    const posts = JSON.parse(planItemsRaw) as PlanPost[];
    const reels = JSON.parse(reelsIdeasRaw) as PlanReelsIdea[];
    const platforms = JSON.parse(platformsRaw) as Platform[];
    if (!Array.isArray(posts) || !Array.isArray(reels) || !Array.isArray(platforms)) return null;
    return { platforms, posts, reels };
  } catch {
    return null;
  }
}

export const WEEKDAY_NAMES = ["Понедельник", "Вторник", "Среда", "Четверг", "Пятница", "Суббота", "Воскресенье"];

export function weekdayLabel(day: number): string {
  return WEEKDAY_NAMES[(day - 1) % 7];
}

export function weekLabel(day: number): string {
  return day <= 7 ? "Неделя 1" : "Неделя 2";
}

// Общая группировка постов по дню — используется и сеткой в кабинете, и
// выгрузкой в Excel (contentPlanExport.ts), чтобы дни/площадки не собирались
// по-разному в двух местах.
export function groupPostsByDay(posts: PlanPost[]): Map<number, Partial<Record<Platform, PlanPost>>> {
  const byDay = new Map<number, Partial<Record<Platform, PlanPost>>>();
  for (const post of posts) {
    if (!byDay.has(post.day)) byDay.set(post.day, {});
    byDay.get(post.day)![post.platform] = post;
  }
  return byDay;
}

export function sortedDays(byDay: Map<number, unknown>): number[] {
  return [...byDay.keys()].sort((a, b) => a - b);
}
