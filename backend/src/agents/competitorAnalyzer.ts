import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { competitorAnalysisProfiles, socialLinks } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";
import { fetchPosts, type ParsedPost } from "../parsers/index.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "competitor-analyzer.md");
const POSTS_PER_PLATFORM = 20;
const TOP_POSTS_PER_COMPETITOR = 5;
// Минимум постов с текстом, при котором ранжирование конкурента по
// вовлечённости вообще что-то значит (см. prompts/competitor-analyzer.md, Вход).
const MIN_POSTS_FOR_RANKING = 3;

const STATUSES = ["боевой", "черновик-скелет"] as const;

export class CompetitorLinksMissingError extends Error {
  constructor() {
    super("competitor_links_missing");
  }
}

// Просмотры — единственный сигнал на Telegram; на VK лайки и репосты сильнее
// сигнализируют активную вовлечённость, чем пассивный просмотр, поэтому
// взвешены выше (см. раздел 3 спецификации, Шаг 3 — "лайкам/репостам/просмотрам").
function engagementScore(post: ParsedPost, platform: "telegram" | "vk"): number {
  const e = post.engagement;
  if (platform === "telegram") return e.views ?? 0;
  return (e.views ?? 0) + (e.likes ?? 0) * 20 + (e.reposts ?? 0) * 50;
}

function formatEngagement(post: ParsedPost, platform: "telegram" | "vk"): string {
  const e = post.engagement;
  if (platform === "telegram") return `просмотры: ${e.views ?? "н/д"}`;
  return `просмотры: ${e.views ?? "н/д"}, лайки: ${e.likes ?? "н/д"}, репосты: ${e.reposts ?? "н/д"}`;
}

interface CompetitorData {
  url: string;
  platform: "telegram" | "vk";
  topPosts: ParsedPost[];
}

function buildCompetitorsContext(competitors: CompetitorData[]): string {
  const sections = competitors.map((c) => {
    if (c.topPosts.length === 0) {
      return `## ${c.url} (${c.platform})\nПосты не найдены.`;
    }
    const posts = c.topPosts
      .map(
        (p, i) =>
          `${i + 1}. [${p.date.toISOString().slice(0, 10)}] (${formatEngagement(p, c.platform)}) ${p.url}\n${p.text}`
      )
      .join("\n\n");
    return `## ${c.url} (${c.platform})\nТоп-${c.topPosts.length} постов по вовлечённости:\n\n${posts}`;
  });
  return `# Посты конкурентов (отсортированы по вовлечённости)\n\n${sections.join("\n\n")}`;
}

export async function runCompetitorAnalyzer(clientId: string) {
  const links = await db.select().from(socialLinks).where(eq(socialLinks.clientId, clientId));
  const competitorLinks = links.filter((l) => l.role === "competitor");
  if (competitorLinks.length === 0) {
    throw new CompetitorLinksMissingError();
  }

  const competitors: CompetitorData[] = [];
  for (const link of competitorLinks) {
    const posts = await fetchPosts(link.platform, link.url, POSTS_PER_PLATFORM);
    const topPosts = [...posts]
      .sort((a, b) => engagementScore(b, link.platform) - engagementScore(a, link.platform))
      .slice(0, TOP_POSTS_PER_COMPETITOR);
    competitors.push({ url: link.url, platform: link.platform, topPosts });
  }

  const rankedCompetitorsCount = competitors.filter((c) => c.topPosts.length >= MIN_POSTS_FOR_RANKING).length;
  const totalPosts = competitors.reduce((sum, c) => sum + c.topPosts.length, 0);
  const platformsWithPosts = [...new Set(competitors.filter((c) => c.topPosts.length > 0).map((c) => c.platform))];

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildCompetitorsContext(competitors);

  const document = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const frontmatter = parseFrontmatter(document) ?? {};
  const status =
    STATUSES.includes(frontmatter.статус as (typeof STATUSES)[number]) && rankedCompetitorsCount >= 2
      ? (frontmatter.статус as (typeof STATUSES)[number])
      : "черновик-скелет";

  const [latest] = await db
    .select({ version: competitorAnalysisProfiles.version })
    .from(competitorAnalysisProfiles)
    .where(eq(competitorAnalysisProfiles.clientId, clientId))
    .orderBy(desc(competitorAnalysisProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(competitorAnalysisProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    competitorsAnalyzed: competitors.length,
    postsAnalyzed: totalPosts,
    platforms: JSON.stringify(platformsWithPosts),
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db
    .select()
    .from(competitorAnalysisProfiles)
    .where(eq(competitorAnalysisProfiles.id, id))
    .limit(1);
  return row;
}
