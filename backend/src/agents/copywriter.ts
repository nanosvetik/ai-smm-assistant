import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { contentPlans, copywriterPosts, packagingProfiles } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "copywriter.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export type Platform = "telegram" | "vk";

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function buildContext(
  contentPlan: typeof contentPlans.$inferSelect,
  packaging: typeof packagingProfiles.$inferSelect,
  platform: Platform,
  day: number
): string {
  return `# Контент-план на 2 недели (статус: ${contentPlan.status})
${contentPlan.documentMarkdown}

# Упаковка профиля (статус: ${packaging.status})
${packaging.documentMarkdown}

# Задание
Напиши пост для площадки: ${platform === "telegram" ? "Telegram" : "ВК"}, день ${day} из плана выше. Используй ровно ту тему и заголовок/хук, которые указаны в таблице плана для этого дня и этой площадки — не меняй тему.
`;
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

export async function runCopywriter(clientId: string, platform: Platform, day = 1) {
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

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(contentPlan, packaging, platform, day);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([contentPlan.status as Status, packaging.status as Status]);
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: copywriterPosts.version })
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
    .orderBy(desc(copywriterPosts.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(copywriterPosts).values({
    id,
    clientId,
    platform,
    version: nextVersion,
    status,
    day,
    contentPlanVersion: contentPlan.version,
    packagingProfileVersion: packaging.version,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(copywriterPosts).where(eq(copywriterPosts.id, id)).limit(1);
  return row;
}
