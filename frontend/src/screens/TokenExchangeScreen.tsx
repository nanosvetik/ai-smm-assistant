import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { ApiError, exchangeAccessLink } from "../lib/api";
import "./TokenExchangeScreen.css";

type Status = "loading" | "ready" | "used" | "expired" | "not_found" | "unknown_error";

export function TokenExchangeScreen() {
  const { token } = useParams<{ token: string }>();
  const [status, setStatus] = useState<Status>("loading");

  useEffect(() => {
    if (!token) return;
    exchangeAccessLink(token)
      .then(() => setStatus("ready"))
      .catch((err) => {
        if (err instanceof ApiError) {
          if (err.code === "link_already_used") setStatus("used");
          else if (err.code === "link_expired") setStatus("expired");
          else if (err.code === "link_not_found") setStatus("not_found");
          else setStatus("unknown_error");
        } else {
          setStatus("unknown_error");
        }
      });
  }, [token]);

  if (status === "ready") {
    return <Navigate to="/onboarding" replace />;
  }

  if (status === "loading") {
    return (
      <div className="token-screen">
        <p className="token-screen-message">Открываем доступ…</p>
      </div>
    );
  }

  const messages: Record<Exclude<Status, "loading" | "ready">, { title: string; body: string }> = {
    used: {
      title: "Эта ссылка уже открывалась",
      body: "Если вы уже начали заполнять анкету на этом устройстве, данные сохранены — откройте анкету напрямую.",
    },
    expired: {
      title: "Срок действия ссылки истёк",
      body: "Напишите нам в тот же чат, откуда пришла ссылка, и мы вышлем новую.",
    },
    not_found: {
      title: "Ссылка не найдена",
      body: "Проверьте, что скопировали ссылку полностью, или запросите новую.",
    },
    unknown_error: {
      title: "Не получилось открыть доступ",
      body: "Попробуйте обновить страницу. Если не поможет — напишите нам.",
    },
  };

  const { title, body } = messages[status];

  return (
    <div className="token-screen">
      <div className="token-screen-card">
        <h1>{title}</h1>
        <p>{body}</p>
        {status === "used" && <a href="/onboarding">Открыть анкету</a>}
      </div>
    </div>
  );
}
