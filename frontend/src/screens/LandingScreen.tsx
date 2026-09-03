import { useRef, useState } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import { useGSAP } from "@gsap/react";
import { ApiError, submitAccessRequest } from "../lib/api";
import { Button } from "../components/Button";
import "./LandingScreen.css";

gsap.registerPlugin(ScrollTrigger, useGSAP);

// Рабочее название бренда — placeholder, не финальное решение (см. CLAUDE.md,
// «Открытые вопросы»: домен genpost-ai.ru уже куплен, но бренд-имя ещё не
// выбрано). Один константный узел, чтобы сменить в одну строку, когда
// решится — не разбросано по компоненту текстом.
const BRAND_NAME = "Своими словами";

// Живой пример поста для hero — не абстрактная метрика (Бриф 1 design-brief-
// ателье.md: «доказательство с первого экрана, а не обещание»). Мастер по
// натуральному мылу — та же калибровочная персона, что уже использовалась
// при проверке текста онбординга (см. память), не подписчик коуча/эксперта
// из тестовых данных бэкенда.
const HERO_EXAMPLE = {
  role: "Пример: мастер по натуральному мылу",
  text: `Вчера клиентка написала: «купила ваше мыло с чередой просто из любопытства, а теперь беру только его — кожа перестала стягивать после душа». Вот ради таких сообщений я вообще этим занимаюсь. Не ради тренда на handmade, а потому что вижу разницу вживую.

Если у вас чувствительная кожа — держите этот сорт в закладках.`,
};

// Пять смысловых шагов пайплайна, поданные не как механика («сначала это,
// потом то»), а как ценность, за которую обычно платят отдельно — по
// прямому запросу пользователя: лендинг должен продавать позиционирование
// и распаковку экспертности как основную ценность продукта, не только
// готовый текст в конце. Порядок соответствует реальному пайплайну агентов
// (ЦА → экспертность → анализ → упаковка → контент), поэтому нумерация
// оправдана — это действительно последовательность, не декоративные бейджи.
const VALUE_STEPS = [
  {
    title: "Портрет вашей аудитории",
    note: "Кто ваш клиент — конкретно, не «все, кому актуально». Здесь чаще всего ошибаются даже опытные маркетологи.",
  },
  {
    title: "Распаковка экспертности",
    note: "На чём держится именно ваш метод и в чём отличие от других — обычно это отдельная дорогая сессия с ментором.",
  },
  {
    title: "Разбор вашего стиля и ниши",
    note: "Как вы уже пишете и что реально заходит у похожих экспертов — конкретные форматы, а не советы «постите чаще».",
  },
  {
    title: "Новая упаковка профиля",
    note: "Позиционирование, био и единый стиль — свежий взгляд на то, что вы, скорее всего, недооцениваете в себе.",
  },
  {
    title: "Готовый контент",
    note: "Пост, картинка и сценарий рилса — не шаблон, а конкретно ваш голос.",
  },
];

// Ambition-глимпс полного SaaS (по прямому брифу пользователя) — сознательно
// не про демо-доступ, отдельный блок про демо стоит только у формы ниже.
const ROADMAP = [
  "Больше площадок — не только Telegram и ВК",
  "Экспертные вертикальные видео из сырого материала — для Reels, TikTok и других популярных социальных сетей",
  "Осмысленные сценарии для сторис",
  "Воронки, встроенные прямо в контент-план",
];

const GENERIC_EXAMPLE =
  "Профессиональный уход за кожей лица — это залог красоты и уверенности в себе. Запишитесь прямо сейчас!";

const VOICE_EXAMPLE = `Записалась ко мне девушка с сильными высыпаниями после смены сезона — испугалась, что это на всю жизнь. Через три чистки лица кожа выровнялась настолько, что она сама спросила: «а зачем я вообще тональным кремом мазалась?»

Вот такие истории мне важнее любых до/после-фото.`;

type FormStatus = "idle" | "submitting" | "done" | "error";

export function LandingScreen() {
  const heroRef = useRef<HTMLDivElement>(null);
  const formSectionRef = useRef<HTMLDivElement>(null);

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [status, setStatus] = useState<FormStatus>("idle");
  const [error, setError] = useState<string | null>(null);

  // Одно оркестрованное появление hero при загрузке (Бриф 1) — заголовок,
  // подзаголовок и кнопка выезжают внахлёст, карточка примера — следом.
  // Дальше по странице — мягкое проявление на скролле, без scroll-hijacking
  // и пиннинга. gsap.matchMedia уважает prefers-reduced-motion.
  useGSAP(
    () => {
      const mm = gsap.matchMedia();

      mm.add("(prefers-reduced-motion: reduce)", () => {
        gsap.set(".hero-animate, .reveal", { autoAlpha: 1, y: 0 });
      });

      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const tl = gsap.timeline({ defaults: { ease: "power3.out" } });
        tl.from(".hero-animate", {
          autoAlpha: 0,
          y: 22,
          stagger: 0.12,
          duration: 0.8,
        }).from(
          ".hero-card",
          { autoAlpha: 0, y: 28, scale: 0.97, duration: 0.9 },
          "-=0.45"
        );

        document.querySelectorAll<HTMLElement>(".reveal").forEach((el) => {
          gsap.from(el, {
            autoAlpha: 0,
            y: 24,
            duration: 0.7,
            ease: "power2.out",
            scrollTrigger: { trigger: el, start: "top 85%", once: true },
          });
        });
      });

      return () => mm.revert();
    },
    { scope: heroRef }
  );

  function scrollToForm() {
    formSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setStatus("submitting");
    setError(null);
    try {
      await submitAccessRequest({ email, name: name.trim() || undefined });
      setStatus("done");
    } catch (err) {
      if (err instanceof ApiError && err.code === "invalid_request") {
        setError("Проверьте, пожалуйста, адрес почты.");
      } else {
        setError("Не получилось отправить заявку. Попробуйте ещё раз.");
      }
      setStatus("error");
    }
  }

  return (
    <div className="landing-screen" ref={heroRef}>
      <header className="landing-header">
        <span className="landing-brand">{BRAND_NAME}</span>
        <Button type="button" variant="quiet" onClick={scrollToForm}>
          Получить демо-доступ
        </Button>
      </header>

      <section className="landing-hero">
        <div className="landing-hero-text">
          <h1 className="hero-animate">Текст, в котором слышно именно вас</h1>
          <p className="landing-hero-sub hero-animate">
            Сначала находим, для кого вы говорите и в чём ваша сила — а потом пишем в этом голосе. Без
            общих фраз, которые может написать кто угодно.
          </p>
          <div className="hero-animate">
            <Button type="button" variant="primary" onClick={scrollToForm}>
              Получить демо-доступ
            </Button>
          </div>
        </div>

        <div className="landing-hero-card hero-card">
          <p className="landing-hero-card-role">{HERO_EXAMPLE.role}</p>
          <div className="landing-post-card">
            <span className="landing-post-mark" aria-hidden="true">
              „
            </span>
            <div className="landing-post-text">
              {HERO_EXAMPLE.text.split("\n\n").map((p, i) => (
                <p key={i}>{p}</p>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="landing-section landing-how">
        <h2 className="reveal">То, за что обычно платят маркетологу</h2>
        <ol className="landing-how-list">
          {VALUE_STEPS.map((step, i) => (
            <li className="landing-how-item reveal" key={i}>
              <span className="landing-how-number" aria-hidden="true">
                {i + 1}
              </span>
              <div>
                <p className="landing-how-title">{step.title}</p>
                <p className="landing-how-note">{step.note}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="landing-section landing-roadmap">
        <h2 className="reveal">Это только начало</h2>
        <ul className="landing-roadmap-list reveal">
          {ROADMAP.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="landing-section landing-contrast">
        <h2 className="reveal">Не шаблон, который выдаст любой чат-бот</h2>
        <div className="landing-contrast-grid reveal">
          <div className="landing-contrast-generic">
            <p className="landing-contrast-label">Так пишет любой чат-бот</p>
            <p>{GENERIC_EXAMPLE}</p>
          </div>
          <div className="landing-contrast-voice">
            <p className="landing-contrast-label">Так — только вы</p>
            {VOICE_EXAMPLE.split("\n\n").map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
        </div>
      </section>

      <section className="landing-section landing-cta" ref={formSectionRef}>
        <div className="landing-cta-inner reveal">
          <h2>Получить демо-доступ</h2>
          <p className="landing-cta-sub">
            Оставьте почту — мы вручную проверим заявку и пришлём одноразовую ссылку на вход, обычно
            в течение дня.
          </p>

          <p className="landing-demo-note">
            <strong>Демо — не витрина, а по-настоящему рабочая система</strong>, только упрощённая:
            короткая анкета вместо полного интервью даёт более общий, но честный разбор аудитории и
            метода — плюс план публикаций и один готовый пост, картинка и сценарий рилса под ваши
            соцсети.
          </p>

          {status === "done" ? (
            <p className="landing-cta-done">
              Заявка отправлена. Ссылка придёт на {email || "указанную почту"} после проверки.
            </p>
          ) : (
            <form className="landing-form" onSubmit={handleSubmit}>
              <label className="landing-form-field">
                <span>Почта</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                />
              </label>
              <label className="landing-form-field">
                <span>Имя (необязательно)</span>
                <input type="text" value={name} onChange={(e) => setName(e.target.value)} placeholder="Как вас зовут" />
              </label>
              <Button type="submit" variant="primary" disabled={status === "submitting"}>
                {status === "submitting" ? "Отправляем…" : "Отправить заявку"}
              </Button>
              {error && <p className="landing-form-error">{error}</p>}
            </form>
          )}
        </div>
      </section>

      <footer className="landing-footer">
        <p>{BRAND_NAME} — для мастеров и небольших брендов, которым важен свой голос.</p>
      </footer>
    </div>
  );
}
