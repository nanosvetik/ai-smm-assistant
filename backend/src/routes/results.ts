import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, copywriterPosts, generatedImages, generatedVideos, reelsScripts, socialLinks } from "../db/schema.js";
import { parseFrontmatter } from "../lib/frontmatter.js";

export const resultsRouter = Router();

type Platform = "telegram" | "vk";

async function latestCopywriterPost(clientId: string, platform: Platform) {
  const [row] = await db
    .select()
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, clientId), eq(copywriterPosts.platform, platform)))
    .orderBy(desc(copywriterPosts.version))
    .limit(1);
  return row ?? null;
}

async function latestGeneratedImage(clientId: string, platform: Platform) {
  const [row] = await db
    .select()
    .from(generatedImages)
    .where(and(eq(generatedImages.clientId, clientId), eq(generatedImages.platform, platform)))
    .orderBy(desc(generatedImages.version))
    .limit(1);
  return row ?? null;
}

async function latestReelsScript(clientId: string) {
  const [row] = await db.select().from(reelsScripts).where(eq(reelsScripts.clientId, clientId)).orderBy(desc(reelsScripts.version)).limit(1);
  return row ?? null;
}

async function latestGeneratedVideo(clientId: string) {
  const [row] = await db.select().from(generatedVideos).where(eq(generatedVideos.clientId, clientId)).orderBy(desc(generatedVideos.version)).limit(1);
  return row ?? null;
}

function themeOf(documentMarkdown: string): string | null {
  const theme = parseFrontmatter(documentMarkdown)?.["тема"];
  return typeof theme === "string" ? theme : null;
}

// Read-only ссылка на готовое демо (kind: "results", раздел 2/6 спецификации)
// — в отличие от /access/:token, не сгорает при использовании и не ставит
// сессионную куку: рассчитана на пересылку нескольким людям (потенциальным
// лидам, не только самому клиенту), не на однократный вход. Никакого
// requireSession — токен в самом URL и есть авторизация для этого маршрута.
// Отдаёт только готовый демо-контент (посты/картинки/рилс) — без
// аналитических документов (ЦА/экспертность и т.п.): это стратегические
// данные клиента, шэрить их со случайными зрителями по пересланной ссылке
// не то же самое, что показать готовый пост.
resultsRouter.get("/results/:token", async (req, res) => {
  const { token } = req.params;

  const [link] = await db.select().from(accessLinks).where(eq(accessLinks.token, token)).limit(1);
  if (!link || link.kind !== "results") {
    res.status(404).json({ error: "link_not_found" });
    return;
  }
  if (link.expiresAt.getTime() < Date.now()) {
    res.status(410).json({ error: "link_expired" });
    return;
  }

  const own = await db
    .select({ platform: socialLinks.platform })
    .from(socialLinks)
    .where(and(eq(socialLinks.clientId, link.clientId), eq(socialLinks.role, "own")));
  const platforms = [...new Set(own.map((r) => r.platform))] as Platform[];

  const posts = (
    await Promise.all(
      platforms.map(async (platform) => {
        const [post, image] = await Promise.all([latestCopywriterPost(link.clientId, platform), latestGeneratedImage(link.clientId, platform)]);
        if (!post) return null;
        return {
          platform,
          theme: themeOf(post.documentMarkdown),
          documentMarkdown: post.documentMarkdown,
          imageUrl: image?.publicUrl ?? null,
        };
      })
    )
  ).filter((p): p is NonNullable<typeof p> => p != null);

  let reels: { theme: string | null; documentMarkdown: string; videoUrl: string | null } | null = null;
  if (platforms.includes("vk")) {
    const script = await latestReelsScript(link.clientId);
    if (script) {
      const video = await latestGeneratedVideo(link.clientId);
      reels = {
        theme: themeOf(script.documentMarkdown),
        documentMarkdown: script.documentMarkdown,
        videoUrl: video?.publicUrl ?? null,
      };
    }
  }

  res.json({ platforms, posts, reels });
});
