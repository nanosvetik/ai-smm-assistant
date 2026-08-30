import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { copywriterPosts, visualGeneratorPrompts, visualStyleProfiles } from "../db/schema.js";
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
  visualProfile: typeof visualStyleProfiles.$inferSelect | undefined
): string {
  return `# Текст поста (статус: ${post.status})
${post.documentMarkdown}

# Визуальный style-профиль
${
  visualProfile
    ? `(статус: ${visualProfile.status})\n${visualProfile.documentMarkdown}`
    : "не создан — клиент не загружал референсы, работай по нейтральному дефолту (см. Шаг 3 промпта)."
}
`;
}

export async function runVisualGenerator(clientId: string, platform: Platform) {
  const [post] = await db
    .select()
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
    .orderBy(desc(copywriterPosts.version))
    .limit(1);
  if (!post) {
    throw new PrerequisitesMissingError(["copywriter"]);
  }

  const [visualProfile] = await db
    .select()
    .from(visualStyleProfiles)
    .where(eq(visualStyleProfiles.clientId, clientId))
    .orderBy(desc(visualStyleProfiles.version))
    .limit(1);

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(post, visualProfile);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus(
    visualProfile ? [post.status as Status, visualProfile.status as Status] : [post.status as Status]
  );
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
    usedVisualProfile: Boolean(visualProfile),
    copywriterPostVersion: post.version,
    visualStyleProfileVersion: visualProfile?.version ?? null,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(visualGeneratorPrompts).where(eq(visualGeneratorPrompts.id, id)).limit(1);
  return row;
}
