import { runCopywriter, type Platform } from "./copywriter.js";
import { runReelsWriter } from "./reelsWriter.js";
import { runEditorInChief } from "./editorInChief.js";

type Review = Awaited<ReturnType<typeof runEditorInChief>>;

export interface ReviewedResult<T> {
  content: T;
  // null — проверка не состоялась (сбой вызова редактора), а не «замечаний
  // нет»: такой текст помечается как требующий ручной проверки.
  review: Review | null;
  needsManualReview: boolean;
}

// Текст к этому моменту уже сгенерирован, оплачен и сохранён. Если падает
// именно проверка, отдавать наружу ошибку нельзя: клиент увидел бы неудачу, а
// повторный запуск оплатил бы вторую генерацию того же поста. Честнее вернуть
// готовый текст с пометкой, что редактор его не смотрел.
async function safeReview(run: () => Promise<Review>): Promise<Review | null> {
  try {
    return await run();
  } catch (err) {
    console.error("[editor-in-chief] review failed, returning content unreviewed:", err);
    return null;
  }
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
  let review = await safeReview(() => runEditorInChief(clientId, "copywriter", platform));

  if (review?.verdict === "needs_revision") {
    content = await runCopywriter(clientId, platform, day, review.documentMarkdown);
    review = await safeReview(() => runEditorInChief(clientId, "copywriter", platform));
  }

  return { content, review, needsManualReview: review === null || review.verdict === "needs_revision" };
}

export async function runReviewedReelsWriter(
  clientId: string
): Promise<ReviewedResult<Awaited<ReturnType<typeof runReelsWriter>>>> {
  let content = await runReelsWriter(clientId);
  let review = await safeReview(() => runEditorInChief(clientId, "reels", "vk"));

  if (review?.verdict === "needs_revision") {
    content = await runReelsWriter(clientId, review.documentMarkdown);
    review = await safeReview(() => runEditorInChief(clientId, "reels", "vk"));
  }

  return { content, review, needsManualReview: review === null || review.verdict === "needs_revision" };
}
