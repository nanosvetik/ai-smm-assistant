import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { audienceProfiles, onboardingProfiles, referenceFiles, socialLinks } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "anthropic/claude-sonnet-5";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "target-audience.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
const NICHE_WIDTHS = ["широкая", "средняя", "узкая"] as const;

export class OnboardingMissingError extends Error {
  constructor() {
    super("onboarding_data_missing");
  }
}

function buildOnboardingContext(
  questionnaire: typeof onboardingProfiles.$inferSelect,
  links: (typeof socialLinks.$inferSelect)[],
  references: (typeof referenceFiles.$inferSelect)[]
): string {
  const ownLinks = links.filter((l) => l.role === "own");
  const competitorLinks = links.filter((l) => l.role === "competitor");

  const formatLinks = (list: typeof links) =>
    list.length > 0 ? list.map((l) => `- ${l.platform}: ${l.url}`).join("\n") : "не указаны";

  const formatReferences = () =>
    references.length > 0
      ? references.map((r) => `- [${r.category}] ${r.originalFilename}`).join("\n")
      : "не загружены";

  return `# Данные онбординга

## Модель продаж
${questionnaire.salesModel === "b2c" ? "B2C" : "B2B"}

## Описание клиента (не продукта)
${questionnaire.clientDescription}

## Реальные фразы клиентов
${questionnaire.clientPhrases?.trim() || "не предоставлены"}

## Главный принцип работы эксперта
${questionnaire.mainPrinciple}

## Что эксперт точно не делает в контенте
${questionnaire.contentTaboos}

## Свои соцсети
${formatLinks(ownLinks)}

## Конкуренты
${formatLinks(competitorLinks)}

## Медиа-референсы (drag-and-drop с онбординга)
${formatReferences()}
`;
}

export async function runAudienceUnpacker(clientId: string) {
  const [questionnaire] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.clientId, clientId))
    .limit(1);
  if (!questionnaire) {
    throw new OnboardingMissingError();
  }

  const links = await db.select().from(socialLinks).where(eq(socialLinks.clientId, clientId));
  const references = await db.select().from(referenceFiles).where(eq(referenceFiles.clientId, clientId));

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildOnboardingContext(questionnaire, links, references);

  const document = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const frontmatter = parseFrontmatter(document) ?? {};
  const status = STATUSES.includes(frontmatter.статус as (typeof STATUSES)[number])
    ? (frontmatter.статус as (typeof STATUSES)[number])
    : "черновик-скелет";
  const nicheWidth = NICHE_WIDTHS.includes(frontmatter.ниша_ширина as (typeof NICHE_WIDTHS)[number])
    ? (frontmatter.ниша_ширина as (typeof NICHE_WIDTHS)[number])
    : null;
  const segments = Array.isArray(frontmatter.сегменты) ? JSON.stringify(frontmatter.сегменты) : null;

  const [latest] = await db
    .select({ version: audienceProfiles.version })
    .from(audienceProfiles)
    .where(eq(audienceProfiles.clientId, clientId))
    .orderBy(desc(audienceProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(audienceProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    b2b: frontmatter.b2b === true,
    nicheWidth,
    segments,
    validationAfter: typeof frontmatter.валидация_после === "string" ? frontmatter.валидация_после : null,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(audienceProfiles).where(eq(audienceProfiles.id, id)).limit(1);
  return row;
}
