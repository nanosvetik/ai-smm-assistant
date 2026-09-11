import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { generatedVideos, reelsVideoPrompts } from "../db/schema.js";
import { extractPromptBlock } from "../lib/promptBlock.js";
import { generateVideoFile } from "../lib/videoGeneration.js";
import { loadReelsReferences } from "./reelsReferenceSet.js";
import { generateId } from "../lib/tokens.js";
import { UPLOAD_ROOT } from "../lib/paths.js";

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

// Не должно происходить при промпте, исправленном под ```text-блок (см.
// prompts/reels-video-generator.md), но не молчим, если модель всё же не
// выдала валидный блок — тот же принцип, что и imageGenerator.ts.
export class PromptNotFoundError extends Error {
  constructor() {
    super("prompt_not_found");
  }
}

// Платная генерация клипа поверх последнего промпта для рилса. Как и с
// картинками, запускается только явным нажатием и добавляется новой версией.
export async function runVideoGenerator(clientId: string) {
  const [promptRow] = await db
    .select()
    .from(reelsVideoPrompts)
    .where(eq(reelsVideoPrompts.clientId, clientId))
    .orderBy(desc(reelsVideoPrompts.version))
    .limit(1);
  if (!promptRow) {
    throw new PrerequisitesMissingError(["reels-video-generator"]);
  }

  const prompt = extractPromptBlock(promptRow.documentMarkdown);
  if (!prompt) {
    throw new PromptNotFoundError();
  }

  // Стартовый кадр клипа — первый в общей выборке референсов рилса
  // (reelsReferenceSet.ts). Выбор намеренно общий с visual-style-analyzer:
  // тот описывает этот же кадр, и промпт строится вокруг его содержимого.
  // Один референс на клип, без выбора конкретного файла в UI — тот же
  // принцип, что и с единственным сценарием рилса на клиента.
  const [reference] = await loadReelsReferences(clientId);
  const referenceImagePath = reference ? path.join(UPLOAD_ROOT, ...reference.filePath.split("/")) : undefined;

  const generated = await generateVideoFile(prompt, referenceImagePath);

  const [latest] = await db
    .select({ version: generatedVideos.version })
    .from(generatedVideos)
    .where(eq(generatedVideos.clientId, clientId))
    .orderBy(desc(generatedVideos.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(generatedVideos).values({
    id,
    clientId,
    version: nextVersion,
    videoPromptVersion: promptRow.version,
    model: generated.model,
    cost: generated.cost,
    filePath: generated.filePath,
    publicUrl: generated.publicUrl,
    referenceFileId: reference?.id ?? null,
    createdAt: now,
  });

  const [row] = await db.select().from(generatedVideos).where(eq(generatedVideos.id, id)).limit(1);
  return row;
}
