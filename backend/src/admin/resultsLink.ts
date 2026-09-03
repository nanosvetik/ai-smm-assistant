import { eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, clients } from "../db/schema.js";
import { generateToken, RESULTS_LINK_TTL_MS } from "../lib/tokens.js";

export class ResultsLinkError extends Error {}

// Read-only ссылка на готовое демо (kind: "results", см. раздел 2/6
// спецификации) — в отличие от онбординговой, не сгорает при использовании:
// рассчитана на возврат клиента и пересылку другим людям. Обычно вызывается
// автоматически из resultsDelivery.ts, как только готов весь текстовый
// демо-контент под реальные площадки клиента.
export async function generateResultsLink(clientId: string) {
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId)).limit(1);
  if (!client) throw new ResultsLinkError(`No client with id ${clientId}`);

  const now = new Date();
  const token = generateToken();
  const expiresAt = new Date(now.getTime() + RESULTS_LINK_TTL_MS);
  await db.insert(accessLinks).values({
    token,
    clientId,
    kind: "results",
    expiresAt,
    createdAt: now,
  });

  const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
  return { link: `${baseUrl}/results/${token}`, expiresAt };
}
