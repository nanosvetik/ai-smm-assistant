import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { generatedImages, visualGeneratorPrompts } from "../db/schema.js";
import { extractPromptBlock } from "../lib/promptBlock.js";
import { generateImageFile } from "../lib/imageGeneration.js";
import { generateId } from "../lib/tokens.js";

export type Platform = "telegram" | "vk";

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

// Не должно происходить при промпте, исправленном под ```text-блок (см.
// prompts/visual-generator.md), но не молчим и не гадаем, если модель всё же
// не выдала валидный блок — явная ошибка дешевле, чем случайный вызов
// платной модели с обрывком текста вместо промпта.
export class PromptNotFoundError extends Error {
  constructor() {
    super("prompt_not_found");
  }
}

// Реальный платный вызов generate_image (раздел 3, Шаг 4 спецификации —
// гейт подтверждения перед медиа-генерацией) поверх последнего промпта
// visual-generator для площадки. Append-only по версиям, тем же принципом,
// что и остальные агенты — повторный клик «Сгенерировать заново» не
// перезаписывает предыдущую картинку молча.
export async function runImageGenerator(clientId: string, platform: Platform) {
  const [promptRow] = await db
    .select()
    .from(visualGeneratorPrompts)
    .where(and(eq(visualGeneratorPrompts.clientId, clientId), eq(visualGeneratorPrompts.platform, platform)))
    .orderBy(desc(visualGeneratorPrompts.version))
    .limit(1);
  if (!promptRow) {
    throw new PrerequisitesMissingError(["visual-generator"]);
  }

  const prompt = extractPromptBlock(promptRow.documentMarkdown);
  if (!prompt) {
    throw new PromptNotFoundError();
  }

  const generated = await generateImageFile(prompt);

  const [latest] = await db
    .select({ version: generatedImages.version })
    .from(generatedImages)
    .where(and(eq(generatedImages.clientId, clientId), eq(generatedImages.platform, platform)))
    .orderBy(desc(generatedImages.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(generatedImages).values({
    id,
    clientId,
    platform,
    version: nextVersion,
    visualPromptVersion: promptRow.version,
    model: generated.model,
    cost: generated.cost,
    filePath: generated.filePath,
    publicUrl: generated.publicUrl,
    createdAt: now,
  });

  const [row] = await db.select().from(generatedImages).where(eq(generatedImages.id, id)).limit(1);
  return row;
}
