import { runAudienceUnpacker } from "./audienceUnpacker.js";
import { runExpertiseUnpacker } from "./expertiseUnpacker.js";
import { runAccountAnalyzer } from "./accountAnalyzer.js";
import { runCompetitorAnalyzer } from "./competitorAnalyzer.js";
import { runVisualStyleAnalyzer } from "./visualStyleAnalyzer.js";
import { runProfileHeaderAnalyzer } from "./profileHeaderAnalyzer.js";
import { runAccountPackager } from "./accountPackager.js";
import { runContentPlanner } from "./contentPlanner.js";
import { runCopywriter, type Platform } from "./copywriter.js";
import { runVisualGenerator } from "./visualGenerator.js";

type Ok<T> = { status: "ok"; result: T };
type Failed = { status: "failed"; error: string };
type Skipped = { status: "skipped"; reason: string };
export type StageResult<T> = Ok<T> | Failed | Skipped;

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

// Обязательные агенты (audience/expertise-unpacker, account-analyzer,
// competitor-analyzer): падение останавливает цепочку — дальше без них
// нечего синтезировать. См. runStage vs runOptionalStage ниже.
async function runStage<T>(fn: () => Promise<T>): Promise<StageResult<T>> {
  try {
    return { status: "ok", result: await fn() };
  } catch (err) {
    return { status: "failed", error: errorMessage(err) };
  }
}

// Необязательные (visual-style-analyzer, profile-header-analyzer): их
// отсутствие — обычное дело (нет референсов, нет own-ссылок и т.п.), не
// повод останавливать весь прогон, downstream-агенты уже умеют работать
// без них (см. accountPackager.ts, visualGenerator.ts).
async function runOptionalStage<T>(fn: () => Promise<T>): Promise<StageResult<T>> {
  try {
    return { status: "ok", result: await fn() };
  } catch (err) {
    return { status: "skipped", reason: errorMessage(err) };
  }
}

function skippedBecause(reason: string): Skipped {
  return { status: "skipped", reason };
}

export interface PipelineResult {
  audienceUnpacker: StageResult<Awaited<ReturnType<typeof runAudienceUnpacker>>>;
  expertiseUnpacker: StageResult<Awaited<ReturnType<typeof runExpertiseUnpacker>>>;
  accountAnalyzer: StageResult<Awaited<ReturnType<typeof runAccountAnalyzer>>>;
  competitorAnalyzer: StageResult<Awaited<ReturnType<typeof runCompetitorAnalyzer>>>;
  visualStyleAnalyzer: StageResult<Awaited<ReturnType<typeof runVisualStyleAnalyzer>>>;
  profileHeaderAnalyzer: StageResult<Awaited<ReturnType<typeof runProfileHeaderAnalyzer>>>;
  accountPackager?: StageResult<Awaited<ReturnType<typeof runAccountPackager>>>;
  contentPlanner?: StageResult<Awaited<ReturnType<typeof runContentPlanner>>>;
  copywriter?: Partial<Record<Platform, StageResult<Awaited<ReturnType<typeof runCopywriter>>>>>;
  visualGenerator?: Partial<Record<Platform, StageResult<Awaited<ReturnType<typeof runVisualGenerator>>>>>;
}

// Запускает весь текстовый пайплайн разом — от данных онбординга до
// готовых демо-постов и промптов для картинок (без самого generate_image:
// дорогой вызов остаётся за отдельным гейтом подтверждения, см. раздел 3
// Шаг 4 спецификации). Каждый этап всё равно пишет свой результат в БД
// сам по себе (как при отдельном вызове через /api/agents/<имя>) — эта
// функция только координирует порядок и параллелизм, не меняет то, что
// уже проверено живыми вызовами по отдельности.
export async function runFullPipeline(clientId: string): Promise<PipelineResult> {
  // Тир 1: всё, что зависит только от данных онбординга, — параллельно.
  // audience-unpacker -> expertise-unpacker идут последовательно внутри
  // своей ветки (expertise точнее с готовым Профилем ЦА в фоне, см.
  // prompts/expertise.md, Шаг 0.3), но это не блокирует остальные четыре
  // независимых агента.
  const [audienceExpertise, accountAnalyzerResult, competitorAnalyzerResult, visualStyleResult, profileHeaderResult] =
    await Promise.all([
      (async () => {
        const audience = await runStage(() => runAudienceUnpacker(clientId));
        if (audience.status !== "ok") {
          return { audience, expertise: skippedBecause("audience-unpacker failed, skipped") };
        }
        const expertise = await runStage(() => runExpertiseUnpacker(clientId));
        return { audience, expertise };
      })(),
      runStage(() => runAccountAnalyzer(clientId)),
      runStage(() => runCompetitorAnalyzer(clientId)),
      runOptionalStage(() => runVisualStyleAnalyzer(clientId)),
      runOptionalStage(() => runProfileHeaderAnalyzer(clientId)),
    ]);

  const result: PipelineResult = {
    audienceUnpacker: audienceExpertise.audience,
    expertiseUnpacker: audienceExpertise.expertise,
    accountAnalyzer: accountAnalyzerResult,
    competitorAnalyzer: competitorAnalyzerResult,
    visualStyleAnalyzer: visualStyleResult,
    profileHeaderAnalyzer: profileHeaderResult,
  };

  // Дальше — жёсткая цепочка по данным в БД: каждый следующий агент требует
  // результата предыдущего (PrerequisitesMissingError), останавливаемся
  // честно на первой обязательной ошибке, а не гадаем, что делать дальше.
  const tier1Ok =
    result.audienceUnpacker.status === "ok" &&
    result.expertiseUnpacker.status === "ok" &&
    result.accountAnalyzer.status === "ok" &&
    result.competitorAnalyzer.status === "ok";
  if (!tier1Ok) {
    return result;
  }

  const packagerResult = await runStage(() => runAccountPackager(clientId));
  result.accountPackager = packagerResult;
  if (packagerResult.status !== "ok") return result;

  const planResult = await runStage(() => runContentPlanner(clientId));
  result.contentPlanner = planResult;
  if (planResult.status !== "ok") return result;

  const platforms = JSON.parse(planResult.result.platforms) as Platform[];

  const copywriterEntries = await Promise.all(
    platforms.map(async (platform) => [platform, await runStage(() => runCopywriter(clientId, platform, 1))] as const)
  );
  result.copywriter = Object.fromEntries(copywriterEntries);

  const visualGeneratorEntries = await Promise.all(
    platforms.map(async (platform) => {
      const cw = result.copywriter![platform]!;
      if (cw.status !== "ok") return [platform, skippedBecause("copywriter failed for this platform")] as const;
      return [platform, await runStage(() => runVisualGenerator(clientId, platform))] as const;
    })
  );
  result.visualGenerator = Object.fromEntries(visualGeneratorEntries);

  return result;
}
