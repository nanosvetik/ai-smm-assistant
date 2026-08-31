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

export const REFERENCE_CATEGORIES = ["before_after", "workspace", "showcase", "products", "process"] as const;
export type ReferenceCategory = (typeof REFERENCE_CATEGORIES)[number];

export interface ReferenceFile {
  id: string;
  category: ReferenceCategory;
  filePath: string;
  originalFilename: string;
}

export interface OnboardingState {
  questionnaire: (Questionnaire & { salesModel: SalesModel }) | null;
  ownLinks: SocialLink[];
  competitorLinks: SocialLink[];
  references: ReferenceFile[];
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
  return res.json();
}

export { ApiError };

export function exchangeAccessLink(token: string) {
  return request<{ status: "ok"; expiresAt: string }>(`/access/${token}`);
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

export async function uploadReference(category: ReferenceCategory, file: File) {
  const formData = new FormData();
  formData.append("file", file);
  return request<{ id: string; category: ReferenceCategory; filePath: string }>(`/onboarding/references/${category}`, {
    method: "POST",
    body: formData,
  });
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
