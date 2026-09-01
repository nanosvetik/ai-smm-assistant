// Извлекает готовый английский промпт из документа visual-generator — см.
// prompts/visual-generator.md, "Готовый промпт" обёрнут в ```text блок именно
// для надёжного извлечения кодом, тот же принцип, что и JSON-блок
// content-planner (см. planData.ts): перебираем все совпадения на случай
// decoy-блока раньше настоящего, берём первый непустой.
export function extractImagePrompt(document: string): string | null {
  const blocks = [...document.matchAll(/```text\s*\n([\s\S]*?)\n```/g)];
  for (const block of blocks) {
    const text = block[1].trim();
    if (text.length > 0) return text;
  }
  return null;
}
