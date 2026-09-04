# smm-mcp

MCP-сервер с двумя тулами: `generate_image` и `generate_video`, оба через
официальные выделенные эндпоинты OpenRouter (`/api/v1/images` и
`/api/v1/videos`). Реализован и проверен живыми вызовами к реальному API
2026-08-29 (не по документации на слово) — см. `CLAUDE.md` в корне проекта.

## Установка

```bash
cd smm-mcp
npm install
cp .env.example .env
# впиши свой ключ OPENROUTER_API_KEY в .env
```

Если `smm-mcp/.env` не создан, сервер подхватит `OPENROUTER_API_KEY` из
корневого `.env` проекта (см. загрузку в начале `src/index.js`).

## Как это работает

**generate_image** — синхронный вызов `POST /images`, картинка приходит
сразу как base64 в ответе, сохраняется в `workspace/06-images/`. Основная
модель — Seedream, при ошибке автоматический фолбэк на FLUX.2 Max.

**generate_video** — асинхронный:
1. `POST /videos` — создаёт задачу, возвращает `{id, status, polling_url}`
2. Поллинг `polling_url` каждые 5 сек, пока `status` не станет `completed`
   (или `failed`/`cancelled`/`expired` — тогда бросаем ошибку)
3. Скачивание по `unsigned_urls[0]` из завершённой задачи (формат
   `/videos/{id}/content?index=0`) в `workspace/07-reels/`

Референсные изображения (`first_frame_url`, `last_frame_url`,
`reference_image`) должны быть **публичными HTTP(S) URL** — OpenRouter
сам их скачивает на своей стороне, base64/локальные пути не принимаются.
В проекте это self-hosted диск + nginx как раздача статики (см. раздел 7
`docs/project-specification.md`), не S3/R2.

**Актуализация (2026-09-04):** это верно для *этой* плоской схемы
параметров (проверено живым тестом 2026-08-29). У OpenRouter с тех пор
появилась новая схема — `frame_images[]`/`input_references[]`, каждый
элемент `{type: "image_url", image_url: {url}, frame_type?}` — та же
обёртка, что в chat completions для vision, и она документированно
принимает `data:`-URI. Этот сервер (`smm-mcp`) продолжает использовать
старую плоскую схему сознательно (dev-инструмент для Claude Code, менять
не просили) — актуальная реализация с base64-референсами через новую схему
теперь в `backend/src/lib/videoGeneration.ts` (см. CLAUDE.md в корне
проекта), не здесь.

Наблюдения по факту: 3-секундный клип на Kling v3.0 Pro завершился за
~60 сек, поэтому таймаут поллинга поставлен с запасом (40 попыток по
5 сек = ~200 сек).

## Подтверждённые модели (слаги проверены против /api/v1/images/models и /api/v1/videos/models)

- **Картинки, основная:** `bytedance-seed/seedream-4.5`
- **Картинки, фолбэк:** `black-forest-labs/flux.2-max`
- **Видео:** `kwaivgi/kling-v3.0-pro` (поддерживает `first_frame`/`last_frame`)

Не менять на другие слаги без повторной проверки — общие названия вроде
просто "Seedream" или "FLUX.2 Max" не резолвятся напрямую как model id.

## Подключение

Зарегистрирован в `.mcp.json` в корне проекта под именем `smm-visuals`.

## Проверка вручную

```bash
npm start
```

Сервер общается по stdio (NDJSON JSON-RPC) — для ручного теста без MCP-клиента
можно попарно прогнать `initialize` → `notifications/initialized` →
`tools/call` через `echo ... | node src/index.js`.
