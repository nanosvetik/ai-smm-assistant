import type { StageConfig } from "../lib/stages";
import "./Sidebar.css";

export type StageProgress = "done" | "current" | "future";

interface SidebarProps {
  stages: StageConfig[];
  progress: Record<string, StageProgress>;
  activeKey: string;
  onSelect: (key: string) => void;
}

export function Sidebar({ stages, progress, activeKey, onSelect }: SidebarProps) {
  return (
    <nav className="sidebar" aria-label="Этапы работы">
      {stages.map((stage) => {
        const state = progress[stage.key] ?? "future";
        return (
          <button
            key={stage.key}
            type="button"
            className={`sidebar-item sidebar-item-${state} ${stage.key === activeKey ? "sidebar-item-active" : ""}`}
            onClick={() => onSelect(stage.key)}
          >
            <span className="sidebar-item-mark" aria-hidden="true">
              {state === "done" ? "✓" : ""}
            </span>
            <span>{stage.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
