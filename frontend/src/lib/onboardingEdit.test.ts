import { describe, expect, it } from "vitest";
import { resolveOnboardingEdit } from "./onboardingEdit";
import type { StageResult } from "./stageProgress";
import type { StageConfig } from "./stages";
import type { AgentResult, OnboardingState, SocialLink } from "./api";

const stage = (key: string, needsPlatform = false): StageConfig => ({
  key,
  label: key,
  description: "",
  agentSlug: key,
  needsPlatform,
  vkOnly: false,
});

const STAGES = [stage("audience-unpacker"), stage("account-analyzer"), stage("copywriter", true)];

const document = { status: "боевой" } as unknown as AgentResult;
const link: SocialLink = { platform: "telegram", url: "https://t.me/example" };

const questionnaire = {
  salesModel: "b2c",
  clientDescription: "",
  mainPrinciple: "",
  contentTaboos: "",
  expertPath: "",
} as OnboardingState["questionnaire"];

describe("resolveOnboardingEdit", () => {
  it("зовёт править анкету, пока она вообще не сдана", () => {
    expect(resolveOnboardingEdit({ questionnaire: null, ownLinks: [] }, STAGES, {})).toBe("free");
  });

  it("зовёт править, пока не запущен ни один этап", () => {
    const results: Record<string, StageResult> = { "audience-unpacker": null, copywriter: {} };
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [link] }, STAGES, results)).toBe("free");
  });

  it("прячет правку, когда работа уже пошла по полной анкете", () => {
    const results: Record<string, StageResult> = { "audience-unpacker": document };
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [link] }, STAGES, results)).toBe("hidden");
  });

  it("считает площадочный этап запущенным по одной готовой площадке", () => {
    // Один пост из двух — это уже потраченный вызов модели, хотя этап
    // непройденный: для isStageDone здесь было бы false.
    const results: Record<string, StageResult> = { copywriter: { telegram: document, vk: null } };
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [link] }, STAGES, results)).toBe("hidden");
  });

  it("предупреждает о невозвратности, когда этапы запущены, а своих площадок нет", () => {
    const results: Record<string, StageResult> = { "audience-unpacker": document };
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [] }, STAGES, results)).toBe("stuck");
  });

  it("зовёт в анкету, когда площадка указана, а постов по ней не нашлось", () => {
    // Битая ссылка на Telegram этап не роняет: t.me отвечает 200 и пустой
    // страницей. Без этой ветки человек узнавал бы о проблеме из строки
    // «постов: 0» и не имел пути назад в анкету.
    const noPosts = { status: "черновик-скелет", postsAnalyzed: 0 } as unknown as AgentResult;
    const results: Record<string, StageResult> = { "account-analyzer": noPosts };
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [link] }, STAGES, results)).toBe("stuck");
  });

  it("не предупреждает, если без площадок ещё ничего не запускали", () => {
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [] }, STAGES, {})).toBe("free");
  });

  it("не считает нетронутым кабинет с непрочитанным этапом", () => {
    // Состояние этапа неизвестно — там мог быть оплаченный результат.
    const unknown = new Set(["account-analyzer"]);
    expect(resolveOnboardingEdit({ questionnaire, ownLinks: [link] }, STAGES, {}, unknown)).toBe("hidden");
  });
});
