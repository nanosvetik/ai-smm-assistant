import path from "node:path";
import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { reelsReferenceFiles } from "../db/schema.js";

const MIME_TYPES: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
};

// Потолок бережёт токены и цену. Референсы собираются под один рилс, так что
// десятка кадров с запасом хватает, чтобы увидеть общее.
const MAX_REFERENCES = 10;

type ReelsReference = typeof reelsReferenceFiles.$inferSelect;

// Единый порядок для всех, кто читает референсы рилса: свежие первыми, так
// что первый элемент — стартовый кадр видео. Его отправляют видео-модели
// первым кадром (videoGenerator.ts), и его же разбирает visual-style-analyzer,
// чтобы промпт описывал движение от того, что на кадре действительно есть.
// Разойдись эти две выборки хоть в мелочи — промпт описывал бы один кадр, а
// видео начиналось бы с другого.
//
// Сравнение по id при равном времени — не педантизм: created_at хранится с
// точностью до секунды, а клиент выбирает несколько файлов разом, и два из
// них легко попадают в одну и ту же секунду. Без второго ключа порядок в
// таком случае задаёт SQLite, и он не обязан быть одинаковым в разных
// запросах.
export function selectReelsReferences(references: ReelsReference[]): ReelsReference[] {
  return references
    .filter((ref) => MIME_TYPES[path.extname(ref.filePath).toLowerCase()])
    .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || b.id.localeCompare(a.id))
    .slice(0, MAX_REFERENCES);
}

export async function loadReelsReferences(clientId: string): Promise<ReelsReference[]> {
  const rows = await db.select().from(reelsReferenceFiles).where(eq(reelsReferenceFiles.clientId, clientId));
  return selectReelsReferences(rows);
}

export function mimeTypeForReference(reference: ReelsReference): string {
  return MIME_TYPES[path.extname(reference.filePath).toLowerCase()]!;
}
