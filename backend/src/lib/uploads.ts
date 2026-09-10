import multer from "multer";
import path from "node:path";
import { mkdirSync } from "node:fs";
import type { Request, RequestHandler, Response } from "express";
import { generateId } from "./tokens.js";

export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

// Загруженные файлы раздаются по прямой ссылке с того же домена, что и сам
// сервис. Если позволить положить туда .html или .svg, они выполнятся в
// источнике сервиса и получат доступ к API от имени того, кто открыл ссылку.
// Поэтому список типов закрытый, а расширение на диске назначаем сами:
// имя файла от клиента для этого не годится.
const ALLOWED_TYPES = new Map([
  ["image/jpeg", ".jpg"],
  ["image/png", ".png"],
  ["image/webp", ".webp"],
  ["image/gif", ".gif"],
]);

export const ALLOWED_UPLOAD_TYPES = [...ALLOWED_TYPES.keys()];

export function extensionForMimeType(mimeType: string): string | undefined {
  return ALLOWED_TYPES.get(mimeType.toLowerCase());
}

// Тип приходит от клиента и подделывается, но подделка не помогает: файл
// будет сохранён с расширением заявленного типа и отдан браузеру как
// изображение, а заголовки статики запрещают трактовать его иначе.
export function createImageUpload(resolveDir: (req: Request) => string) {
  return multer({
    storage: multer.diskStorage({
      destination: (req, _file, cb) => {
        const dir = resolveDir(req);
        mkdirSync(dir, { recursive: true });
        cb(null, dir);
      },
      filename: (_req, file, cb) => {
        cb(null, `${generateId()}${extensionForMimeType(file.mimetype) ?? ".bin"}`);
      },
    }),
    fileFilter: (_req, file, cb) => {
      if (!extensionForMimeType(file.mimetype)) {
        cb(new UnsupportedFileTypeError());
        return;
      }
      cb(null, true);
    },
    limits: { fileSize: MAX_UPLOAD_BYTES },
  });
}

// busboy декодирует заголовки multipart как latin1 — кириллица в имени файла
// приходит побайтово верной, но прочитанной не той кодировкой. Имя не
// украшение: оно попадает в промпт распаковки вместе с категорией референса,
// и модель вместо «до_после.jpg» видит мусор.
export function decodeOriginalFilename(originalname: string): string {
  return Buffer.from(originalname, "latin1").toString("utf8");
}

export class UnsupportedFileTypeError extends Error {
  constructor() {
    super("unsupported_file_type");
  }
}

// Отказ multer приходит как ошибка в next(), а это по умолчанию 500 — клиент
// увидел бы «что-то сломалось» вместо понятного «такие файлы не принимаем».
export function handleUpload(middleware: RequestHandler): RequestHandler {
  return (req, res, next) => {
    middleware(req, res, (err: unknown) => {
      if (err instanceof UnsupportedFileTypeError) {
        res.status(415).json({ error: "unsupported_file_type", allowed: ALLOWED_UPLOAD_TYPES });
        return;
      }
      // Снимок с современного телефона легко перешагивает лимит, так что этот
      // путь достижим обычным клиентом, а не только при попытке навредить.
      if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
        res.status(413).json({ error: "file_too_large", maxBytes: MAX_UPLOAD_BYTES });
        return;
      }
      if (err) {
        next(err);
        return;
      }
      next();
    });
  };
}

// Заголовки для каталогов, куда попадают файлы от клиентов. nosniff не даёт
// браузеру угадать тип вопреки заявленному, а политика запрещает исполнять
// содержимое как страницу, даже если файл туда всё-таки попал.
export function staticSecurityHeaders(res: Response) {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Content-Security-Policy", "default-src 'none'; img-src 'self'; media-src 'self'; sandbox");
}
