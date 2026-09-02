import { useState } from "react";
import type { StageConfig } from "../lib/stages";
import "./Sidebar.css";

export type StageProgress = "done" | "current" | "future";

interface SidebarProps {
  stages: StageConfig[];
  progress: Record<string, StageProgress>;
  activeKey: string;
  onSelect: (key: string) => void;
}

// Три смысловых блока конвейера (разбор → стратегия → готовый контент,
// см. обсуждение кабинета эксперта) — без заголовков и рамок, только
// увеличенный отступ после последнего пункта блока, чтобы взгляд сам считывал
// структуру, не перегружая интерфейс (бриф просит здесь скорость и ясность).
const GROUP_BREAK_AFTER = new Set(["competitor-analyzer", "content-planner"]);

// На десктопе .sidebar — sticky-колонка (см. Sidebar.css), длинный документ
// не отрывает меню от экрана. На узких экранах колонка рядом невозможна —
// вместо неё узкая sticky-полоска с текущим этапом, разворачивающаяся в
// список по тапу (иначе при длинном документе меню оставалось бы наверху
// страницы, до него пришлось бы скроллить обратно — по прямому запросу
// пользователя, решение сессии 2026-09-02). toggle/бэкдроп в разметке есть
// всегда, видимость переключается через CSS-медиазапрос (не JS matchMedia) —
// проще и не требует ресайз-слушателя.
export function Sidebar({ stages, progress, activeKey, onSelect }: SidebarProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const activeStage = stages.find((s) => s.key === activeKey);

  function handleSelect(key: string) {
    onSelect(key);
    setIsExpanded(false);
  }

  return (
    <div className="sidebar">
      <button
        type="button"
        className="sidebar-mobile-toggle"
        onClick={() => setIsExpanded((v) => !v)}
        aria-expanded={isExpanded}
      >
        <span>{activeStage?.label ?? "Этапы"}</span>
        <span className={`sidebar-mobile-chevron ${isExpanded ? "sidebar-mobile-chevron-open" : ""}`} aria-hidden="true">
          ⌄
        </span>
      </button>
      {isExpanded && (
        <button
          type="button"
          className="sidebar-backdrop"
          aria-label="Закрыть меню этапов"
          onClick={() => setIsExpanded(false)}
        />
      )}
      <nav className={`sidebar-nav ${isExpanded ? "sidebar-nav-open" : ""}`} aria-label="Этапы работы">
        {stages.map((stage) => {
          const state = progress[stage.key] ?? "future";
          return (
            <div key={stage.key} className={GROUP_BREAK_AFTER.has(stage.key) ? "sidebar-group-break" : undefined}>
              <button
                type="button"
                className={`sidebar-item sidebar-item-${state} ${stage.key === activeKey ? "sidebar-item-active" : ""}`}
                onClick={() => handleSelect(stage.key)}
              >
                <span className="sidebar-item-mark" aria-hidden="true">
                  {state === "done" ? "✓" : ""}
                </span>
                <span>{stage.label}</span>
              </button>
            </div>
          );
        })}
      </nav>
    </div>
  );
}
