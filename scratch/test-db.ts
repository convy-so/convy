import { getDb } from "../db";

async function main() {
  const db = getDb();
  console.log("Inspecting table constraints...");
  const constraints = await db.execute(
    `SELECT conname, pg_get_constraintdef(c.oid) 
     FROM pg_constraint c 
     JOIN pg_namespace n ON n.oid = c.connamespace 
     WHERE conrelid = 'topic_material_upload_attempts'::regclass`
  );
  console.log("Constraints:", constraints.rows);

  console.log("Inspecting table columns...");
  const columns = await db.execute(
    `SELECT column_name, data_type, is_nullable, column_default 
     FROM information_schema.columns 
     WHERE table_name = 'topic_material_upload_attempts'`
  );
  console.table(columns.rows);
}

main().catch(console.error);
