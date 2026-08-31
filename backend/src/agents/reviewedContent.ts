import { runCopywriter, type Platform } from "./copywriter.js";
import { runReelsWriter } from "./reelsWriter.js";
import { runEditorInChief } from "./editorInChief.js";

export interface ReviewedResult<T> {
  content: T;
  review: Awaited<ReturnType<typeof runEditorInChief>>;
  needsManualReview: boolean;
}

// Раздел 5 спецификации: editor-in-chief сам не переписывает текст — при
// needs_revision его вердикт уходит обратно в copywriter/reels-writer как
// доп. инструкция на одну автоматическую перегенерацию. Если и повторная
// попытка не проходит — не зацикливаемся, отдаём последнюю версию с пометкой
// needsManualReview для UI ("требует ручной проверки" + список нарушений).
// Отдельный оркестратор, а не логика внутри самих генераторов — copywriter.ts/
// reelsWriter.ts остаются чистыми генераторами, каждый уже проверен живым
// вызовом сам по себе.
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
