import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const VIDEOS_URL = "https://openrouter.ai/api/v1/videos";

// Та же модель, что и в smm-mcp/src/index.js (generate_video) — не менять
// без повторной проверки против /api/v1/videos/models (smm-mcp/README.md).
const VIDEO_MODEL = "kwaivgi/kling-v3.0-pro";

// Фиксированная короткая длительность — демо-клип визуализирует только хук
// сценария (см. prompts/reels-video-generator.md), не настраивается
// пользователем. 9:16 — Reels всегда вертикальный формат.
const VIDEO_DURATION_SECONDS = 5;
const ASPECT_RATIO = "9:16";

// Подтверждено эмпирически в smm-mcp: 3-секундный клип на Kling v3.0 Pro
// завершился за ~60 сек, поэтому таймаут поллинга — с запасом.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 40;

const REELS_DIR = path.join(process.cwd(), "..", "workspace", "07-reels");

const MIME_BY_EXT: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

async function fileToDataUri(absolutePath: string): Promise<string> {
  const mime = MIME_BY_EXT[path.extname(absolutePath).toLowerCase()] ?? "image/jpeg";
  const buffer = await readFile(absolutePath);
  return `data:${mime};base64,${buffer.toString("base64")}`;
}

function slugify(text: string): string {
  return (
    text
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 40) || "output"
  );
}

interface VideoJob {
  status: string;
  polling_url?: string;
  unsigned_urls?: string[];
  usage?: { cost?: number };
}

export interface GeneratedVideoFile {
  filePath: string;
  publicUrl: string;
  model: string;
  cost: number | null;
}

// Прямой вызов OpenRouter /api/v1/videos — та же логика, что generate_video в
// smm-mcp/src/index.js (создание задачи → поллинг → скачивание), реализована
// отдельно, т.к. smm-mcp — MCP stdio-сервер для Claude Code, не HTTP-сервис,
// который мог бы вызвать продакшн-бэкенд.
//
// referenceImagePath (решение сессии 2026-09-04, пересматривает более раннее
// решение "без референсов вообще"): раньше здесь не было ни одного
// reference_image/first_frame_url/last_frame_url — та версия API принимала
// только публичный HTTP(S) URL, который OpenRouter скачивает сам (не
// работало на localhost в деве). У OpenRouter с тех пор появилась новая
// схема параметров — frame_images[]/input_references[], та же обёртка
// {type: "image_url", image_url: {url}}, что и в chat completions для
// vision, и она документированно принимает data:-URI (проверено доками +
// live-запросом к /api/v1/videos/models: kwaivgi/kling-v3.0-pro поддерживает
// frame_images с first_frame/last_frame). Кодируем локальный файл в base64
// и передаём как первый кадр — публичный домен/раздача больше не нужны.
export async function generateVideoFile(prompt: string, referenceImagePath?: string): Promise<GeneratedVideoFile> {
  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not set");
  }

  const headers = {
    Authorization: `Bearer ${apiKey}`,
    "Content-Type": "application/json",
  };

  const frameImages = referenceImagePath
    ? [
        {
          type: "image_url",
          image_url: { url: await fileToDataUri(referenceImagePath) },
          frame_type: "first_frame",
        },
      ]
    : undefined;

  const createRes = await fetch(VIDEOS_URL, {
    method: "POST",
    headers,
    body: JSON.stringify({
      model: VIDEO_MODEL,
      prompt,
      duration: VIDEO_DURATION_SECONDS,
      aspect_ratio: ASPECT_RATIO,
      ...(frameImages ? { frame_images: frameImages } : {}),
    }),
  });
  if (!createRes.ok) {
    throw new Error(`generateVideoFile: create job failed (HTTP ${createRes.status}): ${await createRes.text()}`);
  }

  let job = (await createRes.json()) as VideoJob;

  for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
    if (job.status === "completed") break;
    if (["failed", "cancelled", "expired"].includes(job.status)) {
      throw new Error(`generateVideoFile: job ${job.status}. ${JSON.stringify(job)}`);
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

    if (!job.polling_url) {
      throw new Error(`generateVideoFile: no polling_url in job: ${JSON.stringify(job)}`);
    }
    const pollRes = await fetch(job.polling_url, { method: "GET", headers });
    if (!pollRes.ok) {
      throw new Error(`generateVideoFile: polling failed (HTTP ${pollRes.status}): ${await pollRes.text()}`);
    }
    job = (await pollRes.json()) as VideoJob;
  }

  if (job.status !== "completed") {
    throw new Error(
      `generateVideoFile: timed out after ${MAX_POLL_ATTEMPTS} polls (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s), last status: ${job.status}`
    );
  }

  const contentUrl = job.unsigned_urls?.[0];
  if (!contentUrl) {
    throw new Error(`generateVideoFile: no unsigned_urls in completed job: ${JSON.stringify(job)}`);
  }

  const contentRes = await fetch(contentUrl, { method: "GET", headers });
  if (!contentRes.ok) {
    throw new Error(`generateVideoFile: content download failed (HTTP ${contentRes.status})`);
  }

  await mkdir(REELS_DIR, { recursive: true });
  const filename = `${Date.now()}-${slugify(prompt)}.mp4`;
  const filePath = path.join(REELS_DIR, filename);
  await writeFile(filePath, Buffer.from(await contentRes.arrayBuffer()));

  return {
    filePath,
    publicUrl: `/media/07-reels/${filename}`,
    model: VIDEO_MODEL,
    cost: job.usage?.cost ?? null,
  };
}
