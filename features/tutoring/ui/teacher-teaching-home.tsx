"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";

import { CreateClassroomModal } from "@/features/tutoring/ui/create-classroom-modal";
import { CreateLessonModal } from "@/features/tutoring/ui/create-lesson-modal";
import { InviteStudentModal } from "@/features/tutoring/ui/invite-student-modal";
import { TeacherLessonWorkspace } from "@/features/tutoring/ui/teacher-lesson-workspace";
import {
  TeacherClassroomsDirectory,
  TeacherClassroomWorkspace,
  type TeacherClassroomView,
} from "@/features/tutoring/ui/teacher-teaching-home-sections";
import { useTeacherTeachingWorkspace } from "@/features/tutoring/client/hooks/use-teacher-teaching-workspace";
import type { getTeacherTeachingWorkspaceInitialData } from "@/shared/http/page-data";

function countActiveSessions(statuses: string[]) {
  return statuses.filter((status) => status === "active").length;
}

export function TeacherTeachingHome(
  initialData: Awaited<ReturnType<typeof getTeacherTeachingWorkspaceInitialData>>,
) {
  const CLASSROOMS_PAGE_SIZE = 8;
  const [activeClassroomView, setActiveClassroomView] =
    useState<TeacherClassroomView>("sessions");
  const [activeLessonView, setActiveLessonView] = useState<
    "overview" | "reports" | "students"
  >("overview");
  const [isCreateClassModalOpen, setIsCreateClassModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [isLessonModalOpen, setIsLessonModalOpen] = useState(false);
  const [classroomPage, setClassroomPage] = useState(1);

  const [materialTitle, setMaterialTitle] = useState("");
  const [materialDescription, setMaterialDescription] = useState("");
  const [materialFiles, setMaterialFiles] = useState<File[]>([]);

  const {
    classrooms,
    selectedDirectoryClassroom,
    selectedAccessibleClassroomId,
    canManageStudents,
    students,
    pendingInvitations,
    lessons,
    selectedLesson,
    materialsQuery,
    materialUploadAttemptsQuery,
    uploadMaterialMutation,
    updateLessonStatusMutation,
    resendInvitationMutation,
    cancelInvitationMutation,
    reports,
    activationState,
    isActivationStateLoading,
    isActivationStateError,
    setSelectedClassroomId,
    setSelectedLessonId,
  } = useTeacherTeachingWorkspace(initialData, { activeLessonView });

  const materials = materialsQuery.data?.data ?? [];
  const activeSessionCount = countActiveSessions(
    lessons.map((lesson) => lesson.status),
  );
  const draftSessionCount = lessons.filter(
    (lesson) => lesson.status === "draft",
  ).length;
  const pausedSessionCount = lessons.filter(
    (lesson) => lesson.status === "paused",
  ).length;
  const archivedSessionCount = lessons.filter(
    (lesson) => lesson.status === "archived",
  ).length;
  const acceptedStudentCount = students.filter(
    (student) => student.inviteStatus === "accepted",
  ).length;
  const onboardingReadyCount = students.filter(
    (student) => student.onboardingStatus === "completed",
  ).length;
  const classroomPageCount = Math.max(
    1,
    Math.ceil(classrooms.length / CLASSROOMS_PAGE_SIZE),
  );
  const effectiveClassroomPage = Math.min(classroomPage, classroomPageCount);
  const visibleClassrooms = useMemo(() => {
    const start = (effectiveClassroomPage - 1) * CLASSROOMS_PAGE_SIZE;
    return classrooms.slice(start, start + CLASSROOMS_PAGE_SIZE);
  }, [classrooms, effectiveClassroomPage]);

  const handleSelectLesson = (lessonId: string) => {
    setSelectedLessonId(lessonId);
    setActiveLessonView("overview");
  };

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#f3f6fb_100%)] pb-20 pt-10">
      <div className="mx-auto max-w-7xl space-y-10 px-4 sm:px-6 lg:px-8">
        {!selectedDirectoryClassroom ? (
          <TeacherClassroomsDirectory
            classrooms={classrooms}
            visibleClassrooms={visibleClassrooms}
            effectiveClassroomPage={effectiveClassroomPage}
            classroomPageCount={classroomPageCount}
            classroomsPageSize={CLASSROOMS_PAGE_SIZE}
            onPreviousPage={() =>
              setClassroomPage((page) => Math.max(1, page - 1))
            }
            onNextPage={() =>
              setClassroomPage((page) => Math.min(classroomPageCount, page + 1))
            }
            onSelectClassroom={(classroomId) => {
              setActiveClassroomView("sessions");
              setSelectedClassroomId(classroomId);
              setSelectedLessonId(null);
            }}
            onOpenCreateClassroom={() => setIsCreateClassModalOpen(true)}
          />
        ) : !selectedLesson ? (
          <TeacherClassroomWorkspace
            selectedDirectoryClassroom={selectedDirectoryClassroom}
            activeClassroomView={activeClassroomView}
            lessons={lessons}
            students={students}
            pendingInvitations={pendingInvitations}
            canManageStudents={canManageStudents}
            activeSessionCount={activeSessionCount}
            draftSessionCount={draftSessionCount}
            pausedSessionCount={pausedSessionCount}
            archivedSessionCount={archivedSessionCount}
            acceptedStudentCount={acceptedStudentCount}
            onboardingReadyCount={onboardingReadyCount}
            resendInvitationMutation={resendInvitationMutation}
            cancelInvitationMutation={cancelInvitationMutation}
            onBackToClassrooms={() => setSelectedClassroomId(null)}
            onChangeView={setActiveClassroomView}
            onSelectLesson={handleSelectLesson}
            onOpenInviteModal={() => setIsInviteModalOpen(true)}
            onOpenCreateLessonModal={() => setIsLessonModalOpen(true)}
          />
        ) : (
          <>
            <button
              type="button"
              onClick={() => setSelectedLessonId(null)}
              className="inline-flex items-center gap-2 text-sm font-medium text-slate-500 transition hover:text-slate-950"
            >
              <div className="rounded-lg border border-slate-200 bg-white p-1.5">
                <ChevronDown className="h-4 w-4 rotate-90" />
              </div>
              Back to {selectedDirectoryClassroom.title}
            </button>

            <TeacherLessonWorkspace
              selectedDirectoryClassroom={selectedDirectoryClassroom}
              selectedLesson={selectedLesson}
              reports={reports}
              materials={materials}
              students={students}
              activeLessonView={activeLessonView}
              setActiveLessonView={setActiveLessonView}
              updateLessonStatusMutation={updateLessonStatusMutation}
              materialTitle={materialTitle}
              setMaterialTitle={setMaterialTitle}
              materialDescription={materialDescription}
              setMaterialDescription={setMaterialDescription}
              materialFiles={materialFiles}
              setMaterialFiles={setMaterialFiles}
              materialUploadAttempts={materialUploadAttemptsQuery.data?.data ?? []}
              activationState={activationState}
              isActivationStateLoading={isActivationStateLoading}
              isActivationStateError={isActivationStateError}
              uploadMaterialMutation={uploadMaterialMutation}
              setIsInviteModalOpen={setIsInviteModalOpen}
            />
          </>
        )}
      </div>
      <CreateClassroomModal
        isOpen={isCreateClassModalOpen}
        onClose={() => setIsCreateClassModalOpen(false)}
        onSuccess={(id) => setSelectedClassroomId(id)}
      />

      {selectedAccessibleClassroomId ? (
        <>
          <InviteStudentModal
            isOpen={isInviteModalOpen}
            onClose={() => setIsInviteModalOpen(false)}
            classroomId={selectedAccessibleClassroomId}
          />
          <CreateLessonModal
            isOpen={isLessonModalOpen}
            onClose={() => setIsLessonModalOpen(false)}
            classroomId={selectedAccessibleClassroomId}
            availableCourses={initialData.availableCourses}
          />
        </>
      ) : null}
    </div>
  );
}
