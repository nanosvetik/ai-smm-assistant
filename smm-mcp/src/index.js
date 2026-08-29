import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import dotenv from "dotenv";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = path.join(__dirname, "..", "..");

// smm-mcp/.env takes priority (per package's own config); project-root .env
// fills in anything missing (dotenv never overrides an already-set var).
dotenv.config({ path: path.join(__dirname, "..", ".env") });
dotenv.config({ path: path.join(PROJECT_ROOT, ".env") });

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
if (!OPENROUTER_API_KEY) {
  console.error("[smm-mcp] OPENROUTER_API_KEY is not set (checked smm-mcp/.env and project-root .env)");
  process.exit(1);
}

const IMAGES_URL = "https://openrouter.ai/api/v1/images";
const VIDEOS_URL = "https://openrouter.ai/api/v1/videos";

const IMAGE_MODEL_PRIMARY = "bytedance-seed/seedream-4.5";
const IMAGE_MODEL_FALLBACK = "black-forest-labs/flux.2-max";
const VIDEO_MODEL_DEFAULT = "kwaivgi/kling-v3.0-pro";

// Confirmed empirically against the live API on 2026-08-29:
// a 3s clip completed in ~60s. README's original margin (40 * 5s = 200s)
// is kept as a safe ceiling for longer clips.
const POLL_INTERVAL_MS = 5000;
const MAX_POLL_ATTEMPTS = 40;

const IMAGES_DIR = path.join(PROJECT_ROOT, "workspace", "06-images");
const REELS_DIR = path.join(PROJECT_ROOT, "workspace", "07-reels");

const MEDIA_EXT = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
};

function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40) || "output";
}

function isPublicHttpUrl(value) {
  if (typeof value !== "string") return false;
  return /^https?:\/\//i.test(value);
}

async function openrouterFetch(url, options) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      "Content-Type": "application/json",
      ...options?.headers,
    },
  });
  return res;
}

const server = new McpServer({ name: "smm-visuals", version: "0.1.0" });

server.registerTool(
  "generate_image",
  {
    title: "Generate image",
    description:
      "Generates an image via OpenRouter's dedicated /api/v1/images endpoint (synchronous, returns base64). " +
      "Saves the result to workspace/06-images/ and returns the local file path. " +
      "Falls back from Seedream to FLUX.2 Max if the primary model call fails.",
    inputSchema: {
      prompt: z.string().describe("Image generation prompt."),
      model: z
        .string()
        .optional()
        .describe(`Model slug. Defaults to ${IMAGE_MODEL_PRIMARY}, falls back to ${IMAGE_MODEL_FALLBACK} on failure.`),
    },
  },
  async ({ prompt, model }) => {
    const attempts = model ? [model] : [IMAGE_MODEL_PRIMARY, IMAGE_MODEL_FALLBACK];
    let lastError;

    for (const attemptModel of attempts) {
      const res = await openrouterFetch(IMAGES_URL, {
        method: "POST",
        body: JSON.stringify({ model: attemptModel, prompt, n: 1 }),
      });

      if (!res.ok) {
        const body = await res.text();
        lastError = `${attemptModel} -> HTTP ${res.status}: ${body}`;
        continue;
      }

      const json = await res.json();
      const item = json.data?.[0];
      if (!item?.b64_json) {
        lastError = `${attemptModel} -> no b64_json in response`;
        continue;
      }

      await mkdir(IMAGES_DIR, { recursive: true });
      const ext = MEDIA_EXT[item.media_type] ?? "jpg";
      const filename = `${Date.now()}-${slugify(prompt)}.${ext}`;
      const filePath = path.join(IMAGES_DIR, filename);
      await writeFile(filePath, Buffer.from(item.b64_json, "base64"));

      const cost = json.usage?.cost;
      return {
        content: [
          {
            type: "text",
            text: `Saved image to ${filePath}\nModel: ${attemptModel}${cost != null ? `\nCost: $${cost}` : ""}`,
          },
        ],
      };
    }

    throw new Error(`generate_image failed on all models. Last error: ${lastError}`);
  }
);

server.registerTool(
  "generate_video",
  {
    title: "Generate video",
    description:
      "Generates a video via OpenRouter's dedicated /api/v1/videos endpoint (async: create job, poll, download). " +
      "Saves the result to workspace/07-reels/ and returns the local file path. " +
      "first_frame_url / last_frame_url / reference_image MUST be public HTTP(S) URLs " +
      "(OpenRouter fetches them server-side — base64 or local paths are rejected).",
    inputSchema: {
      prompt: z.string().describe("Video generation prompt."),
      model: z.string().optional().describe(`Defaults to ${VIDEO_MODEL_DEFAULT}.`),
      duration: z.number().optional().describe("Duration in seconds (model-dependent allowed values)."),
      aspect_ratio: z.string().optional().describe('E.g. "9:16" for Reels, "16:9", "1:1".'),
      first_frame_url: z.string().optional().describe("Public HTTPS URL of the reference first frame."),
      last_frame_url: z.string().optional().describe("Public HTTPS URL of the reference last frame."),
      reference_image: z.string().optional().describe("Public HTTPS URL of a general reference image."),
    },
  },
  async ({ prompt, model, duration, aspect_ratio, first_frame_url, last_frame_url, reference_image }) => {
    for (const [name, value] of Object.entries({ first_frame_url, last_frame_url, reference_image })) {
      if (value && !isPublicHttpUrl(value)) {
        throw new Error(
          `${name} must be a public http(s) URL — got "${value}". Upload the file to the self-hosted static file server first (see CLAUDE.md, раздел 7) and pass the resulting public URL.`
        );
      }
    }

    const body = {
      model: model ?? VIDEO_MODEL_DEFAULT,
      prompt,
      ...(duration != null ? { duration } : {}),
      ...(aspect_ratio ? { aspect_ratio } : {}),
      ...(first_frame_url ? { first_frame_url } : {}),
      ...(last_frame_url ? { last_frame_url } : {}),
      ...(reference_image ? { reference_image } : {}),
    };

    const createRes = await openrouterFetch(VIDEOS_URL, {
      method: "POST",
      body: JSON.stringify(body),
    });

    if (!createRes.ok) {
      const errBody = await createRes.text();
      throw new Error(`generate_video: create job failed (HTTP ${createRes.status}): ${errBody}`);
    }

    const job = await createRes.json();
    const pollingUrl = job.polling_url;

    let finalJob = job;
    for (let attempt = 0; attempt < MAX_POLL_ATTEMPTS; attempt++) {
      if (finalJob.status === "completed") break;
      if (["failed", "cancelled", "expired"].includes(finalJob.status)) {
        throw new Error(`generate_video: job ${finalJob.status}. ${JSON.stringify(finalJob)}`);
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));

      const pollRes = await openrouterFetch(pollingUrl, { method: "GET" });
      if (!pollRes.ok) {
        throw new Error(`generate_video: polling failed (HTTP ${pollRes.status}): ${await pollRes.text()}`);
      }
      finalJob = await pollRes.json();
    }

    if (finalJob.status !== "completed") {
      throw new Error(
        `generate_video: timed out after ${MAX_POLL_ATTEMPTS} polls (${(MAX_POLL_ATTEMPTS * POLL_INTERVAL_MS) / 1000}s), last status: ${finalJob.status}`
      );
    }

    const contentUrl = finalJob.unsigned_urls?.[0];
    if (!contentUrl) {
      throw new Error(`generate_video: no unsigned_urls in completed job: ${JSON.stringify(finalJob)}`);
    }

    const contentRes = await openrouterFetch(contentUrl, { method: "GET" });
    if (!contentRes.ok) {
      throw new Error(`generate_video: content download failed (HTTP ${contentRes.status})`);
    }

    await mkdir(REELS_DIR, { recursive: true });
    const filename = `${Date.now()}-${slugify(prompt)}.mp4`;
    const filePath = path.join(REELS_DIR, filename);
    const arrayBuffer = await contentRes.arrayBuffer();
    await writeFile(filePath, Buffer.from(arrayBuffer));

    const cost = finalJob.usage?.cost;
    return {
      content: [
        {
          type: "text",
          text: `Saved video to ${filePath}\nModel: ${body.model}${cost != null ? `\nCost: $${cost}` : ""}`,
        },
      ],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
