import { describe, expect, it } from "vitest";
import { extractPromptBlock } from "./promptBlock.js";

// Случаи ниже — из живых документов агентов: модели оформляют один и тот же
// блок по-разному, и строгий разбор стоил клиенту оплаченного отказа.
describe("extractPromptBlock", () => {
  it("берёт промпт из закрытого блока", () => {
    const doc = ["# Визуал", "", "```text", "a cozy anime shop corner", "```", "", "конец"].join("\n");
    expect(extractPromptBlock(doc)).toBe("a cozy anime shop corner");
  });

  it("пропускает пустой блок и берёт следующий непустой", () => {
    const doc = ["```text", "", "```", "", "```text", "настоящий промпт", "```"].join("\n");
    expect(extractPromptBlock(doc)).toBe("настоящий промпт");
  });

  it("достаёт промпт из незакрытого блока", () => {
    // Живой случай: модель открыла ```text, написала промпт целиком и вместо
    // закрывающего фенса приписала хвост html-комментария.
    const doc = ["## Готовый промпт", "", "```text", "a gift box with anime merch. No text or labels.", "-->"].join("\n");
    expect(extractPromptBlock(doc)).toBe("a gift box with anime merch. No text or labels.");
  });

  it("не выдаёт пустоту за промпт", () => {
    expect(extractPromptBlock(["```text", "   ", "-->"].join("\n"))).toBeNull();
    expect(extractPromptBlock("документ без блока вовсе")).toBeNull();
  });

  it("закрытый блок имеет приоритет над хвостом документа", () => {
    const doc = ["```text", "первый промпт", "```", "", "```text", "оборванный хвост"].join("\n");
    expect(extractPromptBlock(doc)).toBe("первый промпт");
  });
});
