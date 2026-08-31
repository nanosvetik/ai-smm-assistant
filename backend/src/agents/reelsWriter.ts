import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { contentPlans, packagingProfiles, referenceFiles, reelsScripts } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter, replaceFrontmatterField } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

// DeepSeek V4 Pro, не Flash — в отличие от остальных контент-агентов.
// Раскадровка и хук на 3 секунды требуют более сильной творческой части,
// чем обычный пост; таблица агентов в спецификации (раздел 4) для этой
// строки указывает "DeepSeek V4" без суффикса — на OpenRouter реально
// существуют только -flash и -pro варианты, решение сессии — Pro.
const MODEL = "deepseek/deepseek-v4-pro";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "reels-writer.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

// Reels в этом продукте существуют только для ВК (см. content-planner,
// prompts/content-planner.md Шаг 3) — если ВК нет в реальных площадках
// клиента, в плане нет и раздела "Идеи Reels", писать сценарий не по чему.
export class ReelsNotAvailableError extends Error {
  constructor() {
    super("reels_not_available");
  }
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

function buildContext(
  contentPlan: typeof contentPlans.$inferSelect,
  packaging: typeof packagingProfiles.$inferSelect,
  referenceCategories: string[],
  editorFeedback?: string
): string {
  const referencesLine =
    referenceCategories.length > 0
      ? `Референсов клиента: категории — ${referenceCategories.join(", ")}.`
      : "Референсов клиента нет — ни одна категория не загружена.";

  const feedbackBlock = editorFeedback
    ? `\n# Замечания редактора (учти при переписывании, выбранная идея остаётся та же)\n${editorFeedback}\n`
    : "";

  return `# Контент-план на 2 недели (статус: ${contentPlan.status})
${contentPlan.documentMarkdown}

# Упаковка профиля (статус: ${packaging.status})
${packaging.documentMarkdown}

# Референсы клиента
${referencesLine}
${feedbackBlock}
# Задание
Выбери одну идею из раздела «Идеи Reels» плана выше и напиши по ней полный сценарий по шагам промпта.
`;
}

// editorFeedback — доп. инструкция от editor-in-chief при автоматической
// перегенерации (см. backend/src/agents/reviewedContent.ts), не параметр
// обычного вызова из UI.
export async function runReelsWriter(clientId: string, editorFeedback?: string) {
  const [contentPlan] = await db
    .select()
    .from(contentPlans)
    .where(eq(contentPlans.clientId, clientId))
    .orderBy(desc(contentPlans.version))
    .limit(1);
  const [packaging] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);

  const missing: string[] = [];
  if (!contentPlan) missing.push("content-planner");
  if (!packaging) missing.push("account-packager");
  if (missing.length > 0 || !contentPlan || !packaging) {
    throw new PrerequisitesMissingError(missing);
  }

  const planPlatforms: string[] = JSON.parse(contentPlan.platforms);
  if (!planPlatforms.includes("vk")) {
    throw new ReelsNotAvailableError();
  }

  const references = await db.select().from(referenceFiles).where(eq(referenceFiles.clientId, clientId));
  const referenceCategories = [...new Set(references.map((r) => r.category))];

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(contentPlan, packaging, referenceCategories, editorFeedback);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([contentPlan.status as Status, packaging.status as Status]);

  // использованы_референсы/категории_референсов — выбор модели (какая идея
  // реально легла на имеющиеся материалы), код не принимает это решение сам,
  // только читает результат из frontmatter (тот же принцип, что и b2b/segments
  // в audienceUnpacker.ts).
  const frontmatter = parseFrontmatter(rawDocument) ?? {};
  const usedReferences = frontmatter.использованы_референсы === true;
  const usedCategories = Array.isArray(frontmatter.категории_референсов)
    ? frontmatter.категории_референсов.filter((c): c is string => typeof c === "string")
    : [];

  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: reelsScripts.version })
    .from(reelsScripts)
    .where(eq(reelsScripts.clientId, clientId))
    .orderBy(desc(reelsScripts.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(reelsScripts).values({
    id,
    clientId,
    version: nextVersion,
    status,
    usedReferences,
    referenceCategories: JSON.stringify(usedCategories),
    contentPlanVersion: contentPlan.version,
    packagingProfileVersion: packaging.version,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(reelsScripts).where(eq(reelsScripts.id, id)).limit(1);
  return row;
}
