import { sql } from "drizzle-orm";
import { boolean, check, date, foreignKey, index, integer, pgTable, text, timestamp, unique, uniqueIndex, uuid } from "drizzle-orm/pg-core";

// Better Auth 1.7 core tables remain unchanged; schedule tables are defined below.
export const user = pgTable("user", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").default(false).notNull(),
  image: text("image"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
});
export const session = pgTable("session", {
  id: text("id").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  token: text("token").notNull().unique(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
  ipAddress: text("ip_address"),
  userAgent: text("user_agent"),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
}, (table) => [index("session_user_id_idx").on(table.userId)]);
export const account = pgTable("account", {
  id: text("id").primaryKey(),
  accountId: text("account_id").notNull(),
  providerId: text("provider_id").notNull(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  accessToken: text("access_token"),
  refreshToken: text("refresh_token"),
  idToken: text("id_token"),
  accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
  refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
  scope: text("scope"),
  password: text("password"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("account_user_id_idx").on(table.userId), uniqueIndex("account_provider_account_idx").on(table.providerId, table.accountId)]);
export const verification = pgTable("verification", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull(),
  value: text("value").notNull(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().$onUpdate(() => new Date()).notNull(),
}, (table) => [index("verification_identifier_idx").on(table.identifier)]);
export type User = typeof user.$inferSelect;

export const schedulePreference = pgTable("schedule_preference", {
  userId: text("user_id").primaryKey().references(() => user.id, { onDelete: "cascade" }),
  timezone: text("timezone").default("Asia/Bangkok").notNull(),
  revision: integer("revision").default(0).notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [check("schedule_revision_nonnegative", sql`${t.revision} >= 0`)]);

export const scheduleEntry = pgTable("schedule_entry", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  mutationId: uuid("mutation_id").notNull(),
  title: text("title").notNull(), kind: text("kind").$type<"available" | "busy">().notNull(),
  timing: text("timing").$type<"weekly" | "date">().notNull(),
  weekday: integer("weekday"), date: date("date", { mode: "string" }),
  startMinute: integer("start_minute").notNull(), endMinute: integer("end_minute").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  unique("schedule_entry_owner_identity").on(t.id, t.userId),
  unique("schedule_entry_mutation").on(t.userId, t.mutationId),
  index("schedule_entry_owner_idx").on(t.userId),
  check("schedule_entry_title", sql`length(trim(${t.title})) between 1 and 80`),
  check("schedule_entry_kind", sql`${t.kind} in ('available', 'busy')`),
  check("schedule_entry_interval", sql`${t.startMinute} >= 0 and ${t.startMinute} < ${t.endMinute} and ${t.endMinute} <= 1440`),
  check("schedule_entry_timing", sql`(${t.timing} = 'weekly' and ${t.weekday} between 1 and 7 and ${t.weekday} is not null and ${t.date} is null) or (${t.timing} = 'date' and ${t.date} is not null and ${t.weekday} is null)`),
]);

// A dated exception cancels a recurring occurrence when replacement fields are NULL,
// or replaces that entire occurrence. Independent date blocks remain additive.
export const scheduleException = pgTable("schedule_exception", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  recurringId: uuid("recurring_id").notNull(), date: date("date", { mode: "string" }).notNull(),
  title: text("title"), kind: text("kind").$type<"available" | "busy">(),
  startMinute: integer("start_minute"), endMinute: integer("end_minute"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  foreignKey({ columns: [t.recurringId, t.userId], foreignColumns: [scheduleEntry.id, scheduleEntry.userId] }).onDelete("cascade"),
  unique("schedule_exception_occurrence").on(t.recurringId, t.date),
  index("schedule_exception_owner_idx").on(t.userId),
  check("schedule_exception_replacement", sql`(${t.title} is null and ${t.kind} is null and ${t.startMinute} is null and ${t.endMinute} is null) or (${t.title} is not null and ${t.kind} is not null and ${t.startMinute} is not null and ${t.endMinute} is not null and length(trim(${t.title})) between 1 and 80 and ${t.kind} in ('available', 'busy') and ${t.startMinute} >= 0 and ${t.startMinute} < ${t.endMinute} and ${t.endMinute} <= 1440)`),
]);
