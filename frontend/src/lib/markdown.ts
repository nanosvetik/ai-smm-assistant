import { load } from "js-yaml";

// Та же устойчивая логика, что и в backend/src/lib/frontmatter.ts: модель
// иногда пишет преамбулу и/или decoy-разделитель "---" (например,
// markdown-разделитель или строку перед ```yaml-кодфенсом) до настоящего
// YAML-frontmatter — простой regex на начало документа такую структуру не
// ловит. Перебираем все пары строк "---" и берём первую, которая реально
// парсится как YAML-объект.
// Живой баг: значения вроде "тема: Личная история: момент..." (скопированные
// дословно из тем контент-плана, часто в формате "Формат: хук") сами содержат
// ":" — невалидный YAML, парсер видит вложенный маппинг и падает на всём
// блоке, из-за чего frontmatter не срезался и утекал в интерфейс как есть.
// Та же логика fallback'а, что и в backend/src/lib/frontmatter.ts — берём
// подозрительное значение в кавычки перед повторной попыткой распарсить.
function quoteColonValues(yamlContent: string): string {
  return yamlContent.replace(/^([^\s#:][^:]*):[ \t]+(.+)$/gm, (line, key: string, value: string) => {
    if (/^["']/.test(value) || !value.includes(":")) return line;
    return `${key}: "${value.replace(/"/g, '\\"')}"`;
  });
}

function isParsableFrontmatter(content: string): boolean {
  try {
    const parsed = load(content);
    if (parsed && typeof parsed === "object") return true;
  } catch {
    // падаем ниже на fallback с кавычками
  }
  try {
    const parsed = load(quoteColonValues(content));
    return Boolean(parsed && typeof parsed === "object");
  } catch {
    return false;
  }
}

function findFrontmatterBlock(document: string): { start: number; end: number } | null {
  const dashLines = [...document.matchAll(/^---[ \t]*$/gm)];
  for (let i = 0; i < dashLines.length - 1; i++) {
    const start = dashLines[i].index!;
    const contentStart = start + dashLines[i][0].length + 1;
    const end = dashLines[i + 1].index!;
    if (isParsableFrontmatter(document.slice(contentStart, end))) {
      return { start, end: end + dashLines[i + 1][0].length };
    }
  }
  return null;
}

// Frontmatter не нужен читателю — статус и так показан отдельно из колонки
// БД (AgentResult.status). Заодно съедаем окружающий кодфенс, если он есть
// (все prompts/*.md просят модель оборачивать frontmatter в ```yaml).
// Живой баг: profile-header-analyzer (Claude Sonnet 5) обернул ```markdown
// вокруг ВСЕГО документа (frontmatter + тело), не только вокруг frontmatter —
// закрывающий ``` оказался в самом конце строки, а не сразу после frontmatter.
// Старая логика ждала yaml/yml и фенс вплотную вокруг frontmatter, поэтому
// не срезала ни открывающий, ни закрывающий тег — весь документ рендерился
// одним блоком кода. Теперь: любой язык фенса, и если закрывающий ``` не
// нашёлся сразу после frontmatter — ищем его в конце всего документа.
export function stripFrontmatter(document: string): string {
  const block = findFrontmatterBlock(document);
  if (!block) return document.trim();

  let { start, end } = block;
  let body = document;

  const fenceBefore = body.slice(0, start).match(/```[\w-]*[ \t]*\n$/);
  if (fenceBefore) start -= fenceBefore[0].length;

  const fenceRightAfter = body.slice(end).match(/^\n```[ \t]*\n/);
  if (fenceRightAfter) {
    end += fenceRightAfter[0].length;
  } else if (fenceBefore) {
    const trailingFence = body.match(/\n```[ \t]*$/);
    if (trailingFence) body = body.slice(0, trailingFence.index);
  }

  return (body.slice(0, start) + body.slice(end)).trim();
}
