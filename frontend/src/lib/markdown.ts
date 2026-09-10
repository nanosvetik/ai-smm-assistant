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

// Поля, которые есть у каждого агента (prompts/*.md): по ним настоящий
// frontmatter отличается от куска текста, случайно оказавшегося между двумя
// "---".
const FRONTMATTER_KEYS = ["тип", "статус", "создан", "обновлён", "платформа"];

function parseBlock(content: string): Record<string, unknown> | null {
  for (const candidate of [content, quoteColonValues(content)]) {
    try {
      const parsed = load(candidate);
      // Массив исключён намеренно: YAML разбирает обычный маркированный
      // список как массив, и без этой проверки перечисление между двумя
      // markdown-разделителями принималось за frontmatter и вырезалось
      // вместе с ними — из документа молча пропадал кусок текста.
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // пробуем следующий вариант разбора
    }
  }
  return null;
}

function findFrontmatterBlock(document: string): { start: number; end: number } | null {
  const dashLines = [...document.matchAll(/^---[ \t]*$/gm)];
  // Блок с узнаваемыми полями выигрывает у просто разбираемого: модель иногда
  // ставит markdown-разделитель до настоящего frontmatter.
  let fallback: { start: number; end: number } | null = null;

  for (let i = 0; i < dashLines.length - 1; i++) {
    const start = dashLines[i].index!;
    const contentStart = start + dashLines[i][0].length + 1;
    const end = dashLines[i + 1].index!;
    const parsed = parseBlock(document.slice(contentStart, end));
    if (!parsed) continue;

    const block = { start, end: end + dashLines[i + 1][0].length };
    if (FRONTMATTER_KEYS.some((key) => key in parsed)) return block;
    fallback ??= block;
  }

  return fallback;
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
