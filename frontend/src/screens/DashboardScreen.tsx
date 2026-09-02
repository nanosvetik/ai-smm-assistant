import { useEffect, useState } from "react";
import { ApiError, getAgentResult, getOnboarding, runAgent, type AgentResult, type Platform } from "../lib/api";
import { STAGES, type StageConfig } from "../lib/stages";
import { Sidebar, type StageProgress } from "../components/Sidebar";
import { StagePanel } from "../components/StagePanel";
import "./DashboardScreen.css";

type LoadState = "loading" | "no_session" | "ready";

type StageResult = AgentResult | null | Partial<Record<Platform, AgentResult | null>>;

function isDone(stage: StageConfig, result: StageResult, platforms: Platform[]): boolean {
  if (!stage.needsPlatform) return result != null;
  // platforms.every(...) на пустом массиве вакуумно даёт true — без явной
  // проверки длины этап без единой площадки клиента ошибочно считался бы
  // пройденным.
  if (platforms.length === 0) return false;
  const byPlatform = (result ?? {}) as Partial<Record<Platform, AgentResult | null>>;
  return platforms.every((p) => byPlatform[p] != null);
}

function requestBody(stage: StageConfig, platform?: Platform): Record<string, unknown> | undefined {
  if (stage.key === "copywriter") return { platform, day: 1 };
  if (stage.key === "visual-generator") return { platform };
  return undefined;
}

export function DashboardScreen() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [platforms, setPlatforms] = useState<Platform[]>([]);
  const [results, setResults] = useState<Record<string, StageResult>>({});
  const [secondaryResults, setSecondaryResults] = useState<Record<string, AgentResult | null>>({});
  const [activeKey, setActiveKey] = useState<string>(STAGES[0].key);

  useEffect(() => {
    getOnboarding()
      .then(async (onboarding) => {
        const clientPlatforms = [...new Set(onboarding.ownLinks.map((l) => l.platform))];
        setPlatforms(clientPlatforms);

        const stages = STAGES.filter((s) => !s.vkOnly || clientPlatforms.includes("vk"));
        const entries = await Promise.all(
          stages.map(async (stage): Promise<[string, StageResult]> => {
            if (!stage.needsPlatform) {
              return [stage.key, await getAgentResult(stage.agentSlug)];
            }
            const byPlatform: Partial<Record<Platform, AgentResult | null>> = {};
            for (const platform of clientPlatforms) {
              byPlatform[platform] = await getAgentResult(stage.agentSlug, { platform });
            }
            return [stage.key, byPlatform];
          })
        );

        const resultMap = Object.fromEntries(entries);
        setResults(resultMap);

        const secondaryStages = stages.filter((s) => s.secondaryAgentSlug);
        const secondaryEntries = await Promise.all(
          secondaryStages.map(async (stage): Promise<[string, AgentResult | null]> => [
            stage.key,
            await getAgentResult(stage.secondaryAgentSlug!),
          ])
        );
        setSecondaryResults(Object.fromEntries(secondaryEntries));

        const firstNotDone = stages.find((s) => !isDone(s, resultMap[s.key], clientPlatforms));
        setActiveKey((firstNotDone ?? stages[stages.length - 1]).key);
        setLoadState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setLoadState("no_session");
        else setLoadState("ready");
      });
  }, []);

  // Смена этапа — не настоящая навигация браузера (SPA), скролл страницы сам
  // не сбрасывается: без этого новый документ открывался бы с той же
  // прокрутки, на которой читали предыдущий (найдено пользователем).
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
    // routes/agents.ts, account-analyzer) — просто перечитываем его.
    if (stage.secondaryAgentSlug) {
      const secondary = await getAgentResult(stage.secondaryAgentSlug);
      setSecondaryResults((prev) => ({ ...prev, [stage.key]: secondary }));
    }
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

  const visibleStages = STAGES.filter((s) => !s.vkOnly || platforms.includes("vk"));
  const progress: Record<string, StageProgress> = {};
  let currentFound = false;
  for (const stage of visibleStages) {
    if (isDone(stage, results[stage.key], platforms)) {
      progress[stage.key] = "done";
    } else if (!currentFound) {
      progress[stage.key] = "current";
      currentFound = true;
    } else {
      progress[stage.key] = "future";
    }
  }

  const activeStage = visibleStages.find((s) => s.key === activeKey) ?? visibleStages[0];

  return (
    <div className="dashboard-screen">
      <Sidebar stages={visibleStages} progress={progress} activeKey={activeStage.key} onSelect={handleSelectStage} />
      <StagePanel
        stage={activeStage}
        platforms={platforms}
        result={results[activeStage.key] ?? null}
        secondaryResult={secondaryResults[activeStage.key] ?? null}
        onRun={(platform) => handleRun(activeStage, platform)}
      />
    </div>
  );
}
