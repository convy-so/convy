/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const path = require("path");

const rootDir = process.cwd();
const mode = process.argv[2] ?? "all";
const allowlistPath = path.join(rootDir, "docs", "structure-audit-allowlist.json");
const allowlist = JSON.parse(fs.readFileSync(allowlistPath, "utf8"));
const appOutsideRouteLocalSet = new Set(allowlist.appOutsideRouteLocal.map(normalize));

const codeExtensions = new Set([".ts", ".tsx", ".js", ".mjs"]);
const frameworkFilenames = new Set([
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
const bannedGenericFilenames = new Set([
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
]);
const allowedFeatureRoots = new Set([
  "admin",
  "auth",
  "feedback",
  "marketing",
  "privacy",
  "settings",
  "surveys",
  "tutoring",
]);
const allowedSharedRoots = new Set([
  "ai",
  "auth",
  "billing",
  "chat",
  "config",
  "db",
  "email",
  "feedback",
  "http",
  "i18n",
  "infra",
  "privacy",
  "realtime",
  "retrieval",
  "security",
  "surveys",
  "tutoring",
  "ui",
  "utils",
]);
const forbiddenDirectories = [
  "features/dashboard",
  "features/expert",
  "shared/hooks",
  "shared/realtime-server",
  "shared/server",
  "shared/workers",
];

function normalize(filePath) {
  return filePath.split(path.sep).join("/");
}

function relative(filePath) {
  return normalize(path.relative(rootDir, filePath));
}

function listFiles(dirPath) {
  const results = [];
  if (!fs.existsSync(dirPath)) {
    return results;
  }

  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (
      entry.name === ".git" ||
      entry.name === ".next" ||
      entry.name === "node_modules" ||
      entry.name === "dist"
    ) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      results.push(...listFiles(fullPath));
      continue;
    }

    results.push(fullPath);
  }

  return results;
}

function loadImports(filePath) {
  const content = fs.readFileSync(filePath, "utf8");
  const imports = [];
  const pattern = /(?:import|export)\s+(?:[^"'`]*?\s+from\s+)?["']([^"']+)["']/g;

  for (const match of content.matchAll(pattern)) {
    imports.push(match[1]);
  }

  return imports;
}

function getTopLevelDirectories(parentDir) {
  if (!fs.existsSync(parentDir)) {
    return [];
  }

  return fs
    .readdirSync(parentDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => entry.name !== "dist")
    .map((entry) => entry.name)
    .sort();
}

function pushIssue(issues, message) {
  issues.push(message);
}

function isPublicFeatureEntrypoint(specifier) {
  return /^@\/features\/[^/]+\/public-[^/]+$/.test(specifier);
}

function hasRouteLocalOwner(filePath) {
  const directoryPath = path.dirname(filePath);

  return fs.readdirSync(directoryPath, { withFileTypes: true }).some((entry) => {
    if (!entry.isFile()) {
      return false;
    }

    const siblingPath = path.join(directoryPath, entry.name);
    const siblingRelativePath = relative(siblingPath);

    return (
      frameworkFilenames.has(entry.name) ||
      appOutsideRouteLocalSet.has(siblingRelativePath)
    );
  });
}

function runStructureAudit() {
  const issues = [];

  for (const dir of forbiddenDirectories) {
    if (fs.existsSync(path.join(rootDir, dir))) {
      pushIssue(issues, `Forbidden legacy directory remains: ${dir}`);
    }
  }

  for (const dir of getTopLevelDirectories(path.join(rootDir, "features"))) {
    if (!allowedFeatureRoots.has(dir)) {
      pushIssue(issues, `Unexpected top-level feature directory: features/${dir}`);
    }
  }

  for (const dir of getTopLevelDirectories(path.join(rootDir, "shared"))) {
    if (!allowedSharedRoots.has(dir)) {
      pushIssue(issues, `Unexpected top-level shared directory: shared/${dir}`);
    }
  }

  const files = listFiles(rootDir).filter((filePath) => {
    const rel = relative(filePath);
    return (
      rel.startsWith("app/") ||
      rel.startsWith("features/") ||
      rel.startsWith("shared/")
    );
  });

  for (const filePath of files) {
    const rel = relative(filePath);
    const ext = path.extname(filePath);
    const baseName = path.basename(filePath, ext);
    const filename = path.basename(filePath);

    if (!codeExtensions.has(ext)) {
      continue;
    }

    if (
      bannedGenericFilenames.has(baseName) &&
      !allowlist.genericFilenames.includes(rel)
    ) {
      pushIssue(issues, `Banned generic filename outside allowlist: ${rel}`);
    }

    if (
      baseName !== baseName.toLowerCase() &&
      !frameworkFilenames.has(filename) &&
      !allowlist.pascalCaseFilenames.includes(rel)
    ) {
      pushIssue(issues, `PascalCase filename outside allowlist: ${rel}`);
    }
  }

  return issues;
}

function runImportAudit() {
  const issues = [];
  const files = listFiles(rootDir).filter((filePath) => codeExtensions.has(path.extname(filePath)));

  for (const filePath of files) {
    const rel = relative(filePath);
    const imports = loadImports(filePath);
    const appFileAllowedByException = allowlist.appOutsideRouteLocal.includes(rel);

    if (rel.startsWith("shared/")) {
      for (const specifier of imports) {
        if (
          specifier.startsWith("@/features/") &&
          !isPublicFeatureEntrypoint(specifier) &&
          !allowlist.sharedFeatureImports.includes(rel)
        ) {
          pushIssue(
            issues,
            `Shared module imports a feature module outside allowlist: ${rel} -> ${specifier}`,
          );
        }
      }
    }

    if (rel.startsWith("features/")) {
      const [, sourceFeature] = rel.split("/");
      for (const specifier of imports) {
        if (!specifier.startsWith("@/features/")) {
          continue;
        }

        const targetFeature = specifier.split("/")[2];
        if (targetFeature && targetFeature !== sourceFeature) {
          if (isPublicFeatureEntrypoint(specifier)) {
            continue;
          }
          const allowedImports = allowlist.crossFeatureImports[rel] ?? [];
          if (!allowedImports.includes(specifier)) {
            pushIssue(
              issues,
              `Feature imports another feature's internal module: ${rel} -> ${specifier}`,
            );
          }
        }
      }
    }

    if (rel.startsWith("app/")) {
      const filename = path.basename(rel);
      const isFrameworkFile = frameworkFilenames.has(filename);
      const isRouteLocalSupportFile =
        rel.includes("/_components/") ||
        rel.includes("/_lib/") ||
        hasRouteLocalOwner(filePath) ||
        rel.startsWith("app/api/") ||
        rel.startsWith("app/actions/");

      if (!isFrameworkFile && !isRouteLocalSupportFile && !appFileAllowedByException) {
        pushIssue(
          issues,
          `App file sits outside route-local _components/_lib and is not allowlisted: ${rel}`,
        );
      }
    }
  }

  return issues;
}

const issues = [
  ...(mode === "structure" || mode === "all" ? runStructureAudit() : []),
  ...(mode === "imports" || mode === "all" ? runImportAudit() : []),
];

if (issues.length > 0) {
  console.error(`Structure audit failed with ${issues.length} issue(s):`);
  for (const issue of issues) {
    console.error(`- ${issue}`);
  }
  process.exit(1);
}

console.log(`Structure audit passed (${mode}).`);
