import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import path from "node:path";
import { mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "..", "data", "app.sqlite");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
const db = drizzle(sqlite);

migrate(db, { migrationsFolder: path.join(__dirname, "..", "..", "drizzle") });
console.log(`Migrations applied to ${DB_PATH}`);
