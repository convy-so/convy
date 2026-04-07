import { getDb } from "./db";
import { sql } from "drizzle-orm";

async function testQuery() {
  try {
    const db = getDb();
    const result = await db.execute(sql`
      with claimable as (
        select
          id,
          channel,
          payload,
          created_at,
          claim_expires_at is not null and claim_expires_at < now() as reclaimed
        from workspace_outbox
        where published_at is null
          and (claim_expires_at is null or claim_expires_at < now())
        order by created_at asc
        limit 1
        for update skip locked
      )
      update workspace_outbox as outbox
      set
        claim_owner = 'test-owner',
        claimed_at = now(),
        claim_expires_at = now() + (30000 * interval '1 millisecond'),
        publish_attempts = outbox.publish_attempts + 1,
        updated_at = now()
      from claimable
      where outbox.id = claimable.id
      returning
        outbox.id as "id",
        outbox.channel as "channel",
        outbox.payload as "payload",
        outbox.created_at as "createdAt",
        claimable.reclaimed as "reclaimed"
    `);
    console.log("Success:", result.rows);
  } catch (err) {
    console.error("Exact Error:", err);
  } finally {
    process.exit();
  }
}

testQuery();
