import { readFileSync } from "node:fs";
import path from "node:path";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import {
  audienceProfiles,
  copywriterPosts,
  editorialReviews,
  expertiseProfiles,
  packagingProfiles,
  reelsScripts,
} from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

// DeepSeek V4 Pro — задача качественная (поймать то, что генератор мог
// пропустить), не рутинная, тот же аргумент, что и в разделе 4 спецификации
// для выбора модели на unpacker-агентах, только здесь дешевле Claude и
// достаточно DeepSeek Pro (раздел 5 спецификации явно называет модель).
const MODEL = "deepseek/deepseek-v4-pro";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "editor-in-chief.md");

export type ContentType = "copywriter" | "reels";
export type Platform = "telegram" | "vk";

const VERDICTS = ["ok", "needs_revision"] as const;
export type Verdict = (typeof VERDICTS)[number];

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function buildContext(
  contentLabel: string,
  contentDocument: string,
  expertise: typeof expertiseProfiles.$inferSelect,
  audience: typeof audienceProfiles.$inferSelect,
  packaging: typeof packagingProfiles.$inferSelect
): string {
  return `# ${contentLabel} — проверяемый текст
${contentDocument}

# Распаковка экспертности (табу, статус: ${expertise.status})
${expertise.documentMarkdown}

# Профиль ЦА (стоп-слова/tone of voice сегментов, статус: ${audience.status})
${audience.documentMarkdown}

# Упаковка профиля (tone of voice/позиционирование, статус: ${packaging.status})
${packaging.documentMarkdown}
`;
}

export async function runEditorInChief(clientId: string, contentType: ContentType, platform: Platform) {
  const [expertise] = await db
    .select()
    .from(expertiseProfiles)
    .where(eq(expertiseProfiles.clientId, clientId))
    .orderBy(desc(expertiseProfiles.version))
    .limit(1);
  const [audience] = await db
    .select()
    .from(audienceProfiles)
    .where(eq(audienceProfiles.clientId, clientId))
    .orderBy(desc(audienceProfiles.version))
    .limit(1);
  const [packaging] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);

  const missing: string[] = [];
  if (!expertise) missing.push("expertise-unpacker");
  if (!audience) missing.push("audience-unpacker");
  if (!packaging) missing.push("account-packager");

  let contentLabel = "";
  let contentDocument: string | undefined;
  let contentVersion: number | undefined;

  if (contentType === "copywriter") {
    const [post] = await db
      .select()
      .from(copywriterPosts)
      .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
      .orderBy(desc(copywriterPosts.version))
      .limit(1);
    if (!post) {
      missing.push("copywriter");
    } else {
      contentLabel = "Текст поста";
      contentDocument = post.documentMarkdown;
      contentVersion = post.version;
    }
  } else {
    const [script] = await db
      .select()
      .from(reelsScripts)
      .where(eq(reelsScripts.clientId, clientId))
      .orderBy(desc(reelsScripts.version))
      .limit(1);
    if (!script) {
      missing.push("reels-writer");
    } else {
      contentLabel = "Сценарий рилса";
      contentDocument = script.documentMarkdown;
      contentVersion = script.version;
    }
  }

  if (
    missing.length > 0 ||
    !expertise ||
    !audience ||
    !packaging ||
    contentDocument === undefined ||
    contentVersion === undefined
  ) {
    throw new PrerequisitesMissingError(missing);
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(contentLabel, contentDocument, expertise, audience, packaging);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  // Неразобранный вердикт трактуем как needs_revision, не ok — ложноположительный
  // needs_revision стоит дешевле (одна лишняя перегенерация), чем незамеченное
  // нарушение, показанное живому пользователю (см. prompts/editor-in-chief.md).
  const frontmatter = parseFrontmatter(rawDocument) ?? {};
  const verdict: Verdict = VERDICTS.includes(frontmatter.вердикт as Verdict)
    ? (frontmatter.вердикт as Verdict)
    : "needs_revision";

  const [latest] = await db
    .select({ version: editorialReviews.version })
    .from(editorialReviews)
    .where(
      and(
        eq(editorialReviews.clientId, clientId),
        eq(editorialReviews.contentType, contentType),
        eq(editorialReviews.platform, platform)
      )
    )
    .orderBy(desc(editorialReviews.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(editorialReviews).values({
    id,
    clientId,
    contentType,
    platform,
    version: nextVersion,
    reviewedContentVersion: contentVersion,
    verdict,
    documentMarkdown: rawDocument,
    createdAt: now,
  });

  const [row] = await db.select().from(editorialReviews).where(eq(editorialReviews.id, id)).limit(1);
  return row;
}
