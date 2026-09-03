export type Platform = "telegram" | "vk";

export interface SocialLink {
  platform: Platform;
  url: string;
}

export type SalesModel = "b2c" | "b2b";

export interface Questionnaire {
  salesModel: SalesModel;
  clientDescription: string;
  clientPhrases?: string;
  mainPrinciple: string;
  contentTaboos: string;
  expertPath: string;
}

export interface OnboardingState {
  questionnaire: (Questionnaire & { salesModel: SalesModel }) | null;
  ownLinks: SocialLink[];
  competitorLinks: SocialLink[];
}

class ApiError extends Error {
  constructor(public status: number, public code: string, public missing?: string[]) {
    super(code);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: init?.body instanceof FormData ? init.headers : { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: "unknown_error" }));
    throw new ApiError(res.status, body.error ?? "unknown_error", body.missing);
  }
  if (res.status === 204) return undefined as T;
  return res.json();
}

export { ApiError };

export function exchangeAccessLink(token: string) {
  return request<{ status: "ok"; expiresAt: string }>(`/access/${token}`);
}

// Заявка с лендинга ("Получить демо-доступ") — только email, см. раздел 2
// спецификации (решение сессии 2026-09-03). Ничего не выдаёт сразу, заявка
// ждёт ручного подтверждения оператором.
export function submitAccessRequest(data: { email: string; name?: string }) {
  return request<{ id: string; status: "pending" }>("/access-requests", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

export function getOnboarding() {
  return request<OnboardingState>("/onboarding");
}

export function submitOnboarding(data: {
  ownLinks: SocialLink[];
  competitorLinks: SocialLink[];
  questionnaire: Questionnaire;
}) {
  return request<{ status: "ok" }>("/onboarding", {
    method: "POST",
    body: JSON.stringify(data),
  });
}

// Референсы, добавляемые на странице рилса после того, как сценарий уже
// написан — отдельно от онбординга (см. CLAUDE.md). Одна зона загрузки, без
// категорий. Пока только хранение — не используются ни visual-style-analyzer,
// ни в generate_video.
export interface ReelsReferenceFile {
  id: string;
  filePath: string;
  originalFilename: string;
  publicUrl: string;
}

export function getReelsReferences() {
  return request<ReelsReferenceFile[]>("/reels-references");
}

export async function uploadReelsReference(file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<ReelsReferenceFile>("/reels-references", {
    method: "POST",
    body: formData,
  });
}

export function deleteReelsReference(id: string) {
  return request<void>(`/reels-references/${id}`, { method: "DELETE" });
}

export type AgentStatus = "боевой" | "черновик-рамка" | "черновик-скелет";

// Общая форма ответа всех POST/GET /api/agents/<slug> — колонки сверх этих
// пяти (platform, day, competitorsAnalyzed и т.п.) конкретному экрану
// кабинета для отображения не нужны, документ и статус исчерпывают дело.
export interface AgentResult {
  version: number;
  status: AgentStatus;
  documentMarkdown: string;
  createdAt: string;
  [key: string]: unknown;
}

// null — этап ещё не запускали (404 от бэкенда), это нормальное состояние
// для кабинета, не ошибка. Любой другой статус ответа пробрасывается дальше.
export async function getAgentResult(agentSlug: string, query?: Record<string, string>): Promise<AgentResult | null> {
  const qs = query ? `?${new URLSearchParams(query)}` : "";
  try {
    return await request<AgentResult>(`/agents/${agentSlug}${qs}`, { method: "GET" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

export function runAgent(agentSlug: string, body?: Record<string, unknown>): Promise<AgentResult> {
  return request<AgentResult>(`/agents/${agentSlug}`, {
    method: "POST",
    body: JSON.stringify(body ?? {}),
  });
}

// Реальный вызов generate_image (раздел 3, Шаг 4 спецификации) — платная
// операция за отдельной кнопкой «Сгенерировать», не часть обычного
// AgentResult (нет статуса боевой/черновик, это медиа-артефакт, не документ).
export interface GeneratedImage {
  version: number;
  platform: Platform;
  visualPromptVersion: number;
  model: string;
  cost: number | null;
  publicUrl: string;
  createdAt: string;
}

export function generateImage(platform: Platform): Promise<GeneratedImage> {
  return request<GeneratedImage>("/agents/generate-image", {
    method: "POST",
    body: JSON.stringify({ platform }),
  });
}

export async function getGeneratedImage(platform: Platform): Promise<GeneratedImage | null> {
  try {
    return await request<GeneratedImage>(`/agents/generate-image?${new URLSearchParams({ platform })}`, {
      method: "GET",
    });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Реальный вызов generate_video (раздел 3, Шаг 4 спецификации) — зеркало
// GeneratedImage, без platform (Reels — один клип на клиента, как и сам
// сценарий рилса).
export interface GeneratedVideo {
  version: number;
  videoPromptVersion: number;
  model: string;
  cost: number | null;
  publicUrl: string;
  createdAt: string;
}

export function generateVideo(): Promise<GeneratedVideo> {
  return request<GeneratedVideo>("/agents/generate-video", {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function getGeneratedVideo(): Promise<GeneratedVideo | null> {
  try {
    return await request<GeneratedVideo>("/agents/generate-video", { method: "GET" });
  } catch (err) {
    if (err instanceof ApiError && err.status === 404) return null;
    throw err;
  }
}

// Read-only ссылка на готовое демо (см. CLAUDE.md, "результат-страница") —
// не под сессией, токен в URL и есть авторизация. Отдаёт только готовый
// демо-контент (посты/картинки/рилс), без аналитических документов.
export interface ResultsPost {
  platform: Platform;
  theme: string | null;
  documentMarkdown: string;
  imageUrl: string | null;
}

export interface ResultsReels {
  theme: string | null;
  documentMarkdown: string;
  videoUrl: string | null;
}

export interface ResultsBundle {
  platforms: Platform[];
  posts: ResultsPost[];
  reels: ResultsReels | null;
}

export function getResults(token: string) {
  return request<ResultsBundle>(`/results/${token}`);
}
