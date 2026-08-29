import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import path from "node:path";
import { mkdirSync } from "node:fs";
import * as schema from "./schema.js";

const DB_PATH = process.env.DB_PATH ?? path.join(process.cwd(), "..", "data", "app.sqlite");
mkdirSync(path.dirname(DB_PATH), { recursive: true });

const sqlite = new Database(DB_PATH);
sqlite.pragma("journal_mode = WAL");

export const db = drizzle(sqlite, { schema });
