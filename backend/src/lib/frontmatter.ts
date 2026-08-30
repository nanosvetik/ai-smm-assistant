import { load } from "js-yaml";

// Промпты агентов выдают документ с YAML-frontmatter между парой строк "---"
// (см. prompts/target-audience.md, "YAML-frontmatter"). Модель иногда вставляет
// markdown-разделители "---" до настоящего frontmatter-блока (например перед
// ```yaml-кодфенсом) — первая попавшаяся пара "---" тогда захватывает не тот
// кусок текста и валит YAML-парсер. Перебираем все пары строк "---" по
// порядку и берём первую, которая реально парсится как YAML-объект.
export function parseFrontmatter(document: string): Record<string, unknown> | null {
  const dashLines = [...document.matchAll(/^---\s*$/gm)].map((m) => m.index ?? 0);

  for (let i = 0; i < dashLines.length - 1; i++) {
    const block = document.slice(dashLines[i], dashLines[i + 1]).replace(/^---\s*\n/, "");
    try {
      const parsed = load(block);
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}
