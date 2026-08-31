import { sqliteTable, text, integer } from "drizzle-orm/sqlite-core";

export const clients = sqliteTable("clients", {
  id: text("id").primaryKey(),
  contactType: text("contact_type", { enum: ["email", "telegram", "vk"] }).notNull(),
  contactValue: text("contact_value").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Заявка с лендинга ("получить демо-доступ"). Ручное подтверждение на старте —
// см. раздел 2 Project Specification v2.md.
export const accessRequests = sqliteTable("access_requests", {
  id: text("id").primaryKey(),
  contactType: text("contact_type", { enum: ["email", "telegram", "vk"] }).notNull(),
  contactValue: text("contact_value").notNull(),
  status: text("status", { enum: ["pending", "approved", "rejected"] })
    .notNull()
    .default("pending"),
  clientId: text("client_id").references(() => clients.id),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
  reviewedAt: integer("reviewed_at", { mode: "timestamp" }),
});

// Одноразовая ссылка (сгорает при первом использовании, не привязана к IP) и
// долгоживущая read-only ссылка на результаты — обе "magic link", различаются
// полем kind. См. раздел 2 Project Specification v2.md.
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
// таблице, различаются полем role. См. раздел 3 спецификации, Шаг 1.
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

// Опросник онбординга — короткая форма-заменитель интервью, один ответ на
// клиента (пересдача формы перезаписывает). См. раздел 3 спецификации, Шаг 1.
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

// Результат агента audience-unpacker («Профиль ЦА»). Append-only по версиям —
// повторный запуск не перезаписывает существующую запись молча (см. раздел 3
// спецификации и автономный режим в prompts/target-audience.md). Статусные
// поля дублируют YAML-frontmatter документа как отдельные колонки — нужны
// для честных бейджей в UI (боевой/черновик-*), не только для чтения текста.
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

// Результат агента expertise-unpacker («Распаковка экспертности»). Append-only
// по версиям, тот же принцип, что и audience_profiles. Статусы здесь только
// боевой/черновик-рамка (без черновик-скелет) — см. YAML-frontmatter в
// prompts/expertise.md, Фаза 0 не имеет skeleton-ветки, только hard-stop.
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

// Результат агента account-analyzer («Анализ своего аккаунта»). Append-only
// по версиям, тот же принцип, что и audience_profiles/expertise_profiles.
// Статусы только боевой/черновик-скелет — здесь нет промежуточного варианта
// с публичными источниками (как у unpacker-агентов): вход всегда либо
// реальные посты эксперта в достаточном количестве, либо их не хватает.
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

// Результат агента profile-header-analyzer («Аудит шапки профиля») — новый
// агент сверх исходной таблицы раздела 4 (см. раздел 9 спецификации).
// Фактологический разбор аватара/обложки/описания реального профиля клиента
// (не постов) vision-моделью — используется account-packager для
// заземлённого «Аудита профиля» вместо чисто умозрительных рекомендаций.
// Append-only по версиям, статус — чисто механический: удалось ли получить
// хотя бы один аватар, не качественная оценка модели (в отличие от
// visual-style-analyzer).
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

// Результат агента visual-style-analyzer («Визуальный style-профиль») —
// добавлен в этой сессии, не входил в исходную таблицу агентов раздела 4
// спецификации (см. "Архитектурное решение этой сессии" в разделе 9).
// Анализирует загруженные на онбординге drag-and-drop референсы (не посты)
// vision-моделью, чтобы у visual-generator был устойчивый визуальный стиль
// клиента, а не разрозненные генерации от раза к разу. Append-only по
// версиям, статусы боевой/черновик-скелет тем же принципом, что и
// account_style_profiles.
export const visualStyleProfiles = sqliteTable("visual_style_profiles", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-скелет"] }).notNull(),
  referencesAnalyzed: integer("references_analyzed").notNull(),
  categories: text("categories").notNull(),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента competitor-analyzer («Анализ конкурентов»). Append-only по
// версиям, тот же принцип, что и account_style_profiles. Статусы боевой
// (2+ конкурента с пригодными для ранжирования постами) / черновик-скелет
// (данных меньше чем у двух конкурентов) — см. prompts/competitor-analyzer.md.
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

// Результат агента account-packager («Упаковка профиля»). Append-only по
// версиям. Статус наследуется от самого слабого из трёх входных документов
// (аудитория/экспертность/стиль), не выбирается моделью самостоятельно — см.
// buildStatus в backend/src/agents/accountPackager.ts. Версии входов
// зафиксированы для трассировки: если позже кто-то из unpacker'ов
// перезапустится, видно, на каких именно версиях строилась эта упаковка.
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

// Результат агента content-planner («Контент-план на 2 недели»). Append-only
// по версиям. Статус наследуется от самого слабого из двух входов (упаковка
// профиля / анализ конкурентов), тем же принципом, что и packaging_profiles.
// Версии обоих входов зафиксированы для трассировки. platforms — ровно те
// площадки, что реально есть у клиента (own-ссылки на онбординге), не
// обязательно обе: план и демо строятся только под них, см. Шаг 2/3 в
// prompts/content-planner.md. Проверяется дальше в copywriter.ts, чтобы
// нельзя было сгенерировать пост для площадки, которой у клиента нет.
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
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента copywriter — готовый текст одного демо-поста. Append-only
// по версиям, но версия считается отдельно на каждую площадку (telegram/vk
// пишутся и перегенерируются независимо друг от друга) — см.
// backend/src/agents/copywriter.ts. Статус наследуется от самого слабого из
// двух входов (контент-план / упаковка профиля), тем же принципом.
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

// Результат агента visual-generator — промпт для generate_image (сам вызов
// generate_image, дорогая операция, происходит отдельно и только по
// подтверждению пользователя — не здесь, см. раздел 3 Шаг 4 спецификации).
// Append-only по версиям, версия считается отдельно на каждую площадку, тем
// же принципом, что и copywriter_posts. visualStyleProfileVersion — null,
// если клиент не загрузил референсы (у visual-style-analyzer нечего было
// анализировать) — тогда промпт написан по нейтральному дефолту, см.
// usedVisualProfile и prompts/visual-generator.md, "Вход".
export const visualGeneratorPrompts = sqliteTable("visual_generator_prompts", {
  id: text("id").primaryKey(),
  clientId: text("client_id")
    .notNull()
    .references(() => clients.id),
  platform: text("platform", { enum: ["telegram", "vk"] }).notNull(),
  version: integer("version").notNull(),
  status: text("status", { enum: ["боевой", "черновик-рамка", "черновик-скелет"] }).notNull(),
  usedVisualProfile: integer("used_visual_profile", { mode: "boolean" }).notNull(),
  copywriterPostVersion: integer("copywriter_post_version").notNull(),
  visualStyleProfileVersion: integer("visual_style_profile_version"),
  documentMarkdown: text("document_markdown").notNull(),
  createdAt: integer("created_at", { mode: "timestamp" }).notNull(),
});

// Результат агента reels-writer — сценарий одного демо-рилса. Append-only по
// версиям, без разделения по площадкам (Reels в этом продукте существуют
// только для ВК, см. content-planner) — в отличие от copywriter_posts/
// visual_generator_prompts, где версия считается на каждую площадку отдельно.
// usedReferences/referenceCategories — не то, что реально загружено клиентом
// (это reference_files), а то, что модель реально использовала в выбранной
// идее (см. Шаг 1 prompts/reels-writer.md) — оба могут разойтись, если
// референсы есть, но ни один не подошёл ни одной идее плана.
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

// Результат агента editor-in-chief («Редакторская проверка») — вердикт
// ok/needs_revision над конкретной версией copywriter_posts или
// reels_scripts (contentType + reviewedContentVersion). Append-only, версия
// считается отдельно на пару (contentType, platform) — тот же принцип, что и
// copywriter_posts. Не хранит нарушения отдельной структурированной колонкой:
// агент сам не переписывает текст (см. раздел 5 спецификации), а фидбек для
// автоматической перегенерации — это documentMarkdown целиком, не разобранный
// на поля список (см. backend/src/agents/reviewedContent.ts).
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

// Drag-and-drop медиа-референсы с онбординга (не сгенерированное демо-медиа —
// то хранится отдельно, см. /workspace в CLAUDE.md). Файлы на диске, здесь
// только путь. См. раздел 3 (категории) и раздел 7 (хранение) спецификации.
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
