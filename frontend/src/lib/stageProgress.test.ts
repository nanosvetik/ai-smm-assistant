import { describe, expect, it } from "vitest";
import { buildStageProgress, isStageDone, type StageResult } from "./stageProgress";
import type { StageConfig } from "./stages";
import type { AgentResult } from "./api";

const stage = (key: string, needsPlatform = false): StageConfig => ({
  key,
  label: key,
  description: "",
  agentSlug: key,
  needsPlatform,
  vkOnly: false,
});

const document = { status: "боевой" } as unknown as AgentResult;

describe("isStageDone", () => {
  it("считает обычный этап пройденным, когда документ есть", () => {
    expect(isStageDone(stage("audience"), document, ["telegram"])).toBe(true);
    expect(isStageDone(stage("audience"), null, ["telegram"])).toBe(false);
  });

  it("не считает площадочный этап пройденным без единой площадки", () => {
    // Ровно этот случай был живым багом: у клиента, не указавшего ни одной
    // площадки, «Посты» и «Изображения» показывались готовыми сразу.
    expect(isStageDone(stage("copywriter", true), {} as StageResult, [])).toBe(false);
  });

  it("требует результата по каждой площадке клиента", () => {
    const partial = { telegram: document, vk: null } as StageResult;
    expect(isStageDone(stage("copywriter", true), partial, ["telegram", "vk"])).toBe(false);
    expect(isStageDone(stage("copywriter", true), partial, ["telegram"])).toBe(true);
  });
});

describe("buildStageProgress", () => {
  it("отмечает первый непройденный этап текущим, остальные будущими", () => {
    const stages = [stage("audience"), stage("expertise"), stage("plan")];
    const progress = buildStageProgress(stages, { audience: document }, ["telegram"]);
    expect(progress).toEqual({ audience: "done", expertise: "current", plan: "future" });
  });

  it("не делает текущим этап, состояние которого неизвестно", () => {
    // Чтение результата может не дойти до сервера. Такой этап не «не
    // запускали»: увести туда клиента значило бы предложить ему запустить
    // заново то, что, возможно, уже сгенерировано и оплачено.
    const stages = [stage("audience"), stage("expertise"), stage("plan")];
    const progress = buildStageProgress(stages, { audience: document }, ["telegram"], new Set(["expertise"]));
    expect(progress).toEqual({ audience: "done", expertise: "future", plan: "current" });
  });

  it("не двигает текущий этап вперёд из-за пройденного позже", () => {
    // Клиент может запускать этапы не по порядку — текущим остаётся первый
    // незакрытый, а не следующий за последним запущенным.
    const stages = [stage("audience"), stage("expertise"), stage("plan")];
    const progress = buildStageProgress(stages, { plan: document }, ["telegram"]);
    expect(progress).toEqual({ audience: "current", expertise: "future", plan: "done" });
  });
});
