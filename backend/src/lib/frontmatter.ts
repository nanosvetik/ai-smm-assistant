import { load } from "js-yaml";

// Промпты агентов выдают документ с YAML-frontmatter между парой строк "---"
// (см. prompts/target-audience.md, "YAML-frontmatter"). Ищем первую такую
// пару где угодно в тексте — не привязываемся к тому, обёрнута она в
// markdown-код-блок ```yaml или нет, модель формулирует это не всегда строго.
export function parseFrontmatter(document: string): Record<string, unknown> | null {
  const match = document.match(/---\s*\n([\s\S]*?)\n---/);
  if (!match) {
    return null;
  }
  const parsed = load(match[1]);
  return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
}
