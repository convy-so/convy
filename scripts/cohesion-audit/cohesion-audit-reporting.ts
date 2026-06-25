import type { AuditRow, AuditSummary } from "./audit-types";

export function buildSummary(rows: AuditRow[]): AuditSummary {
  const byAction = new Map<string, number>();
  const byBatch = new Map<string, number>();
  const byOwnerArea = new Map<string, number>();

  for (const row of rows) {
    byAction.set(row.action, (byAction.get(row.action) ?? 0) + 1);
    byBatch.set(row.batch, (byBatch.get(row.batch) ?? 0) + 1);
    byOwnerArea.set(row.ownerArea, (byOwnerArea.get(row.ownerArea) ?? 0) + 1);
  }

  const topHotspots = rows
    .filter((row) => row.action === "split" || row.tags.includes("dense dependency hub"))
    .sort((left, right) => right.lineCount - left.lineCount)
    .slice(0, 20);

  return {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    actions: Object.fromEntries([...byAction.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
    batches: Object.fromEntries([...byBatch.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
    ownerAreas: Object.fromEntries([...byOwnerArea.entries()].sort((left, right) => left[0].localeCompare(right[0]))),
    topHotspots: topHotspots.map((row) => ({
      path: row.path,
      action: row.action,
      lineCount: row.lineCount,
      tags: row.tags,
      batch: row.batch,
    })),
  };
}

export function buildMarkdown(rows: AuditRow[]) {
  const summary = buildSummary(rows);
  const topHotspots = summary.topHotspots
    .map((row) => `- \`${row.path}\` - ${row.lineCount} lines - ${row.action} - ${row.batch} - ${row.tags.join(", ")}`)
    .join("\n");

  const actionRows = Object.entries(summary.actions)
    .map(([action, count]) => `| ${action} | ${count} |`)
    .join("\n");

  const batchRows = Object.entries(summary.batches)
    .map(([batch, count]) => `| ${batch} | ${count} |`)
    .join("\n");

  return `# Repo Cohesion Audit

Generated: ${summary.generatedAt}

This matrix is the lightweight artifact for the cohesion refactor program. Every audited code-bearing file has a disposition, a batch assignment, a role, a boundary classification, import metadata, and a one-sentence purpose statement in \`repo-cohesion-audit.json\`.

## Coverage
- Audited files: ${summary.fileCount}
- Mutation scope covered: \`app\`, \`features\`, \`shared\`
- Tail-end review scope classified in Batch F: \`i18n\`, \`scripts\`, \`docker\`, root config files, tests, workers, schemas, migrations

## Actions
| Action | Count |
| --- | ---: |
${actionRows}

## Batch Allocation
| Batch | Count |
| --- | ---: |
${batchRows}

## Primary Hotspots
${topHotspots || "- None"}
`;
}
