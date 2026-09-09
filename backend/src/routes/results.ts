import { Router } from "express";
import { and, desc, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, copywriterPosts, generatedImages, generatedVideos, packagingProfiles, reelsScripts, socialLinks } from "../db/schema.js";
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

async function latestPackagingProfile(clientId: string) {
  const [row] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, clientId))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);
  return row ?? null;
}

function themeOf(documentMarkdown: string): string | null {
  const theme = parseFrontmatter(documentMarkdown)?.["тема"];
  return typeof theme === "string" ? theme : null;
}

// Витрина готового демо, доступная только по ссылке. В отличие от обмена
// анкетной ссылки, не сгорает и не ставит куку: её пересылают нескольким
// людям, а не используют для входа. Сессия здесь не проверяется намеренно —
// токен в URL и есть авторизация.
//
// Отдаются посты, картинки, рилс и «Упаковка профиля»: последняя уже
// синтезирует главное в презентабельном виде и работает как витрина.
// Контент-план и сырая аналитика сюда не идут: план — личная стратегия
// клиента, а не материал для случайного зрителя пересланной ссылки (скачать
// его можно из кабинета), аналитика же показывает кухню, ради которой имеет
// смысл вернуться за полной версией.
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

  const packaging = await latestPackagingProfile(link.clientId);

  res.json({ platforms, posts, reels, packaging: packaging ? { documentMarkdown: packaging.documentMarkdown } : null });
});
