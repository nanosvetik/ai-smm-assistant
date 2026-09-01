import { readFileSync } from "node:fs";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { reelsScripts, reelsVideoPrompts } from "../db/schema.js";
import { chatCompletion } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { ensureVisualStyleProfile } from "./visualStyleAnalyzer.js";
import { generateId } from "../lib/tokens.js";

// deepseek-v4-flash — вход тут текст (сценарий), не изображения, vision не
// нужен, тот же выбор, что и у visual-generator.
const MODEL = "deepseek/deepseek-v4-flash";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "reels-video-generator.md");

const STATUSES = ["боевой", "черновик-рамка", "черновик-скелет"] as const;
type Status = (typeof STATUSES)[number];
const STATUS_RANK: Record<Status, number> = { "черновик-скелет": 0, "черновик-рамка": 1, боевой: 2 };

export class PrerequisitesMissingError extends Error {
  constructor(public missing: string[]) {
    super("prerequisites_missing");
  }
}

function weakestStatus(statuses: Status[]): Status {
  return statuses.reduce((weakest, s) => (STATUS_RANK[s] < STATUS_RANK[weakest] ? s : weakest));
}

function buildContext(
  script: typeof reelsScripts.$inferSelect,
  visualProfile: Awaited<ReturnType<typeof ensureVisualStyleProfile>>
): string {
  return `# Сценарий рилса (статус: ${script.status})
${script.documentMarkdown}

# Визуальный style-профиль
${
  visualProfile
    ? `(статус: ${visualProfile.status})\n${visualProfile.documentMarkdown}`
    : "не создан — клиент не загружал референсы, работай по нейтральному дефолту (см. Шаг 2 промпта)."
}
`;
}

// Пишет промпт для generate_video, визуализирующий только хук сценария (см.
// prompts/reels-video-generator.md) — сам вызов generate_video происходит
// отдельно, см. videoGenerator.ts.
export async function runReelsVideoGenerator(clientId: string) {
  const [script] = await db
    .select()
    .from(reelsScripts)
    .where(eq(reelsScripts.clientId, clientId))
    .orderBy(desc(reelsScripts.version))
    .limit(1);
  if (!script) {
    throw new PrerequisitesMissingError(["reels-writer"]);
  }

  const visualProfile = await ensureVisualStyleProfile(clientId);

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const userMessage = buildContext(script, visualProfile);

  const rawDocument = await chatCompletion(MODEL, [
    { role: "system", content: systemPrompt },
    { role: "user", content: userMessage },
  ]);

  const status = weakestStatus(
    visualProfile ? [script.status as Status, visualProfile.status as Status] : [script.status as Status]
  );
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const [latest] = await db
    .select({ version: reelsVideoPrompts.version })
    .from(reelsVideoPrompts)
    .where(eq(reelsVideoPrompts.clientId, clientId))
    .orderBy(desc(reelsVideoPrompts.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(reelsVideoPrompts).values({
    id,
    clientId,
    version: nextVersion,
    status,
    usedVisualProfile: Boolean(visualProfile),
    reelsScriptVersion: script.version,
    visualStyleProfileVersion: visualProfile?.version ?? null,
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(reelsVideoPrompts).where(eq(reelsVideoPrompts.id, id)).limit(1);
  return row;
}
