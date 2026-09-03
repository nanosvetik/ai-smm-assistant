import { Router } from "express";
import { z } from "zod";
import { and, desc, eq } from "drizzle-orm";
import { requireSession } from "../middleware/session.js";
import { db } from "../db/index.js";
import { accountStyleProfiles, audienceProfiles, competitorAnalysisProfiles, contentPlans, copywriterPosts, editorialReviews, expertiseProfiles, generatedImages, generatedVideos, packagingProfiles, profileHeaderProfiles, reelsScripts, reelsVideoPrompts, visualGeneratorPrompts, visualStyleProfiles } from "../db/schema.js";
import { OnboardingMissingError, runAudienceUnpacker } from "../agents/audienceUnpacker.js";
import { OnboardingMissingError as ExpertiseOnboardingMissingError, runExpertiseUnpacker } from "../agents/expertiseUnpacker.js";
import { OwnLinksMissingError, runAccountAnalyzer } from "../agents/accountAnalyzer.js";
import { CompetitorLinksMissingError, runCompetitorAnalyzer } from "../agents/competitorAnalyzer.js";
import { OwnLinksMissingError as ProfileHeaderOwnLinksMissingError, runProfileHeaderAnalyzer } from "../agents/profileHeaderAnalyzer.js";
import { PrerequisitesMissingError, runAccountPackager } from "../agents/accountPackager.js";
import { PrerequisitesMissingError as ContentPlannerPrerequisitesMissingError, runContentPlanner } from "../agents/contentPlanner.js";
import { PlatformNotInPlanError, PrerequisitesMissingError as CopywriterPrerequisitesMissingError } from "../agents/copywriter.js";
import { ReferencesMissingError, runVisualStyleAnalyzer } from "../agents/visualStyleAnalyzer.js";
import { PrerequisitesMissingError as VisualGeneratorPrerequisitesMissingError, runVisualGenerator } from "../agents/visualGenerator.js";
import {
  PrerequisitesMissingError as ImageGeneratorPrerequisitesMissingError,
  PromptNotFoundError,
  runImageGenerator,
} from "../agents/imageGenerator.js";
import {
  PrerequisitesMissingError as ReelsVideoGeneratorPrerequisitesMissingError,
  runReelsVideoGenerator,
} from "../agents/reelsVideoGenerator.js";
import {
  PrerequisitesMissingError as VideoGeneratorPrerequisitesMissingError,
  PromptNotFoundError as VideoPromptNotFoundError,
  runVideoGenerator,
} from "../agents/videoGenerator.js";
import { PrerequisitesMissingError as ReelsWriterPrerequisitesMissingError, ReelsNotAvailableError } from "../agents/reelsWriter.js";
import { PrerequisitesMissingError as EditorInChiefPrerequisitesMissingError, runEditorInChief } from "../agents/editorInChief.js";
import { runReviewedCopywriter, runReviewedReelsWriter } from "../agents/reviewedContent.js";
import { runFullPipeline } from "../agents/pipeline.js";
import { ensureResultsLinkSent } from "../agents/resultsDelivery.js";

export const agentsRouter = Router();
agentsRouter.use(requireSession);

// Запуск audience-unpacker — реальный платный вызов OpenRouter (Claude
// Sonnet 5). Каждый запрос — новая версия Профиля ЦА, старые не
// перезаписываются (см. схему audience_profiles).
agentsRouter.post("/agents/audience-unpacker", async (req, res) => {
  try {
    const profile = await runAudienceUnpacker(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof OnboardingMissingError) {
      res.status(400).json({ error: "onboarding_data_missing" });
      return;
    }
    console.error("[agents] audience-unpacker failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Профиля ЦА клиента.
agentsRouter.get("/agents/audience-unpacker", async (req, res) => {
  const [profile] = await db
    .select()
    .from(audienceProfiles)
    .where(eq(audienceProfiles.clientId, req.clientId!))
    .orderBy(desc(audienceProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск expertise-unpacker — реальный платный вызов OpenRouter (Claude
// Sonnet 5). Каждый запрос — новая версия Распаковки экспертности, старые не
// перезаписываются (см. схему expertise_profiles).
agentsRouter.post("/agents/expertise-unpacker", async (req, res) => {
  try {
    const profile = await runExpertiseUnpacker(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof ExpertiseOnboardingMissingError) {
      res.status(400).json({ error: "onboarding_data_missing" });
      return;
    }
    console.error("[agents] expertise-unpacker failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Распаковки экспертности клиента.
agentsRouter.get("/agents/expertise-unpacker", async (req, res) => {
  const [profile] = await db
    .select()
    .from(expertiseProfiles)
    .where(eq(expertiseProfiles.clientId, req.clientId!))
    .orderBy(desc(expertiseProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск competitor-analyzer — реальный платный вызов OpenRouter (DeepSeek
// V4 Flash) поверх топ-постов конкурентов по вовлечённости, собранных
// парсером (backend/src/parsers). Каждый запрос — новая версия Анализа
// конкурентов, старые не перезаписываются.
agentsRouter.post("/agents/competitor-analyzer", async (req, res) => {
  try {
    const profile = await runCompetitorAnalyzer(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof CompetitorLinksMissingError) {
      res.status(400).json({ error: "competitor_links_missing" });
      return;
    }
    console.error("[agents] competitor-analyzer failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Анализа конкурентов клиента.
agentsRouter.get("/agents/competitor-analyzer", async (req, res) => {
  const [profile] = await db
    .select()
    .from(competitorAnalysisProfiles)
    .where(eq(competitorAnalysisProfiles.clientId, req.clientId!))
    .orderBy(desc(competitorAnalysisProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск account-analyzer — реальный платный вызов OpenRouter (DeepSeek V4
// Flash) поверх постов, собранных парсером (backend/src/parsers). Каждый
// запрос — новая версия Анализа своего аккаунта, старые не перезаписываются.
// Решение сессии: заодно всегда дёргаем profile-header-analyzer (Claude
// Sonnet vision, own-ссылки — тот же вход, ничего дополнительного не нужно) —
// у него нет своей кнопки в сайдбаре (см. открытые вопросы в CLAUDE.md), а
// без этого он никогда не запускался бы в реальном дашборде. Параллельно
// через Promise.all, его ошибка не должна ронять ответ account-analyzer —
// это опциональный вход для account-packager, не обязательный этап.
agentsRouter.post("/agents/account-analyzer", async (req, res) => {
  try {
    const [profile] = await Promise.all([
      runAccountAnalyzer(req.clientId!),
      runProfileHeaderAnalyzer(req.clientId!).catch((err) => {
        console.error("[agents] profile-header-analyzer (авто, вместе с account-analyzer) failed:", err);
      }),
    ]);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof OwnLinksMissingError) {
      res.status(400).json({ error: "own_links_missing" });
      return;
    }
    console.error("[agents] account-analyzer failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Анализа своего аккаунта клиента.
agentsRouter.get("/agents/account-analyzer", async (req, res) => {
  const [profile] = await db
    .select()
    .from(accountStyleProfiles)
    .where(eq(accountStyleProfiles.clientId, req.clientId!))
    .orderBy(desc(accountStyleProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск profile-header-analyzer — реальный платный вызов OpenRouter (Claude
// Sonnet 5, vision) поверх аватара/обложки/описания own-площадок клиента.
// Новый агент сверх исходной таблицы, независим от остальных (нужны только
// own-ссылки с онбординга) — опциональный вход для account-packager,
// см. раздел 9 спецификации.
agentsRouter.post("/agents/profile-header-analyzer", async (req, res) => {
  try {
    const profile = await runProfileHeaderAnalyzer(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof ProfileHeaderOwnLinksMissingError) {
      res.status(400).json({ error: "own_links_missing" });
      return;
    }
    console.error("[agents] profile-header-analyzer failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Аудита шапки профиля клиента.
agentsRouter.get("/agents/profile-header-analyzer", async (req, res) => {
  const [profile] = await db
    .select()
    .from(profileHeaderProfiles)
    .where(eq(profileHeaderProfiles.clientId, req.clientId!))
    .orderBy(desc(profileHeaderProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск account-packager — реальный платный вызов OpenRouter (DeepSeek V4
// Flash) поверх результатов audience-unpacker, expertise-unpacker и
// account-analyzer. Требует все три — это синтез поверх готового, не анализ
// с нуля (см. prompts/account-packager.md).
agentsRouter.post("/agents/account-packager", async (req, res) => {
  try {
    const profile = await runAccountPackager(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof PrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    console.error("[agents] account-packager failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Упаковки профиля клиента.
agentsRouter.get("/agents/account-packager", async (req, res) => {
  const [profile] = await db
    .select()
    .from(packagingProfiles)
    .where(eq(packagingProfiles.clientId, req.clientId!))
    .orderBy(desc(packagingProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

// Запуск content-planner — реальный платный вызов OpenRouter (DeepSeek V4
// Flash) поверх Упаковки профиля и Анализа конкурентов. Требует оба — план
// строится на пересечении подтверждённого в нише и того, что органично
// методу и стилю эксперта (см. prompts/content-planner.md).
agentsRouter.post("/agents/content-planner", async (req, res) => {
  try {
    const plan = await runContentPlanner(req.clientId!);
    res.status(201).json(plan);
  } catch (err) {
    if (err instanceof ContentPlannerPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    console.error("[agents] content-planner failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Контент-плана клиента.
agentsRouter.get("/agents/content-planner", async (req, res) => {
  const [plan] = await db
    .select()
    .from(contentPlans)
    .where(eq(contentPlans.clientId, req.clientId!))
    .orderBy(desc(contentPlans.version))
    .limit(1);

  if (!plan) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(plan);
});

const copywriterRequestSchema = z.object({
  platform: z.enum(["telegram", "vk"]),
  day: z.number().int().min(1).max(14).optional(),
});

// Запуск copywriter — реальный платный вызов OpenRouter (DeepSeek V4 Flash)
// поверх Контент-плана и Упаковки профиля, для одной площадки и дня из
// плана. Каждая площадка версионируется отдельно (см. схему copywriter_posts).
// Идёт через runReviewedCopywriter (см. reviewedContent.ts), не голый
// runCopywriter — раньше эта ручка (единственный путь генерации поста из
// кабинета, run-all к UI не подключён) вообще не проходила через
// editor-in-chief, хотя автопроверка табу/стоп-слов/нейрослопа — часть
// ключевого УТП продукта, не опциональная деталь (см. раздел 5 спецификации).
agentsRouter.post("/agents/copywriter", async (req, res) => {
  const parsed = copywriterRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  try {
    const { content, needsManualReview } = await runReviewedCopywriter(
      req.clientId!,
      parsed.data.platform,
      parsed.data.day
    );
    res.status(201).json({ ...content, needsManualReview });
    // Fire-and-forget — не блокирует ответ клиенту и не должен ронять его
    // при ошибке (см. resultsDelivery.ts: идемпотентно, сама решает, готов
    // ли уже весь текстовый демо-контент под реальные площадки клиента).
    ensureResultsLinkSent(req.clientId!).catch((err) => console.error("[results] ensureResultsLinkSent failed:", err));
  } catch (err) {
    if (err instanceof CopywriterPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    if (err instanceof PlatformNotInPlanError) {
      res.status(400).json({ error: "platform_not_in_plan", platform: err.platform });
      return;
    }
    console.error("[agents] copywriter failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

const copywriterQuerySchema = z.object({ platform: z.enum(["telegram", "vk"]) });

// Последняя (по номеру версии) сохранённая версия поста клиента для указанной площадки.
agentsRouter.get("/agents/copywriter", async (req, res) => {
  const parsed = copywriterQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const [post] = await db
    .select()
    .from(copywriterPosts)
    .where(and(eq(copywriterPosts.clientId, req.clientId!), eq(copywriterPosts.platform, parsed.data.platform)))
    .orderBy(desc(copywriterPosts.version))
    .limit(1);

  if (!post) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(post);
});

// Запуск visual-style-analyzer — реальный платный вызов OpenRouter (Claude
// Sonnet 5 — vision-задача над потенциально личными фото клиента, не
// публичным контентом) поверх drag-and-drop референсов клиента. Разовый
// анализ визуальной айдентики, не входил в исходную таблицу агентов (см.
// раздел 9 спецификации) — добавлен вместе с планированием visual-generator,
// чтобы генерации держали единый стиль от раза к разу.
agentsRouter.post("/agents/visual-style-analyzer", async (req, res) => {
  try {
    const profile = await runVisualStyleAnalyzer(req.clientId!);
    res.status(201).json(profile);
  } catch (err) {
    if (err instanceof ReferencesMissingError) {
      res.status(400).json({ error: "references_missing" });
      return;
    }
    console.error("[agents] visual-style-analyzer failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия Визуального style-профиля клиента.
agentsRouter.get("/agents/visual-style-analyzer", async (req, res) => {
  const [profile] = await db
    .select()
    .from(visualStyleProfiles)
    .where(eq(visualStyleProfiles.clientId, req.clientId!))
    .orderBy(desc(visualStyleProfiles.version))
    .limit(1);

  if (!profile) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(profile);
});

const visualGeneratorRequestSchema = z.object({ platform: z.enum(["telegram", "vk"]) });

// Запуск visual-generator — реальный платный вызов OpenRouter (DeepSeek V4
// Flash: вход тут уже текст, а не картинки, vision не нужен) поверх
// последнего поста copywriter для площадки + Визуального style-профиля
// (если есть). Пишет только промпт для generate_image — сам дорогой вызов
// generate_image происходит отдельно, по подтверждению пользователя (см.
// раздел 3 Шаг 4 спецификации, гейт ещё не реализован).
agentsRouter.post("/agents/visual-generator", async (req, res) => {
  const parsed = visualGeneratorRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  try {
    const prompt = await runVisualGenerator(req.clientId!, parsed.data.platform);
    res.status(201).json(prompt);
  } catch (err) {
    if (err instanceof VisualGeneratorPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    console.error("[agents] visual-generator failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

const visualGeneratorQuerySchema = z.object({ platform: z.enum(["telegram", "vk"]) });

// Последняя (по номеру версии) сохранённая версия промпта для указанной площадки.
agentsRouter.get("/agents/visual-generator", async (req, res) => {
  const parsed = visualGeneratorQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const [prompt] = await db
    .select()
    .from(visualGeneratorPrompts)
    .where(and(eq(visualGeneratorPrompts.clientId, req.clientId!), eq(visualGeneratorPrompts.platform, parsed.data.platform)))
    .orderBy(desc(visualGeneratorPrompts.version))
    .limit(1);

  if (!prompt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(prompt);
});

const generateImageRequestSchema = z.object({ platform: z.enum(["telegram", "vk"]) });

// Запуск реального вызова generate_image (раздел 3, Шаг 4 спецификации —
// гейт подтверждения перед медиа-генерацией) поверх последнего промпта
// visual-generator для площадки. Отдельная ручка, не встроена в
// /agents/visual-generator — текст промпта дешёвый и генерируется сразу без
// подтверждения, реальный вызов картиночной модели — дорогая операция за
// явным кликом «Сгенерировать» (см. ImageGenerationBlock.tsx на фронтенде).
agentsRouter.post("/agents/generate-image", async (req, res) => {
  const parsed = generateImageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  try {
    const image = await runImageGenerator(req.clientId!, parsed.data.platform);
    res.status(201).json(image);
  } catch (err) {
    if (err instanceof ImageGeneratorPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    if (err instanceof PromptNotFoundError) {
      res.status(502).json({ error: "prompt_not_found" });
      return;
    }
    console.error("[agents] generate-image failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая сгенерированная картинка для указанной площадки.
agentsRouter.get("/agents/generate-image", async (req, res) => {
  const parsed = generateImageRequestSchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const [image] = await db
    .select()
    .from(generatedImages)
    .where(and(eq(generatedImages.clientId, req.clientId!), eq(generatedImages.platform, parsed.data.platform)))
    .orderBy(desc(generatedImages.version))
    .limit(1);

  if (!image) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(image);
});

// Запуск reels-writer — реальный платный вызов OpenRouter (DeepSeek V4 Pro)
// поверх Контент-плана и Упаковки профиля. Reels в этом продукте существуют
// только для ВК — если ВК нет в реальных площадках клиента, падает
// ReelsNotAvailableError до вызова модели. Без параметра площадки: сценарий
// один на клиента, версионируется без разбивки по площадкам. Идёт через
// runReviewedReelsWriter (см. reviewedContent.ts) — тот же аргумент, что и у
// copywriter выше: это единственный путь генерации сценария из кабинета, и он
// обязан проходить editor-in-chief, а не только run-all.
agentsRouter.post("/agents/reels-writer", async (req, res) => {
  try {
    const { content, needsManualReview } = await runReviewedReelsWriter(req.clientId!);
    res.status(201).json({ ...content, needsManualReview });
    ensureResultsLinkSent(req.clientId!).catch((err) => console.error("[results] ensureResultsLinkSent failed:", err));
  } catch (err) {
    if (err instanceof ReelsWriterPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    if (err instanceof ReelsNotAvailableError) {
      res.status(400).json({ error: "reels_not_available" });
      return;
    }
    console.error("[agents] reels-writer failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия сценария рилса клиента.
agentsRouter.get("/agents/reels-writer", async (req, res) => {
  const [script] = await db
    .select()
    .from(reelsScripts)
    .where(eq(reelsScripts.clientId, req.clientId!))
    .orderBy(desc(reelsScripts.version))
    .limit(1);

  if (!script) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(script);
});

// Запуск reels-video-generator — реальный платный вызов OpenRouter (DeepSeek
// V4 Flash) поверх последнего сценария reels-writer, пишет промпт для
// generate_video (визуализация хука, см. prompts/reels-video-generator.md).
// Без параметра площадки — Reels один на клиента, как и reels_scripts.
agentsRouter.post("/agents/reels-video-generator", async (req, res) => {
  try {
    const prompt = await runReelsVideoGenerator(req.clientId!);
    res.status(201).json(prompt);
  } catch (err) {
    if (err instanceof ReelsVideoGeneratorPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    console.error("[agents] reels-video-generator failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая версия видео-промпта клиента.
agentsRouter.get("/agents/reels-video-generator", async (req, res) => {
  const [prompt] = await db
    .select()
    .from(reelsVideoPrompts)
    .where(eq(reelsVideoPrompts.clientId, req.clientId!))
    .orderBy(desc(reelsVideoPrompts.version))
    .limit(1);

  if (!prompt) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(prompt);
});

// Запуск реального вызова generate_video (раздел 3, Шаг 4 спецификации —
// видео-часть гейта подтверждения) поверх последнего промпта
// reels-video-generator. Отдельная ручка, не встроена в
// /agents/reels-video-generator — тот же принцип, что и с картинками:
// текст промпта дешёвый и генерируется сразу, реальный вызов видео-модели —
// дорогая операция за явным кликом «Сгенерировать» (см. VideoGenerationBlock.tsx).
agentsRouter.post("/agents/generate-video", async (req, res) => {
  try {
    const video = await runVideoGenerator(req.clientId!);
    res.status(201).json(video);
  } catch (err) {
    if (err instanceof VideoGeneratorPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    if (err instanceof VideoPromptNotFoundError) {
      res.status(502).json({ error: "prompt_not_found" });
      return;
    }
    console.error("[agents] generate-video failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

// Последняя (по номеру версии) сохранённая сгенерированная видео-запись клиента.
agentsRouter.get("/agents/generate-video", async (req, res) => {
  const [video] = await db
    .select()
    .from(generatedVideos)
    .where(eq(generatedVideos.clientId, req.clientId!))
    .orderBy(desc(generatedVideos.version))
    .limit(1);

  if (!video) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(video);
});

const editorInChiefRequestSchema = z.object({
  contentType: z.enum(["copywriter", "reels"]),
  platform: z.enum(["telegram", "vk"]),
});

// Запуск editor-in-chief — реальный платный вызов OpenRouter (DeepSeek V4
// Pro) поверх последней версии поста/сценария указанной площадки + табу
// (expertise-unpacker) + стоп-слова/tone (audience-unpacker) + tone/
// позиционирование (account-packager). Только вердикт, текст не переписывает
// (раздел 5 спецификации) — автоматическая перегенерация по фидбеку живёт в
// backend/src/agents/reviewedContent.ts, не в этой ручке.
agentsRouter.post("/agents/editor-in-chief", async (req, res) => {
  const parsed = editorInChiefRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  try {
    const review = await runEditorInChief(req.clientId!, parsed.data.contentType, parsed.data.platform);
    res.status(201).json(review);
  } catch (err) {
    if (err instanceof EditorInChiefPrerequisitesMissingError) {
      res.status(400).json({ error: "prerequisites_missing", missing: err.missing });
      return;
    }
    console.error("[agents] editor-in-chief failed:", err);
    res.status(502).json({ error: "agent_call_failed" });
  }
});

const editorInChiefQuerySchema = z.object({
  contentType: z.enum(["copywriter", "reels"]),
  platform: z.enum(["telegram", "vk"]),
});

// Последняя (по номеру версии) сохранённая проверка для указанных типа контента и площадки.
agentsRouter.get("/agents/editor-in-chief", async (req, res) => {
  const parsed = editorInChiefQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const [review] = await db
    .select()
    .from(editorialReviews)
    .where(
      and(
        eq(editorialReviews.clientId, req.clientId!),
        eq(editorialReviews.contentType, parsed.data.contentType),
        eq(editorialReviews.platform, parsed.data.platform)
      )
    )
    .orderBy(desc(editorialReviews.version))
    .limit(1);

  if (!review) {
    res.status(404).json({ error: "not_found" });
    return;
  }
  res.json(review);
});

// Запускает весь текстовый пайплайн разом (кнопка «Запустить анализ» на
// онбординге, раздел 6 спецификации) — независимые агенты параллельно,
// дальше по зависимостям, до готовых промптов для картинок включительно.
// Каждый этап пишет свой результат в БД сам по себе (как и при отдельном
// вызове), эта ручка не хранит собственного состояния — можно звать
// заново после исправления причины сбоя, старые версии не трогает.
// Ответ 200 даже при частичном сбое: то, что реально произошло на каждом
// этапе, — предметная информация для фронтенда, не серверная ошибка.
agentsRouter.post("/agents/run-all", async (req, res) => {
  try {
    const result = await runFullPipeline(req.clientId!);
    res.json(result);
  } catch (err) {
    console.error("[agents] run-all failed unexpectedly:", err);
    res.status(500).json({ error: "pipeline_failed" });
  }
});
