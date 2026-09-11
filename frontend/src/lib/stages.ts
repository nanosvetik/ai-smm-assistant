import type { Platform } from "./api";

// Девять пунктов меню, а не двенадцать по числу агентов: клиент видит этапы
// своей работы, а не устройство системы. visual-style-analyzer и
// profile-header-analyzer запускаются сами там, где нужны, а редакторская
// проверка встроена в генерацию текста и отдельным шагом не показывается.
export interface StageConfig {
  key: string;
  label: string;
  description: string;
  agentSlug: string;
  needsPlatform: boolean;
  vkOnly: boolean;
  // Опциональный вспомогательный агент без своей кнопки. Бэкенд дёргает его
  // сам вместе с основным агентом этапа; здесь только для отображения
  // результата вторым блоком, если он есть.
  secondaryAgentSlug?: string;
  secondaryLabel?: string;
  // Переопределяет дефолтный текст под прогресс-баром (StagePanel.tsx) —
  // нужен там, где реальное время заметно отличается от обычных 1–3 минут
  // (copywriter/reels-writer теперь идут через editor-in-chief с возможной
  // одной автоматической перегенерацией, см. reviewedContent.ts на бэкенде).
  progressHint?: string;
}

export const STAGES: StageConfig[] = [
  {
    key: "audience",
    label: "ЦА и позиционирование",
    description: "Портрет вашей аудитории: кто эти люди, каким языком они говорят и что их зацепит.",
    agentSlug: "audience-unpacker",
    needsPlatform: false,
    vkOnly: false,
  },
  {
    key: "expertise",
    label: "Распаковка эксперта",
    description: "Ваш метод, принципы работы и то, чего вы точно не делаете в контенте.",
    agentSlug: "expertise-unpacker",
    needsPlatform: false,
    vkOnly: false,
  },
  {
    key: "account-analyzer",
    label: "Анализ аккаунта",
    description: "Как вы уже пишете сейчас — по вашим реальным постам, без придумывания заново.",
    agentSlug: "account-analyzer",
    needsPlatform: false,
    vkOnly: false,
    secondaryAgentSlug: "profile-header-analyzer",
    secondaryLabel: "Аудит шапки профиля",
  },
  {
    key: "competitor-analyzer",
    label: "Анализ конкурентов",
    description: "Что реально заходит у похожих специалистов в вашей нише.",
    agentSlug: "competitor-analyzer",
    needsPlatform: false,
    vkOnly: false,
  },
  {
    key: "account-packager",
    label: "Упаковка аккаунта",
    description: "Как рассказывать о себе одним текстом — позиционирование и готовое био.",
    agentSlug: "account-packager",
    needsPlatform: false,
    vkOnly: false,
  },
  {
    key: "content-planner",
    label: "Контент-план",
    description: "Темы и заголовки постов на две недели вперёд под ваши площадки.",
    agentSlug: "content-planner",
    needsPlatform: false,
    vkOnly: false,
  },
  {
    key: "copywriter",
    label: "Посты",
    description: "Готовый текст демо-поста по контент-плану — отдельно для каждой вашей площадки.",
    agentSlug: "copywriter",
    needsPlatform: true,
    vkOnly: false,
    progressHint: "Пишем текст и сразу проверяем его редактором — обычно 2–5 минут. Не закрывайте вкладку.",
  },
  {
    key: "visual-generator",
    label: "Изображения",
    description: "Иллюстрация к посту в стиле, который подходит именно вам.",
    agentSlug: "visual-generator",
    needsPlatform: true,
    vkOnly: false,
  },
  {
    key: "reels-writer",
    label: "Рилсы",
    description: "Сценарий короткого видео для ВК — хук, раскадровка и текст на камеру.",
    agentSlug: "reels-writer",
    needsPlatform: false,
    vkOnly: true,
    progressHint: "Пишем сценарий и сразу проверяем его редактором — обычно 2–5 минут. Не закрывайте вкладку.",
  },
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

// Отказы, которые повтором не лечатся: пока не изменятся данные клиента,
// ответ будет тем же. Предлагать «попробуйте ещё раз» на них — отправлять
// человека по кругу, поэтому у каждого свой текст с причиной.
const PERMANENT_ERRORS: Record<string, string> = {
  onboarding_data_missing: "Сначала заполните анкету — без неё этот этап запускать не из чего.",
  own_links_missing: "В анкете не указано ни одной своей площадки, а этот этап разбирает именно ваши посты.",
  competitor_links_missing: "В анкете не указаны конкуренты — этот этап разбирает именно их.",
  references_missing: "Не загружено ни одного фото-референса, разбирать нечего.",
  platform_not_in_plan: "В контент-плане нет постов для этой площадки.",
  reels_not_available: "Reels в этом продукте существуют только для ВК, а он не указан в анкете.",
  invalid_request: "Запрос не принят сервисом. Обновите страницу и попробуйте снова.",
};

export function describePermanentError(code: string): string | null {
  return PERMANENT_ERRORS[code] ?? null;
}
