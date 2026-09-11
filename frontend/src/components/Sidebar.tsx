import { useState } from "react";
import type { StageConfig } from "../lib/stages";
import type { OnboardingEditState } from "../lib/onboardingEdit";
import "./Sidebar.css";

export type StageProgress = "done" | "current" | "future";

interface SidebarProps {
  stages: StageConfig[];
  progress: Record<string, StageProgress>;
  activeKey: string;
  onSelect: (key: string) => void;
  // Появляется, когда демо-контент собран целиком. Живёт именно здесь, а не
  // только в блоке наверху страницы: документы этапов длинные, и с середины
  // рилса верх экрана не виден — а сайдбар едет вместе с прокруткой.
  resultsUrl?: string | null;
  // Звать ли обратно в анкету и нужна ли оговорка о невозвратности
  // (см. lib/onboardingEdit.ts). "hidden" — ссылки нет вовсе.
  onboardingEdit?: OnboardingEditState;
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
// страницы, до него пришлось бы прокручивать обратно). Переключатель и
// затемнение в разметке есть
// всегда, видимость переключается через CSS-медиазапрос (не JS matchMedia) —
// проще и не требует ресайз-слушателя.
export function Sidebar({
  stages,
  progress,
  activeKey,
  onSelect,
  resultsUrl,
  onboardingEdit = "hidden",
}: SidebarProps) {
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
                  {state === "done" ? "✓" : state === "current" ? "•" : ""}
                </span>
                <span>{stage.label}</span>
              </button>
            </div>
          );
        })}
      </nav>
      {resultsUrl && (
        <a className="sidebar-results" href={resultsUrl} target="_blank" rel="noopener noreferrer">
          <span className="sidebar-results-mark" aria-hidden="true">
            ✓
          </span>
          <span>Смотреть результаты</span>
        </a>
      )}
      {onboardingEdit !== "hidden" && (
        <div className="sidebar-onboarding-edit">
          <a className="sidebar-onboarding-edit-link" href="/onboarding">
            Изменить анкету
          </a>
          {onboardingEdit === "stuck" && (
            <p className="sidebar-onboarding-edit-note">
              Документы, которые уже готовы, не пересоберутся — правка повлияет только на следующие этапы.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
