# Состояние бэкенда

Что реализовано и проверено живыми вызовами (не только юнит-тестами). Обоснования архитектурных решений — `docs/project-specification.md`, история решений — `docs/decision-log.md`, грабли — `docs/gotchas.md`.

**Статус:** текстовый пайплайн, медиа-генерация, доставка ссылок и витрина результатов реализованы полностью. Не реализовано ничего из запланированного MVP-объёма.

## Доступ и сессии

- **`POST /api/access-requests`** — заявка с лендинга. Контракт `{ email, name? }`, `z.string.email`. Email — единственный канал: почта есть у всех и это адрес для будущих писем, а Telegram/ВК всё равно не могут писать клиенту первыми. Колонки `contactType`/`contactValue` в `db/schema.ts` остались от прежней схемы с выбором канала, TS/zod-enum сужен до `["email"]` (миграция не нужна — SQLite хранит обычный `TEXT`). Не путать с own-соцсетями клиента на онбординге (`social_links`) — это независимая часть продукта.
- Уведомление оператору в Telegram с кнопками «Одобрить»/«Отклонить» на каждую заявку (включая имя, если есть).
- Ручное подтверждение: `npm run admin:list` / `admin:approve -- <id>` / `admin:reject -- <id>` (CLI, не HTTP-админка — намеренно, чтобы не открывать лишнюю поверхность в сеть) либо кнопки в Telegram. Общая точка — `approveRequest` в `admin/approval.ts`.
- **Автодоставка magic-ссылки на email.** `backend/src/lib/email.ts`, `nodemailer`, универсальная SMTP-обёртка — провайдер меняется через `.env` без правки кода. `isEmailConfigured`: если SMTP не задан, `approveRequest` возвращает `delivered: false`, и оператор видит ссылку для ручной пересылки. Ошибка отправки перехватывается и не откатывает уже сохранённое одобрение.
- **`GET /api/access/:token`** — обмен ссылки на сессию (httpOnly cookie). **Ссылку не сжигает**: `usedAt` проставляется в `POST /api/onboarding` после сохранения анкеты, поэтому предпросмотр ссылки почтовым роботом не убивает доступ клиенту (решение 2026-09-09, см. decision-log). Ограничение по времени — `ONBOARDING_LINK_TTL_MS` = 48 ч. `SESSION_TTL_MS` = 24 ч, повторного входа в кабинет нет (осознанно, см. decision-log).
- Magic-ссылка ведёт на фронтенд (`{BASE_URL}/onboarding/:token`), не на API-ручку — она отдаёт голый JSON, тупик для живого пользователя. `BASE_URL` по умолчанию смотрит на дев-порт фронтенда (5173); в проде это один домен через nginx/Caddy.

## Онбординг

- **`POST/GET /api/onboarding`** (под `requireSession`) — свои соцсети (0–2), ссылки конкурентов (2–3 обязательных), опросник. Пересдача формы перезаписывает предыдущие ссылки/ответы.
- Опросник — 5 полей: `salesModel`, `clientDescription`, `clientPhrases` (опционально), `expertPath`, `mainPrinciple`, `contentTaboos`. `expertPath` добавлен позже остальных: в анкете не было ни одного вопроса про самого эксперта, из-за чего Блок 2 «Экспертность и путь» в `prompts/expertise.md` был структурно обречён оставаться пустым у любого клиента. Колонка без `NOT NULL` (в таблице уже были строки без неё), обязательность — только в zod-схеме и форме.
- **`POST /api/onboarding/references/:category`** — старая загрузка референсов (multer, `/uploads/<client_id>/<category>/`). Код жив (`visual-style-analyzer`/`reels-writer` его читают), но фронтенд туда больше не пишет — референсы переехали на страницу «Рилсы».
- **`POST/GET/DELETE /api/reels-references`** (`routes/reelsReferences.ts`) — новые референсы для рилса, отдельная таблица `reels_reference_files` без категорий. Сознательно отдельно от `reference_files`: `visual-style-analyzer` агрегирует референсы по `clientId` без фильтра по категории, общая таблица была бы прямой утечкой. `DELETE` сверяет `clientId` из сессии и удаляет строку + файл с диска (`unlink` с проглатыванием ошибки при рассинхроне). Ручки «заменить» нет — замена = удалить и загрузить заново.

## Витрина результатов

- **`GET /api/results/:token`** — read-only бандл готового демо: посты, картинки, сценарий рилса, видео + «Упаковка профиля» (последняя версия `packaging_profiles`, `documentMarkdown` целиком). Без `requireSession` — токен в URL и есть авторизация, ссылка рассчитана на пересылку людям без сессии.
- Сознательно **не** отдаёт контент-план и сырые аналитические документы (ЦА, экспертность, анализ аккаунта/конкурентов, аудит шапки): упаковка профиля уже синтезирует ключевое в презентабельном виде и работает как лид-магнит, а контент-план — личная стратегия клиента, не материал для случайных зрителей. Аналитика сгорает вместе с сессией — это стимул вернуться за полной версией.
- Ссылка (`kind: "results"` в `access_links`, не сгорает при использовании, TTL 90 дней) генерируется **автоматически**, не оператором: `agents/resultsDelivery.ts` (`ensureResultsLinkSent`) вызывается fire-and-forget после каждого сохранения поста/сценария (`routes/agents.ts`), идемпотентно проверяет готовность всего текстового демо под реальные площадки клиента и отправляет письмо. Ошибка отправки перехватывается, и оператор получает ссылку в Telegram с пометкой, что письмо не дошло: ссылка создаётся **до** письма, поэтому повторного захода в эту функцию не будет — без фолбэка сбой почты означал бы потерю результата для клиента.
- **Порядок роутеров в `index.ts` критичен:** `resultsRouter` монтируется **до** `onboardingRouter`/`agentsRouter`/`reelsReferencesRouter` — все три вешают `router.use(requireSession)` без пути, который перехватывает любой дошедший до роутера запрос (включая чужие пути) и отвечает 401 сам, не вызывая `next`.

## Парсеры соцсетей

`backend/src/parsers/` — обе платформы, проверено живыми вызовами:
- `telegram.ts` — публичная `t.me/s/<channel>`, HTML через `cheerio`; `fetchTelegramProfileHeader` парсит `.tgme_page_photo_image img`, `.tgme_channel_info_description`, `.tgme_channel_info_header_title`.
- `vk.ts` — `wall.get` по `VK_SERVICE_TOKEN`; `fetchVkProfileHeader` через `groups.getById` (аватар `photo_max`, обложка — среднеразмерный вариант из `cover.images`, описание).
- Общий тип `ParsedPost` с полем `engagement` (просмотры на обеих площадках, лайки/репосты только на VK), точка входа `fetchPosts(platform, url)`.

## Агенты

Общий паттерн: `POST/GET /api/agents/<slug>`, результат парсится (YAML-frontmatter → статус и прочие поля отдельными колонками) и сохраняется **append-only по версиям** — повторный запуск не перезаписывает предыдущую версию молча. Синтезирующие агенты читают *последние версии* своих входов и фиксируют их номера для трассировки.

### Распаковка

- **`audience-unpacker`** (Claude Sonnet 5) — на данных онбординга. → `audience_profiles` (статус/b2b/ширина ниши/сегменты).
- **`expertise-unpacker`** (Claude Sonnet 5) — плюс последняя версия `audience_profiles` фоновым контекстом («для кого метод», не цель задачи) и `expertPath` отдельной секцией «Путь эксперта». → `expertise_profiles`. Статусы только `боевой`/`черновик-рамка`.

### Анализ

- **`account-analyzer`** (`deepseek/deepseek-v4-flash`) — вход не форма, а реальные посты по обеим own-площадкам через `fetchPosts`. Задача рутинная (эмпирическое описание стиля по факту текста), потому Flash. → `account_style_profiles`, статусы `боевой`/`черновик-скелет`.
- **`competitor-analyzer`** (Flash) — топ-5 постов по вовлечённости на конкурента (просмотры для Telegram; просмотры + лайки×20 + репосты×50 для VK — репосты весят больше как самый активный сигнал). Ищет кросс-паттерны, подтверждённые у 2+ конкурентов независимо. Статус `боевой` требует минимум 2 конкурентов с 3+ постами — **код перепроверяет это сам**, не доверяя самооценке модели. → `competitor_analysis_profiles`.
- **`profile-header-analyzer`** (Claude Sonnet 5, сверх исходной таблицы агентов) — vision по реальному аватару/обложке/описанию профиля. Чисто фактологическое описание, без оценок и рекомендаций (это работа `account-packager`). Изображения передаются публичным URL (не `data:` base64 — они и так публичны). Статус механический: `боевой`, если хотя бы по одной площадке скачался аватар. → `profile_header_profiles`.
- **`visual-style-analyzer`** (Claude Sonnet 5, сверх исходной таблицы) — vision по drag-and-drop референсам, до 2 на категорию / 10 всего (`MAX_PER_CATEGORY`/`MAX_TOTAL_REFERENCES`). Картинки идут как `data:` base64 прямо в сообщении. Нет референсов → `ReferencesMissingError`. Статус: порог 3+ референса работает только как пол. **Для картинок-постов больше не используется** (визуальный стиль синтезирует `account-packager` из текста) — остался входом только для `reels-video-generator`. `ensureVisualStyleProfile(clientId)` — ленивый автозапуск изнутри потребителя: читает последнюю версию, если нет — вызывает анализ, перехватывая любые ошибки как некритичные. Повторно не гоняется: референсы загружаются только на онбординге, вход физически не может измениться между генерациями.

### Синтез

- **`account-packager`** (Flash) — поверх последних `audience_profiles` + `expertise_profiles` + `account_style_profiles` (все три обязательны, иначе `PrerequisitesMissingError`), ничего не анализирует заново. Опциональный четвёртый вход — «Аудит шапки профиля»: если есть, рекомендации по шапке строятся как сравнение факта с должным; если нет — работает по-старому с явной оговоркой. Отсутствие аудита не влияет на статус (это факт для одного раздела, не показатель качества документа), версия пишется в `profileHeaderProfileVersion` (`null`, если не использовался). Даёт позиционирование, единый tone of voice, готовый текст био, рекомендации по шапке **и «Визуальный стиль»** (палитра/свет/композиция/чего избегать — из позиционирования, ЦА и метода), который передаётся дальше в `visual-generator`. Статус — самый слабый из трёх **обязательных** входов, код считает сам (`weakestStatus`) и переписывает строку `статус:` в сохранённом frontmatter через `replaceFrontmatterField`. → `packaging_profiles`.
- **`content-planner`** (DeepSeek V4 Pro) — поверх последних `packaging_profiles` + `competitor_analysis_profiles` (сырые ЦА/экспертность уже сжаты в упаковку), плюс **реальные площадки клиента из `social_links`**, не из `account_style_profiles.platforms`. План строится только под реальные площадки: только Telegram → ни плана, ни идей Reels для ВК; только ВК → без Telegram. Агент сам выбирает реалистичную частоту по каждой площадке (например «Telegram — через день», «ВК — 2 раза в неделю») и заполняет только эти дни; частота помечена как гипотеза-ориентир. Пометка `[формат подтверждён в нише:...]` — там, где тема реально адаптирует кросс-паттерн конкурентов. Только темы/заголовки, без полных текстов.
 Дополнительно выдаёт машиночитаемый ```json-блок сразу после frontmatter (`posts`/`reels` — день, площадка, тема, заголовок, паттерн), читается `lib/planData.ts` (`parsePlanData`) в колонки `content_plans.planItems`/`reelsIdeas` (nullable — без валидного JSON план всё равно сохраняется). Статус — самый слабый из двух входов.

### Генерация контента

- **`copywriter`** (DeepSeek V4 Pro) — текст одного демо-поста поверх последних `content_plans` + `packaging_profiles`, для конкретной `platform` и `day` (по умолчанию 1; модель сама находит строку в таблице плана, кодом markdown-таблица не парсится). Правило промпта: «честность живёт в метаданных, не в тексте поста» — даже при статусе `черновик-*` пост пишется уверенным текстом, оговорки только во frontmatter. Проверяет площадку против `content_plans.platforms` → `PlatformNotInPlanError` до вызова модели. Каждая площадка версионируется независимо в `copywriter_posts`.
- **`reels-writer`** (DeepSeek V4 Pro — раскадровка и хук на 3 секунды требуют более сильной творческой части) — сценарий одного рилса поверх тех же входов. Reels только для ВК: нет ВК → `ReelsNotAvailableError` до вызова модели. Без параметра площадки (сценарий один на клиента). Модель сама выбирает идею из раздела «Идеи Reels», предпочитая покрытую загруженными референсами (передаётся текстовый список категорий, без vision), иначе — нейтральный формат, с запретом выдумывать несуществующие референсы. `использованы_референсы`/`категории_референсов` — решение модели, код только читает. → `reels_scripts`.
- **`editor-in-chief`** (DeepSeek V4 Pro) — вердикт `ok`/`needs_revision` поверх последней версии `copywriter_posts` (по `platform`) или `reels_scripts` (`contentType`: `copywriter` | `reels`) + табу из `expertise_profiles` + стоп-слова/tone of voice из `audience_profiles` + tone of voice/позиционирование из `packaging_profiles`. Все четыре обязательны. **Не переписывает текст сам** — только вердикт + список нарушений (категория/цитата/объяснение), чтобы не плодить ещё один источник искажений. Нераспознанный вердикт трактуется как `needs_revision`, не `ok` (ложноположительный стоит одной лишней перегенерации, пропущенное нарушение — показа клиенту). → `editorial_reviews`, версия считается на пару (`contentType`, `platform`).
- **`agents/reviewedContent.ts`** — retry-оркестратор поверх генераторов и редактора, отдельно от них, чтобы `copywriter.ts`/`reelsWriter.ts` оставались чистыми генераторами. `runReviewedCopywriter`/`runReviewedReelsWriter`: генерация → проверка → при `needs_revision` **одна** перегенерация с вердиктом как доп. инструкцией (`editorFeedback`) → повторная проверка. Дальше не зацикливается, возвращает `needsManualReview: true`. **Обе HTTP-ручки `POST /agents/copywriter` и `/agents/reels-writer` зовут именно reviewed-версии** — раньше звали голые генераторы, и контент из кабинета вообще не проходил редактора. При `needsManualReview: true` роуты дополнительно возвращают `editorFeedback` (сырой `documentMarkdown` вердикта) для показа в интерфейсе.
 **Ограничение:** ни `needsManualReview`, ни `editorFeedback` не персистятся в БД — видны только в ответе на POST, при перезагрузке страницы (GET) не восстанавливаются.

### Медиа

- **`visual-generator`** (Flash — вход уже текст, vision не нужен) — пишет **только промпт** для генерации картинки, поверх последнего поста `copywriter` для площадки + последней `packaging_profiles` (обязательный вход, `PrerequisitesMissingError`; берётся независимым повторным fetch, не через транзитивную гарантию из `content_plan`). Использует раздел «Визуальный стиль» упаковки буквально. Готовый промпт на английском (точнее работает с Seedream/FLUX.2) в обязательном ` ```text `-блоке, краткое описание для человека — по-русски. → `visual_generator_prompts` (`packagingProfileVersion` обязательна).
- **`POST/GET /api/agents/generate-image`** (`agents/imageGenerator.ts`) — реальный платный вызов OpenRouter `/api/v1/images` (~$0.04). Промпт извлекается из ` ```text `-блока через `lib/promptBlock.ts` (`extractPromptBlock`), не парсингом вольного markdown. → `generated_images` (без колонки `status` — это медиа-артефакт, не документ с оценкой), файлы в `workspace/06-images/`.
- **`reels-video-generator`** (Flash) — промпт для видео по `prompts/reels-video-generator.md`. **Визуализирует только хук** (первые 3 секунды), не всю раскадровку: видео-модели генерируют один короткий непрерывный клип, а не смонтированный ролик. Получает флаг «референс есть/нет»; если есть — не переописывает, что на кадре, а описывает продолжение сцены (`референсный_кадр_использован` во frontmatter). → `reels_video_prompts`.
- **`POST/GET /api/agents/generate-video`** (`agents/videoGenerator.ts`) — вызов `/api/v1/videos` (~$0.84, заметно дороже картинки). `duration` 5 сек и `aspect_ratio: "9:16"` фиксированы. Сам подбирает **самый свежий** файл из `reels_reference_files` и передаёт его как первый кадр; `generated_videos.referenceFileId` трассирует какой. → файлы в `workspace/07-reels/`.
- **`lib/imageGeneration.ts` / `lib/videoGeneration.ts`** — прямая реализация вызовов, **не через `smm-mcp`**: тот зарегистрирован в `.mcp.json` как stdio-инструмент для Claude Code, а не HTTP-сервис, который мог бы дёрнуть продакшн-Express. Слаги моделей те же, что подтверждены в `smm-mcp/README.md` (`bytedance-seed/seedream-4.5`, фолбэк `black-forest-labs/flux.2-max`, `kwaivgi/kling-v3.0-pro`) — не менять без повторной проверки. `smm-mcp` не тронут.
- **Референсный кадр передаётся как `data:`-URI**, публичный домен не нужен: `generateVideoFile` принимает `referenceImagePath`, кодирует файл в base64 (`fileToDataUri`, MIME по расширению) и шлёт как `frame_images: [{type:"image_url", image_url:{url}, frame_type:"first_frame"}]`.
- Файлы раздаются на деве через `express.static`: `/media` → `workspace/`, `/uploads` → `UPLOAD_ROOT`. На проде эту роль берёт nginx/Caddy.

### Оркестрация

- **`POST /api/agents/run-all`** (`agents/pipeline.ts`, `runFullPipeline`). Независимые агенты идут через `Promise.all` — 5 параллельных веток (аудитория→экспертность одной веткой, анализ аккаунта, анализ конкурентов, визуальный стиль, аудит шапки). Дальше жёсткая цепочка по зависимостям: упаковка → план → копирайтер+reels-writer (параллельно, через reviewed-версии) → визуал-промпт (стартует после того, как для площадки отработали copywriter+editor). `visual-style-analyzer`/`profile-header-analyzer` — необязательные ветки (`runOptionalStage`), их падение не останавливает пайплайн; `reels-writer` без ВК → `skipped`, не `failed`. Ответ — всегда 200 с отчётом по каждому этапу (`ok`/`failed`/`skipped`), потому что непрохождение по домену не серверная ошибка. Оркестратор не хранит состояния, можно звать заново.
 **Фронтенд его не вызывает и не будет** — в кабинете кнопка «Запустить» на каждом этапе отдельно. Эндпоинт оставлен для сквозных live-тестов при разработке.

## Модели агентов

| Агент | Модель |
|---|---|
| audience-unpacker | Claude Sonnet 5 |
| expertise-unpacker | Claude Sonnet 5 |
| visual-style-analyzer | Claude Sonnet 5 |
| profile-header-analyzer | Claude Sonnet 5 |
| account-analyzer | DeepSeek V4 Flash |
| competitor-analyzer | DeepSeek V4 Flash |
| account-packager | DeepSeek V4 Flash |
| visual-generator | DeepSeek V4 Flash |
| reels-video-generator | DeepSeek V4 Flash |
| content-planner | DeepSeek V4 Pro |
| copywriter | DeepSeek V4 Pro |
| reels-writer | DeepSeek V4 Pro |
| editor-in-chief | DeepSeek V4 Pro |

История переключений и обоснования — `docs/decision-log.md`.

## Общие модули

- `lib/openrouter.ts` — клиент OpenRouter. Формат OpenAI-совместимый (`choices[0].message.content`), не нативный Anthropic Messages API; слаги с префиксом провайдера (`anthropic/claude-sonnet-5`). Запрос голый `{model, messages}` — **никаких `tools` не передаётся**. `ChatMessage.content` — `string | (TextContentBlock | ImageContentBlock)[]` для мультимодальных вызовов.
- `lib/frontmatter.ts` — `parseFrontmatter` (устойчивый перебор пар `---`) и `replaceFrontmatterField(document, field, value)` поверх той же логики. Использовать общую функцию, не локальные regex-копии.
- `lib/promptBlock.ts` — `extractPromptBlock` для ` ```text `-блоков (картинки и видео).
- `lib/planData.ts` — `parsePlanData` для json-блока контент-плана.
- `lib/email.ts` — SMTP-обёртка + `formatExpiryDateTime`/`formatExpiryDate` (человекочитаемые сроки через `toLocaleString("ru-RU")`, не `toISOString`).
- `lib/tokens.ts` — `SESSION_TTL_MS` и генерация токенов.
- `middleware/requireSession` — используется `onboarding.ts`, `agents.ts`, `reelsReferences.ts`.
