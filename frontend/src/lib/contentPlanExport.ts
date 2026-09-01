import type ExcelJS from "exceljs";
import { PLATFORM_LABELS } from "./stages";
import { groupPostsByDay, sortedDays, weekLabel, weekdayLabel, type ContentPlanData, type PlanPost } from "./planData";

const HEADER_FILL: ExcelJS.Fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4A2545" } };
const HEADER_FONT: Partial<ExcelJS.Font> = { bold: true, color: { argb: "FFFFFFFF" } };

function formatPostCell(post: PlanPost | undefined): string {
  if (!post) return "";
  const patternLine = post.pattern ? `\n[формат подтверждён в нише: ${post.pattern}]` : "";
  return `${post.title}\n${post.theme}${patternLine}`;
}

// exceljs — тяжёлая библиотека, нужна только по клику «Скачать» — грузим её
// динамически, а не на каждое открытие кабинета (см. StagePanel/ContentPlanGrid).
export async function downloadContentPlanXlsx(plan: ContentPlanData): Promise<void> {
  const { default: ExcelJSRuntime } = await import("exceljs");
  const workbook = new ExcelJSRuntime.Workbook();

  const gridSheet = workbook.addWorksheet("Контент-план");
  gridSheet.columns = [
    { header: "Неделя", key: "week", width: 12 },
    { header: "День недели", key: "weekday", width: 16 },
    ...plan.platforms.map((p) => ({ header: PLATFORM_LABELS[p], key: p, width: 50 })),
  ];
  gridSheet.getRow(1).fill = HEADER_FILL;
  gridSheet.getRow(1).font = HEADER_FONT;
  gridSheet.views = [{ state: "frozen", ySplit: 1 }];

  const byDay = groupPostsByDay(plan.posts);

  for (const day of sortedDays(byDay)) {
    const entry = byDay.get(day)!;
    const row: Record<string, string> = {
      week: weekLabel(day),
      weekday: weekdayLabel(day),
    };
    for (const p of plan.platforms) {
      row[p] = formatPostCell(entry[p]);
    }
    const addedRow = gridSheet.addRow(row);
    addedRow.eachCell((cell) => {
      cell.alignment = { wrapText: true, vertical: "top" };
    });
  }

  if (plan.reels.length > 0) {
    const reelsSheet = workbook.addWorksheet("Идеи Reels");
    reelsSheet.columns = [
      { header: "Тема", key: "theme", width: 30 },
      { header: "Хук (первые 3 сек.)", key: "hook", width: 40 },
      { header: "Нужны личные материалы", key: "needsReferences", width: 22 },
      { header: "Паттерн", key: "pattern", width: 30 },
    ];
    reelsSheet.getRow(1).fill = HEADER_FILL;
    reelsSheet.getRow(1).font = HEADER_FONT;

    for (const idea of plan.reels) {
      const row = reelsSheet.addRow({
        theme: idea.theme,
        hook: idea.hook,
        needsReferences: idea.needsReferences ? "Да" : "Нет",
        pattern: idea.pattern ?? "",
      });
      row.eachCell((cell) => {
        cell.alignment = { wrapText: true, vertical: "top" };
      });
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "контент-план.xlsx";
  link.click();
  URL.revokeObjectURL(url);
}
