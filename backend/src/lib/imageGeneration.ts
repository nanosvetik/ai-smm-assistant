import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const IMAGES_URL = "https://openrouter.ai/api/v1/images";

// Те же подтверждённые слаги, что и в smm-mcp/src/index.js (generate_image) —
// не менять без повторной проверки против /api/v1/images/models
// (smm-mcp/README.md).
const IMAGE_MODEL_PRIMARY = "bytedance-seed/seedream-4.5";
const IMAGE_MODEL_FALLBACK = "black-forest-labs/flux.2-max";

// Тот же каталог, что использует smm-mcp (workspace/06-images относительно
// корня проекта) — реализация независимая (см. imageGenerator.ts на прод-путь
// вызова, smm-mcp — инструмент разработки для Claude Code, не HTTP-сервис),
// но артефакты складываются в то же место, что уже описано в CLAUDE.md.
const IMAGES_DIR = path.join(process.cwd(), "..", "workspace", "06-images");

const MEDIA_EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "output"
  );
}

export interface GeneratedImageFile {
  filePath: string;
  publicUrl: string;
  model: string;
  cost: number | null;
}

// Прямой вызов OpenRouter /api/v1/images — та же логика, что generate_image в
// smm-mcp/src/index.js (основная модель + фолбэк), реализована отдельно,
// т.к. smm-mcp — MCP stdio-сервер для Claude Code, не HTTP-сервис, который
// мог бы вызвать продакшн-бэкенд.
export async function generateImageFile(prompt: string): Promise<GeneratedImageFile> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const attempts = [IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK];
  let lastError = "";

  for (const model of attempts) {
    const res = await fetch(IMAGES_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, prompt, n: 1 }),
    });

    if (!res.ok) {
      lastError = `${model} -> HTTP ${res.status}: ${await res.text()}`;
      continue;
    }

    const json = (await res.json()) as {
      data?: Array<{ b64_json?: string; media_type?: string }>;
      usage?: { cost?: number };
    };
    const item = json.data?.[0];
    if (!item?.b64_json) {
      lastError = `${model} -> no b64_json in response`;
      continue;
    }

    await mkdir(IMAGES_DIR, { recursive: true });
    const ext = MEDIA_EXT[item.media_type ?? ""] ?? "jpg";
    const filename = `${Date.now()}-${slugify(prompt)}.${ext}`;
    const filePath = path.join(IMAGES_DIR, filename);
    await writeFile(filePath, Buffer.from(item.b64_json, "base64"));

    return {
      filePath,
      publicUrl: `/media/06-images/${filename}`,
      model,
      cost: json.usage?.cost ?? null,
    };
  }

  throw new Error(`generateImageFile failed on all models. Last error: ${lastError}`);
}
