// Отправка через HTTP API Unisender Go, а не SMTP: боевой хостинг режет
// исходящий SMTP целиком — все порты (25/465/587), у всех провайдеров,
// включая российских (проверено живьём, см. docs/decision-log.md,
// «SMTP-провайдер»). Обычный HTTPS-запрос на 443 проходит, поэтому письма
// уходят тем же способом, каким бэкенд ходит в любой другой API.
//
// Наружу файл отдаёт тот же интерфейс, что и прежняя SMTP-обёртка
// (isEmailConfigured + sendMail), поэтому вызывающий код — approval.ts и
// resultsDelivery.ts — не менялся.
const API_URL = "https://goapi.unisender.ru/ru/transactional/api/v1/email/send.json";

const DEFAULT_FROM_NAME = "Своими словами";

interface SendResponse {
  status?: string;
  message?: string;
  code?: number;
  failed_emails?: Record<string, string>;
}

export function isEmailConfigured(): boolean {
  return Boolean(process.env.UNISENDER_API_KEY && process.env.MAIL_FROM);
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  const apiKey = process.env.UNISENDER_API_KEY;
  const fromEmail = process.env.MAIL_FROM;
  if (!apiKey || !fromEmail) throw new Error("Email API is not configured");

  const res = await fetch(API_URL, {
    method: "POST",
    headers: { "X-API-KEY": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      message: {
        recipients: [{ email: to }],
        subject,
        from_email: fromEmail,
        from_name: process.env.MAIL_FROM_NAME ?? DEFAULT_FROM_NAME,
        // Адрес отправителя живёт на домене сервиса, а MX-записей у него нет —
        // ответить на такое письмо некуда. Тексты писем и экранов при этом
        // предлагают клиенту ответить, поэтому ответы уводим на живой ящик
        // оператора. Пока MAIL_REPLY_TO не задан, поле просто не отправляется.
        ...(process.env.MAIL_REPLY_TO ? { reply_to: process.env.MAIL_REPLY_TO } : {}),
        body: { plaintext: text },
        // Поля skip_unsubscribe здесь намеренно нет, хотя письма транзакционные
        // и блок «отписаться» в них неуместен: Unisender Go принимает его только
        // от аккаунтов с флагом allow_skip_unsubscribe, остальным отвечает
        // HTTP 400 с кодом 1588 (проверено живой отправкой 2026-09-09). Флаг
        // выдаёт поддержка по запросу — до этого поле передавать нельзя.
      },
    }),
  });

  // API отвечает HTTP 200 и на успех, и на часть ошибок — признак разбирается
  // в теле, поэтому одной проверки res.ok недостаточно.
  const raw = await res.text();
  let data: SendResponse;
  try {
    data = JSON.parse(raw) as SendResponse;
  } catch {
    throw new Error(`Email send failed (HTTP ${res.status}), ответ не JSON: ${raw.slice(0, 300)}`);
  }

  if (!res.ok || data.status !== "success") {
    throw new Error(`Email send failed (HTTP ${res.status}, код ${data.code ?? "—"}): ${data.message ?? raw.slice(0, 300)}`);
  }

  // Успешный ответ может содержать адреса, которые сервис отверг (чёрный
  // список, неверный формат). Без этой проверки отправка считалась бы
  // удавшейся, а письмо не ушло бы — оператор узнал бы об этом от клиента.
  const rejected = data.failed_emails?.[to];
  if (rejected) {
    throw new Error(`Email rejected for ${to}: ${rejected}`);
  }
}

// Сроки действия ссылок для писем клиенту. Машинный таймстамп в письме
// выглядит технически и не говорит человеку ничего. Анкетная ссылка живёт
// часами — нужно время суток; ссылка на результаты живёт месяцами, там время
// не важно, зато важен год: три месяца легко переходят в следующий.
export function formatExpiryDateTime(date: Date): string {
  return date.toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" });
}

export function formatExpiryDate(date: Date): string {
  return date.toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });
}
