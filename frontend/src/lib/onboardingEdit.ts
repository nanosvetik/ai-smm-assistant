import type { AgentResult, OnboardingState, Platform } from "./api";
import { accountAnalysisFoundNoPosts } from "./accountAnalysis";
import type { StageResult } from "./stageProgress";
import type { StageConfig } from "./stages";

// Пересдача анкеты ничего не перезапускает: POST /onboarding заменяет ссылки и
// ответы, но уже сгенерированные документы остаются на старых данных, а
// перезапустить этап клиент не может — кнопка живёт только до первого
// результата. Поэтому предлагать правку имеет смысл ровно тогда, когда она
// ещё на что-то повлияет:
//
// free   — не запущено ни одного этапа: правка бесплатна и действует целиком.
// stuck  — что-то уже сгенерировано, но данные анкеты не дают ехать дальше:
//          своих площадок нет вовсе либо по указанной ссылке не нашлось ни
//          одного поста. Правка нужна, но прошлые документы не пересоберутся —
//          об этом говорим прямо.
// hidden — анкета полная и работа идёт: правка уже ничего не изменит, и
//          звать на неё значило бы обманывать.
export type OnboardingEditState = "free" | "stuck" | "hidden";

// Не isStageDone: там площадочный этап считается пройденным только когда есть
// документ по каждой площадке, а здесь важен сам факт запуска — один пост из
// двух это уже потраченный вызов модели.
function hasAnyResult(stage: StageConfig, result: StageResult): boolean {
  if (result == null) return false;
  if (!stage.needsPlatform) return true;
  const byPlatform = result as Partial<Record<Platform, AgentResult | null>>;
  return Object.values(byPlatform).some((document) => document != null);
}

export function resolveOnboardingEdit(
  onboarding: Pick<OnboardingState, "questionnaire" | "ownLinks">,
  stages: StageConfig[],
  results: Record<string, StageResult>,
  // Этапы, состояние которых прочитать не удалось: там результат может уже
  // существовать, поэтому «ничего не запущено» утверждать нельзя.
  unknownKeys: ReadonlySet<string> = new Set()
): OnboardingEditState {
  // Ссылки и ответы сохраняются одним запросом, так что без анкеты нет и
  // площадок — запускать было нечего, правка заведомо безопасна.
  if (!onboarding.questionnaire) return "free";

  const anyStarted = unknownKeys.size > 0 || stages.some((stage) => hasAnyResult(stage, results[stage.key]));
  if (!anyStarted) return "free";

  // Пустой список площадок — тупик по анкете; ноль разобранных постов —
  // тупик по существу: этап прошёл, но разбирать было нечего, и всё
  // дальнейшее построится на пустом документе.
  const stuck = onboarding.ownLinks.length === 0 || accountAnalysisFoundNoPosts(results);
  return stuck ? "stuck" : "hidden";
}
