import type { AgentResult, Platform } from "./api";
import type { StageConfig } from "./stages";

// Результат этапа выглядит по-разному: у площадочных этапов это объект с
// ключами площадок, у остальных — один документ.
export type StageResult = AgentResult | null | Partial<Record<Platform, AgentResult | null>>;

export type StageProgressState = "done" | "current" | "future";

export function isStageDone(stage: StageConfig, result: StageResult, platforms: Platform[]): boolean {
  if (!stage.needsPlatform) return result != null;
  // every() на пустом массиве возвращает true, поэтому длину проверяем явно:
  // без этого этап у клиента, не указавшего ни одной площадки, показывался бы
  // пройденным, хотя не запускался ни разу.
  if (platforms.length === 0) return false;
  const byPlatform = (result ?? {}) as Partial<Record<Platform, AgentResult | null>>;
  return platforms.every((p) => byPlatform[p] != null);
}

// Первый непройденный этап считается текущим, всё после него — будущим.
// Пройденные позади него остаются пройденными: конвейер линейный, но клиент
// волен запускать этапы не по порядку.
export function buildStageProgress(
  stages: StageConfig[],
  results: Record<string, StageResult>,
  platforms: Platform[],
  // Этапы, состояние которых прочитать не удалось. Они не «пройдены», но и
  // текущими стать не могут: неизвестно, сделаны они или нет, а увести туда
  // клиента значило бы предложить ему запустить этап заново вслепую.
  unknownKeys: ReadonlySet<string> = new Set()
): Record<string, StageProgressState> {
  const progress: Record<string, StageProgressState> = {};
  let currentFound = false;
  for (const stage of stages) {
    if (unknownKeys.has(stage.key)) {
      progress[stage.key] = "future";
    } else if (isStageDone(stage, results[stage.key], platforms)) {
      progress[stage.key] = "done";
    } else if (!currentFound) {
      progress[stage.key] = "current";
      currentFound = true;
    } else {
      progress[stage.key] = "future";
    }
  }
  return progress;
}
