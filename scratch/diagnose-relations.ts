import { extractTablesRelationalConfig, normalizeRelation, createTableRelationsHelpers } from "drizzle-orm";
import * as schema from "../db/schema";

try {
  console.log("Extracting relational config...");
  const { tables, tableNamesMap } = extractTablesRelationalConfig(schema, createTableRelationsHelpers);
  console.log("Extracted tables:", Object.keys(tables).length);

  console.log("\nDiagnosing all relations:");
  let failCount = 0;
  for (const [tableName, tableConfig] of Object.entries(tables)) {
    for (const [relationName, relation] of Object.entries(tableConfig.relations)) {
      try {
        const normalized = normalizeRelation(tables, tableNamesMap, relation as any);
      } catch (err: any) {
        failCount++;
        console.error(`  [FAIL] Table: ${tableName}, Relation: ${relationName}:`, err.message);
      }
    }
  }
  if (failCount === 0) {
    console.log("All relations diagnosed successfully!");
  } else {
    console.log(`Diagnosis complete. Failed relations count: ${failCount}`);
  }
} catch (err: any) {
  console.error("Fatal error during diagnosis:", err);
}
