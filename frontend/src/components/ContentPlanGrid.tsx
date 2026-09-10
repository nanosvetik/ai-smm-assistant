import { Fragment, useState } from "react";
import { PLATFORM_LABELS } from "../lib/stages";
import { groupPostsByDay, sortedDays, weekLabel, weekdayLabel, type ContentPlanData } from "../lib/planData";
import { downloadContentPlanXlsx } from "../lib/contentPlanExport";
import { Button } from "./Button";
import "./ContentPlanGrid.css";

// Сетка контент-плана поверх структурированного JSON-блока content-planner
// (backend/src/lib/planData.ts). Показываются только те дни, на которые
// действительно есть публикация: строки-заглушки создавали бы впечатление,
// что писать надо каждый день.
export function ContentPlanGrid({ plan }: { plan: ContentPlanData }) {
  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const byDay = groupPostsByDay(plan.posts);
  const days = sortedDays(byDay);

  async function handleDownload() {
    setIsDownloading(true);
    setError(null);
    try {
      await downloadContentPlanXlsx(plan);
    } catch {
      // Сборка книги грузит exceljs отдельным чанком и может не собраться:
      // молчать здесь нельзя — прямо над кнопкой написано, что план больше
      // нигде не хранится, и клиент решит, что файл сохранён.
      setError("Не получилось собрать файл. Попробуйте ещё раз — или скопируйте темы из таблицы ниже.");
    } finally {
      setIsDownloading(false);
    }
  }

  return (
    <div className="content-plan-grid">
      <p className="content-plan-download-note">
        <strong>Скачайте таблицу сейчас.</strong> Контент-план хранится только в этом кабинете — доступ к нему
        ограничен по времени, и в отличие от готовых постов и упаковки профиля он больше нигде не сохраняется.
      </p>

      <div className="content-plan-toolbar">
        <Button type="button" variant="primary" onClick={handleDownload} disabled={isDownloading}>
          {isDownloading ? "Готовим файл…" : "Скачать таблицу (.xlsx)"}
        </Button>
      </div>
      {error && <p className="stage-error">{error}</p>}

      {days.length === 0 ? (
        <p className="content-plan-empty">В этом плане пока нет ни одного запланированного дня.</p>
      ) : (
        <div className="content-plan-table-wrap">
          <table className="content-plan-table">
            <thead>
              <tr>
                <th>День</th>
                {plan.platforms.map((p) => (
                  <th key={p}>{PLATFORM_LABELS[p]}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {days.map((day, index) => {
                const entry = byDay.get(day)!;
                const previousDay = index > 0 ? days[index - 1] : null;
                const showWeekLabel = previousDay === null || weekLabel(day) !== weekLabel(previousDay);
                return (
                  <Fragment key={day}>
                    {showWeekLabel && (
                      <tr className="content-plan-week-row">
                        <td colSpan={1 + plan.platforms.length}>{weekLabel(day)}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="content-plan-weekday">{weekdayLabel(day)}</td>
                      {plan.platforms.map((p) => {
                        const post = entry[p];
                        return (
                          <td key={p}>
                            {post ? (
                              <div className="content-plan-cell">
                                <p className="content-plan-title">{post.title}</p>
                                <p className="content-plan-theme">{post.theme}</p>
                                {post.pattern && (
                                  <p className="content-plan-pattern">формат подтверждён в нише: {post.pattern}</p>
                                )}
                              </div>
                            ) : (
                              <span className="content-plan-empty-cell">—</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {plan.reels.length > 0 && (
        <div className="content-plan-reels">
          <h2>Идеи Reels</h2>
          <ul>
            {plan.reels.map((idea, index) => (
              <li className="content-plan-reels-item" key={index}>
                <p className="content-plan-title">{idea.theme}</p>
                <p className="content-plan-reels-hook">«{idea.hook}»</p>
                <p className="content-plan-reels-meta">
                  {idea.needsReferences ? "Нужны личные материалы" : "Без привязки к личным материалам"}
                  {idea.pattern && ` · формат подтверждён в нише: ${idea.pattern}`}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
