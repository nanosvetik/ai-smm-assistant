import type { AgentResult } from "./api";
import type { StageResult } from "./stageProgress";

export const ACCOUNT_ANALYZER_KEY = "account-analyzer";

// Нерабочая ссылка на свою площадку далеко не всегда роняет этап: t.me на
// несуществующий канал отвечает редиректом на обычную страницу со статусом
// 200, парсер честно возвращает ноль постов, и «Анализ аккаунта» проходит до
// конца — только собран документ из пустоты, и на нём дальше строится вся
// остальная цепочка. Единственный надёжный признак — само число разобранных
// постов: форму адреса проверять бесполезно, опечатка в имени канала выглядит
// как совершенно валидная ссылка.
//
// Ровно ноль, а не «меньше N»: поле приходит через индексную сигнатуру
// AgentResult, и у старых документов его может не быть вовсе — пугать
// клиента на отсутствующем значении нельзя.
export function foundNoPosts(result: AgentResult | null): boolean {
  return result != null && result.postsAnalyzed === 0;
}

export function accountAnalysisFoundNoPosts(results: Record<string, StageResult>): boolean {
  const result = results[ACCOUNT_ANALYZER_KEY];
  if (result == null || typeof result !== "object") return false;
  return foundNoPosts(result as AgentResult);
}
