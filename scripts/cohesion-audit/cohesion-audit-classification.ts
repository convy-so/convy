import path from "node:path";

import { frameworkFilenames, genericBaseNames } from "./cohesion-audit-files";
import type { AuditAction } from "./audit-types";

export function getOwnerArea(relPath: string) {
  const parts = relPath.split("/");

  if (parts[0] === "features") {
    return parts.length >= 2 ? `features/${parts[1]}` : "features";
  }

  if (parts[0] === "shared") {
    return parts.length >= 2 ? `shared/${parts[1]}` : "shared";
  }

  if (parts[0] === "app") {
    if (relPath.startsWith("app/api/")) {
      return "app/api";
    }
    if (relPath.startsWith("app/actions/")) {
      return "app/actions";
    }
    return "app";
  }

  if (parts[0] === "i18n") {
    return "i18n";
  }

  if (parts[0] === "scripts") {
    return "scripts";
  }

  if (parts[0] === "docker") {
    return "docker";
  }

  return "root";
}

function humanizeSegment(segment: string) {
  return segment
    .replace(/\.[^.]+$/, "")
    .replace(/^\[(.+)\]$/, "$1")
    .replace(/^\[\[\.\.\.(.+)\]\]$/, "$1")
    .replace(/^\[\.\.\.(.+)\]$/, "$1")
    .replace(/[-_]/g, " ")
    .trim();
}

function humanizeTrail(relPath: string) {
  const segments = relPath.split("/");
  const trail = segments
    .filter((segment) => !["app", "features", "shared", "i18n", "scripts", "docker"].includes(segment))
    .slice(-3)
    .map(humanizeSegment)
    .filter(Boolean)
    .join(" ");

  return trail || humanizeSegment(path.basename(relPath));
}

export function classifyFileRole(relPath: string, fileName: string) {
  if (relPath === "shared/db/schema.ts") {
    return "schema";
  }
  if (relPath.includes("/tests/") || relPath.endsWith(".test.ts") || relPath.endsWith(".test.tsx")) {
    return "test";
  }
  if (relPath.includes("/migrations/") || relPath.endsWith(".sql")) {
    return "migration";
  }
  if (relPath.includes("/schema/")) {
    return "schema";
  }
  if (relPath.includes("/workers/")) {
    return relPath.endsWith("/index.ts") || relPath.endsWith("/worker-runtime.ts")
      ? "worker-entrypoint"
      : "worker-module";
  }
  if (relPath.includes("/prompts/")) {
    return "prompt-module";
  }
  if (relPath.includes("/email/") || relPath.includes("/templates/")) {
    return "email-template";
  }
  if (relPath.includes("/client/hooks/") || fileName.startsWith("use-")) {
    return "client-hook";
  }
  if (relPath.includes("/ui/")) {
    return fileName.endsWith("-client.tsx") ? "page-client" : "ui-component";
  }
  if (relPath.includes("/server/actions/") || relPath.startsWith("app/actions/")) {
    return "server-action";
  }
  if (relPath.startsWith("app/api/") && fileName === "route.ts") {
    return "api-route";
  }
  if (fileName === "page.tsx") {
    return "page";
  }
  if (fileName === "layout.tsx") {
    return "layout";
  }
  if (frameworkFilenames.has(fileName)) {
    return "framework-boundary";
  }
  if (/public-(client|server|ui)\.ts$/.test(relPath)) {
    return "public-entrypoint";
  }
  if (relPath.startsWith("scripts/") || relPath.startsWith("docker/")) {
    return "script";
  }
  if (
    relPath.startsWith("shared/config/") ||
    relPath.startsWith("shared/db/") ||
    relPath.startsWith("shared/http/") ||
    relPath.startsWith("shared/infra/") ||
    relPath.startsWith("shared/security/")
  ) {
    return "shared-service";
  }
  if (relPath.includes("/server/")) {
    return "server-module";
  }
  if (relPath.startsWith("shared/")) {
    return "shared-module";
  }
  if (relPath.startsWith("features/")) {
    return "feature-module";
  }
  if (relPath.startsWith("app/")) {
    return "route-local module";
  }

  return "config-module";
}

export function classifyBoundary(relPath: string, fileRole: string) {
  if (fileRole === "api-route" || fileRole === "page" || fileRole === "layout" || fileRole === "framework-boundary") {
    return "framework boundary";
  }
  if (fileRole === "public-entrypoint") {
    return "public feature boundary";
  }
  if (fileRole === "schema" || fileRole === "migration") {
    return "data boundary";
  }
  if (fileRole === "worker-entrypoint") {
    return "runtime entrypoint";
  }
  if (relPath.endsWith("/index.ts") || relPath.endsWith("/index.tsx")) {
    return "public shared boundary";
  }
  return "private module";
}

export function buildPurpose(relPath: string, ownerArea: string, fileRole: string) {
  const subject = humanizeTrail(relPath);

  switch (fileRole) {
    case "api-route":
      return `Handles the ${subject} API route.`;
    case "page":
      return `Renders the ${subject} page.`;
    case "layout":
      return `Composes the ${subject} layout.`;
    case "framework-boundary":
      return `Defines the ${subject} framework boundary.`;
    case "route-local module":
      return `Supports the ${subject} route-local workflow.`;
    case "server-action":
      return `Exposes the ${subject} server actions.`;
    case "public-entrypoint":
      return `Defines the public entrypoint for ${ownerArea}.`;
    case "client-hook":
      return `Provides the ${subject} client hook for ${ownerArea}.`;
    case "ui-component":
      return `Renders the ${subject} interface for ${ownerArea}.`;
    case "page-client":
      return `Owns the ${subject} page client for ${ownerArea}.`;
    case "schema":
      return `Defines the ${subject} database schema.`;
    case "migration":
      return `Applies the ${subject} database migration.`;
    case "email-template":
      return `Defines the ${subject} email template.`;
    case "test":
      return `Verifies the ${subject} behavior.`;
    case "worker-entrypoint":
      return `Starts the ${subject} worker runtime.`;
    case "worker-module":
      return `Implements the ${subject} worker behavior.`;
    case "prompt-module":
      return `Defines the ${subject} prompt module.`;
    case "script":
      return `Runs the ${subject} maintenance workflow.`;
    case "server-module":
      return `Owns the ${subject} server workflow for ${ownerArea}.`;
    case "shared-service":
      return `Provides the ${subject} shared infrastructure for the repo.`;
    case "shared-module":
      return `Provides the ${subject} shared module for the repo.`;
    case "feature-module":
      return `Supports the ${subject} feature workflow in ${ownerArea}.`;
    default:
      return `Defines the ${subject} configuration for the repo.`;
  }
}

function isBatchFScope(ownerArea: string, fileRole: string, relPath: string) {
  return (
    ownerArea === "root" ||
    ownerArea === "i18n" ||
    ownerArea === "scripts" ||
    ownerArea === "docker" ||
    fileRole === "test" ||
    fileRole === "worker-entrypoint" ||
    fileRole === "worker-module" ||
    fileRole === "schema" ||
    fileRole === "migration" ||
    relPath.includes("/tests/") ||
    relPath.includes("/workers/") ||
    relPath.includes("/schema/") ||
    relPath.includes("/migrations/")
  );
}

export function classifyBatch(ownerArea: string, relPath: string, fileRole: string) {
  if (isBatchFScope(ownerArea, fileRole, relPath)) {
    return "Batch F";
  }
  if (ownerArea.startsWith("shared/")) {
    return "Batch A";
  }
  if (ownerArea === "features/tutoring") {
    return "Batch B";
  }
  if (ownerArea === "features/surveys") {
    return "Batch C";
  }
  if (ownerArea.startsWith("app")) {
    return "Batch D";
  }
  if (ownerArea.startsWith("features/")) {
    return "Batch E";
  }
  return "Batch F";
}

function isMutationScope(ownerArea: string) {
  return ownerArea.startsWith("app") || ownerArea.startsWith("features/") || ownerArea.startsWith("shared/");
}

function isPureReExport(content: string) {
  const trimmed = content.trim();
  if (!trimmed) {
    return false;
  }

  const stripped = trimmed
    .replace(/import\s+"[^"]+";?/g, "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return stripped.length > 0 && stripped.every((line) => line.startsWith("export "));
}

function fileHasRouteShellLeakage(relPath: string, fileRole: string, content: string, lineCount: number) {
  if (!relPath.startsWith("app/")) {
    return false;
  }
  if (fileRole !== "api-route" && fileRole !== "page" && fileRole !== "page-client") {
    return false;
  }
  if (lineCount < 120) {
    return false;
  }
  return /getDb|query\.|insert\(|update\(|delete\(|generateStructuredOutput|createUIMessageStream/.test(content);
}

function hasCrossFeatureBoundaryLeak(ownerArea: string, imports: string[]) {
  if (!ownerArea.startsWith("features/")) {
    return false;
  }

  const sourceFeature = ownerArea.split("/")[1];
  return imports.some((specifier) => {
    if (!specifier.startsWith("@/features/")) {
      return false;
    }

    const [, , targetFeature, targetFile] = specifier.split("/");
    if (!targetFeature || targetFeature === sourceFeature) {
      return false;
    }

    return !(targetFile?.startsWith("public-"));
  });
}

export function buildTags(params: {
  relPath: string;
  baseName: string;
  fileRole: string;
  content: string;
  lineCount: number;
  imports: string[];
  dependentCount: number;
  ownerArea: string;
  boundary: string;
}) {
  const tags = new Set<string>();
  const exportCount = (params.content.match(/\bexport\b/g) ?? []).length;

  if (params.lineCount >= 700) {
    if (["schema", "migration", "prompt-module"].includes(params.fileRole)) {
      tags.add("oversized but cohesive");
    } else {
      tags.add("oversized and mixed-concern");
    }
  } else if (
    params.lineCount >= 400 &&
    ["api-route", "page-client", "server-module", "shared-service"].includes(params.fileRole)
  ) {
    tags.add("oversized and mixed-concern");
  }

  if (
    params.lineCount < 25 &&
    params.boundary === "private module" &&
    ![
      "config-module",
      "schema",
      "migration",
      "test",
      "script",
      "worker-entrypoint",
      "worker-module",
    ].includes(params.fileRole) &&
    (isPureReExport(params.content) || (params.dependentCount <= 1 && exportCount <= 3))
  ) {
    tags.add("undersized/private wrapper");
  }

  if (genericBaseNames.has(params.baseName)) {
    tags.add("generic naming");
  }

  if (fileHasRouteShellLeakage(params.relPath, params.fileRole, params.content, params.lineCount)) {
    tags.add("route-shell leakage");
  }

  if (hasCrossFeatureBoundaryLeak(params.ownerArea, params.imports)) {
    tags.add("cross-feature boundary leak");
  }

  if (params.dependentCount >= 8 || params.imports.length >= 15) {
    tags.add("dense dependency hub");
  }

  return [...tags].sort();
}

export function classifyAction(params: {
  lineCount: number;
  tags: string[];
  ownerArea: string;
  boundary: string;
  content: string;
  batch: string;
  fileRole: string;
}) {
  const mutationScope = isMutationScope(params.ownerArea);
  const largeMixedConcern = params.tags.includes("oversized and mixed-concern");
  const genericNaming = params.tags.includes("generic naming");
  const undersizedWrapper = params.tags.includes("undersized/private wrapper");
  const routeShellLeakage = params.tags.includes("route-shell leakage");

  if (params.batch === "Batch F") {
    return largeMixedConcern || routeShellLeakage
      ? ("defer" satisfies AuditAction)
      : ("keep" satisfies AuditAction);
  }

  if (!mutationScope && (largeMixedConcern || genericNaming || undersizedWrapper || routeShellLeakage)) {
    return "defer" satisfies AuditAction;
  }
  if (undersizedWrapper) {
    return "merge" satisfies AuditAction;
  }
  if (genericNaming && params.boundary === "private module") {
    return "rename" satisfies AuditAction;
  }
  if (largeMixedConcern || routeShellLeakage) {
    return "split" satisfies AuditAction;
  }
  if (
    params.lineCount >= 700 &&
    params.fileRole !== "schema" &&
    params.fileRole !== "migration" &&
    !params.content.includes("drizzleTable")
  ) {
    return mutationScope ? "split" : "defer";
  }
  return mutationScope ? "keep" : "defer";
}
