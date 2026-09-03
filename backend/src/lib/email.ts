import nodemailer from "nodemailer";

// Универсальная SMTP-обёртка, а не привязка к конкретному провайдеру —
// выбор сервиса (свой почтовый ящик, Postmark, SendGrid и т.п.) сознательно
// не сделан на момент написания (решение сессии 2026-09-03), почти все
// транзакционные сервисы отдают SMTP-креды наравне с HTTP API, так что смена
// провайдера — это правка .env, не кода. Пока переменные не заданы,
// isEmailConfigured() возвращает false и вызывающий код (approval.ts) сам
// решает, как показать ссылку оператору вместо автоотправки.
let cachedTransport: ReturnType<typeof nodemailer.createTransport> | null = null;

export function isEmailConfigured(): boolean {
  return Boolean(process.env.SMTP_HOST && process.env.SMTP_USER && process.env.SMTP_PASS && process.env.SMTP_FROM);
}

function getTransport() {
  if (cachedTransport) return cachedTransport;
  cachedTransport = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : 587,
    secure: process.env.SMTP_PORT === "465",
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  return cachedTransport;
}

export async function sendMail(to: string, subject: string, text: string): Promise<void> {
  if (!isEmailConfigured()) throw new Error("SMTP is not configured");
  await getTransport().sendMail({ from: process.env.SMTP_FROM, to, subject, text });
}
