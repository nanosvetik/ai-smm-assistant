import { useState } from "react";
import { copyText } from "../lib/clipboard";
import { Button } from "./Button";
import "./CompletionBanner.css";

// Появляется, когда демо-контент собран целиком и ссылка на результаты уже
// создана. До него о готовности сообщало только письмо — а письмо с домена
// без репутации уходит в «Спам», и клиент, дошедший до конца, оставался на
// последнем экране этапа, не зная, что работа закончена.
//
// Ссылка показывается текстом, а не прячется за кнопкой: если копирование не
// сработало (нет защищённого контекста, вкладка потеряла фокус — см.
// lib/clipboard.ts), её всегда можно выделить руками.
export function CompletionBanner({ url }: { url: string }) {
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
      <h2 className="completion-banner-title">Всё готово</h2>
      <p className="completion-banner-lead">
        Демо-контент собран. Страница с результатами открывается без входа — сохраните её в закладки или перешлите кому
        угодно.
      </p>

      <p className="completion-banner-link">{url}</p>

      <div className="completion-banner-actions">
        <a className="btn btn-primary" href={url} target="_blank" rel="noopener noreferrer">
          Смотреть результаты
        </a>
        <Button type="button" variant="quiet" onClick={handleCopy}>
          {copied ? "Скопировано" : "Скопировать ссылку"}
        </Button>
      </div>

      {copyFailed && <p className="completion-banner-note">Скопировать не получилось — выделите ссылку выше вручную.</p>}

      <p className="completion-banner-note">
        Эту же ссылку мы отправили вам на почту. Если письма нет — загляните в «Спам»; здесь оно в любом случае
        останется.
      </p>
    </section>
  );
}
