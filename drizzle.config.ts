import { defineConfig } from "drizzle-kit";

if (!process.env.DATABASE_URL) {
  throw new Error("DATABASE_URL is not set");
}

export default defineConfig({
  schema: "./db/schema",
  out: "./db/migrations",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Supabase: store migration history in public (default "drizzle" schema requires CREATE SCHEMA).
  migrations: {
    table: "__drizzle_migrations",
    schema: "public",
  },
});

