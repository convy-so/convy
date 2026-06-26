import type { Dispatch, SetStateAction } from "react";

export type LessonView = "overview" | "reports" | "students";
export type LessonStatus = "draft" | "active" | "paused" | "archived";

export type LessonReport = {
  id: string;
  updatedAt: string | Date;
  masteryPercent: number;
  report: {
    studentSummary: string;
    identifiedGaps?: string[] | null;
  };
  student: {
    id: string;
    fullName: string;
  };
};

export type LessonMaterial = {
  id: string;
  title: string;
  materialKind: string;
  mimeType: string;
  extractionStatus: string;
  indexingStatus: string;
  analysis?: Record<string, unknown>;
};

export type MaterialUploadAttempt = {
  id: string;
  previousAttemptId?: string | null;
  batchId: string;
  fileName: string;
  status: "queued" | "processing" | "succeeded" | "failed";
  stage: "upload" | "extraction" | "analysis" | "indexing" | "pack_build";
  storagePath?: string | null;
  userMessage?: string | null;
  retryable?: boolean | null;
  failureMessage?: string | null;
  internalError?: string | null;
  materialId?: string | null;
  createdAt?: string | Date;
};

export type LessonStudent = {
  id: string;
  fullName: string;
  email: string;
};

export type TeacherLessonWorkspaceProps = {
  selectedDirectoryClassroom: { id: string; title: string };
  selectedLesson: {
    id: string;
    title: string;
    description?: string | null;
    status: string;
    courseTitle?: string | null;
    contentLocale?: string | null;
    learningOutcomes?: Array<{
      id?: string;
      title: string;
      description: string;
    }> | null;
  };
  reports: LessonReport[];
  materials: LessonMaterial[];
  students: LessonStudent[];
  activeLessonView: LessonView;
  setActiveLessonView: Dispatch<SetStateAction<LessonView>>;
  updateLessonStatusMutation: {
    mutate: (payload: { lessonId: string; status: LessonStatus }) => void;
    isPending: boolean;
  };
  materialTitle: string;
  setMaterialTitle: Dispatch<SetStateAction<string>>;
  materialDescription: string;
  setMaterialDescription: Dispatch<SetStateAction<string>>;
  materialFiles: File[];
  setMaterialFiles: Dispatch<SetStateAction<File[]>>;
  materialUploadAttempts: MaterialUploadAttempt[];
  activationState: { ready: boolean; reason: string } | null;
  isActivationStateLoading: boolean;
  isActivationStateError: boolean;
  uploadMaterialMutation: {
    mutate: (
      payload: {
        lessonId: string;
        files: File[];
        title?: string;
        description?: string;
      },
      options: { onSuccess: () => void },
    ) => void;
    isPending: boolean;
  };
  setIsInviteModalOpen: Dispatch<SetStateAction<boolean>>;
};

