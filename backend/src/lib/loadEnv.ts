import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

// Импортируется первым в каждой точке входа (сервер, admin-скрипты). Всё
// остальное подгружается после — динамическим import(), потому что статические
// импорты выполняются раньше тела модуля, а модули читают переменные окружения
// сразу при загрузке: путь к базе, каталог загрузок, ключи внешних сервисов.
//
// Корень проекта вычисляется здесь заново, а не берётся из paths.ts, ровно по
// той же причине: импорт paths.ts отсюда выполнился бы до dotenv.config() и
// зафиксировал бы пути без учёта .env.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, "..", "..", "..", ".env") });
