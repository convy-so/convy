"use client";

import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import toast from "react-hot-toast";

import {
  normalizeLearningOutcomesAction,
  updateLessonDetailsAction,
} from "@/app/actions/classroom";
import { retryLessonMaterialUploadAttempt } from "@/features/tutoring/public-client";
import { getSubjectDisplayLabel } from "@/features/tutoring/server/subject-packages";
import {
  formatOutcomesForNotes,
  parseOutcomeNotes,
  toOutcomeDrafts,
  toOutcomePayload,
} from "@/features/tutoring/ui/lesson-editor-helpers";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { queryKeys } from "@/shared/http/query-keys";
import { appLocaleLabels } from "@/shared/i18n/config";

import { TeacherLessonOverviewPanel } from "./overview-panel";
import { TeacherLessonReportsPanel } from "./reports-panel";
import { TeacherLessonStudentsPanel } from "./students-panel";
import type { TeacherLessonWorkspaceProps } from "./workspace-model";

export function TeacherLessonWorkspace({
  selectedDirectoryClassroom,
  selectedLesson,
  reports,
  materials,
  students,
  activeLessonView,
  setActiveLessonView,
  updateLessonStatusMutation,
  materialTitle,
  setMaterialTitle,
  materialDescription,
  setMaterialDescription,
  materialFiles,
  setMaterialFiles,
  materialUploadAttempts,
  activationState,
  isActivationStateLoading,
  isActivationStateError,
  uploadMaterialMutation,
  setIsInviteModalOpen,
}: TeacherLessonWorkspaceProps) {
  const queryClient = useQueryClient();
  const lessonSubjectLabel =
    selectedLesson.courseTitle ?? getSubjectDisplayLabel(null);
  const lessonLocaleLabel =
    appLocaleLabels[
      (selectedLesson.contentLocale ?? "en") as keyof typeof appLocaleLabels
    ];
  const [rawOutcomeNotes, setRawOutcomeNotes] = useState(
    formatOutcomesForNotes(toOutcomeDrafts(selectedLesson.learningOutcomes ?? [])),
  );
  const [sessionTitle, setSessionTitle] = useState(selectedLesson.title);
  const [isSavingSessionTitle, setIsSavingSessionTitle] = useState(false);
  const [outcomeReviewNotes, setOutcomeReviewNotes] = useState<string[]>([]);
  const [isGeneratingOutcomes, setIsGeneratingOutcomes] = useState(false);
  const [isSavingOutcomes, setIsSavingOutcomes] = useState(false);
  const [retryingAttemptId, setRetryingAttemptId] = useState<string | null>(null);

  const visibleUploadAttempts = materialUploadAttempts.filter(
    (attempt) => attempt.status !== "succeeded",
  );
  const isActivationEligibleLesson =
    selectedLesson.status === "draft" || selectedLesson.status === "paused";
  const isActivationReady = activationState?.ready ?? false;
  const canActivate = isActivationEligibleLesson && isActivationReady;
  const canPause = selectedLesson.status === "active";
  const canArchive = selectedLesson.status === "active";

  let statusHint = isActivationStateLoading
    ? "Checking whether this session is ready to activate."
    : "To activate this session, add at least one learning outcome and one supporting material.";
  if (selectedLesson.status === "active") {
    statusHint = "This session is live for tutoring. You can pause it or archive it.";
  } else if (selectedLesson.status === "archived") {
    statusHint = "This session is archived and no longer active for students.";
  } else if (isActivationStateLoading) {
    statusHint = "Checking whether this session is ready to activate.";
  } else if (isActivationStateError) {
    statusHint =
      "Could not verify activation readiness right now. Refresh the page to try again.";
  } else if (selectedLesson.status === "paused") {
    statusHint = isActivationReady
      ? "This session is paused. Resume it when students should access it again."
      : activationState?.reason ??
        "This session is paused, but the required setup is incomplete.";
  } else if (activationState?.reason) {
    statusHint = activationState.reason;
  } else if (isActivationReady) {
    statusHint = "This session is ready to activate.";
  }

  useEffect(() => {
    setSessionTitle(selectedLesson.title);
    const nextDrafts = toOutcomeDrafts(selectedLesson.learningOutcomes ?? []);
    setRawOutcomeNotes(formatOutcomesForNotes(nextDrafts));
    setOutcomeReviewNotes([]);
  }, [selectedLesson.id, selectedLesson.title, selectedLesson.learningOutcomes]);

  const invalidateLessonData = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.tutoring.lessons(selectedDirectoryClassroom.id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tutoring.activationState(selectedLesson.id),
      }),
    ]);
  };

  const refreshMaterialState = async () => {
    await Promise.all([
      queryClient.invalidateQueries({
        queryKey: queryKeys.tutoring.materials(selectedLesson.id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tutoring.materialUploadAttempts(selectedLesson.id),
      }),
      queryClient.invalidateQueries({
        queryKey: queryKeys.tutoring.activationState(selectedLesson.id),
      }),
    ]);
  };

  const handleRetryAttempt = async (attemptId: string) => {
    setRetryingAttemptId(attemptId);

    try {
      const result = await retryLessonMaterialUploadAttempt({
        lessonId: selectedLesson.id,
        attemptId,
      });

      await refreshMaterialState();

      if (result.data.attempt.status === "queued") {
        toast.success("Material retry queued");
      } else {
        toast.error(
          result.data.attempt.userMessage ??
            result.data.attempt.failureMessage ??
            "This file could not be re-queued.",
        );
      }
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to retry this upload",
      );
    } finally {
      setRetryingAttemptId(null);
    }
  };

  const handleSaveSessionTitle = async () => {
    const nextTitle = sessionTitle.trim();

    if (nextTitle.length < 2) {
      toast.error("Session title must be at least 2 characters.");
      return;
    }

    setIsSavingSessionTitle(true);

    try {
      const result = await updateLessonDetailsAction({
        lessonId: selectedLesson.id,
        title: nextTitle,
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setSessionTitle(result.data.title);
      await invalidateLessonData();
      toast.success("Session title updated");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to update session title",
      );
    } finally {
      setIsSavingSessionTitle(false);
    }
  };

  const handleGenerateOutcomes = async () => {
    const notes = rawOutcomeNotes.trim();

    if (!notes) {
      toast.error("Add the teacher's learning goal notes first.");
      return;
    }

    setIsGeneratingOutcomes(true);

    try {
      const result = await normalizeLearningOutcomesAction({
        lessonId: selectedLesson.id,
        rawNotes: notes,
        title: selectedLesson.title,
        description: selectedLesson.description ?? "",
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setRawOutcomeNotes(formatOutcomesForNotes(result.data.outcomes));
      setOutcomeReviewNotes(
        result.data.outcomes
          .map((outcome) => outcome.reviewNote)
          .filter((note): note is string => Boolean(note)),
      );
      toast.success("Learning outcomes rewritten");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to generate outcomes",
      );
    } finally {
      setIsGeneratingOutcomes(false);
    }
  };

  const handleSaveOutcomes = async () => {
    const normalizedOutcomes = toOutcomePayload(parseOutcomeNotes(rawOutcomeNotes));

    if (!normalizedOutcomes.length) {
      toast.error("Add at least one learning outcome before saving.");
      return;
    }

    setIsSavingOutcomes(true);

    try {
      const result = await updateLessonDetailsAction({
        lessonId: selectedLesson.id,
        learningOutcomes: normalizedOutcomes,
      });

      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      setRawOutcomeNotes(formatOutcomesForNotes(normalizedOutcomes));
      setOutcomeReviewNotes([]);
      await invalidateLessonData();
      toast.success("Learning outcomes saved");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to save outcomes",
      );
    } finally {
      setIsSavingOutcomes(false);
    }
  };

  const uploadMaterial = () => {
    uploadMaterialMutation.mutate(
      {
        lessonId: selectedLesson.id,
        files: materialFiles,
        title: materialTitle || undefined,
        description: materialDescription || undefined,
      },
      {
        onSuccess: () => {
          setMaterialTitle("");
          setMaterialDescription("");
          setMaterialFiles([]);
        },
      },
    );
  };

  return (
    <>
      <div className="border-b border-slate-200">
        <nav className="-mb-px flex flex-wrap items-center gap-6">
          {(
            [
              ["overview", "Overview", null],
              ["reports", "Reports", reports.length],
              ["students", "Students", students.length],
            ] as const
          ).map(([view, label, count]) => (
            <button
              key={view}
              type="button"
              onClick={() => setActiveLessonView(view)}
              className={`inline-flex items-center gap-2 border-b-2 px-1 py-3 text-sm font-medium transition-colors ${
                activeLessonView === view
                  ? "border-slate-950 text-slate-950"
                  : "border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700"
              }`}
            >
              {label}
              {count != null ? (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs text-slate-500">
                  {count}
                </span>
              ) : null}
            </button>
          ))}
        </nav>
      </div>

      {activeLessonView === "overview" ? (
        <TeacherLessonOverviewPanel
          classroomTitle={selectedDirectoryClassroom.title}
          lessonStatus={selectedLesson.status}
          lessonSubjectLabel={lessonSubjectLabel}
          lessonLocaleLabel={lessonLocaleLabel}
          sessionTitle={sessionTitle}
          setSessionTitle={setSessionTitle}
          selectedLessonTitle={selectedLesson.title}
          rawOutcomeNotes={rawOutcomeNotes}
          setRawOutcomeNotes={(value) => {
            setRawOutcomeNotes(value);
            setOutcomeReviewNotes([]);
          }}
          outcomeReviewNotes={outcomeReviewNotes}
          materials={materials}
          materialTitle={materialTitle}
          setMaterialTitle={setMaterialTitle}
          materialDescription={materialDescription}
          setMaterialDescription={setMaterialDescription}
          materialFiles={materialFiles}
          setMaterialFiles={setMaterialFiles}
          visibleUploadAttempts={visibleUploadAttempts}
          retryingAttemptId={retryingAttemptId}
          handleRetryAttempt={handleRetryAttempt}
          handleSaveSessionTitle={handleSaveSessionTitle}
          handleGenerateOutcomes={handleGenerateOutcomes}
          handleSaveOutcomes={handleSaveOutcomes}
          uploadMaterial={uploadMaterial}
          statusHint={statusHint}
          isActivationEligibleLesson={isActivationEligibleLesson}
          isActivationStateLoading={isActivationStateLoading}
          isActivationReady={isActivationReady}
          canActivate={canActivate}
          canPause={canPause}
          canArchive={canArchive}
          isActivationStateError={isActivationStateError}
          updateLessonStatus={(status) =>
            updateLessonStatusMutation.mutate({
              lessonId: selectedLesson.id,
              status,
            })
          }
          isUpdateLessonStatusPending={updateLessonStatusMutation.isPending}
          isSavingSessionTitle={isSavingSessionTitle}
          isGeneratingOutcomes={isGeneratingOutcomes}
          isSavingOutcomes={isSavingOutcomes}
          isUploadPending={uploadMaterialMutation.isPending}
        />
      ) : null}

      {activeLessonView === "reports" ? (
        <TeacherLessonReportsPanel reports={reports} />
      ) : null}

      {activeLessonView === "students" ? (
        <TeacherLessonStudentsPanel
          students={students}
          openInviteModal={() => setIsInviteModalOpen(true)}
        />
      ) : null}
    </>
  );
}


