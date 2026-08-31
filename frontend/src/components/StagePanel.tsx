import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, type AgentResult, type Platform } from "../lib/api";
import { PLATFORM_LABELS, describeMissing, type StageConfig } from "../lib/stages";
import { stripFrontmatter } from "../lib/markdown";
import { Button } from "./Button";
import "./StagePanel.css";

interface StagePanelProps {
  stage: StageConfig;
  platforms: Platform[];
  result: AgentResult | null | Partial<Record<Platform, AgentResult | null>>;
  secondaryResult?: AgentResult | null;
  onRun: (platform?: Platform) => Promise<void>;
}

function StatusLine({ result }: { result: AgentResult }) {
  const isDraft = result.status.startsWith("черновик");
  return (
    <div className="stage-status-block">
      <p className="stage-status-line">
        статус: {result.status} · версия {result.version}
      </p>
      {isDraft && (
        <p className="stage-status-note">Черновик — это честность инструмента при неполных данных, не ошибка.</p>
      )}
    </div>
  );
}

function RunBlock({
  result,
  onRun,
  runLabel,
  emptyHint,
}: {
  result: AgentResult | null;
  onRun: () => Promise<void>;
  runLabel: string;
  emptyHint: string;
}) {
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleClick() {
    setIsRunning(true);
    setError(null);
    try {
      await onRun();
    } catch (err) {
      if (err instanceof ApiError && err.missing && err.missing.length > 0) {
        setError(`Сначала пройдите: ${describeMissing(err.missing)}.`);
      } else if (err instanceof ApiError) {
        setError("Не получилось запустить этот этап. Попробуйте ещё раз.");
      } else {
        setError("Что-то пошло не так. Попробуйте ещё раз.");
      }
    } finally {
      setIsRunning(false);
    }
  }

  return (
    <div className="stage-run-block">
      {result ? (
        <>
          <StatusLine result={result} />
          <div className="stage-document">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(result.documentMarkdown)}</ReactMarkdown>
          </div>
        </>
      ) : !isRunning ? (
        <p className="stage-empty">{emptyHint}</p>
      ) : null}
      <Button type="button" variant={result ? "quiet" : "primary"} onClick={handleClick} disabled={isRunning}>
        {isRunning ? "Запускаем…" : result ? "Переделать" : runLabel}
      </Button>
      {isRunning && (
        <div className="stage-progress" role="status" aria-live="polite">
          <div className="stage-progress-track">
            <div className="stage-progress-bar" />
          </div>
          <p className="stage-progress-text">Работаем над документом — обычно 1–3 минуты. Не закрывайте вкладку.</p>
        </div>
      )}
      {error && <p className="stage-error">{error}</p>}
    </div>
  );
}

// Вспомогательный агент без своей кнопки (см. StageConfig.secondaryAgentSlug)
// — бэкенд запускает его сам вместе с основным, здесь только читаем и
// показываем результат, ничего не запускаем.
function SecondaryBlock({ label, result }: { label: string; result: AgentResult | null }) {
  return (
    <div className="stage-secondary-block">
      <h2>{label}</h2>
      {result ? (
        <>
          <StatusLine result={result} />
          <div className="stage-document">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(result.documentMarkdown)}</ReactMarkdown>
          </div>
        </>
      ) : (
        <p className="stage-empty">Появится вместе со следующим запуском этапа выше.</p>
      )}
    </div>
  );
}

export function StagePanel({ stage, platforms, result, secondaryResult, onRun }: StagePanelProps) {
  const emptyHint = `Пока не запускали — нажмите «Запустить» ниже, чтобы получить первый результат.`;

  return (
    <div className="stage-panel">
      <h1>{stage.label}</h1>
      <p className="stage-description">{stage.description}</p>

      {stage.needsPlatform ? (
        <div className="stage-platforms">
          {platforms.map((platform, index) => (
            <div className="stage-platform-block" key={platform}>
              {index > 0 && <div className="stage-platform-divider" />}
              <h2>{PLATFORM_LABELS[platform]}</h2>
              <RunBlock
                result={(result as Partial<Record<Platform, AgentResult | null>>)?.[platform] ?? null}
                onRun={() => onRun(platform)}
                runLabel="Запустить"
                emptyHint={emptyHint}
              />
            </div>
          ))}
        </div>
      ) : (
        <RunBlock result={result as AgentResult | null} onRun={() => onRun()} runLabel="Запустить" emptyHint={emptyHint} />
      )}

      {stage.secondaryAgentSlug && (
        <SecondaryBlock label={stage.secondaryLabel ?? stage.secondaryAgentSlug} result={secondaryResult ?? null} />
      )}
    </div>
  );
}
