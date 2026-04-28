import { Pool } from "pg";
import * as path from "path";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(path.join(process.cwd()));

async function enableVector() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    console.error("DATABASE_URL is not set in .env");
    process.exit(1);
  }

  const pool = new Pool({
    connectionString,
    ssl: connectionString.includes("localhost") ? false : { rejectUnauthorized: false },
  });

  try {
    console.log("Connecting to database...");
    const client = await pool.connect();
    console.log("Enabling pgvector extension...");
    await client.query("CREATE EXTENSION IF NOT EXISTS vector;");
    console.log("[✓] pgvector extension enabled successfully.");
    client.release();
  } catch (err) {
    console.error("Error enabling pgvector extension:", err);
  } finally {
    await pool.end();
  }
}

enableVector();
