import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Server } from "node:http";

// Путь к базе читается модулями на верхнем уровне при импорте, поэтому
// переменная выставляется до динамических import'ов ниже, а тестовая база
// живёт во временном каталоге и не касается рабочей.
const tempDir = mkdtempSync(path.join(tmpdir(), "smm-test-"));
process.env.DB_PATH = path.join(tempDir, "test.sqlite");
process.env.UPLOAD_DIR = path.join(tempDir, "uploads");

let server: Server;
let baseUrl: string;
let approveRequest: typeof import("../admin/approval.js").approveRequest;

beforeAll(async () => {
  const Database = (await import("better-sqlite3")).default;
  const { drizzle } = await import("drizzle-orm/better-sqlite3");
  const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
  const sqlite = new Database(process.env.DB_PATH!);
  migrate(drizzle(sqlite), { migrationsFolder: path.join(process.cwd(), "drizzle") });
  sqlite.close();

  const { createApp } = await import("../app.js");
  ({ approveRequest } = await import("../admin/approval.js"));

  await new Promise<void>((resolve) => {
    server = createApp().listen(0, () => {
      const address = server.address();
      baseUrl = `http://127.0.0.1:${typeof address === "object" && address ? address.port : 0}`;
      resolve();
    });
  });
});

afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

const questionnaire = {
  ownLinks: [{ platform: "telegram", url: "https://t.me/example" }],
  competitorLinks: [
    { platform: "telegram", url: "https://t.me/rival_one" },
    { platform: "telegram", url: "https://t.me/rival_two" },
  ],
  questionnaire: {
    salesModel: "b2c",
    clientDescription: "Мастера ручной работы, которые продают через соцсети.",
    mainPrinciple: "Показывать процесс, а не только результат.",
    contentTaboos: "Никаких обещаний быстрого заработка.",
    expertPath: "Училась у наставника, потом десять лет практики.",
  },
};

async function createApprovedLink(email: string): Promise<string> {
  const created = await fetch(`${baseUrl}/api/access-requests`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const { id } = (await created.json()) as { id: string };
  const { link } = await approveRequest(id);
  return link.split("/").pop()!;
}

describe("заявка на доступ", () => {
  it("отклоняет неверный адрес", async () => {
    const res = await fetch(`${baseUrl}/api/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "не-адрес" }),
    });
    expect(res.status).toBe(400);
  });

  it("принимает заявку, но доступа сразу не даёт", async () => {
    const res = await fetch(`${baseUrl}/api/access-requests`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: "new@example.com", name: "Ольга" }),
    });
    expect(res.status).toBe(201);
    expect(await res.json()).toMatchObject({ status: "pending" });
  });
});

describe("ссылка на анкету", () => {
  it("не сгорает при открытии и сгорает после отправки формы", async () => {
    const token = await createApprovedLink("flow@example.com");

    // Первое открытие: почтовый антивирус или предпросмотр в почтовом клиенте
    // выглядят ровно так же, поэтому ссылка обязана пережить их.
    const first = await fetch(`${baseUrl}/api/access/${token}`);
    expect(first.status).toBe(200);
    const cookie = first.headers.get("set-cookie")!.split(";")[0];

    const second = await fetch(`${baseUrl}/api/access/${token}`);
    expect(second.status).toBe(200);

    const submitted = await fetch(`${baseUrl}/api/onboarding`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Cookie: cookie },
      body: JSON.stringify(questionnaire),
    });
    expect(submitted.status).toBe(200);

    const afterSubmit = await fetch(`${baseUrl}/api/access/${token}`);
    expect(afterSubmit.status).toBe(410);
    expect(await afterSubmit.json()).toMatchObject({ error: "link_already_used" });
  });

  it("отвечает 404 на несуществующий токен", async () => {
    const res = await fetch(`${baseUrl}/api/access/нет-такого-токена`);
    expect(res.status).toBe(404);
  });
});

describe("защита кабинета", () => {
  it("не отдаёт данные анкеты без сессии", async () => {
    const res = await fetch(`${baseUrl}/api/onboarding`);
    expect(res.status).toBe(401);
  });

  it("не пускает к агентам без сессии", async () => {
    const res = await fetch(`${baseUrl}/api/agents/audience-unpacker`, { method: "POST" });
    expect(res.status).toBe(401);
  });

  it("оставляет публичную ссылку на результаты доступной без сессии", async () => {
    // Проверка порядка роутеров: защищённые монтируются после публичных, и
    // при перестановке этот маршрут молча начал бы отвечать 401.
    const res = await fetch(`${baseUrl}/api/results/несуществующий`);
    expect(res.status).toBe(404);
  });
});
