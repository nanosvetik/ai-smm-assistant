import { beforeAll, describe, expect, it } from "vitest";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

// База не нужна — проверяется чистая функция, — но модуль тянет за собой
// db/index.js, который открывает файл по DB_PATH при загрузке (см. lib/paths.ts).
const tempDir = mkdtempSync(path.join(tmpdir(), "smm-reels-refs-"));
process.env.DB_PATH = path.join(tempDir, "test.sqlite");

let selectReelsReferences: typeof import("./reelsReferenceSet.js").selectReelsReferences;

beforeAll(async () => {
  ({ selectReelsReferences } = await import("./reelsReferenceSet.js"));
});

function reference(id: string, seconds: number, extension = ".jpg") {
  return {
    id,
    clientId: "client-1",
    filePath: `client-1/reels/${id}${extension}`,
    originalFilename: `${id}${extension}`,
    createdAt: new Date(seconds * 1000),
  };
}

describe("selectReelsReferences", () => {
  it("ставит самый свежий референс первым — он и есть стартовый кадр", () => {
    const selected = selectReelsReferences([reference("a", 100), reference("b", 300), reference("c", 200)]);
    expect(selected.map((ref) => ref.id)).toEqual(["b", "c", "a"]);
  });

  // Ради этого случая порядок и вынесен в общую функцию. created_at хранится
  // с точностью до секунды, а клиент выбирает несколько файлов разом — два
  // легко попадают в одну секунду. Разойдись порядок между вызовами, и
  // visual-style-analyzer описал бы один кадр, а видео началось бы с другого.
  it("при одинаковом времени даёт один и тот же порядок независимо от порядка на входе", () => {
    const forward = selectReelsReferences([reference("a", 100), reference("b", 100), reference("c", 100)]);
    const reversed = selectReelsReferences([reference("c", 100), reference("b", 100), reference("a", 100)]);
    expect(forward.map((ref) => ref.id)).toEqual(reversed.map((ref) => ref.id));
  });

  it("отбрасывает файлы с неподдерживаемым расширением", () => {
    const selected = selectReelsReferences([reference("a", 100, ".bin"), reference("b", 200)]);
    expect(selected.map((ref) => ref.id)).toEqual(["b"]);
  });

  it("не берёт больше десяти референсов", () => {
    const many = Array.from({ length: 15 }, (_, index) => reference(`ref-${index}`, index));
    expect(selectReelsReferences(many)).toHaveLength(10);
  });
});
