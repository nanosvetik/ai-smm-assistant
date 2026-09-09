import { runCopywriter, type Platform } from "./copywriter.js";
import { runReelsWriter } from "./reelsWriter.js";
import { runEditorInChief } from "./editorInChief.js";

export interface ReviewedResult<T> {
  content: T;
  review: Awaited<ReturnType<typeof runEditorInChief>>;
  needsManualReview: boolean;
}

// Редактор не переписывает текст сам: при вердикте «нужна правка» его
// замечания уходят обратно автору как дополнительная инструкция, и текст
// генерируется заново — ровно один раз. Если и вторая попытка не проходит,
// цикл не продолжается: отдаём последнюю версию с пометкой, что нужна ручная
// проверка. Оркестрация вынесена сюда, чтобы генераторы оставались просто
// генераторами и их можно было вызывать поодиночке.
export async function runReviewedCopywriter(
  clientId: string,
  platform: Platform,
  day = 1
): Promise<ReviewedResult<Awaited<ReturnType<typeof runCopywriter>>>> {
  let content = await runCopywriter(clientId, platform, day);
  let review = await runEditorInChief(clientId, "copywriter", platform);

  if (review.verdict === "needs_revision") {
    content = await runCopywriter(clientId, platform, day, review.documentMarkdown);
    review = await runEditorInChief(clientId, "copywriter", platform);
  }

  return { content, review, needsManualReview: review.verdict === "needs_revision" };
}

export async function runReviewedReelsWriter(
  clientId: string
): Promise<ReviewedResult<Awaited<ReturnType<typeof runReelsWriter>>>> {
  let content = await runReelsWriter(clientId);
  let review = await runEditorInChief(clientId, "reels", "vk");

  if (review.verdict === "needs_revision") {
    content = await runReelsWriter(clientId, review.documentMarkdown);
    review = await runEditorInChief(clientId, "reels", "vk");
  }

  return { content, review, needsManualReview: review.verdict === "needs_revision" };
}
