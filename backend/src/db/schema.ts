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
