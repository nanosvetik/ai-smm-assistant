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

export function Sidebar({ stages, progress, activeKey, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Этапы работы">
      {stages.map((stage) => {
        const state = progress[stage.key] ?? "future";
        return (
          <div key={stage.key} className={GROUP_BREAK_AFTER.has(stage.key) ? "sidebar-group-break" : undefined}>
            <button
              type="button"
              className={`sidebar-item sidebar-item-${state} ${stage.key === activeKey ? "sidebar-item-active" : ""}`}
              onClick={() => onSelect(stage.key)}
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
  );
}
