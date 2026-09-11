import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { visualStyleProfiles } from "../db/schema.js";
import { chatCompletion, type ChatMessage, type ImageContentBlock, type TextContentBlock } from "../lib/openrouter.js";
import { parseFrontmatter, replaceFrontmatterField, stampFrontmatterDates } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";
import { loadReelsReferences, mimeTypeForReference } from "./reelsReferenceSet.js";
import { promptPath, UPLOAD_ROOT } from "../lib/paths.js";

// Здесь модель дороже, чем у текстовых агентов, и на то две причины.
// Референсы клиента — его собственные фотографии, подобранные под готовый
// сценарий рилса, не публичные посты. А дешёвая экспериментальная
// альтернатива требует разрешить провайдеру обучение на входных данных, что
// для личных фотографий неприемлемо. Операция редкая — один раз на набор
// референсов, — поэтому цена терпима.
//
// Это единственный агент конвейера, который видит фотографии клиента. Промпт
// к видео пишет текстовая модель, поэтому описание стартового кадра отсюда —
// её единственный источник знания о том, что в кадре (см. Шаг 0 промпта и
// reelsVideoGenerator.ts).
const MODEL = "anthropic/claude-sonnet-5";
const PROMPT_PATH = promptPath("visual-style-analyzer.md");

const STATUSES = ["боевой", "черновик-скелет"] as const;
// Ниже — не строим уверенный "фирменный стиль" на случайном кадре
// (см. prompts/visual-style-analyzer.md, "Вход").
const MIN_REFERENCES_FOR_BOEVOY = 3;

export class ReferencesMissingError extends Error {
  constructor() {
    super("references_missing");
  }
}

async function buildImageBlock(filePath: string, mimeType: string): Promise<ImageContentBlock> {
  const bytes = await readFile(path.join(UPLOAD_ROOT, ...filePath.split("/")));
  return { type: "image_url", image_url: { url: `data:${mimeType};base64,${bytes.toString("base64")}` } };
}

// Набор референсов изменился с тех пор, как считали профиль. Прежняя версия
// агента такой проверки не имела, и не зря: онбординговые референсы клиент
// загружал один раз и больше не трогал. Референсы рилса живут иначе — их
// добавляют и удаляют прямо перед генерацией видео, уже глядя на сценарий.
// Сохранённый профиль описывал бы стиль фотографий, которых у клиента может
// уже не быть, а его описание стартового кадра — вообще другой кадр.
export function isProfileOutdated(
  profile: { referencesAnalyzed: number; createdAt: Date } | undefined,
  references: { createdAt: Date }[]
): boolean {
  if (!profile) return true;
  if (profile.referencesAnalyzed !== references.length) return true;
  return references.some((ref) => ref.createdAt > profile.createdAt);
}

export async function runVisualStyleAnalyzer(clientId: string) {
  const selected = await loadReelsReferences(clientId);
  if (selected.length === 0) {
    throw new ReferencesMissingError();
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");

  // Первый референс помечается явно: именно он уйдёт видео-модели стартовым
  // кадром, и именно его агент описывает отдельным разделом. Порядок задан
  // общей выборкой (reelsReferenceSet.ts), а не этим циклом.
  const imageBlocks = await Promise.all(
    selected.map(async (ref, index): Promise<(TextContentBlock | ImageContentBlock)[]> => [
      {
        type: "text",
        text: index === 0 ? "Стартовый кадр — именно с него начнётся видео:" : `Ещё один референс (${index + 1}):`,
      },
      await buildImageBlock(ref.filePath, mimeTypeForReference(ref)),
    ])
  );

  const userMessage: ChatMessage = {
    role: "user",
    content: [
      { type: "text", text: `Референсов на входе: ${selected.length}. Разбери их по шагам промпта.` },
      ...imageBlocks.flat(),
    ],
  };

  const rawDocument = await chatCompletion(MODEL, [{ role: "system", content: systemPrompt }, userMessage]);

  // Порог по количеству — это пол, а не потолок (тот же принцип, что и в
  // competitor-analyzer): согласованность стиля между референсами видна
  // только модели, код не может её проверить по счётчику. Если референсов
  // мало — статус принудительно черновик-скелет; если хватает, доверяем
  // собственной оценке модели (в т.ч. её честному "боевой" не ставить" при
  // явном визуальном противоречии между референсами, см. промпт).
  const frontmatter = parseFrontmatter(rawDocument) ?? {};
  const modelStatus = STATUSES.includes(frontmatter.статус as (typeof STATUSES)[number])
    ? (frontmatter.статус as (typeof STATUSES)[number])
    : "черновик-скелет";
  const status: (typeof STATUSES)[number] =
    selected.length >= MIN_REFERENCES_FOR_BOEVOY ? modelStatus : "черновик-скелет";
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: visualStyleProfiles.version })
    .from(visualStyleProfiles)
    .where(eq(visualStyleProfiles.clientId, clientId))
    .orderBy(desc(visualStyleProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(visualStyleProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    referencesAnalyzed: selected.length,
    documentMarkdown: stampFrontmatterDates(document),
    createdAt: now,
  });

  const [row] = await db.select().from(visualStyleProfiles).where(eq(visualStyleProfiles.id, id)).limit(1);
  return row;
}

// Вызывается consumer'ом профиля (reelsVideoGenerator.ts), а не кнопкой в
// сайдбаре: у агента нет своего этапа, он вспомогательный. Собственного
// момента запуска у него тоже нет — референсы появляются тогда, когда клиент
// их загрузит, то есть уже после того, как сценарий рилса написан.
//
// Пересчёт — только при изменившемся наборе референсов: вызов платный, а на
// неизменившемся входе модель вернула бы то же самое.
export async function ensureVisualStyleProfile(clientId: string) {
  const references = await loadReelsReferences(clientId);
  if (references.length === 0) return undefined;

  const [existing] = await db
    .select()
    .from(visualStyleProfiles)
    .where(eq(visualStyleProfiles.clientId, clientId))
    .orderBy(desc(visualStyleProfiles.version))
    .limit(1);
  if (!isProfileOutdated(existing, references)) return existing;

  try {
    return await runVisualStyleAnalyzer(clientId);
  } catch (err) {
    console.error("[agents] visual-style-analyzer (авто, вместе с генерацией промпта) failed:", err);
    return undefined;
  }
}
