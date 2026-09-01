import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { competitorAnalysisProfiles, contentPlans, packagingProfiles, socialLinks } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { parsePlanData } from "../lib/planData.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "content-planner.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
// Слабее -> сильнее, тот же принцип, что и в accountPackager.ts.
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function buildContext(
  platforms: string[],
  packaging: typeof packagingProfiles.$inferSelect,
  competitorAnalysis: typeof competitorAnalysisProfiles.$inferSelect
): string {
  const platformLabels = platforms.map((p) => (p === "telegram" ? "Telegram" : "ВК")).join(", ");
  return `# Площадки клиента
${platformLabels}

# Упаковка профиля (статус: ${packaging.status})
${packaging.documentMarkdown}

# Анализ конкурентов (статус: ${competitorAnalysis.status})
${competitorAnalysis.documentMarkdown}
`;
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

export async function runContentPlanner(clientId: string) {
  const [packaging] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);
  const [competitorAnalysis] = await db
    .select()
    .from(competitorAnalysisProfiles)
    .where(eq(competitorAnalysisProfiles.clientId, clientId))
    .orderBy(desc(competitorAnalysisProfiles.version))
    .limit(1);

  // Источник платформ — реальные own-ссылки с онбординга, не
  // account_style_profiles.platforms: там могли выпасть площадки, где
  // парсер не нашёл постов, хотя клиент их всё равно указал и хочет план
  // именно под них (см. обсуждение "что если у клиента одна соцсеть").
  const ownLinks = await db
    .select()
    .from(socialLinks)
    .where(and(eq(socialLinks.clientId, clientId), eq(socialLinks.role, "own")));
  const platforms = [...new Set(ownLinks.map((l) => l.platform))];

  const missing: string[] = [];
  if (!packaging) missing.push("account-packager");
  if (!competitorAnalysis) missing.push("competitor-analyzer");
  if (platforms.length === 0) missing.push("onboarding-own-links");
  if (missing.length > 0 || !packaging || !competitorAnalysis) {
    throw new PrerequisitesMissingError(missing);
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(platforms, packaging, competitorAnalysis);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([packaging.status as Status, competitorAnalysis.status as Status]);
  const document = replaceFrontmatterField(rawDocument, "статус", status);
  // null, если модель не выдала валидный JSON-блок — кабинет тогда честно
  // откатывается на рендер documentMarkdown целиком (см. planData.ts), это
  // не блокирует сохранение самого плана.
  const planData = parsePlanData(document);

  const [latest] = await db
    .select({ version: contentPlans.version })
    .from(contentPlans)
    .where(eq(contentPlans.clientId, clientId))
    .orderBy(desc(contentPlans.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(contentPlans).values({
    id,
    clientId,
    version: nextVersion,
    status,
    platforms: JSON.stringify(platforms),
    packagingProfileVersion: packaging.version,
    competitorAnalysisProfileVersion: competitorAnalysis.version,
    documentMarkdown: document,
    planItems: planData ? JSON.stringify(planData.posts) : null,
    reelsIdeas: planData ? JSON.stringify(planData.reels) : null,
    createdAt: now,
  });

  const [row] = await db.select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1);
  return row;
}
