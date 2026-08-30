import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { profileHeaderProfiles, socialLinks } from "../db/schema.js";
import { chatCompletion, type ChatMessage, type ImageContentBlock, type TextContentBlock } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";
import { fetchProfileHeader } from "../parsers/index.js";

// Claude Sonnet 5 — тот же выбор и по той же причине, что и у
// visual-style-analyzer (см. CLAUDE.md, "Известные грабли"): vision-задача,
// разовая операция на клиента. Здесь изображения формально публичные
// (аватар/обложка видны всем на странице профиля), но модель уже
// проверена и не требует новых privacy-разрешений в OpenRouter — незачем
// заново открывать этот вопрос ради одной задачи.
const MODEL = "anthropic/claude-sonnet-5";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "profile-header-analyzer.md");

const STATUSES = ["боевой", "черновик-скелет"] as const;

export class OwnLinksMissingError extends Error {
  constructor() {
    super("own_links_missing");
  }
}

function platformLabel(platform: string): string {
  return platform === "telegram" ? "Telegram" : "ВК";
}

function buildContentBlocks(
  platform: string,
  header: Awaited<ReturnType<typeof fetchProfileHeader>>
): (TextContentBlock | ImageContentBlock)[] {
  const blocks: (TextContentBlock | ImageContentBlock)[] = [
    {
      type: "text",
      text: `## ${platformLabel(platform)}\nНазвание: ${header.name ?? "не удалось получить"}\nОписание: ${
        header.description ?? "не удалось получить"
      }`,
    },
  ];
  if (header.avatarUrl) {
    blocks.push({ type: "text", text: "Аватар:" }, { type: "image_url", image_url: { url: header.avatarUrl } });
  } else {
    blocks.push({ type: "text", text: "Аватар: не удалось получить" });
  }
  if (header.coverUrl) {
    blocks.push({ type: "text", text: "Обложка:" }, { type: "image_url", image_url: { url: header.coverUrl } });
  }
  return blocks;
}

export async function runProfileHeaderAnalyzer(clientId: string) {
  const ownLinks = await db
    .select()
    .from(socialLinks)
    .where(and(eq(socialLinks.clientId, clientId), eq(socialLinks.role, "own")));
  if (ownLinks.length === 0) {
    throw new OwnLinksMissingError();
  }

  const headers = await Promise.all(
    ownLinks.map(async (link) => ({ platform: link.platform, header: await fetchProfileHeader(link.platform, link.url) }))
  );

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const content = headers.flatMap(({ platform, header }) => buildContentBlocks(platform, header));
  const userMessage: ChatMessage = { role: "user", content };

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    userMessage,
  ]);

  const platformsWithAvatar = headers.filter(({ header }) => header.avatarUrl).map(({ platform }) => platform);
  const status: (typeof STATUSES)[number] = platformsWithAvatar.length > 0 ? "боевой" : "черновик-скелет";
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: profileHeaderProfiles.version })
    .from(profileHeaderProfiles)
    .where(eq(profileHeaderProfiles.clientId, clientId))
    .orderBy(desc(profileHeaderProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(profileHeaderProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    platforms: JSON.stringify(platformsWithAvatar),
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(profileHeaderProfiles).where(eq(profileHeaderProfiles.id, id)).limit(1);
  return row;
}
