import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { competitorAnalysisProfiles, contentPlans, packagingProfiles } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
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
  packaging: typeof packagingProfiles.$inferSelect,
  competitorAnalysis: typeof competitorAnalysisProfiles.$inferSelect
): string {
  return `# Упаковка профиля (статус: ${packaging.status})
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

  const missing: string[] = [];
  if (!packaging) missing.push("account-packager");
  if (!competitorAnalysis) missing.push("competitor-analyzer");
  if (missing.length > 0 || !packaging || !competitorAnalysis) {
    throw new PrerequisitesMissingError(missing);
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(packaging, competitorAnalysis);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([packaging.status as Status, competitorAnalysis.status as Status]);
  const document = replaceFrontmatterField(rawDocument, "статус", status);

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
    packagingProfileVersion: packaging.version,
    competitorAnalysisProfileVersion: competitorAnalysis.version,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(contentPlans).where(eq(contentPlans.id, id)).limit(1);
  return row;
}
