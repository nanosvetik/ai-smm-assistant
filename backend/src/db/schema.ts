import { sqliteTable, text, integer, real } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  // Канал связи только один — почта: она есть у всех, и на неё же уходят
  // ссылки на анкету и на результаты. Не путать с собственными соцсетями
  // клиента (social_links) — те нужны для анализа контента, а не для связи.
  // Перечисление ограничено в TypeScript и zod, а не в SQL: SQLite не хранит
  // CHECK для enum, в таблице это обычный текст. Колонка с единственным
  // значением оставлена сознательно — она дешёвая и позволит добавить второй
  // канал без миграции.
  contactType: text("contact_type", { enum: ["email"] }).notNull(),
  contactValue: text("contact_value").notNull(),
  // Копируется из заявки при одобрении: клиент живёт дольше заявки, а имя
  // нужно, чтобы письма были адресными.
  name: text("name"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Заявка с лендинга. Доступ выдаётся только после ручного подтверждения
// оператором — автоматической регистрации в продукте нет.
export const accessRequests = sqliteTable("access_requests", {
  id: text("id").primaryKey(),
  // Тот же принцип, что и в clients.contactType.
  contactType: text("contact_type", { enum: ["email"] }).notNull(),
  contactValue: text("contact_value").notNull(),
  // Имя необязательно: с лендинга собирается минимум данных, заявка без
  // имени тоже полноценна.
  name: text("name"),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  clientId: text("client_id").references(() => clients.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
});

// Две ссылки-пропуска в одной таблице, различаются полем kind. Анкетная
// сгорает при отправке формы (не при открытии) и не привязана к IP; ссылка на
// результаты живёт долго и переживает любое число открытий — её пересылают
// знакомым. Подробности — docs/security.md.
export const accessLinks = sqliteTable("access_links", {
  token: text("token").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  kind: text("kind", { enum: ["onboarding", "results"] }).notNull(),
  usedAt: integer("used_at", { mode: "timestamp" }),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

export const sessions = sqliteTable("sessions", {
  token: text("token").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  expiresAt: integer("expires_at", { mode: "timestamp" }).notNull(),
});

// Собственные соцсети клиента и ссылки на конкурентов — обе роли живут в одной
// таблице, различаются полем role.
export const socialLinks = sqliteTable("social_links", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  role: text("role", { enum: ["own", "competitor"] }).notNull(),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  url: text("url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Опросник онбординга — короткая форма вместо часового интервью, один ответ
// на клиента: повторная отправка перезаписывает предыдущий.
export const onboardingProfiles = sqliteTable("onboarding_profiles", {
  clientId: text("client_id")
    .primaryKey()
    .references(() => clients.id),
  salesModel: text("sales_model", { enum: ["b2c", "b2b"] }).notNull(),
  clientDescription: text("client_description").notNull(),
  clientPhrases: text("client_phrases"),
  mainPrinciple: text("main_principle").notNull(),
  contentTaboos: text("content_taboos").notNull(),
  // Нет NOT NULL умышленно — в БД уже есть тестовые строки без этого поля
  // (добавлено позже остальных). Обязательность — на уровне zod-схемы
  // роута (backend/src/routes/onboarding.ts) и формы (frontend), не БД.
  expertPath: text("expert_path"),
  submittedAt: integer("submitted_at", { mode: "timestamp" }).notNull(),
});

// Результат агента audience-unpacker («Профиль ЦА»). Только добавление
// версий: повторный запуск не затирает предыдущий документ молча. Статусные
// поля дублируют YAML-frontmatter документа отдельными колонками — иначе
// интерфейс не мог бы показать честный бейдж «боевой/черновик», не разбирая
// текст на лету.
export const audienceProfiles = sqliteTable("audience_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  b2b: integer("b2b", { mode: "boolean" }).notNull().default(false),
  nicheWidth: text("niche_width", { enum: ["широкая", "средняя", "узкая"] }),
  segments: text("segments"),
  validationAfter: text("validation_after"),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента expertise-unpacker («Распаковка экспертности»), тот же
// принцип версионирования. Статусов здесь два, а не три: у этого агента нет
// ветки «скелет» — при нехватке данных он останавливается, а не выдаёт
// заготовку (prompts/expertise.md).
export const expertiseProfiles = sqliteTable("expertise_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка"] }).notNull(),
  b2b: integer("b2b", { mode: "boolean" }).notNull().default(false),
  methodology: text("methodology"),
  methodStructure: text("method_structure", {
    enum: ["линейная", "цикл", "слои", "фазы"],
  }),
  validationAfter: text("validation_after"),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента account-analyzer («Анализ своего аккаунта»), то же
// версионирование. Промежуточного статуса нет: либо постов эксперта хватило,
// либо нет — гипотезы по нише, как у распаковщиков, здесь неоткуда взять.
export const accountStyleProfiles = sqliteTable("account_style_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-скелет"] }).notNull(),
  postsAnalyzed: integer("posts_analyzed").notNull(),
  platforms: text("platforms").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента profile-header-analyzer («Аудит шапки профиля»): разбор
// аватара, обложки и описания реального профиля — не постов. Нужен, чтобы
// рекомендации по упаковке опирались на то, что у клиента действительно
// стоит, а не на догадки. Статус здесь механический — удалось ли получить
// хотя бы одно изображение, а не оценка качества моделью.
export const profileHeaderProfiles = sqliteTable("profile_header_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-скелет"] }).notNull(),
  platforms: text("platforms").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента visual-style-analyzer («Визуальный style-профиль»): разбор
// референсов рилса (reels_reference_files), чтобы промпт к видео опирался на
// стиль реальных фотографий клиента. Версионирование и статусы — как у
// account_style_profiles. Колонки с категориями здесь нет: у референсов рилса
// одна зона загрузки без разбиения (см. reels_reference_files).
export const visualStyleProfiles = sqliteTable("visual_style_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-скелет"] }).notNull(),
  referencesAnalyzed: integer("references_analyzed").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента competitor-analyzer («Анализ конкурентов»). Боевой статус
// требует хотя бы двух конкурентов с достаточным числом постов: по одному
// сравнивать не с чем (prompts/competitor-analyzer.md).
export const competitorAnalysisProfiles = sqliteTable("competitor_analysis_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-скелет"] }).notNull(),
  competitorsAnalyzed: integer("competitors_analyzed").notNull(),
  postsAnalyzed: integer("posts_analyzed").notNull(),
  platforms: text("platforms").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента account-packager («Упаковка профиля»). Статус берётся от
// самого слабого из трёх входов (аудитория, экспертность, стиль), а не
// назначается моделью: документ не может быть надёжнее того, из чего собран
// (buildStatus в agents/accountPackager.ts). Версии входов записаны, чтобы
// после перезапуска любого из них было видно, на чём строилась упаковка.
export const packagingProfiles = sqliteTable("packaging_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  audienceProfileVersion: integer("audience_profile_version").notNull(),
  expertiseProfileVersion: integer("expertise_profile_version").notNull(),
  accountStyleProfileVersion: integer("account_style_profile_version").notNull(),
  // null, если клиент/агент ещё не прогнал profile-header-analyzer — тогда
  // "Аудит профиля" строится по-старому, только из умозрительных выводов.
  profileHeaderProfileVersion: integer("profile_header_profile_version"),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента content-planner («Контент-план на 2 недели»). Статус — от
// самого слабого входа, тем же принципом, что и у упаковки профиля.
// В platforms попадают ровно те площадки, что клиент указал своими, — не
// обязательно обе: план строится только под них, и copywriter потом
// отказывается писать пост для площадки, которой у клиента нет.
export const contentPlans = sqliteTable("content_plans", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  platforms: text("platforms").notNull(),
  packagingProfileVersion: integer("packaging_profile_version").notNull(),
  competitorAnalysisProfileVersion: integer("competitor_analysis_profile_version").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  // Структурированная версия плана, разобранная из json-блока, который модель
  // выдаёт рядом с документом (lib/planData.ts). Пусто, если блок не удалось
  // разобрать: кабинет тогда показывает документ целиком, без сетки и
  // выгрузки, — это честнее пустой таблицы.
  planItems: text("plan_items"),
  reelsIdeas: text("reels_ideas"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента copywriter — готовый текст одного демо-поста. Версия
// считается отдельно на каждую площадку: посты для Telegram и ВК пишутся
// независимо. Статус — от самого слабого входа, как и везде выше.
export const copywriterPosts = sqliteTable("copywriter_posts", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  day: integer("day").notNull(),
  contentPlanVersion: integer("content_plan_version").notNull(),
  packagingProfileVersion: integer("packaging_profile_version").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента visual-generator — текстовый промпт для картинки. Сама
// генерация стоит денег и делается отдельно, только по явному нажатию
// клиента. Версия считается на каждую площадку, как и у постов. Визуальный
// стиль берётся из соответствующего раздела упаковки профиля, поэтому её
// версия обязательна: без упаковки этому агенту не на что опереться.
export const visualGeneratorPrompts = sqliteTable("visual_generator_prompts", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  copywriterPostVersion: integer("copywriter_post_version").notNull(),
  packagingProfileVersion: integer("packaging_profile_version").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Сгенерированная картинка — результат платного вызова поверх промпта из
// visual_generator_prompts. Колонки статуса нет: это файл, а не документ,
// оценивать его как «боевой/черновик» бессмысленно. Версия промпта
// сохраняется, чтобы после его перегенерации интерфейс не показывал старую
// картинку рядом с новым промптом.
export const generatedImages = sqliteTable("generated_images", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  version: integer("version").notNull(),
  visualPromptVersion: integer("visual_prompt_version").notNull(),
  model: text("model").notNull(),
  cost: real("cost"),
  filePath: text("file_path").notNull(),
  publicUrl: text("public_url").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента reels-writer — сценарий одного демо-рилса. Без разделения
// по площадкам: Reels в этом продукте существуют только для ВК.
// usedReferences и referenceCategories описывают не то, что клиент загрузил
// (это reference_files), а то, что модель действительно использовала в
// выбранной идее: референсы могут быть, но не подойти ни одной из них.
export const reelsScripts = sqliteTable("reels_scripts", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  usedReferences: integer("used_references", { mode: "boolean" }).notNull(),
  referenceCategories: text("reference_categories").notNull(),
  contentPlanVersion: integer("content_plan_version").notNull(),
  packagingProfileVersion: integer("packaging_profile_version").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента reels-video-generator — промпт для видео, показывающего
// только хук сценария, а не весь ролик. Зеркало visual_generator_prompts, но
// без площадки: рилс у клиента один. usedVisualProfile отмечает, был ли на
// входе визуальный стиль, — без него промпт получается заметно общее.
export const reelsVideoPrompts = sqliteTable("reels_video_prompts", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  usedVisualProfile: integer("used_visual_profile", { mode: "boolean" }).notNull(),
  reelsScriptVersion: integer("reels_script_version").notNull(),
  visualStyleProfileVersion: integer("visual_style_profile_version"),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Сгенерированный клип поверх промпта из reels_video_prompts. Зеркало
// generated_images, без площадки — клип у клиента один. referenceFileId
// показывает, какой из загруженных клиентом файлов пошёл первым кадром.
export const generatedVideos = sqliteTable("generated_videos", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  videoPromptVersion: integer("video_prompt_version").notNull(),
  model: text("model").notNull(),
  cost: real("cost"),
  filePath: text("file_path").notNull(),
  publicUrl: text("public_url").notNull(),
  referenceFileId: text("reference_file_id"),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента editor-in-chief («Редакторская проверка») — вердикт над
// конкретной версией поста или сценария. Нарушения не разложены по колонкам
// намеренно: редактор не переписывает текст сам, а его замечания уходят
// автору целиком, как связный отзыв (agents/reviewedContent.ts). Разбор на
// поля здесь ничего бы не дал, кроме потери смысла.
export const editorialReviews = sqliteTable("editorial_reviews", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  contentType: text("content_type", { enum: ["copywriter", "reels"] }).notNull(),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  version: integer("version").notNull(),
  reviewedContentVersion: integer("reviewed_content_version").notNull(),
  verdict: text("verdict", { enum: ["ok", "needs_revision"] }).notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Медиа-референсы, загруженные на онбординге. Сами файлы лежат на диске,
// в таблице только путь. Не путать со сгенерированным демо-медиа — оно
// хранится отдельно.
export const referenceFiles = sqliteTable("reference_files", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  category: text("category", {
    enum: ["before_after", "workspace", "showcase", "products", "process"],
  }).notNull(),
  filePath: text("file_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Референсы, которые клиент добавляет на странице рилса, когда сценарий уже
// написан. Отдельно от онбординговых reference_files: те собирались вслепую,
// до сценария, и клиент не понимал, подо что их подбирать. Категорий здесь
// нет — одна зона загрузки.
export const reelsReferenceFiles = sqliteTable("reels_reference_files", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  filePath: text("file_path").notNull(),
  originalFilename: text("original_filename").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});
