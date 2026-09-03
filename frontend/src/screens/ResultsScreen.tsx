import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ApiError, getResults, type ResultsBundle } from "../lib/api";
import { PLATFORM_LABELS } from "../lib/stages";
import { stripFrontmatter } from "../lib/markdown";
import "./ResultsScreen.css";

type Status = "loading" | "ready" | "expired" | "not_found" | "unknown_error";

// Витрина готового демо, а не рабочий экран кабинета — сознательно ближе по
// тону к Брифу 1 (лендинг: тепло, немного асимметрии, продажа с первого
// экрана), не к Брифу 2 (кабинет: скорость и ясность). Ссылку могут
// переслать людям, которые продукт вообще не видели — это витрина и
// потенциальный лид-магнит, не рабочий инструмент (design-brief-ателье.md).
export function ResultsScreen() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");
  const [bundle, setBundle] = useState<ResultsBundle | null>(null);

  useEffect(() => {
    if (!token) return;
    getResults(token)
      .then((data) => {
        setBundle(data);
        setStatus("ready");
      })
      .catch((err) => {
        if (err instanceof ApiError && err.code === "link_expired") setStatus("expired");
        else if (err instanceof ApiError && err.code === "link_not_found") setStatus("not_found");
        else setStatus("unknown_error");
      });
  }, [token]);

  if (status === "loading") {
    return (
      <div className="results-screen">
        <p className="results-loading">Собираем демо…</p>
      </div>
    );
  }

  if (status !== "ready" || !bundle) {
    const messages: Record<Exclude<Status, "loading" | "ready">, { title: string; body: string }> = {
      expired: {
        title: "Срок действия ссылки истёк",
        body: "Напишите тому, кто прислал вам эту ссылку — попросите новую.",
      },
      not_found: {
        title: "Ссылка не найдена",
        body: "Проверьте, что скопировали ссылку полностью.",
      },
      unknown_error: {
        title: "Не получилось открыть страницу",
        body: "Попробуйте обновить — если не поможет, напишите тому, кто прислал ссылку.",
      },
    };
    const { title, body } = messages[status];
    return (
      <div className="results-screen">
        <div className="results-error-card">
          <h1>{title}</h1>
          <p>{body}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="results-screen">
      <header className="results-hero">
        <p className="results-eyebrow">Демо-контент</p>
        <h1>Вот что получилось</h1>
        <p className="results-hero-sub">
          Настоящий текст, картинка и сценарий, собранные под голос и метод конкретного эксперта — не шаблон.
        </p>
      </header>

      <div className="results-showcase">
        {bundle.posts.map((post) => (
          <section className="results-item" key={post.platform}>
            <p className="results-item-label">{PLATFORM_LABELS[post.platform]}</p>
            {post.theme && <h2 className="results-item-theme">{post.theme}</h2>}
            <div className="results-item-body">
              <div className="results-post-card">
                <span className="results-post-mark" aria-hidden="true">
                  „
                </span>
                <div className="results-post-text">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(post.documentMarkdown)}</ReactMarkdown>
                </div>
              </div>
              {post.imageUrl && (
                <div className="results-media">
                  <img src={post.imageUrl} alt="Иллюстрация к посту" />
                </div>
              )}
            </div>
          </section>
        ))}

        {bundle.reels && (
          <section className="results-item">
            <p className="results-item-label">Reels · ВК</p>
            {bundle.reels.theme && <h2 className="results-item-theme">{bundle.reels.theme}</h2>}
            <div className="results-item-body">
              {bundle.reels.videoUrl ? (
                <div className="results-media results-media-video">
                  <video src={bundle.reels.videoUrl} controls playsInline />
                </div>
              ) : null}
              <details className="results-script-details">
                <summary>Показать сценарий</summary>
                <div className="results-script-body">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>{stripFrontmatter(bundle.reels.documentMarkdown)}</ReactMarkdown>
                </div>
              </details>
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
