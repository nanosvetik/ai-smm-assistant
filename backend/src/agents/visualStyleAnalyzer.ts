import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { referenceFiles, visualStyleProfiles } from "../db/schema.js";
import { chatCompletion, type ChatMessage, type ImageContentBlock, type TextContentBlock } from "../lib/openrouter.js";
import { replaceFrontmatterField } from "../lib/frontmatter.js";
import { generateId } from "../lib/tokens.js";

const MODEL = "deepseek/deepseek-v4-flash-vision-exp";
const PROMPT_PATH = path.join(process.cwd(), "..", "prompts", "visual-style-analyzer.md");
const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "..", "uploads");

const STATUSES = ["боевой", "черновик-скелет"] as const;
// Ниже — не строим уверенный "фирменный стиль" на случайном кадре
// (см. prompts/visual-style-analyzer.md, "Вход").
const MIN_REFERENCES_FOR_BOEVOY = 3;
// На категорию — чтобы один заваленный фотографиями "process" не вытеснил
// остальные категории из выборки; общий потолок бережёт токены/цену.
const MAX_PER_CATEGORY = 2;
const MAX_TOTAL_REFERENCES = 10;

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

export class ReferencesMissingError extends Error {
  constructor() {
    super("references_missing");
  }
}

function selectReferences(references: (typeof referenceFiles.$inferSelect)[]) {
  const byCategory = new Map<string, (typeof referenceFiles.$inferSelect)[]>();
  for (const ref of references) {
    const ext = path.extname(ref.filePath).toLowerCase();
    if (!MIME_TYPES[ext]) continue;
    const list = byCategory.get(ref.category) ?? [];
    list.push(ref);
    byCategory.set(ref.category, list);
  }

  const selected: (typeof referenceFiles.$inferSelect)[] = [];
  for (const list of byCategory.values()) {
    selected.push(...list.slice(0, MAX_PER_CATEGORY));
  }
  return selected.slice(0, MAX_TOTAL_REFERENCES);
}

async function buildImageBlock(ref: typeof referenceFiles.$inferSelect): Promise<(TextContentBlock | ImageContentBlock)[]> {
  const ext = path.extname(ref.filePath).toLowerCase();
  const mimeType = MIME_TYPES[ext];
  const filePath = path.join(UPLOAD_ROOT, ...ref.filePath.split("/"));
  const bytes = await readFile(filePath);
  const base64 = bytes.toString("base64");
  return [
    { type: "text", text: `Категория: ${ref.category}` },
    { type: "image_url", image_url: { url: `data:${mimeType};base64,${base64}` } },
  ];
}

export async function runVisualStyleAnalyzer(clientId: string) {
  const allReferences = await db.select().from(referenceFiles).where(eq(referenceFiles.clientId, clientId));
  const selected = selectReferences(allReferences);
  if (selected.length === 0) {
    throw new ReferencesMissingError();
  }

  const systemPrompt = readFileSync(PROMPT_PATH, "utf8");
  const imageBlocks = await Promise.all(selected.map(buildImageBlock));

  const userMessage: ChatMessage = {
    role: "user",
    content: [
      { type: "text", text: `Референсов на входе: ${selected.length}. Разбери визуальный стиль по шагам промпта.` },
      ...imageBlocks.flat(),
    ],
  };

  const rawDocument = await chatCompletion(MODEL, [{ role: "system", content: systemPrompt }, userMessage]);

  // Статус не отдаётся на откуп модели — тот же принцип честности, что и в
  // остальных агентах: порог явно завязан на то, что реально есть на входе.
  const status: (typeof STATUSES)[number] =
    selected.length >= MIN_REFERENCES_FOR_BOEVOY ? "боевой" : "черновик-скелет";
  const document = replaceFrontmatterField(rawDocument, "статус", status);

  const categories = [...new Set(selected.map((r) => r.category))];

  const [latest] = await db
    .select({ version: visualStyleProfiles.version })
    .from(visualStyleProfiles)
    .where(eq(visualStyleProfiles.clientId, clientId))
    .orderBy(desc(visualStyleProfiles.version))
    .limit(1);
  const nextVersion = (latest?.version ?? 0) + 1;

  const id = generateId();
  const now = new Date();
  await db.insert(visualStyleProfiles).values({
    id,
    clientId,
    version: nextVersion,
    status,
    referencesAnalyzed: selected.length,
    categories: JSON.stringify(categories),
    documentMarkdown: document,
    createdAt: now,
  });

  const [row] = await db.select().from(visualStyleProfiles).where(eq(visualStyleProfiles.id, id)).limit(1);
  return row;
}
