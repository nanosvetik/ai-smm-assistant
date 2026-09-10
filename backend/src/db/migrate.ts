import "../lib/loadEnv.js";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Динамически — чтобы путь к базе вычислялся уже с учётом .env: иначе миграции
// накатились бы на файл, отличный от того, с которым работает сервер.
const { DB_PATH } = await import("../lib/paths.js");

mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.join(__dirname, "..", "..", "drizzle") });
console.log(`Migrations applied to ${DB_PATH}`);
