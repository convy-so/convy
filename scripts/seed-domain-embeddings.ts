
import "dotenv/config";
import { SUB_DOMAINS } from "../lib/agents/skill-system/registry";
import { generateEmbedding } from "../lib/rag/embeddings";
import { getDb } from "../db";
import { domainEmbeddings } from "../db/schema/domain-embeddings";
const db = getDb();

async function seed() {
  console.log(`Starting to seed ${SUB_DOMAINS.length} domains...`);

  for (const domain of SUB_DOMAINS) {
    console.log(`Processing: ${domain.name} (${domain.id})`);

    // Create a composite text for embedding that captures the essence of the domain
    const compositeText = `
      Domain: ${domain.name}
      Description: ${domain.description}
      Keywords: ${domain.triggerKeywords.join(", ")}
      Examples of research questions or goals:
      ${domain.semanticExamples.join("\n")}
    `.trim();

    try {
      const embedding = await generateEmbedding(compositeText);

      // Upsert into domainEmbeddings
      await db
        .insert(domainEmbeddings)
        .values({
          domainId: domain.id,
          domainName: domain.name,
          familyId: domain.familyId,
          compositeText: compositeText,
          embedding: embedding,
        })
        .onConflictDoUpdate({
          target: domainEmbeddings.domainId,
          set: {
            domainName: domain.name,
            familyId: domain.familyId,
            compositeText: compositeText,
            embedding: embedding,
            updatedAt: new Date(),
          },
        });

      console.log(`Successfully seeded: ${domain.id}`);
    } catch (error) {
      console.error(`Failed to seed ${domain.id}:`, error);
    }
  }

  console.log("Seeding completed successfully!");
  process.exit(0);
}

seed().catch((err) => {
  console.error("Critical error during seeding:", err);
  process.exit(1);
});
