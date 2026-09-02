import { Router } from "express";
import { eq } from "drizzle-orm";
import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { requireSession } from "../middleware/session.js";
import { db } from "../db/index.js";
import { reelsReferenceFiles } from "../db/schema.js";
import { generateId } from "../lib/tokens.js";

export const reelsReferencesRouter = Router();
reelsReferencesRouter.use(requireSession);

const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(process.cwd(), "..", "uploads");

const upload = multer({
  storage: multer.diskStorage({
    destination: (req, _file, cb) => {
      const dir = path.join(UPLOAD_ROOT, req.clientId!, "reels");
      mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename: (_req, file, cb) => {
      cb(null, `${generateId()}${path.extname(file.originalname)}`);
    },
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
});

// Референсы клиента для конкретного рилса — добавляются на странице рилса,
// после того как сценарий уже написан (см. CLAUDE.md). Одна зона загрузки,
// без категорий.
reelsReferencesRouter.post("/reels-references", upload.single("file"), async (req, res) => {
  if (!req.file) {
    res.status(400).json({ error: "file_required" });
    return;
  }

  const clientId = req.clientId!;
  const id = generateId();
  const relativePath = path.relative(UPLOAD_ROOT, req.file.path).split(path.sep).join("/");

  await db.insert(reelsReferenceFiles).values({
    id,
    clientId,
    filePath: relativePath,
    originalFilename: req.file.originalname,
    createdAt: new Date(),
  });

  res.status(201).json({ id, filePath: relativePath, originalFilename: req.file.originalname });
});

reelsReferencesRouter.get("/reels-references", async (req, res) => {
  const clientId = req.clientId!;
  const references = await db.select().from(reelsReferenceFiles).where(eq(reelsReferenceFiles.clientId, clientId));
  res.json(references);
});
