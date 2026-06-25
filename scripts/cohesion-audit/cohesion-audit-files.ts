import fs from "node:fs";
import path from "node:path";

export const rootDir = process.cwd();
export const outputJsonPath = path.join(rootDir, "docs", "repo-cohesion-audit.json");
export const outputMarkdownPath = path.join(rootDir, "docs", "repo-cohesion-audit.md");

const auditRoots = [
  "app",
  "features",
  "shared",
  "i18n",
  "scripts",
  "docker",
];

const rootFiles = [
  "drizzle.config.ts",
  "eslint.config.mjs",
  "instrumentation-client.ts",
  "instrumentation.ts",
  "next.config.ts",
  "postcss.config.mjs",
  "proxy.ts",
  "sentry.client.config.ts",
  "sentry.edge.config.ts",
  "sentry.server.config.ts",
];

const codeExtensions = new Set([
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".mts",
  ".cts",
  ".sql",
  ".sh",
]);

export const frameworkFilenames = new Set([
  "page.tsx",
  "layout.tsx",
  "route.ts",
  "loading.tsx",
  "error.tsx",
  "not-found.tsx",
  "global-error.tsx",
  "providers.tsx",
  "robots.ts",
  "sitemap.ts",
]);

export const genericBaseNames = new Set([
  "utils",
  "helpers",
  "service",
  "shared",
  "runtime",
  "storage",
  "manager",
  "handler",
  "queries",
  "types",
  "index",
  "errors",
  "logging",
  "prompting",
]);

export function normalize(filePath: string) {
  return filePath.split(path.sep).join("/");
}

export function relative(filePath: string) {
  return normalize(path.relative(rootDir, filePath));
}

function listFiles(targetPath: string): string[] {
  if (!fs.existsSync(targetPath)) {
    return [];
  }

  const entries = fs.readdirSync(targetPath, { withFileTypes: true });
  const results: string[] = [];

  for (const entry of entries) {
    if (entry.name === ".git" || entry.name === ".next" || entry.name === "node_modules") {
      continue;
    }

    const fullPath = path.join(targetPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
      continue;
    }

    if (codeExtensions.has(path.extname(entry.name))) {
      results.push(fullPath);
    }
  }

  return results;
}

export function readText(filePath: string) {
  return fs.readFileSync(filePath, "utf8");
}

export function collectAuditFiles() {
  const seen = new Set<string>();
  const files: string[] = [];

  for (const auditRoot of auditRoots) {
    for (const filePath of listFiles(path.join(rootDir, auditRoot))) {
      const relPath = relative(filePath);
      if (!seen.has(relPath)) {
        seen.add(relPath);
        files.push(filePath);
      }
    }
  }

  for (const rootFile of rootFiles) {
    const fullPath = path.join(rootDir, rootFile);
    if (!fs.existsSync(fullPath)) {
      continue;
    }

    const relPath = relative(fullPath);
    if (!seen.has(relPath)) {
      seen.add(relPath);
      files.push(fullPath);
    }
  }

  return files.sort((left, right) => relative(left).localeCompare(relative(right)));
}

export function parseImports(content: string) {
  const imports: string[] = [];
  const pattern = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;

  for (const match of content.matchAll(pattern)) {
    const specifier = match[1];
    if (specifier) {
      imports.push(specifier);
    }
  }

  return imports;
}

export function resolveImport(fromRelPath: string, specifier: string, fileSet: Set<string>) {
  const candidates: string[] = [];

  if (specifier.startsWith("@/")) {
    candidates.push(specifier.slice(2));
  } else if (specifier.startsWith(".")) {
    candidates.push(normalize(path.join(path.dirname(fromRelPath), specifier)));
  } else {
    return null;
  }

  const suffixes = [
    "",
    ".ts",
    ".tsx",
    ".js",
    ".jsx",
    ".mjs",
    ".cjs",
    ".mts",
    ".cts",
    "/index.ts",
    "/index.tsx",
    "/index.js",
    "/index.mjs",
  ];

  for (const candidate of candidates) {
    for (const suffix of suffixes) {
      const normalized = normalize(candidate + suffix);
      if (fileSet.has(normalized)) {
        return normalized;
      }
    }
  }

  return null;
}
