import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { audienceProfiles, expertiseProfiles, onboardingProfiles, referenceFiles, socialLinks } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { parseFrontmatter } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-pro";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "expertise.md");

const STATUSES = ["боевой", "черновик-рамка"] as const;
const METHOD_STRUCTURES = ["линейная", "цикл", "слои", "фазы"] as const;

export class OnboardingMissingError extends Error {
  constructor() {
    super("onboarding_data_missing");
  }
}

function buildOnboardingContext(
  questionnaire: typeof onboardingProfiles.$inferSelect,
  links: (typeof socialLinks.$inferSelect)[],
  references: (typeof referenceFiles.$inferSelect)[],
  latestAudienceProfile: typeof audienceProfiles.$inferSelect | undefined
): string {
  const ownLinks = links.filter((l) => l.role === "own");

  const formatLinks = (list: typeof links) =>
    list.length > 0 ? list.map((l) => `- ${l.platform}: ${l.url}`).join("\n") : "не указаны";

  const formatReferences = () =>
    references.length > 0
      ? references.map((r) => `- [${r.category}] ${r.originalFilename}`).join("\n")
      : "не загружены";

  return `# Данные онбординга

## Модель продаж
${questionnaire.salesModel === "b2c" ? "B2C" : "B2B"}

## Путь эксперта (как пришёл в дело, на чём строится опыт)
${questionnaire.expertPath ?? "не предоставлено"}

## Главный принцип работы эксперта
${questionnaire.mainPrinciple}

## Что эксперт точно не делает в контенте
${questionnaire.contentTaboos}

## Свои соцсети (материалы про эксперта)
${formatLinks(ownLinks)}

## Медиа-референсы (drag-and-drop с онбординга)
${formatReferences()}

## Профиль ЦА (фон — для кого работает метод, не цель этой задачи)
${latestAudienceProfile ? latestAudienceProfile.documentMarkdown : "не создан"}
`;
}

export async function runExpertiseUnpacker(clientId: string) {
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
  const [latestAudienceProfile] = await db
    .select()
    .from(audienceProfiles)
    .where(eq(audienceProfiles.clientId, clientId))
    .orderBy(desc(audienceProfiles.version))
    .limit(1);

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildOnboardingContext(questionnaire, links, references, latestAudienceProfile);

  const document = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const frontmatter = parseFrontmatter(document) ?? {};
  const status = STATUSES.includes(frontmatter.статус as (typeof STATUSES)[number])
    ? (frontmatter.статус as (typeof STATUSES)[number])
    : "черновик-рамка";
  const methodStructure = METHOD_STRUCTURES.includes(
    frontmatter.структура_метода as (typeof METHOD_STRUCTURES)[number]
  )
    ? (frontmatter.структура_метода as (typeof METHOD_STRUCTURES)[number])
    : null;
  const methodology =
    typeof frontmatter.авторская_методология === "string" && frontmatter.авторская_методология !== "—"
      ? frontmatter.авторская_методология
      : null;

  const [latest] = await db
    .select({ version: expertiseProfiles.version })
    .from(expertiseProfiles)
    .where(eq(expertiseProfiles.clientId, clientId))
    .orderBy(desc(expertiseProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(expertiseProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    b2b: frontmatter.b2b === true,
    methodology,
    methodStructure,
    validationAfter: typeof frontmatter.валидация_после === "string" ? frontmatter.валидация_после : null,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(expertiseProfiles).where(eq(expertiseProfiles.id, id)).limit(1);
  return row;
}
