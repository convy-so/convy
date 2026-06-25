export type AuditAction = "keep" | "merge" | "split" | "rename" | "defer";

export type AuditRow = {
  path: string;
  ownerArea: string;
  fileRole: string;
  boundary: string;
  purpose: string;
  action: AuditAction;
  batch: string;
  tags: string[];
  lineCount: number;
  imports: string[];
  directDependents: string[];
  importCount: number;
  dependentCount: number;
};

export type AuditSummary = {
  generatedAt: string;
  fileCount: number;
  actions: Record<string, number>;
  batches: Record<string, number>;
  ownerAreas: Record<string, number>;
  topHotspots: Array<{
    path: string;
    action: AuditAction;
    lineCount: number;
    tags: string[];
    batch: string;
  }>;
};
