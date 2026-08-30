import { Router } from "express";
import { desc, eq } from "drizzle-orm";
import { requireSession } from "../middleware/session.js";
import { db } from "../db/index.js";
import { audienceProfiles } from "../db/schema.js";
import { OnboardingMissingError, runAudienceUnpacker } from "../agents/audienceUnpacker.js";

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
