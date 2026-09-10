import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// Тестовая база во временном каталоге, путь выставляется до динамических
// import'ов: модули читают его при загрузке (см. lib/paths.ts).
const tempDir = mkdtempSync(path.join(tmpdir(), "smm-results-"));
process.env.DB_PATH = path.join(tempDir, "test.sqlite");

let db: typeof import("../db/index.js").db;
let schema: typeof import("../db/schema.js");
let ensureResultsLinkSent: typeof import("./resultsDelivery.js").ensureResultsLinkSent;
let findResultsLink: typeof import("../admin/resultsLink.js").findResultsLink;

beforeAll(async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DB_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();

  ({ db } = await import("../db/index.js"));
  schema = await import("../db/schema.js");
  ({ ensureResultsLinkSent } = await import("./resultsDelivery.js"));
  ({ findResultsLink } = await import("../admin/resultsLink.js"));
});

async function seedReadyClient(clientId: string) {
  const now = new Date();
  await db.insert(schema.clients).values({
    id: clientId,
    contactType: "email",
    contactValue: `${clientId}@example.com`,
    name: null,
    createdAt: now,
  });
  await db.insert(schema.socialLinks).values({
    id: `${clientId}-link`,
    clientId,
    role: "own",
    platform: "telegram",
    url: "https://t.me/example",
    createdAt: now,
  });
  await db.insert(schema.copywriterPosts).values({
    id: `${clientId}-post`,
    clientId,
    platform: "telegram",
    version: 1,
    status: "боевой",
    day: 1,
    contentPlanVersion: 1,
    packagingProfileVersion: 1,
    documentMarkdown: "текст поста",
    createdAt: now,
  });
}

async function resultsLinkCount(clientId: string) {
  const { and, eq } = await import("drizzle-orm");
  const rows = await db
    .select()
    .from(schema.accessLinks)
    .where(and(eq(schema.accessLinks.clientId, clientId), eq(schema.accessLinks.kind, "results")));
  return rows.length;
}

describe("ensureResultsLinkSent", () => {
  it("создаёт одну ссылку при одновременных вызовах", async () => {
    // Проверка «ссылка уже есть» и её создание — два отдельных обращения к
    // базе. Клиент, догенерировавший последний пост в двух вкладках, получал
    // два письма с двумя разными действующими ссылками на 90 дней.
    const clientId = "client-parallel";
    await seedReadyClient(clientId);

    await Promise.all([ensureResultsLinkSent(clientId), ensureResultsLinkSent(clientId)]);

    expect(await resultsLinkCount(clientId)).toBe(1);
  });

  it("не создаёт ссылку, пока готов не весь демо-контент", async () => {
    const clientId = "client-incomplete";
    const now = new Date();
    await db.insert(schema.clients).values({
      id: clientId,
      contactType: "email",
      contactValue: `${clientId}@example.com`,
      name: null,
      createdAt: now,
    });
    await db.insert(schema.socialLinks).values({
      id: `${clientId}-link`,
      clientId,
      role: "own",
      platform: "telegram",
      url: "https://t.me/example",
      createdAt: now,
    });

    await ensureResultsLinkSent(clientId);

    expect(await resultsLinkCount(clientId)).toBe(0);
  });

  it("повторный вызов после готовой ссылки ничего не добавляет", async () => {
    const clientId = "client-repeat";
    await seedReadyClient(clientId);

    await ensureResultsLinkSent(clientId);
    await ensureResultsLinkSent(clientId);

    expect(await resultsLinkCount(clientId)).toBe(1);
  });
});

// Кабинет показывает блок «всё готово» именно по этой выдаче. Пустой ответ и
// ответ со ссылкой должны различаться надёжно: если бы «ещё не готово» было
// неотличимо от сбоя, блок появлялся бы раньше времени и вёл в никуда.
describe("findResultsLink", () => {
  it("возвращает null, пока ссылка не создана", async () => {
    const clientId = "client-link-absent";
    await seedReadyClient(clientId);

    expect(await findResultsLink(clientId)).toBeNull();
  });

  it("отдаёт ссылку на созданный токен", async () => {
    const clientId = "client-link-present";
    await seedReadyClient(clientId);
    await ensureResultsLinkSent(clientId);

    const link = await findResultsLink(clientId);

    expect(link).not.toBeNull();
    expect(link!.link).toContain("/results/");
    expect(link!.expiresAt.getTime()).toBeGreaterThan(Date.now());
  });

  it("собирает адрес по текущему BASE_URL, а не по тому, что был при создании", async () => {
    // Ссылка живёт 90 дней и переживает смену домена: в базе лежит только
    // токен, адрес собирается при каждом чтении.
    const clientId = "client-link-baseurl";
    await seedReadyClient(clientId);
    await ensureResultsLinkSent(clientId);

    const previous = process.env.BASE_URL;
    process.env.BASE_URL = "https://example.test";
    try {
      const link = await findResultsLink(clientId);
      expect(link!.link.startsWith("https://example.test/results/")).toBe(true);
    } finally {
      if (previous === undefined) delete process.env.BASE_URL;
      else process.env.BASE_URL = previous;
    }
  });
});
