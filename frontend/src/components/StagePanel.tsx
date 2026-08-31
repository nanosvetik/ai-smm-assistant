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
  onRun: (platform?: Platform) => Promise<void>;
}

function StatusLine({ result }: { result: AgentResult }) {
  return (
    <p className="stage-status-line">
      статус: {result.status} · версия {result.version}
    </p>
  );
}

function RunBlock({
  result,
  onRun,
  runLabel,
}: {
  result: AgentResult | null;
  onRun: () => Promise<void>;
  runLabel: string;
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
      ) : (
        <p className="stage-empty">Этот этап ещё не запускали.</p>
      )}
      <Button type="button" variant={result ? "quiet" : "primary"} onClick={handleClick} disabled={isRunning}>
        {isRunning ? "Запускаем…" : result ? "Переделать" : runLabel}
      </Button>
      {error && <p className="stage-error">{error}</p>}
    </div>
  );
}

export function StagePanel({ stage, platforms, result, onRun }: StagePanelProps) {
  return (
    <div className="stage-panel">
      <h1>{stage.label}</h1>

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
              />
            </div>
          ))}
        </div>
      ) : (
        <RunBlock result={result as AgentResult | null} onRun={() => onRun()} runLabel="Запустить" />
      )}
    </div>
  );
}
