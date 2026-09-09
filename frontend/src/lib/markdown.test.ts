import { describe, expect, it } from "vitest";
import { stripFrontmatter } from "./markdown";

// Служебный заголовок документа не должен доезжать до клиента ни в одном из
// вариантов оформления, которые выдают разные модели.
describe("stripFrontmatter", () => {
  it("срезает обычный блок", () => {
    const doc = ["---", "статус: боевой", "---", "", "# Профиль ЦА", "", "Текст."].join("\n");
    expect(stripFrontmatter(doc)).toBe("# Профиль ЦА\n\nТекст.");
  });

  it("срезает блок вместе с обрамляющим кодфенсом", () => {
    const doc = ["```yaml", "---", "статус: боевой", "---", "```", "", "# Заголовок"].join("\n");
    expect(stripFrontmatter(doc)).toBe("# Заголовок");
  });

  it("разворачивает документ, целиком завёрнутый в кодфенс", () => {
    // Так повёл себя profile-header-analyzer: обернул в ```markdown весь
    // документ, а не только заголовок, — и страница показывала блок кода.
    const doc = ["```markdown", "---", "статус: боевой", "---", "", "# Аудит шапки", "", "Текст.", "```"].join("\n");
    const result = stripFrontmatter(doc);
    expect(result).toContain("# Аудит шапки");
    expect(result).not.toContain("```");
    expect(result).not.toContain("статус:");
  });

  it("срезает блок, в значении которого есть двоеточие", () => {
    // Пока такой блок не разбирался, он утекал на экран сырым текстом.
    const doc = ["---", "статус: боевой", "тема: Разбор кейса: как это было", "---", "", "Текст."].join("\n");
    const result = stripFrontmatter(doc);
    expect(result).toBe("Текст.");
  });

  it("оставляет документ без frontmatter нетронутым", () => {
    expect(stripFrontmatter("# Заголовок\n\nТекст.")).toBe("# Заголовок\n\nТекст.");
  });

  it("не принимает markdown-разделитель внутри текста за frontmatter", () => {
    const doc = ["# Заголовок", "", "Первая часть.", "", "---", "", "Вторая часть."].join("\n");
    expect(stripFrontmatter(doc)).toContain("Первая часть.");
    expect(stripFrontmatter(doc)).toContain("Вторая часть.");
  });
});
