import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// База не нужна — проверяется чистая функция, — но модуль тянет за собой
// db/index.js, который открывает файл по DB_PATH при загрузке (см. lib/paths.ts).
// Поэтому путь выставляется во временный каталог до динамического import'а.
const tempDir = mkdtempSync(path.join(tmpdir(), "smm-visual-style-"));
process.env.DB_PATH = path.join(tempDir, "test.sqlite");

let isProfileOutdated: typeof import("./visualStyleAnalyzer.js").isProfileOutdated;

beforeAll(async () => {
  ({ isProfileOutdated } = await import("./visualStyleAnalyzer.js"));
});

const profileCreatedAt = new Date("2026-09-11T12:00:00Z");
const before = new Date("2026-09-11T11:00:00Z");
const after = new Date("2026-09-11T13:00:00Z");

function profile(referencesAnalyzed: number) {
  return { referencesAnalyzed, createdAt: profileCreatedAt };
}

describe("isProfileOutdated", () => {
  it("считает устаревшим отсутствующий профиль", () => {
    expect(isProfileOutdated(undefined, [{ createdAt: before }])).toBe(true);
  });

  it("оставляет профиль, если набор референсов не менялся", () => {
    expect(isProfileOutdated(profile(2), [{ createdAt: before }, { createdAt: before }])).toBe(false);
  });

  it("пересчитывает, когда референс добавили", () => {
    expect(isProfileOutdated(profile(1), [{ createdAt: after }, { createdAt: before }])).toBe(true);
  });

  it("пересчитывает, когда референс удалили", () => {
    expect(isProfileOutdated(profile(2), [{ createdAt: before }])).toBe(true);
  });

  // Главный случай ради которого проверка вообще нужна: клиент удалил фото и
  // загрузил другое вместо него. Количество совпадает, и по одному счётчику
  // профиль выглядел бы актуальным — а описывает он стиль фотографии, которой
  // у клиента больше нет.
  it("пересчитывает, когда референс заменили на другой", () => {
    expect(isProfileOutdated(profile(1), [{ createdAt: after }])).toBe(true);
  });
});
