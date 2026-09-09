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

// Платная генерация картинки поверх последнего промпта для площадки.
// Запускается только явным нажатием клиента — автоматически деньги не
// тратятся. Новая картинка добавляется версией, а не затирает предыдущую:
// повторное нажатие не должно молча уничтожать то, что человеку нравилось.
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
