import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function testSimpleUpdate() {
  try {
    const db = getDb();
    // Just try to update a single record by ID without CTE/FROM
    const result = await db.execute(sql`
      update workspace_outbox 
      set updated_at = now() 
      where id = 'non-existent'
      returning id
    `);
    console.log("Success:", result.rows);
  } catch (err) {
    console.error("Error:", err);
  } finally {
    process.exit();
  }
}

testSimpleUpdate();
