import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accountStyleProfiles, socialLinks } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";
import { fetchPosts, type ParsedPost } from "../parsers/index.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "account-analyzer.md");
const POSTS_PER_PLATFORM = 20;

const STATUSES = ["боевой", "черновик-скелет"] as const;

export class OwnLinksMissingError extends Error {
  constructor() {
    super("own_links_missing");
  }
}

function formatPosts(platform: string, posts: ParsedPost[]): string {
  if (posts.length === 0) return `### ${platform}\nПосты не найдены.`;
  const body = posts
    .map((p) => `- [${p.date.toISOString().slice(0, 10)}] (${p.url})\n${p.text}`)
    .join("\n\n");
  return `### ${platform}\n${body}`;
}

function buildPostsContext(postsByPlatform: Record<string, ParsedPost[]>): string {
  const sections = Object.entries(postsByPlatform).map(([platform, posts]) => formatPosts(platform, posts));
  return `# Посты эксперта\n\n${sections.join("\n\n")}`;
}

export async function runAccountAnalyzer(clientId: string) {
  const links = await db
    .select()
    .from(socialLinks)
    .where(eq(socialLinks.clientId, clientId));
  const ownLinks = links.filter((l) => l.role === "own");
  if (ownLinks.length === 0) {
    throw new OwnLinksMissingError();
  }

  const postsByPlatform: Record<string, ParsedPost[]> = {};
  for (const link of ownLinks) {
    postsByPlatform[link.platform] = await fetchPosts(link.platform, link.url, POSTS_PER_PLATFORM);
  }

  const totalPosts = Object.values(postsByPlatform).reduce((sum, posts) => sum + posts.length, 0);
  const platformsWithPosts = Object.entries(postsByPlatform)
    .filter(([, posts]) => posts.length > 0)
    .map(([platform]) => platform);

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildPostsContext(postsByPlatform);

  const document = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const frontmatter = parseFrontmatter(document) ?? {};
  const status = STATUSES.includes(frontmatter.статус as (typeof STATUSES)[number])
    ? (frontmatter.статус as (typeof STATUSES)[number])
    : "черновик-скелет";

  const [latest] = await db
    .select({ version: accountStyleProfiles.version })
    .from(accountStyleProfiles)
    .where(eq(accountStyleProfiles.clientId, clientId))
    .orderBy(desc(accountStyleProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(accountStyleProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    postsAnalyzed: totalPosts,
    platforms: JSON.stringify(platformsWithPosts),
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(accountStyleProfiles).where(eq(accountStyleProfiles.id, id)).limit(1);
  return row;
}
