import { and, eq } from "drizzle-orm";
import { db } from "../db/index.js";
import { accessLinks, clients } from "../db/schema.js";
import { generateToken, RESULTS_LINK_TTL_MS } from "../lib/tokens.js";

export class ResultsLinkError extends Error {}

// BASE_URL читается при каждом вызове, а не при загрузке модуля: тесты и
// admin-скрипты поднимают окружение в разном порядке.
function resultsUrl(token: string): string {
  const baseUrl = process.env.BASE_URL ?? "http://localhost:5173";
  return `${baseUrl}/results/${token}`;
}

// Ссылка на готовое демо только для чтения. В отличие от анкетной, не
// сгорает: рассчитана на возврат клиента и пересылку другим людям. Обычно вызывается
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

  return { link: resultsUrl(token), expiresAt };
}

// Ссылка на результаты, если она уже создана. Нужна кабинету: до этого
// единственным каналом доставки было письмо, а письмо с домена без репутации
// уходит в «Спам» — клиент, дошедший до конца, не видел готовый демо-контент
// вовсе и не имел способа о нём узнать.
export async function findResultsLink(clientId: string) {
  const [row] = await db
    .select({ token: accessLinks.token, expiresAt: accessLinks.expiresAt })
    .from(accessLinks)
    .where(and(eq(accessLinks.clientId, clientId), eq(accessLinks.kind, "results")))
    .limit(1);
  if (!row) return null;
  return { link: resultsUrl(row.token), expiresAt: row.expiresAt };
}
