import { useState } from "react";
import { copyText } from "../lib/clipboard";
import { Button } from "./Button";
import "./CompletionBanner.css";

// Появляется, когда демо-контент собран целиком, и стоит в конце открытого
// этапа — там, где заканчивается чтение: под видео на «Рилсах», под картинкой
// у клиента без ВК. Наверху страницы блок не годился: документы этапов
// длинные, и, досмотрев рилс до конца, клиент верх экрана уже не видел.
//
// Постоянное напоминание живёт отдельно, строкой в sticky-сайдбаре. Здесь —
// то, что строкой не передать: срок жизни ссылки, право делиться и судьба
// письма.
function formatExpiry(iso: string): string {
  // Тот же формат, что в письме (backend/src/lib/email.ts): месяцы живут
  // долго, поэтому важен год, а время суток не важно.
  return new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}

export function CompletionBanner({ url, expiresAt }: { url: string; expiresAt: string }) {
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);

  async function handleCopy() {
    const ok = await copyText(url);
    setCopied(ok);
    setCopyFailed(!ok);
    if (ok) setTimeout(() => setCopied(false), 2000);
  }

  return (
    <section className="completion-banner">
      <p className="completion-banner-title">
        <span aria-hidden="true">✓</span> Всё готово
      </p>
      <p className="completion-banner-lead">
        Демо-контент собран. Страница открывается без входа — сохраните её в закладки или перешлите кому угодно. Ссылка
        работает до {formatExpiry(expiresAt)}.
      </p>

      <div className="completion-banner-actions">
        <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
          Смотреть результаты
        </a>
        <Button type="button" variant="quiet" onClick={handleCopy}>
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </Button>
      </div>

      {/* Ссылка показывается, только если скопировать не удалось: без
          защищённого контекста или при потере фокуса вкладкой (см.
          lib/clipboard.ts) её надо дать выделить руками. */}
      {copyFailed && <p className="completion-banner-link">{url}</p>}

      <p className="completion-banner-note">
        Эту же ссылку мы отправили вам на почту — если письма нет, загляните в «Спам».
      </p>
    </section>
  );
}
