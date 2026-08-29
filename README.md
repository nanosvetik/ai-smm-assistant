# smm-mvp-visuals-mcp

MCP-сервер с двумя тулами: `generate_image` и `generate_video`, оба через
официальные выделенные эндпоинты OpenRouter (`/api/v1/images` и
`/api/v1/videos`) — формат подтверждён официальной документацией OpenRouter.

## Установка

```bash
cd smm-mcp
npm install
cp .env.example .env
# впиши свой ключ OPENROUTER_API_KEY в .env
```

## Как это работает

**generate_image** — синхронный вызов `POST /images`, картинка приходит
сразу как base64 в ответе, сохраняется в `workspace/06-images/`.

**generate_video** — асинхронный:
1. `POST /videos` — создаёт задачу, возвращает `{id, status, polling_url}`
2. Поллинг `polling_url` каждые 5 сек, пока `status` не станет `completed`
   (или `failed`/`cancelled`/`expired` — тогда бросаем ошибку)
3. `GET /videos/{id}/content?index=0` — скачивает готовый mp4 в
   `workspace/07-reels/`

Референсные изображения (`first_frame_url`, `last_frame_url`,
`reference_image`) должны быть **публичными HTTP(S) URL** — не все
провайдеры принимают base64. Если референс есть только как файл от
клиента, его сначала нужно куда-то залить (например, через Files API
самого OpenRouter — см. `/docs/guides/features/files-api` — или на любой
свой storage) и передать сюда уже готовую ссылку.

Наблюдения по факту: генерация видео на Kling v3.0 Pro занимает
~130 секунд, поэтому таймаут поллинга поставлен с запасом (40 попыток
по 5 сек = ~200 сек).

## Подключение в Claude Code

В `.mcp.json` проекта:

```json
{
  "mcpServers": {
    "smm-visuals": {
      "command": "node",
      "args": ["./smm-mcp/src/index.js"]
    }
  }
}
```

Дать доступ к этому серверу конкретным саб-агентам через поле `tools`
в их `.claude/agents/*.md`.

## Проверка вручную

```bash
npm start
```

Сервер общается по stdio — для ручного теста удобнее подключить его
через Claude Code напрямую, либо написать маленький скрипт-клиент.
