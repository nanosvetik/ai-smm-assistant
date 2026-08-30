import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accountStyleProfiles, audienceProfiles, expertiseProfiles, packagingProfiles } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "account-packager.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
// Слабее -> сильнее. Итоговый статус упаковки — самый слабый из трёх входов,
// не выбор модели (см. prompts/account-packager.md, "Честность статусов").
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function buildContext(
  audience: typeof audienceProfiles.$inferSelect,
  expertise: typeof expertiseProfiles.$inferSelect,
  accountStyle: typeof accountStyleProfiles.$inferSelect
): string {
  return `# Профиль ЦА (статус: ${audience.status})
${audience.documentMarkdown}

# Распаковка экспертности (статус: ${expertise.status})
${expertise.documentMarkdown}

# Анализ своего аккаунта (статус: ${accountStyle.status})
${accountStyle.documentMarkdown}
`;
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

// Статус выставляет код (weakestStatus), не модель — переписываем строку в
// её собственном YAML-frontmatter, чтобы сохранённый документ не расходился
// с колонкой status в БД (см. "Честность статусов" в промпте).
function patchStatus(document: string, status: Status): string {
  const match = document.match(/---\s*\n([\s\S]*?)\n---/);
  if (!match) return document;
  const patchedBlock = match[1].replace(/статус:\s*\S+/, `статус: ${status}`);
  return document.replace(match[1], patchedBlock);
}

export async function runAccountPackager(clientId: string) {
  const [audience] = await db
    .select()
    .from(audienceProfiles)
    .where(eq(audienceProfiles.clientId, clientId))
    .orderBy(desc(audienceProfiles.version))
    .limit(1);
  const [expertise] = await db
    .select()
    .from(expertiseProfiles)
    .where(eq(expertiseProfiles.clientId, clientId))
    .orderBy(desc(expertiseProfiles.version))
    .limit(1);
  const [accountStyle] = await db
    .select()
    .from(accountStyleProfiles)
    .where(eq(accountStyleProfiles.clientId, clientId))
    .orderBy(desc(accountStyleProfiles.version))
    .limit(1);

  const missing: string[] = [];
  if (!audience) missing.push("audience-unpacker");
  if (!expertise) missing.push("expertise-unpacker");
  if (!accountStyle) missing.push("account-analyzer");
  if (missing.length > 0 || !audience || !expertise || !accountStyle) {
    throw new PrerequisitesMissingError(missing);
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(audience, expertise, accountStyle);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus([
    audience.status as Status,
    expertise.status as Status,
    accountStyle.status as Status,
  ]);
  const document = patchStatus(rawDocument, status);

  const [latest] = await db
    .select({ version: packagingProfiles.version })
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(packagingProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    audienceProfileVersion: audience.version,
    expertiseProfileVersion: expertise.version,
    accountStyleProfileVersion: accountStyle.version,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(packagingProfiles).where(eq(packagingProfiles.id, id)).limit(1);
  return row;
}
