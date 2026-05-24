/**
 * Diagnostic: step-by-step upload pipeline test
 *
 * This script walks through each stage of processLearningMaterialUploadAttempt
 * one by one so we can pin-point exactly which step is throwing.
 *
 * Run:  npx tsx --env-file=.env scratch/test-upload-pipeline.ts
 */

import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  topicMaterialUploadAttempts,
  topicMaterials,
  learningTopics,
  users,
} from "@/db/schema";
import { downloadLearningMaterial } from "@/lib/storage";
import {
  extractLearningMaterialText,
  analyzeLearningMaterial,
} from "@/lib/learning/materials";
import { generateBatchEmbeddings } from "@/lib/rag/embeddings";
import { prepareEmbeddingsForIndexing } from "@/lib/rag/core";

function sep(label: string) {
  console.log("\n" + "─".repeat(60));
  console.log(`  ${label}`);
  console.log("─".repeat(60));
}

function ok(msg: string, data?: unknown) {
  console.log(`  ✅  ${msg}`, data !== undefined ? data : "");
}

function fail(msg: string, err: unknown) {
  console.error(`  ❌  ${msg}`);
  if (err instanceof Error) {
    console.error("     message:", err.message);
    // node-postgres wraps the real PG error in .cause
    const cause = (err as any).cause;
    if (cause) {
      console.error("     cause.message:", cause.message);
      console.error("     cause.code   :", cause.code);
      console.error("     cause.detail :", cause.detail);
      console.error("     cause.hint   :", cause.hint);
      console.error("     cause.table  :", cause.table);
      console.error("     cause.constraint:", cause.constraint);
    }
    // Drizzle sometimes attaches query info differently
    const drizzleCause = (err as any).drizzle;
    if (drizzleCause) console.error("     drizzle:", drizzleCause);
  } else {
    console.error("     raw error:", err);
  }
}

async function main() {
  const db = getDb();

  // ── 0. Find the most recent FAILED attempt ──────────────────────────────────
  sep("STEP 0 — fetch most recent failed upload attempt");
  const failedAttempt = await db.query.topicMaterialUploadAttempts.findFirst({
    where: eq(topicMaterialUploadAttempts.status, "failed"),
    orderBy: (t, { desc }) => [desc(t.createdAt)],
  });

  if (!failedAttempt) {
    console.log("  No failed attempts found — nothing to diagnose.");
    process.exit(0);
  }

  ok("Found failed attempt", {
    id: failedAttempt.id,
    topicId: failedAttempt.topicId,
    uploadedByUserId: failedAttempt.uploadedByUserId,
    stage: failedAttempt.stage,
    failureMessage: failedAttempt.failureMessage,
    storagePath: failedAttempt.storagePath,
    fileName: failedAttempt.fileName,
    mimeType: failedAttempt.mimeType,
  });

  const { topicId, uploadedByUserId, storagePath, fileName, mimeType } =
    failedAttempt;

  // ── 1. Verify that the FK references exist ──────────────────────────────────
  sep("STEP 1 — verify FK references (user + topic)");

  try {
    const user = await db.query.users.findFirst({
      where: eq(users.id, uploadedByUserId),
      columns: { id: true, email: true },
    });
    if (user) ok("User exists in DB", user);
    else console.error("  ❌  User NOT found in users table!", { uploadedByUserId });
  } catch (err) {
    fail("User lookup failed", err);
  }

  try {
    const topic = await db.query.learningTopics.findFirst({
      where: eq(learningTopics.id, topicId),
      columns: { id: true, title: true, classroomId: true },
    });
    if (topic) ok("Topic exists in DB", topic);
    else console.error("  ❌  Topic NOT found in learning_topics!", { topicId });
  } catch (err) {
    fail("Topic lookup failed", err);
  }

  // ── 2. Attempt a test INSERT into topic_material_upload_attempts ────────────
  sep("STEP 2 — test INSERT into topic_material_upload_attempts");
  const testId = `diag-test-${Date.now()}`;
  try {
    const [inserted] = await db
      .insert(topicMaterialUploadAttempts)
      .values({
        id: testId,
        batchId: "diag-batch",
        topicId,
        uploadedByUserId,
        fileName: failedAttempt.fileName ?? "test.pdf",
        mimeType: failedAttempt.mimeType ?? null,
        sizeBytes: failedAttempt.sizeBytes ?? null,
        storageBucket: failedAttempt.storageBucket ?? null,
        storagePath: failedAttempt.storagePath ?? null,
        status: "queued",
        stage: "upload",
        failureMessage: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: topicMaterialUploadAttempts.id });

    ok("INSERT succeeded", inserted);

    // Clean up the test row immediately
    await db
      .delete(topicMaterialUploadAttempts)
      .where(eq(topicMaterialUploadAttempts.id, testId));
    ok("Cleanup: test row deleted");
  } catch (err) {
    fail("INSERT into topic_material_upload_attempts FAILED", err);
  }

  // ── 3. Download the file from storage ──────────────────────────────────────
  sep("STEP 3 — download file from Supabase storage");
  if (!storagePath) {
    console.log("  ⚠️  No storage path on this attempt — skipping download.");
    process.exit(0);
  }

  let fileBuffer: Buffer | null = null;
  try {
    fileBuffer = await downloadLearningMaterial(storagePath);
    ok(`Downloaded ${fileBuffer.length} bytes from storage`);
  } catch (err) {
    fail("Storage download FAILED", err);
    process.exit(1);
  }

  // ── 4. Extract text ─────────────────────────────────────────────────────────
  sep("STEP 4 — extract text from file (Gemini)");
  let extractedText = "";
  try {
    extractedText = await extractLearningMaterialText({
      buffer: fileBuffer,
      filename: fileName ?? "file.pdf",
      mimeType: mimeType ?? "application/pdf",
    });
    ok(`Extracted ${extractedText.length} chars`);
  } catch (err) {
    fail("Text extraction FAILED", err);
    process.exit(1);
  }

  // ── 5. Analyze material ─────────────────────────────────────────────────────
  sep("STEP 5 — analyze material (Gemini)");
  let analysis: Record<string, unknown> | null = null;
  try {
    const topic = await db.query.learningTopics.findFirst({
      where: eq(learningTopics.id, topicId),
    });
    if (!topic) throw new Error("Topic not found for analysis");

    analysis = await analyzeLearningMaterial({
      topicTitle: topic.title,
      topicDescription: topic.description,
      learningOutcomes: (topic.learningOutcomes ?? []) as Array<{ title: string; description: string }>,
      materialText: extractedText,
    });
    ok("Analysis succeeded", { keys: Object.keys(analysis) });
  } catch (err) {
    fail("Material analysis FAILED", err);
    process.exit(1);
  }

  // ── 6. Generate embeddings ──────────────────────────────────────────────────
  sep("STEP 6 — generate embeddings (Voyage AI)");
  try {
    const chunks = await prepareEmbeddingsForIndexing({
      content: extractedText,
      chunkOptions: { maxTokens: 350 },
      headerEntries: [{ label: "Test", value: "diagnostic" }],
      attribution: { feature: "diagnostic-test" },
    });
    ok(`Generated ${chunks.length} embedding chunks`);
  } catch (err) {
    fail("Embedding generation FAILED", err);
    process.exit(1);
  }

  // ── 7. INSERT into topic_materials ─────────────────────────────────────────
  sep("STEP 7 — INSERT into topic_materials");
  const materialTestId = `diag-mat-${Date.now()}`;
  try {
    const [mat] = await db
      .insert(topicMaterials)
      .values({
        id: materialTestId,
        topicId,
        uploadedByUserId,
        title: failedAttempt.fileName ?? "Test",
        description: null,
        materialKind: "pdf",
        storageBucket: failedAttempt.storageBucket ?? null,
        storagePath: storagePath,
        publicUrl: `/api/media/learning/${materialTestId}`,
        mimeType: mimeType ?? "application/pdf",
        sizeBytes: failedAttempt.sizeBytes ?? null,
        extractionStatus: "completed",
        extractionError: null,
        indexingStatus: "processing",
        indexingError: null,
        extractedText,
        analysis,
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .returning({ id: topicMaterials.id });

    ok("INSERT into topic_materials succeeded", mat);

    // Clean up
    await db.delete(topicMaterials).where(eq(topicMaterials.id, materialTestId));
    ok("Cleanup: test material deleted");
  } catch (err) {
    fail("INSERT into topic_materials FAILED", err);
  }

  sep("DIAGNOSTIC COMPLETE");
  console.log("  If all steps above show ✅, the issue is intermittent / env-related.");
  console.log("  If a step shows ❌, that is where the pipeline is breaking.\n");
}

main().catch((err) => {
  console.error("Unhandled error in diagnostic:", err);
  process.exit(1);
});
