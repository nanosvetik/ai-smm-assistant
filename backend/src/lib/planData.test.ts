import { describe, expect, it } from "vitest";
import { parsePlanData } from "./planData.js";

const validBlock = JSON.stringify({
  posts: [{ day: 1, platform: "telegram", theme: "Личная история", title: "С чего всё началось", pattern: null }],
  reels: [{ theme: "Процесс", hook: "Три секунды на кадр", needsReferences: true, pattern: "закулисье" }],
});

function withBlock(json: string, before = "", after = ""): string {
  return `${before}\n\`\`\`json\n${json}\n\`\`\`\n${after}`;
}

describe("parsePlanData", () => {
  it("читает блок плана вместе с окружающим текстом", () => {
    const plan = parsePlanData(withBlock(validBlock, "# Контент-план", "Следующий шаг: ..."));
    expect(plan?.posts).toHaveLength(1);
    expect(plan?.posts[0]).toMatchObject({ day: 1, platform: "telegram" });
    expect(plan?.reels[0]).toMatchObject({ needsReferences: true });
  });

  it("пропускает посторонний json-блок и находит настоящий", () => {
    const doc = withBlock('{"пример": "не план"}') + withBlock(validBlock);
    expect(parsePlanData(doc)?.posts).toHaveLength(1);
  });

  it("возвращает null на неполной структуре", () => {
    // Отсутствие reels — не «пустой план», а признак того, что модель выдала
    // что-то другое: интерфейс в этом случае показывает документ целиком.
    const doc = withBlock(JSON.stringify({ posts: [] }));
    expect(parsePlanData(doc)).toBeNull();
  });

  it("возвращает null на чужой площадке", () => {
    const doc = withBlock(
      JSON.stringify({
        posts: [{ day: 1, platform: "instagram", theme: "т", title: "з", pattern: null }],
        reels: [],
      })
    );
    expect(parsePlanData(doc)).toBeNull();
  });

  it("возвращает null на битом json", () => {
    expect(parsePlanData(withBlock("{ posts: [ "))).toBeNull();
  });

  it("возвращает null, когда блока нет", () => {
    expect(parsePlanData("# План на две недели\n\nПонедельник — пост.")).toBeNull();
  });
});
