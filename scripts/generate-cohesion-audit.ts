import fs from "node:fs";
import path from "node:path";

import type { AuditRow } from "./cohesion-audit/audit-types";
import {
  collectAuditFiles,
  outputJsonPath,
  outputMarkdownPath,
  parseImports,
  readText,
  relative,
  resolveImport,
} from "./cohesion-audit/cohesion-audit-files";
import {
  buildPurpose,
  buildTags,
  classifyAction,
  classifyBatch,
  classifyBoundary,
  classifyFileRole,
  getOwnerArea,
} from "./cohesion-audit/cohesion-audit-classification";
import { buildMarkdown, buildSummary } from "./cohesion-audit/cohesion-audit-reporting";

function buildAuditRows(files: string[]) {
  const fileSet = new Set(files.map((filePath) => relative(filePath)));
  const importGraph = new Map<string, string[]>();
  const resolvedDependents = new Map<string, Set<string>>();
  const rows: AuditRow[] = [];

  for (const filePath of files) {
    const relPath = relative(filePath);
    importGraph.set(relPath, parseImports(readText(filePath)));
    resolvedDependents.set(relPath, new Set());
  }

  for (const [fromRelPath, imports] of importGraph.entries()) {
    for (const specifier of imports) {
      const resolved = resolveImport(fromRelPath, specifier, fileSet);
      if (resolved) {
        resolvedDependents.get(resolved)?.add(fromRelPath);
      }
    }
  }

  for (const filePath of files) {
    const relPath = relative(filePath);
    const content = readText(filePath);
    const imports = importGraph.get(relPath) ?? [];
    const lineCount = content.split(/\r?\n/).length;
    const fileName = path.basename(relPath);
    const baseName = path.basename(relPath, path.extname(relPath));
    const ownerArea = getOwnerArea(relPath);
    const fileRole = classifyFileRole(relPath, fileName);
    const boundary = classifyBoundary(relPath, fileRole);
    const directDependents = [...(resolvedDependents.get(relPath) ?? new Set())].sort();
    const tags = buildTags({
      relPath,
      baseName,
      fileRole,
      content,
      lineCount,
      imports,
      dependentCount: directDependents.length,
      ownerArea,
      boundary,
    });
    const batch = classifyBatch(ownerArea, relPath, fileRole);
    const action = classifyAction({
      fileRole,
      lineCount,
      tags,
      ownerArea,
      boundary,
      content,
      batch,
    });

    rows.push({
      path: relPath,
      ownerArea,
      fileRole,
      boundary,
      purpose: buildPurpose(relPath, ownerArea, fileRole),
      action,
      batch,
      tags,
      lineCount,
      imports,
      directDependents,
      importCount: imports.length,
      dependentCount: directDependents.length,
    });
  }

  return rows;
}

function main() {
  const files = collectAuditFiles();
  const rows = buildAuditRows(files);
  const payload = {
    generatedAt: new Date().toISOString(),
    fileCount: rows.length,
    summary: buildSummary(rows),
    files: rows,
  };

  fs.writeFileSync(outputJsonPath, `${JSON.stringify(payload, null, 2)}\n`);
  fs.writeFileSync(outputMarkdownPath, buildMarkdown(rows));

  console.log(`Generated cohesion audit for ${rows.length} files.`);
  console.log(`- ${relative(outputJsonPath)}`);
  console.log(`- ${relative(outputMarkdownPath)}`);
}

main();
