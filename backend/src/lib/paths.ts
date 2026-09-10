import path from "node:path";
import { fileURLToPath } from "node:url";

// Пути к данным считаются от расположения самого кода, а не от рабочей
// директории процесса. Причина не косметическая: при запуске из другой
// директории (systemd-юнит с собственным WorkingDirectory, cron, запуск
// `node backend/dist/index.js` из корня) промпты агентов просто не находятся,
// а SQLite ведёт себя хуже — better-sqlite3 молча создаёт новый пустой файл
// вместо ошибки, и сервис поднимается без единого клиента и без сессий.
//
// Глубина одинакова в разработке и после сборки: src/lib/* компилируется в
// dist/lib/* (rootDir: "src", outDir: "dist"), поэтому от каталога этого файла
// до корня репозитория всегда три уровня вверх.
const __dirname = path.dirname(fileURLToPath(import.meta.url));

export const PROJECT_ROOT = path.join(__dirname, "..", "..", "..");

export const DB_PATH = process.env.DB_PATH ?? path.join(PROJECT_ROOT, "data", "app.sqlite");

// Референсы, загруженные клиентом. Переопределяется UPLOAD_DIR, если диск с
// файлами вынесен отдельно от кода.
export const UPLOAD_ROOT = process.env.UPLOAD_DIR ?? path.join(PROJECT_ROOT, "uploads");

// Сгенерированные медиа. Каталог раздаётся статикой как /media (app.ts), так
// что путь записи и путь раздачи обязаны совпадать — иначе ссылки в письме и
// на странице результатов ведут в 404.
export const WORKSPACE_ROOT = path.join(PROJECT_ROOT, "workspace");

export function promptPath(fileName: string): string {
  return path.join(PROJECT_ROOT, "prompts", fileName);
}
