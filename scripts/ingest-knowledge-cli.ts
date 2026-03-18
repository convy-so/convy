import { ingestKnowledge, type KnowledgeEntry } from "../lib/rag/ingest";
import fs from "fs";
import path from "path";

/**
 * Convy Knowledge Ingestion CLI
 * 
 * Usage:
 * Single Entry:
 *   npx tsx --env-file=.env scripts/ingest-knowledge-cli.ts --title "My Title" --content "My Content" --category "pattern" --domainId 1
 * 
 * Batch (JSON File):
 *   npx tsx --env-file=.env scripts/ingest-knowledge-cli.ts --file path/to/entries.json
 */

async function main() {
  const args = process.argv.slice(2);
  const params: any = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i].startsWith("--")) {
      params[args[i].substring(2)] = args[i + 1];
      i++;
    }
  }

  if (params.file) {
    const filePath = path.resolve(process.cwd(), params.file);
    if (!fs.existsSync(filePath)) {
      console.error(`Error: File not found at ${filePath}`);
      process.exit(1);
    }

    const data = JSON.parse(fs.readFileSync(filePath, "utf-8"));
    const entries = Array.isArray(data) ? data : [data];

    console.log(`Ingesting ${entries.length} entries from ${params.file}...`);
    for (const entry of entries) {
      await processEntry(entry);
    }
  } else if (params.title && params.content && params.category) {
    const entry: KnowledgeEntry = {
      title: params.title,
      content: params.content,
      category: params.category as any,
      domainId: params.domainId ? parseInt(params.domainId) : undefined,
      source: "user",
      metadata: {
        ingestedAt: new Date().toISOString(),
        manualIngestion: true
      }
    };
    await processEntry(entry);
  } else {
    printUsage();
  }
}

async function processEntry(entry: KnowledgeEntry) {
  try {
    console.log(`Processing: ${entry.title}...`);
    await ingestKnowledge(entry);
    console.log(`Successfully ingested: ${entry.title}`);
  } catch (error) {
    console.error(`Failed to ingest ${entry.title}:`, error);
  }
}

function printUsage() {
  console.log(`
Convy Knowledge Ingestion CLI

Single Entry:
  npx tsx --env-file=.env scripts/ingest-knowledge-cli.ts --title "Title" --content "Content" --category "pattern" [--domainId 1]

Batch (JSON File):
  npx tsx --env-file=.env scripts/ingest-knowledge-cli.ts --file path/to/entries.json

Categories: technique, pattern, insight, feedback, general
  `);
}

main().catch(console.error);
