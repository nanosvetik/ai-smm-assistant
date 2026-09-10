import "../lib/loadEnv.js";
import { eq } from "drizzle-orm";

// Как и в остальных admin-скриптах: база открывается после загрузки .env,
// иначе DB_PATH из окружения не учтён и очередь заявок выглядит пустой.
const { db } = await import("../db/index.js");
const { accessRequests } = await import("../db/schema.js");

const pending = await db.select().from(accessRequests).where(eq(accessRequests.status, "pending"));

if (pending.length === 0) {
  console.log("No pending access requests.");
} else {
  for (const r of pending) {
    console.log(`${r.id}  ${r.contactValue}${r.name ? `  (${r.name})` : ""}  ${r.createdAt.toISOString()}`);
  }
}
