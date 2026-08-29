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
