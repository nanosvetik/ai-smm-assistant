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

// Живой баг: значения вроде "тема: Личная история: момент..." (скопированные
// дословно из тем контент-плана, часто в формате "Формат: хук") сами содержат
// ":" — невалидный YAML, парсер видит вложенный маппинг и падает на всём
// блоке. Промпты (copywriter.md/reels-writer.md) просят модель заключать
// такие значения в кавычки, но полагаться только на это нельзя — берём в
// кавычки сами перед повторной попыткой распарсить, если первая попытка
// упала. Не трогаем ключи с "#" (инлайн-комментарии в YAML) и уже
// закавыченные значения.
function quoteColonValues(yamlContent: string): string {
  return yamlContent.replace(/^([^\s#:][^:]*):[ \t]+(.+)$/gm, (line, key: string, value: string) => {
    if (/^["']/.test(value) || !value.includes(":")) return line;
    return `${key}: "${value.replace(/"/g, '\\"')}"`;
  });
}

function tryParse(content: string): Record<string, unknown> | null {
  try {
    const parsed = load(content);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
  } catch {
    try {
      const parsed = load(quoteColonValues(content));
      return parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : null;
    } catch {
      return null;
    }
  }
}

export function parseFrontmatter(document: string): Record<string, unknown> | null {
  for (const { start, end } of findFrontmatterBlocks(document)) {
    const parsed = tryParse(document.slice(start, end));
    if (parsed) return parsed;
  }
  return null;
}

// Используется агентами, которые сами вычисляют статус (не доверяя
// самооценке модели, см. accountPackager.ts/contentPlanner.ts) и переписывают
// им сохранённый документ, чтобы текст не расходился с колонкой в БД.
export function replaceFrontmatterField(document: string, field: string, value: string): string {
  for (const { start, end } of findFrontmatterBlocks(document)) {
    const content = document.slice(start, end);
    if (!tryParse(content)) continue;
    const fieldPattern = new RegExp(`^${field}:\\s*\\S+`, "m");
    if (!fieldPattern.test(content)) continue;
    return document.slice(0, start) + content.replace(fieldPattern, `${field}: ${value}`) + document.slice(end);
  }
  return document;
}
