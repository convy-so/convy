import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function testConn() {
  try {
    const db = getDb();
    const result = await db.execute(sql`select 1 as "num"`);
    console.log("Connection OK:", result.rows);
  } catch (err) {
    console.error("Connection Error:", err);
  } finally {
    process.exit();
  }
}

testConn();
