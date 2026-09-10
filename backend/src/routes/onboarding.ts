import { Router } from "express";
import { z } from "zod";
import { and, eq, isNull } from "drizzle-orm";
import path from "node:path";
import { requireSession } from "../middleware/session.js";
import { db } from "../db/index.js";
import { accessLinks, socialLinks, onboardingProfiles, referenceFiles } from "../db/schema.js";
import { generateId } from "../lib/tokens.js";
import { createImageUpload, handleUpload } from "../lib/uploads.js";
import { UPLOAD_ROOT } from "../lib/paths.js";

export const onboardingRouter = Router();
onboardingRouter.use(requireSession);

const REFERENCE_CATEGORIES = ["before_after", "workspace", "showcase", "products", "process"] as const;

const linkSchema = z.object({
  platform: z.enum(["telegram", "vk"]),
  url: z.string().trim().url().max(500),
});

// Опросник заменяет получасовое интервью несколькими вопросами: спрашиваем
// ровно то, без чего распаковка аудитории и экспертности выродится в общие
// слова.
const onboardingSchema = z.object({
  ownLinks: z.array(linkSchema).max(2),
  competitorLinks: z.array(linkSchema).min(2).max(3),
  questionnaire: z.object({
    salesModel: z.enum(["b2c", "b2b"]),
    clientDescription: z.string().trim().min(1).max(2000),
    clientPhrases: z.string().trim().max(2000).optional(),
    mainPrinciple: z.string().trim().min(1).max(2000),
    contentTaboos: z.string().trim().min(1).max(2000),
    expertPath: z.string().trim().min(1).max(2000),
  }),
});

// Данные формы онбординга: свои соцсети, ссылки на конкурентов, опросник.
// Пересдача формы полностью заменяет предыдущие ссылки и ответы клиента.
onboardingRouter.post("/onboarding", async (req, res) => {
  const parsed = onboardingSchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: "invalid_request", details: parsed.error.flatten() });
    return;
  }

  const clientId = req.clientId!;
  const now = new Date();
  const { ownLinks, competitorLinks, questionnaire } = parsed.data;

  await db.delete(socialLinks).where(eq(socialLinks.clientId, clientId));
  const linkRows = [
    ...ownLinks.map((link) => ({ ...link, role: "own" as const })),
    ...competitorLinks.map((link) => ({ ...link, role: "competitor" as const })),
  ].map((link) => ({
    id: generateId(),
    clientId,
    role: link.role,
    platform: link.platform,
    url: link.url,
    createdAt: now,
  }));
  if (linkRows.length > 0) {
    await db.insert(socialLinks).values(linkRows);
  }

  await db
    .insert(onboardingProfiles)
    .values({
      clientId,
      salesModel: questionnaire.salesModel,
      clientDescription: questionnaire.clientDescription,
      clientPhrases: questionnaire.clientPhrases ?? null,
      mainPrinciple: questionnaire.mainPrinciple,
      contentTaboos: questionnaire.contentTaboos,
      expertPath: questionnaire.expertPath,
      submittedAt: now,
    })
    .onConflictDoUpdate({
      target: onboardingProfiles.clientId,
      set: {
        salesModel: questionnaire.salesModel,
        clientDescription: questionnaire.clientDescription,
        clientPhrases: questionnaire.clientPhrases ?? null,
        mainPrinciple: questionnaire.mainPrinciple,
        contentTaboos: questionnaire.contentTaboos,
        expertPath: questionnaire.expertPath,
        submittedAt: now,
      },
    });

  // Только здесь ссылка на анкету и становится использованной — не при
  // открытии страницы (почему именно так — в routes/access.ts). Помечаем все
  // ещё живые анкетные ссылки клиента:
  // сессия не помнит, каким токеном была получена, а их у одного клиента
  // больше одной только в нештатных случаях (оператор выдал повторную).
  //
  // Пересдать форму клиент по-прежнему может — сессия живёт 24 часа и
  // ссылка для этого не нужна. Без сессии (другое устройство) понадобится
  // новая ссылка от оператора; раньше, при сжигании на открытии, было ровно
  // так же, только наступало раньше.
  await db
    .update(accessLinks)
    .set({ usedAt: now })
    .where(
      and(eq(accessLinks.clientId, clientId), eq(accessLinks.kind, "onboarding"), isNull(accessLinks.usedAt))
    );

  res.json({ status: "ok" });
});

// Текущее состояние онбординга клиента — для префилла формы и экрана
// прогресса ("что уже загружено").
onboardingRouter.get("/onboarding", async (req, res) => {
  const clientId = req.clientId!;

  const [questionnaire] = await db
    .select()
    .from(onboardingProfiles)
    .where(eq(onboardingProfiles.clientId, clientId))
    .limit(1);
  const links = await db.select().from(socialLinks).where(eq(socialLinks.clientId, clientId));
  const references = await db.select().from(referenceFiles).where(eq(referenceFiles.clientId, clientId));

  res.json({
    questionnaire: questionnaire ?? null,
    ownLinks: links.filter((link) => link.role === "own"),
    competitorLinks: links.filter((link) => link.role === "competitor"),
    references,
  });
});

// Категория идёт параметром маршрута, не полем multipart-тела: порядок частей
// в multipart не гарантирован, и текстовое поле после файла может быть ещё не
// распаршено на момент выбора каталога.
const upload = createImageUpload((req) => path.join(UPLOAD_ROOT, req.clientId!, req.params.category));

// Медиа-референс, один файл за запрос, с разбивкой по категориям.
onboardingRouter.post(
  "/onboarding/references/:category",
  (req, res, next) => {
    if (!REFERENCE_CATEGORIES.includes(req.params.category as (typeof REFERENCE_CATEGORIES)[number])) {
      res.status(400).json({ error: "invalid_category" });
      return;
    }
    next();
  },
  handleUpload(upload.single("file")),
  async (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: "file_required" });
      return;
    }

    const clientId = req.clientId!;
    const category = req.params.category as (typeof REFERENCE_CATEGORIES)[number];
    const id = generateId();
    // Слэши нормализуются под URL: на проде путь раздаётся статикой с Linux,
    // а path.relative на Windows отдаёт обратные слэши, которые ломают адрес.
    const relativePath = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join("/");

    await db.insert(referenceFiles).values({
      id,
      clientId,
      category,
      filePath: relativePath,
      originalFilename: req.file.originalname,
      createdAt: new Date(),
    });

    res.status(201).json({ id, category, filePath: relativePath });
  }
);
