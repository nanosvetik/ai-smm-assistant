import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "../middleware/session.js";
import { db } from "../db/index.js";
import { accountStyleProfiles, audienceProfiles, competitorAnalysisProfiles, contentPlans, expertiseProfiles, packagingProfiles } from "../db/schema.js";
import { OnboardingMissingError, runAudienceUnpacker } from "../agents/audienceUnpacker.js";
import { OnboardingMissingError as ExpertiseOnboardingMissingError, runExpertiseUnpacker } from "../agents/expertiseUnpacker.js";
import { OwnLinksMissingError, runAccountAnalyzer } from "../agents/accountAnalyzer.js";
import { CompetitorLinksMissingError, runCompetitorAnalyzer } from "../agents/competitorAnalyzer.js";
import { PrerequisitesMissingError, runAccountPackager } from "../agents/accountPackager.js";
import { PrerequisitesMissingError as ContentPlannerPrerequisitesMissingError, runContentPlanner } from "../agents/contentPlanner.js";

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
agentsRouter.post("/agents/account-analyzer", async (req, res) => {
  try {
    const profile = await runAccountAnalyzer(req.clientId!);
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
