import { useEffect, useState } from "react";
import {
  ApiError,
  getAgentResult,
  getOnboarding,
  getResultsLink,
  runAgent,
  type AgentResult,
  type OnboardingState,
  type Platform,
  type ResultsLink,
} from "../lib/api";
import { STAGES, type StageConfig } from "../lib/stages";
import { buildStageProgress, isStageDone, type StageResult } from "../lib/stageProgress";
import { resolveOnboardingEdit, type OnboardingEditState } from "../lib/onboardingEdit";
import { AppHeader } from "../components/AppHeader";
import { Sidebar, type StageProgress } from "../components/Sidebar";
import { StagePanel } from "../components/StagePanel";
import "./DashboardScreen.css";

type LoadState = "loading" | "no_session" | "load_failed" | "ready";
type OnboardingSnapshot = Pick<OnboardingState, "questionnaire" | "ownLinks">;

function requestBody(stage: StageConfig, platform?: Platform): Record<string, unknown> | undefined {
  if (stage.key === "copywriter") return { platform, day: 1 };
  if (stage.key === "visual-generator") return { platform };
  return undefined;
}

export function DashboardScreen() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  // Анкета нужна целиком, а не только площадками: пустой опросник и пустые
  // «свои соцсети» — разные поводы звать клиента обратно в форму (см.
  // lib/onboardingEdit.ts).
  const [onboarding, setOnboarding] = useState<OnboardingSnapshot | null>(null);
  const [results, setResults] = useState<Record<string, StageResult>>({});
  const [secondaryResults, setSecondaryResults] = useState<Record<string, AgentResult | null>>({});
  // Этапы, состояние которых узнать не удалось. Отличать их от «не запускали»
  // важно: там, где результат может уже существовать, кнопка повторного
  // запуска — это лишнее платное обращение к моделям.
  const [failedStages, setFailedStages] = useState<Set<string>>(new Set());
  const [activeKey, setActiveKey] = useState<string>(STAGES[0].key);
  // Ссылка на результаты появляется, только когда собран весь демо-контент.
  // Сбой её чтения намеренно не показывается: это дополнение к экрану, а не
  // сам экран — незачем пугать ошибкой того, у кого всё сгенерировалось.
  const [resultsLink, setResultsLink] = useState<ResultsLink | null>(null);

  useEffect(() => {
    getOnboarding()
      .then(async (onboarding) => {
        const clientPlatforms = [...new Set(onboarding.ownLinks.map((l) => l.platform))];
        setPlatforms(clientPlatforms);
        setOnboarding({ questionnaire: onboarding.questionnaire, ownLinks: onboarding.ownLinks });

        const stages = STAGES.filter((s) => !s.vkOnly || clientPlatforms.includes("vk"));
        const failed = new Set<string>();
        let sessionExpired = false;

        // Каждый этап читается независимо: раньше одна неудачная выдача
        // роняла Promise.all целиком, results оставался пустым, и весь кабинет
        // показывал «Пока не запускали» с кнопкой «Запустить» — приглашение
        // оплатить заново то, что уже сделано. Теперь неизвестный этап
        // помечается отдельно и кнопки не получает (см. StagePanel).
        async function readStage(slug: string, query?: Record<string, string>): Promise<AgentResult | null> {
          try {
            return await getAgentResult(slug, query);
          } catch (err) {
            if (err instanceof ApiError && err.status === 401) sessionExpired = true;
            throw err;
          }
        }

        const entries = await Promise.all(
          stages.map(async (stage): Promise<[string, StageResult]> => {
            try {
              if (!stage.needsPlatform) {
                return [stage.key, await readStage(stage.agentSlug)];
              }
              const byPlatform: Partial<Record<Platform, AgentResult | null>> = {};
              for (const platform of clientPlatforms) {
                byPlatform[platform] = await readStage(stage.agentSlug, { platform });
              }
              return [stage.key, byPlatform];
            } catch {
              failed.add(stage.key);
              return [stage.key, null];
            }
          })
        );

        if (sessionExpired) {
          setLoadState("no_session");
          return;
        }

        const resultMap = Object.fromEntries(entries);
        setResults(resultMap);
        setFailedStages(failed);

        const secondaryStages = stages.filter((s) => s.secondaryAgentSlug);
        const secondaryEntries = await Promise.all(
          secondaryStages.map(async (stage): Promise<[string, AgentResult | null]> => {
            try {
              return [stage.key, await getAgentResult(stage.secondaryAgentSlug!)];
            } catch {
              return [stage.key, null];
            }
          })
        );
        setSecondaryResults(Object.fromEntries(secondaryEntries));

        // Первым открывается непройденный этап, но только среди тех, чьё
        // состояние известно: этап с ошибкой чтения не «непройденный».
        const firstNotDone = stages.find((s) => !failed.has(s.key) && !isStageDone(s, resultMap[s.key], clientPlatforms));
        setActiveKey((firstNotDone ?? stages[stages.length - 1]).key);
        setLoadState("ready");

        void refreshResultsLink();
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setLoadState("no_session");
        // Анкета не прочиталась — состав площадок неизвестен, а без него
        // кабинет собрать не из чего. Показываем это прямо, а не пустой экран.
        else setLoadState("load_failed");
      });
  }, []);

  async function refreshResultsLink() {
    try {
      setResultsLink(await getResultsLink());
    } catch {
      // Молча: блок «всё готово» — дополнение, а не содержимое кабинета.
    }
  }

  // Смена этапа — не настоящая навигация браузера (SPA), скролл страницы сам
  // не сбрасывается: без этого новый документ открывался бы с той же
  // прокрутки, на которой читали предыдущий.
  function handleSelectStage(key: string) {
    setActiveKey(key);
    window.scrollTo(0, 0);
  }

  async function handleRun(stage: StageConfig, platform?: Platform) {
    const result = await runAgent(stage.agentSlug, requestBody(stage, platform));
    setResults((prev) => {
      if (!stage.needsPlatform || !platform) return { ...prev, [stage.key]: result };
      const byPlatform = (prev[stage.key] ?? {}) as Partial<Record<Platform, AgentResult | null>>;
      return { ...prev, [stage.key]: { ...byPlatform, [platform]: result } };
    });

    // Бэкенд уже дождался и сохранил вспомогательный агент (см.
    // routes/agents.ts, account-analyzer) — просто перечитываем его. Сбой
    // этого чтения не должен выглядеть как провал самого этапа: основной
    // документ уже сгенерирован, оплачен и показан выше.
    if (stage.secondaryAgentSlug) {
      try {
        const secondary = await getAgentResult(stage.secondaryAgentSlug);
        setSecondaryResults((prev) => ({ ...prev, [stage.key]: secondary }));
      } catch {
        setSecondaryResults((prev) => ({ ...prev, [stage.key]: null }));
      }
    }

    // Последний недостающий текст мог только что закрыть весь демо-набор —
    // тогда ссылка на результаты создаётся именно этим запросом (см.
    // /api/results-link), и блок «всё готово» появляется сразу, а не после
    // перезагрузки страницы.
    await refreshResultsLink();
  }

  if (loadState === "loading") {
    return (
      <div className="dashboard-screen">
        <p className="dashboard-loading">Загружаем…</p>
      </div>
    );
  }

  if (loadState === "no_session") {
    return (
      <div className="dashboard-screen">
        <div className="dashboard-no-session">
          <h1>Нет доступа</h1>
          <p>Откройте эту страницу по ссылке, которую мы прислали вам в чат.</p>
        </div>
      </div>
    );
  }

  if (loadState === "load_failed") {
    return (
      <div className="dashboard-screen">
        <div className="dashboard-no-session">
          <h1>Не удалось загрузить кабинет</h1>
          <p>Обновите страницу. Всё, что уже сделано, сохранено — ничего не потерялось.</p>
        </div>
      </div>
    );
  }

  const visibleStages = STAGES.filter((s) => !s.vkOnly || platforms.includes("vk"));
  const progress: Record<string, StageProgress> = buildStageProgress(visibleStages, results, platforms, failedStages);

  const activeStage = visibleStages.find((s) => s.key === activeKey) ?? visibleStages[0];
  // Считается на каждый рендер, а не один раз при загрузке: первый же
  // запущенный этап закрывает бесплатную правку анкеты.
  const onboardingEdit: OnboardingEditState = onboarding
    ? resolveOnboardingEdit(onboarding, visibleStages, results, failedStages)
    : "hidden";

  return (
    <>
      <AppHeader />
      <div className="dashboard-screen">
        <Sidebar
          stages={visibleStages}
          progress={progress}
          activeKey={activeStage.key}
          onSelect={handleSelectStage}
          resultsUrl={resultsLink?.url ?? null}
          onboardingEdit={onboardingEdit}
        />
        <StagePanel
          stage={activeStage}
          platforms={platforms}
          result={results[activeStage.key] ?? null}
          resultUnknown={failedStages.has(activeStage.key)}
          secondaryResult={secondaryResults[activeStage.key] ?? null}
          onRun={(platform) => handleRun(activeStage, platform)}
          resultsLink={resultsLink}
        />
      </div>
    </>
  );
}
