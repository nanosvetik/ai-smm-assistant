import { readFileSync } from "node:fs";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { reelsScripts, reelsVideoPrompts } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField, stampFrontmatterDates } from "../lib/frontmatter.js";
import { ensureVisualStyleProfile } from "./visualStyleAnalyzer.js";
import { loadReelsReferences } from "./reelsReferenceSet.js";
import { generateId } from "../lib/tokens.js";
import { promptPath } from "../lib/paths.js";

// deepseek-v4-flash — вход тут текст (сценарий), не изображения, vision не
// нужен, тот же выбор, что и у visual-generator.
const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = promptPath("reels-video-generator.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

// Промпт к видео пишет текстовая модель — самой фотографии она не получает.
// Что на стартовом кадре, ей известно только из раздела «Стартовый кадр»
// визуального style-профиля: его пишет visual-style-analyzer, единственный
// агент конвейера с глазами. Если профиля нет (анализ не удался), знания о
// кадре нет вообще — и тогда честнее велеть не выдумывать сцену, чем
// получить промпт про телефон в руках поверх скриншота с котятами.
function referenceFrameContext(hasReferenceImage: boolean, hasVisualProfile: boolean): string {
  if (!hasReferenceImage) {
    return "Референса нет — работай по нейтральному визуальному описанию хука (см. Шаг 1).";
  }
  if (hasVisualProfile) {
    return "Клиент загрузил фотографию — она уйдёт видео-модели первым кадром. Что на ней, описано выше, в разделе «Стартовый кадр» визуального style-профиля. Движение обязано продолжать именно эту сцену (см. Шаг 1).";
  }
  return "Клиент загрузил фотографию — она уйдёт видео-модели первым кадром, но описания кадра нет. Опиши только движение камеры, света и общее развитие сцены, не утверждая, что именно находится в кадре (см. Шаг 1).";
}

function buildContext(
  script: typeof reelsScripts.$inferSelect,
  visualProfile: Awaited<ReturnType<typeof ensureVisualStyleProfile>>,
  hasReferenceImage: boolean
): string {
  return `# Сценарий рилса (статус: ${script.status})
${script.documentMarkdown}

# Визуальный style-профиль
${
  visualProfile
    ? `(статус: ${visualProfile.status})\n${visualProfile.documentMarkdown}`
    : "не создан — клиент не загружал референсы, работай по нейтральному дефолту (см. Шаг 2 промпта)."
}

# Референсный кадр
${referenceFrameContext(hasReferenceImage, Boolean(visualProfile))}
`;
}

// Пишет промпт для generate_video, визуализирующий только хук сценария (см.
// prompts/reels-video-generator.md) — сам вызов generate_video происходит
// отдельно, см. videoGenerator.ts.
export async function runReelsVideoGenerator(clientId: string) {
  const [script] = await db
    .select()
    .from(reelsScripts)
    .where(eq(reelsScripts.clientId, clientId))
    .orderBy(desc(reelsScripts.version))
    .limit(1);
  if (!script) {
    throw new PrerequisitesMissingError(["reels-writer"]);
  }

  const visualProfile = await ensureVisualStyleProfile(clientId);

  // Та же выборка, что у visual-style-analyzer и videoGenerator: важно не
  // «есть ли вообще файлы», а есть ли тот самый стартовый кадр.
  const [reference] = await loadReelsReferences(clientId);

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(script, visualProfile, Boolean(reference));

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus(
    visualProfile ? [script.status as Status, visualProfile.status as Status] : [script.status as Status]
  );
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: reelsVideoPrompts.version })
    .from(reelsVideoPrompts)
    .where(eq(reelsVideoPrompts.clientId, clientId))
    .orderBy(desc(reelsVideoPrompts.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(reelsVideoPrompts).values({
    id,
    clientId,
    version: nextVersion,
    status,
    usedVisualProfile: Boolean(visualProfile),
    reelsScriptVersion: script.version,
    visualStyleProfileVersion: visualProfile?.version ?? null,
    documentMarkdown: stampFrontmatterDates(document),
    createdAt: now,
  });

  const [row] = await db.select().from(reelsVideoPrompts).where(eq(reelsVideoPrompts.id, id)).limit(1);
  return row;
}
