import { pgTable, text, boolean, serial, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";

export const fxServers = pgTable("fx_servers", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  role: text("role").notNull(),
  baseUrl: text("base_url").notNull().default(""),
  allowControl: boolean("allow_control").notNull().default(false),
});
export const insertFxServerSchema = createInsertSchema(fxServers);
export type FxServerRecord = typeof fxServers.$inferSelect;

export const fxActivity = pgTable("fx_activity", {
  id: serial("id").primaryKey(),
  serverId: text("server_id").notNull(),
  serverName: text("server_name").notNull(),
  action: text("action").notNull(),
  ok: boolean("ok").notNull(),
  timestamp: timestamp("timestamp", { withTimezone: true }).notNull().defaultNow(),
  detail: text("detail").notNull(),
});
export const insertFxActivitySchema = createInsertSchema(fxActivity).omit({ id: true, timestamp: true });
export type FxActivityRecord = typeof fxActivity.$inferSelect;
