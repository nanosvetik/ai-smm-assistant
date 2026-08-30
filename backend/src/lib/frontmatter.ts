import { load } from "js-yaml";

// Промпты агентов выдают документ с YAML-frontmatter между парой строк "---"
// (см. prompts/target-audience.md, "YAML-frontmatter"). Модель иногда вставляет
// markdown-разделители "---" до настоящего frontmatter-блока (например перед
// ```yaml-кодфенсом) — первая попавшаяся пара "---" тогда захватывает не тот
// кусок текста. Перебираем все пары строк "---" по порядку и берём первую,
// которая реально парсится как YAML-объект — и для чтения, и для записи поля.
function findFrontmatterBlocks(document: string): Array<{ start: number; end: number }> {
  const dashes = [...document.matchAll(/^---[ \t]*$/gm)];
  const blocks: Array<{ start: number; end: number }> = [];
  for (let i = 0; i < dashes.length - 1; i++) {
    blocks.push({
      start: dashes[i].index! + dashes[i][0].length + 1,
      end: dashes[i + 1].index!,
    });
  }
  return blocks;
}

export function parseFrontmatter(document: string): Record<string, unknown> | null {
  for (const { start, end } of findFrontmatterBlocks(document)) {
    try {
      const parsed = load(document.slice(start, end));
      if (parsed && typeof parsed === "object") {
        return parsed as Record<string, unknown>;
      }
    } catch {
      continue;
    }
  }
  return null;
}

// Используется агентами, которые сами вычисляют статус (не доверяя
// самооценке модели, см. accountPackager.ts/contentPlanner.ts) и переписывают
// им сохранённый документ, чтобы текст не расходился с колонкой в БД.
export function replaceFrontmatterField(document: string, field: string, value: string): string {
  for (const { start, end } of findFrontmatterBlocks(document)) {
    const content = document.slice(start, end);
    try {
      const parsed = load(content);
      if (!parsed || typeof parsed !== "object") continue;
    } catch {
      continue;
    }
    const fieldPattern = new RegExp(`^${field}:\\s*\\S+`, "m");
    if (!fieldPattern.test(content)) continue;
    return document.slice(0, start) + content.replace(fieldPattern, `${field}: ${value}`) + document.slice(end);
  }
  return document;
}
