import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { copywriterPosts, packagingProfiles, visualGeneratorPrompts } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "visual-generator.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export type Platform = "telegram" | "vk";

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

function buildContext(
  post: typeof copywriterPosts.$inferSelect,
  packaging: typeof packagingProfiles.$inferSelect
): string {
  return `# Текст поста (статус: ${post.status})
${post.documentMarkdown}

# Упаковка профиля (статус: ${packaging.status})
${packaging.documentMarkdown}
`;
}

export async function runVisualGenerator(clientId: string, platform: Platform) {
  const [post] = await db
    .select()
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
    .orderBy(desc(copywriterPosts.version))
    .limit(1);
  const [packaging] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);

  const missing: string[] = [];
  if (!post) missing.push("copywriter");
  if (!packaging) missing.push("account-packager");
  if (missing.length > 0 || !post || !packaging) {
    throw new PrerequisitesMissingError(missing);
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(post, packaging);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([post.status as Status, packaging.status as Status]);
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: visualGeneratorPrompts.version })
    .from(visualGeneratorPrompts)
    .where(and(eq(visualGeneratorPrompts.clientId, clientId), eq(visualGeneratorPrompts.platform, platform)))
    .orderBy(desc(visualGeneratorPrompts.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(visualGeneratorPrompts).values({
    id,
    clientId,
    platform,
    version: nextVersion,
    status,
    copywriterPostVersion: post.version,
    packagingProfileVersion: packaging.version,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(visualGeneratorPrompts).where(eq(visualGeneratorPrompts.id, id)).limit(1);
  return row;
}
