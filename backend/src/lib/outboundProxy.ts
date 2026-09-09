import { ProxyAgent } from "undici";

// Боевой сервер стоит в России, и часть внешних сервисов оттуда недоступна:
// OpenRouter отвечает 403 (геоблок на своей стороне), Telegram и t.me не
// отвечают вовсе (режется по дороге). Такие вызовы уходят через форвард-прокси
// на зарубежном сервере проекта, остальные — напрямую: ВК из иностранных
// дата-центров работает хуже, чем с российского адреса, а почтовый API
// российский, ему заграница не нужна. Отсюда выборочность: прокси
// подключается пофайлово, а не глобальным dispatcher'ом.
//
// Пустой OUTBOUND_PROXY_URL — прямой выход. Так живёт дев-машина, и так же
// поведёт себя прод, если переменную забыть, — поэтому дев-проверка «работает
// без прокси» ничего не говорит о проде.
let cached: ProxyAgent | undefined;
let cachedUrl: string | undefined;

function agent(): ProxyAgent | undefined {
  const url = process.env.OUTBOUND_PROXY_URL;
  if (!url) return undefined;
  if (!cached || cachedUrl !== url) {
    cached = new ProxyAgent(url);
    cachedUrl = url;
  }
  return cached;
}

// Замена глобальному fetch для вызовов, которым нужен заграничный выход.
// Сигнатура совпадает с fetch, поэтому в вызывающем коде меняется только имя.
export function proxiedFetch(input: string, init: RequestInit = {}): Promise<Response> {
  const dispatcher = agent();
  if (!dispatcher) return fetch(input, init);
  return fetch(input, { ...init, dispatcher } as RequestInit);
}
