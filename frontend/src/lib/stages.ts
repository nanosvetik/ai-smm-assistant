import type { Platform } from "./api";

// Ровно 9 пунктов сайдбара из Брифа 2 design-brief-ателье.md — не 1-в-1 с
// таблицей 12 агентов раздела 4 спецификации. visual-style-analyzer и
// profile-header-analyzer — вспомогательные входы (запускаются сами там, где
// нужны), editor-in-chief теперь встроен в copywriter/reels-writer через
// reviewedContent.ts на бэкенде — не отдельный шаг для пользователя.
export interface StageConfig {
  key: string;
  label: string;
  agentSlug: string;
  needsPlatform: boolean;
  vkOnly: boolean;
}

export const STAGES: StageConfig[] = [
  { key: "audience", label: "ЦА и позиционирование", agentSlug: "audience-unpacker", needsPlatform: false, vkOnly: false },
  { key: "expertise", label: "Распаковка эксперта", agentSlug: "expertise-unpacker", needsPlatform: false, vkOnly: false },
  { key: "account-analyzer", label: "Анализ аккаунта", agentSlug: "account-analyzer", needsPlatform: false, vkOnly: false },
  { key: "competitor-analyzer", label: "Анализ конкурентов", agentSlug: "competitor-analyzer", needsPlatform: false, vkOnly: false },
  { key: "account-packager", label: "Упаковка аккаунта", agentSlug: "account-packager", needsPlatform: false, vkOnly: false },
  { key: "content-planner", label: "Контент-план", agentSlug: "content-planner", needsPlatform: false, vkOnly: false },
  { key: "copywriter", label: "Посты", agentSlug: "copywriter", needsPlatform: true, vkOnly: false },
  { key: "visual-generator", label: "Изображения", agentSlug: "visual-generator", needsPlatform: true, vkOnly: false },
  { key: "reels-writer", label: "Рилсы", agentSlug: "reels-writer", needsPlatform: false, vkOnly: true },
];

export const PLATFORM_LABELS: Record<Platform, string> = {
  telegram: "Telegram",
  vk: "ВК",
};

// Русские подписи для agentSlug, встречающихся в PrerequisitesMissingError
// (см. backend/src/agents/*.ts, поле missing) — включая источники, которых
// нет в сайдбаре (onboarding-own-links из content-planner.ts).
export const AGENT_LABELS: Record<string, string> = {
  "audience-unpacker": "ЦА и позиционирование",
  "expertise-unpacker": "Распаковка эксперта",
  "account-analyzer": "Анализ аккаунта",
  "competitor-analyzer": "Анализ конкурентов",
  "account-packager": "Упаковка аккаунта",
  "content-planner": "Контент-план",
  copywriter: "Посты",
  "visual-generator": "Изображения",
  "reels-writer": "Рилсы",
  "onboarding-own-links": "свои соцсети в анкете",
};

export function describeMissing(missing: string[]): string {
  return missing.map((slug) => AGENT_LABELS[slug] ?? slug).join(", ");
}
