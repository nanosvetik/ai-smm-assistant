import { useState } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, type AgentResult, type Platform } from "../lib/api";
import { PLATFORM_LABELS, describeMissing, type StageConfig } from "../lib/stages";
import { stripFrontmatter } from "../lib/markdown";
import { parseContentPlanData } from "../lib/planData";
import { Button } from "./Button";
import { ContentPlanGrid } from "./ContentPlanGrid";
import { ImageGenerationBlock } from "./ImageGenerationBlock";
import { ReelsReferenceUpload } from "./ReelsReferenceUpload";
import { VideoGenerationBlock } from "./VideoGenerationBlock";
import "./StagePanel.css";

// content-planner — единственный этап с собственной сеткой вместо сырого
// markdown-документа (см. lib/planData.ts). Если структурированный JSON-блок
// не распарсился (модель не выдала валидный блок) — честно откатываемся на
// обычный рендер документа, не показываем пустую сетку.
function DocumentBody({ stage, result }: { stage: StageConfig; result: AgentResult }) {
  if (stage.key === "content-planner") {
    const plan = parseContentPlanData(result);
    if (plan) return <ContentPlanGrid plan={plan} />;
  }
  // Готовый пост — единственный момент в кабинете, где клиент видит реальный
  // текст в своём голосе, а не рабочий аналитический документ. Отдельная
  // карточка (по образцу InterviewCard.tsx: кружок-„ рядом с текстом через
  // flex, не позади него — см. известный баг в OnboardingScreen про
  // абсолютное позиционирование) и editorial-serif для самого текста,
  // остальные документы (ЦА, экспертность и т.д.) — прежний нейтральный вид,
  // им скорость и ясность важнее, не убеждение (design-brief-ателье.md, Бриф 2).
  if (stage.key === "copywriter") {
    return (
      <div className="stage-document-post">
        <span className="stage-document-post-mark" aria-hidden="true">
          „
        </span>
        <div className="stage-document-post-body">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(result.documentMarkdown)}</ReactMarkdown>
        </div>
      </div>
    );
  }
  return (
    <div className="stage-document">
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(result.documentMarkdown)}</ReactMarkdown>
    </div>
  );
}

interface StagePanelProps {
  stage: StageConfig;
  platforms: Platform[];
  result: AgentResult | null | Partial<Record<Platform, AgentResult | null>>;
  secondaryResult?: AgentResult | null;
  onRun: (platform?: Platform) => Promise<void>;
}

function StatusLine({ result }: { result: AgentResult }) {
  const isDraft = result.status.startsWith("черновик");
  const needsManualReview = result.needsManualReview === true;
  return (
    <div className="stage-status-block">
      <p className="stage-status-line">
        статус: {result.status} · версия {result.version}
      </p>
      {isDraft && (
        <p className="stage-status-note">Черновик — это честность инструмента при неполных данных, не ошибка.</p>
      )}
      {needsManualReview && (
        <p className="stage-status-warning">
          Редактор дважды нашёл нарушения (табу, стоп-слова или нейрослоп) и не смог их снять автоматически —
          проверьте текст вручную перед использованием.
        </p>
      )}
    </div>
  );
}

function RunBlock({
  stage,
  result,
  onRun,
  runLabel,
  emptyHint,
}: {
  stage: StageConfig;
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
          <DocumentBody stage={stage} result={result} />
        </>
      ) : !isRunning ? (
        <p className="stage-empty">{emptyHint}</p>
      ) : null}
      {/* Кнопка живёт только до первого результата — «Переделать» убрана
          решением сессии 2026-09-02 (по прямому запросу пользователя): это
          демо, повторные платные вызовы за счёт пользователя недопустимы, и
          для «честных» этапов (ЦА, экспертность и т.д.) это ещё и вопрос
          принципа — не перевыбирать факт до устраивающего ответа. */}
      {!result && (
        <Button type="button" variant="primary" onClick={handleClick} disabled={isRunning}>
          {isRunning ? "Запускаем…" : runLabel}
        </Button>
      )}
      {isRunning && (
        <div className="stage-progress" role="status" aria-live="polite">
          <div className="stage-progress-track">
            <div className="stage-progress-bar" />
          </div>
          <p className="stage-progress-text">
            {stage.progressHint ?? "Работаем над документом — обычно 1–3 минуты. Не закрывайте вкладку."}
          </p>
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
          {platforms.map((platform, index) => {
            const platformResult = (result as Partial<Record<Platform, AgentResult | null>>)?.[platform] ?? null;
            return (
              <div className="stage-platform-block" key={platform}>
                {index > 0 && <div className="stage-platform-divider" />}
                <h2>{PLATFORM_LABELS[platform]}</h2>
                {stage.key === "visual-generator" ? (
                  // Промпт для картинки — внутренняя деталь, клиенту не
                  // показываем (ни русское описание, ни английский промпт,
                  // ни модель/цену) — только готовую иллюстрацию. Кнопка
                  // одна: молча пишет свежий промпт и сразу генерирует
                  // картинку, см. ImageGenerationBlock.tsx.
                  <ImageGenerationBlock platform={platform} onGeneratePrompt={() => onRun(platform)} />
                ) : (
                  <RunBlock
                    stage={stage}
                    result={platformResult}
                    onRun={() => onRun(platform)}
                    runLabel="Запустить"
                    emptyHint={emptyHint}
                  />
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <>
          <RunBlock
            stage={stage}
            result={result as AgentResult | null}
            onRun={() => onRun()}
            runLabel="Запустить"
            emptyHint={emptyHint}
          />
          {/* Сценарий рилса (хук/раскадровка/озвучка) — реальный контент для
              клиента, остаётся видимым как есть (в отличие от промпта
              картинки, тут скрывать нечего). После сценария — референсы,
              подходящие именно к нему (см. ReelsReferenceUpload.tsx), клиент
              добавляет их уже глядя на готовый сценарий, не заранее вслепую
              на онбординге. Видео-промпт для generate_video — внутренняя
              деталь, скрыт тем же принципом, что и у картинок: одна кнопка
              ниже сценария и референсов. */}
          {stage.key === "reels-writer" && result && (
            <>
              <ReelsReferenceUpload />
              <VideoGenerationBlock />
            </>
          )}
        </>
      )}

      {stage.secondaryAgentSlug && (
        <SecondaryBlock label={stage.secondaryLabel ?? stage.secondaryAgentSlug} result={secondaryResult ?? null} />
      )}
    </div>
  );
}
