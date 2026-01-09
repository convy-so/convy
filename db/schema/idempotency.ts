import { pgTable, text, timestamp, jsonb } from "drizzle-orm/pg-core";
import { timestamps } from "./common";

export const idempotencyKeys = pgTable("idempotency_keys", {
  key: text("key").primaryKey(), // The unique idempotency key (UUID or hash)
  userId: text("user_id"), // Optional: link to user
  operation: text("operation").notNull(), // E.g., "payment.charge", "webhook.zapier"
  
  // Need to store the result to return it if duplicate request comes in
  responseBody: jsonb("response_body"), 
  responseStatus: text("response_status"),

  lockedAt: timestamp("locked_at", { withTimezone: true, mode: "date" }).defaultNow(),
  expiresAt: timestamp("expires_at", { withTimezone: true, mode: "date" }).notNull(), // Clean up old keys
  
  createdAt: timestamp("created_at", { withTimezone: true, mode: "date" }).defaultNow().notNull(),
});
