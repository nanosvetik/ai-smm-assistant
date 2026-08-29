import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessRequests } from "../db/schema.js";

const pending = await db.select().from(accessRequests).where(eq(accessRequests.status, "pending"));

if (pending.length === 0) {
  console.log("No pending access requests.");
} else {
  for (const r of pending) {
    console.log(`${r.id}  [${r.contactType}]  ${r.contactValue}  (${r.createdAt.toISOString()})`);
  }
}
