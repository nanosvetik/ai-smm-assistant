import { useEffect, useState, type FormEvent } from "react";
import {
  ApiError,
  getOnboarding,
  submitOnboarding,
  type Questionnaire,
  type SalesModel,
  type SocialLink,
} from "../lib/api";
import { LinksField } from "../components/LinksField";
import { InterviewCard } from "../components/InterviewCard";
import { Button } from "../components/Button";
import "./OnboardingScreen.css";

type LoadState = "loading" | "no_session" | "ready";
type SubmitState = "idle" | "submitting" | "success" | "error";

const EMPTY_QUESTIONNAIRE: Questionnaire = {
  salesModel: "b2c",
  clientDescription: "",
  clientPhrases: "",
  mainPrinciple: "",
  contentTaboos: "",
  expertPath: "",
};

export function OnboardingScreen() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [ownLinks, setOwnLinks] = useState<SocialLink[]>([]);
  const [competitorLinks, setCompetitorLinks] = useState<SocialLink[]>([
    { platform: "telegram", url: "" },
    { platform: "telegram", url: "" },
  ]);
  const [questionnaire, setQuestionnaire] = useState<Questionnaire>(EMPTY_QUESTIONNAIRE);
  const [submitState, setSubmitState] = useState<SubmitState>("idle");
  const [validationError, setValidationError] = useState<string | null>(null);

  useEffect(() => {
    getOnboarding()
      .then((state) => {
        if (state.ownLinks.length > 0) setOwnLinks(state.ownLinks);
        if (state.competitorLinks.length >= 2) setCompetitorLinks(state.competitorLinks);
        // Сервер честно возвращает null для полей, добавленных позже
        // остальных (см. expertPath) — у существующих клиентов в БД их ещё
        // нет. Спред не спасает: ключ присутствует со значением null и всё
        // равно перекрывает "" из EMPTY_QUESTIONNAIRE — коалесим явно, иначе
        // плейсхолдер отрисуется корректно (values[key] ?? ""), но .trim()
        // при сабмите на null кидает необработанное исключение вне
        // try/catch — форма молча ничего не сохраняет, без единой ошибки.
        if (state.questionnaire) {
          setQuestionnaire({
            ...EMPTY_QUESTIONNAIRE,
            ...state.questionnaire,
            expertPath: state.questionnaire.expertPath ?? "",
            clientPhrases: state.questionnaire.clientPhrases ?? "",
          });
        }
        setLoadState("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) {
          setLoadState("no_session");
        } else {
          setLoadState("ready");
        }
      });
  }, []);

  function updateQuestionnaire(patch: Partial<Questionnaire>) {
    setQuestionnaire((q) => ({ ...q, ...patch }));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setValidationError(null);

    const cleanOwn = ownLinks.filter((l) => l.url.trim().length > 0);
    const cleanCompetitor = competitorLinks.filter((l) => l.url.trim().length > 0);

    if (cleanCompetitor.length < 2) {
      setValidationError("Укажите ссылки минимум на 2 конкурентов — без них не получится найти рабочие форматы в нише.");
      return;
    }
    if (
      !questionnaire.clientDescription.trim() ||
      !questionnaire.mainPrinciple.trim() ||
      !questionnaire.contentTaboos.trim() ||
      !questionnaire.expertPath.trim()
    ) {
      setValidationError("Ответьте на обязательные вопросы ниже — без них не получится честно распаковать метод.");
      return;
    }

    setSubmitState("submitting");
    try {
      await submitOnboarding({ ownLinks: cleanOwn, competitorLinks: cleanCompetitor, questionnaire });
      setSubmitState("success");
    } catch {
      setSubmitState("error");
    }
  }

  if (loadState === "loading") {
    return (
      <div className="onboarding-screen">
        <p className="onboarding-loading">Загружаем…</p>
      </div>
    );
  }

  if (loadState === "no_session") {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-no-session">
          <h1>Нет доступа</h1>
          <p>Откройте эту страницу по ссылке, которую мы прислали вам в чат.</p>
        </div>
      </div>
    );
  }

  if (submitState === "success") {
    return (
      <div className="onboarding-screen">
        <div className="onboarding-success">
          <h1>Данные сохранены</h1>
          <p>Дальше — в кабинете: там можно запускать анализ по шагам и смотреть результат каждого.</p>
          <p className="onboarding-success-note">
            <strong>Это демо-версия.</strong> В реальной работе распаковка строится на 30–60-минутном интервью; здесь
            — по вашим коротким ответам, поэтому часть документов честно выйдет с пометкой «нужно уточнить» вместо
            выдумки. Это принцип инструмента, не недоделка демо.
          </p>
          <a className="onboarding-success-link btn btn-primary" href="/dashboard">
            Перейти в кабинет
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-screen">
      <form className="onboarding-form" onSubmit={handleSubmit}>
        <header className="onboarding-header">
          <div className="onboarding-header-top">
            <span className="onboarding-header-mark" aria-hidden="true">„</span>
            <h1>Расскажите о себе</h1>
          </div>
          <p>
            Это займёт минут десять. Дальше на основе этих ответов мы соберём портрет вашей аудитории,
            ваш метод и черновик первых постов — отвечайте своими словами, чем живее, тем точнее получится.
          </p>
          <p className="onboarding-roadmap">
            Дальше по порядку: <span>формат работы</span> · <span>ваши каналы</span> · <span>несколько вопросов</span>
          </p>
        </header>

        <section className="onboarding-section">
          <h2 className="onboarding-eyebrow">О вашей работе</h2>
          <label className="onboarding-field-label">Как вы работаете с клиентами?</label>
          <div className="sales-model-toggle">
            {(["b2c", "b2b"] as SalesModel[]).map((model) => (
              <button
                type="button"
                key={model}
                className={`sales-model-option ${questionnaire.salesModel === model ? "sales-model-option-active" : ""}`}
                onClick={() => updateQuestionnaire({ salesModel: model })}
              >
                {model === "b2c" ? "С частными клиентами" : "С бизнесом"}
              </button>
            ))}
          </div>
          <p className="onboarding-field-hint">
            Это определяет, как мы будем говорить о ваших клиентах дальше — как о людях, которые платят сами, или
            как о партнёрах и заказчиках.
          </p>
        </section>

        <section className="onboarding-section">
          <h2 className="onboarding-eyebrow">Ваши каналы</h2>
          <LinksField
            label="Ваши соцсети"
            hint="Telegram-канал и/или сообщество ВК, где вы уже публикуетесь. Можно оставить пустым, если их пока нет."
            links={ownLinks}
            onChange={setOwnLinks}
            min={0}
            max={2}
          />
          <LinksField
            label="Конкуренты или эксперты в вашей нише"
            hint="2–3 ссылки — мы найдём, какие форматы реально работают у похожих специалистов."
            links={competitorLinks}
            onChange={setCompetitorLinks}
            min={2}
            max={3}
          />
        </section>

        <section className="onboarding-section">
          <h2 className="onboarding-eyebrow">Теперь — несколько вопросов</h2>
          <InterviewCard values={questionnaire} onChange={updateQuestionnaire} />
        </section>

        {validationError && <p className="onboarding-validation-error">{validationError}</p>}
        {submitState === "error" && (
          <p className="onboarding-validation-error">Не получилось сохранить данные. Попробуйте ещё раз.</p>
        )}

        <Button type="submit" disabled={submitState === "submitting"}>
          {submitState === "submitting" ? "Сохраняем…" : "Сохранить и продолжить"}
        </Button>
      </form>
    </div>
  );
}
