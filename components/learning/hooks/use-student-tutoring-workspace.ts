"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";

import { askOutOfSessionQuestionAction, completeTutoringSessionAction } from "@/app/actions/classroom";
import { getFriendlyActionError } from "@/lib/action-ux";
import {
  ApiClientError,
  fetchMyPatterns,
  fetchTutoringSession,
  type LearningMeData,
} from "@/lib/api/learning";
import {
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";
import { queryKeys } from "@/lib/query-keys";
import type { getStudentLearningWorkspaceInitialData } from "@/lib/server/app-queries";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

function toTextUIMessages(
  messages:
    | Array<{
        id: string;
        role: string;
        content: string;
        metadata?: Record<string, unknown>;
      }>
    | undefined,
): UIMessage[] {
  return (messages ?? []).flatMap((message) => {
    if (message.role !== "assistant" && message.role !== "user") {
      return [];
    }

    return [
      {
        id: message.id,
        role: message.role,
        parts: [{ type: "text", text: message.content }],
        annotations: message.metadata
          ? [{ type: "metadata", data: message.metadata }]
          : [],
      } as UIMessage,
    ];
  });
}

function retryTransientLearningApiFailure(failureCount: number, error: Error) {
  return (
    error instanceof ApiClientError &&
    error.code === "SERVICE_UNAVAILABLE" &&
    failureCount < 2
  );
}

export function useStudentTutoringWorkspace({
  classroomId,
  lessonId,
  learningMe,
  initialPatterns,
  initialTutoringSession,
}: {
  classroomId: string;
  lessonId: string;
  learningMe: StudentLearningMeData;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialPatterns"];
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialTutoringSession"];
}) {
  const queryClient = useQueryClient();
  const locale = useLocale();

  const [selectedStudyLanguage, setSelectedStudyLanguage] = useState<AppLocale>(
    isAppLocale(locale) ? locale : "en",
  );
  const [outOfSessionReply, setOutOfSessionReply] = useState<string | null>(null);

  const memberships = learningMe.student;
  const selectedMembership =
    memberships.find((membership) => membership.classroom.id === classroomId) ?? null;
  const selectedLesson =
    selectedMembership?.topics.find((topic) => topic.id === lessonId) ?? null;

  const patternsQuery = useQuery<Awaited<ReturnType<typeof fetchMyPatterns>>>({
    queryKey: queryKeys.learning.myPatterns,
    queryFn: fetchMyPatterns,
    initialData:
      initialPatterns as Awaited<ReturnType<typeof fetchMyPatterns>> | undefined,
    staleTime: 30_000,
  });

  const tutoringSessionQuery = useQuery({
    queryKey: queryKeys.learning.tutoring(lessonId, selectedStudyLanguage),
    queryFn: () => fetchTutoringSession(lessonId, selectedStudyLanguage),
    enabled: Boolean(selectedMembership && selectedLesson && !selectedMembership.needsOnboarding),
    initialData:
      selectedMembership &&
      selectedLesson &&
      !selectedMembership.needsOnboarding &&
      initialTutoringSession
        ? initialTutoringSession
        : undefined,
    staleTime: 30_000,
    retry: retryTransientLearningApiFailure,
  });

  const initialTutoringMessages = useMemo(
    () =>
      toTextUIMessages(
        tutoringSessionQuery.data?.data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
          metadata: message.metadata ?? undefined,
        })),
      ),
    [tutoringSessionQuery.data?.data.messages],
  );

  const tutoringTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/learning/tutoring-sessions/${tutoringSessionQuery.data?.data.sessionId ?? "pending"}/chat`,
        body: {
          sessionId: tutoringSessionQuery.data?.data.sessionId,
          language: selectedStudyLanguage,
        },
      }),
    [selectedStudyLanguage, tutoringSessionQuery.data?.data.sessionId],
  );

  const {
    messages: tutoringChatMessages,
    sendMessage: sendTutoringChatMessage,
    setMessages: setTutoringChatMessages,
    status: tutoringChatStatus,
    addToolResult: addTutoringToolResult,
  } = useChat({
    id: `learning-tutoring-${lessonId}-${selectedStudyLanguage}`,
    messages: initialTutoringMessages,
    transport: tutoringTransport,
  });

  const tutoringSyncRef = useRef(0);
  const activeTutoringSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (tutoringChatMessages.length === 0 && initialTutoringMessages.length > 0) {
      setTutoringChatMessages(initialTutoringMessages);
    }
  }, [initialTutoringMessages, setTutoringChatMessages, tutoringChatMessages.length]);

  useEffect(() => {
    const nextSessionId = tutoringSessionQuery.data?.data.sessionId ?? null;
    if (!nextSessionId) {
      activeTutoringSessionIdRef.current = null;
      return;
    }

    if (activeTutoringSessionIdRef.current !== nextSessionId) {
      activeTutoringSessionIdRef.current = nextSessionId;
      tutoringSyncRef.current = initialTutoringMessages.length;
      setTutoringChatMessages(initialTutoringMessages);
    }
  }, [
    initialTutoringMessages,
    setTutoringChatMessages,
    tutoringSessionQuery.data?.data.sessionId,
  ]);

  useEffect(() => {
    if (
      tutoringChatStatus === "ready" &&
      tutoringSessionQuery.data?.data.sessionId &&
      tutoringChatMessages.length > tutoringSyncRef.current
    ) {
      tutoringSyncRef.current = tutoringChatMessages.length;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.learning.tutoring(lessonId, selectedStudyLanguage),
      });
    }
  }, [
    lessonId,
    queryClient,
    selectedStudyLanguage,
    tutoringChatMessages.length,
    tutoringChatStatus,
    tutoringSessionQuery.data?.data.sessionId,
  ]);

  const outOfSessionMutation = useMutation({
    mutationFn: async (input: {
      topicId: string;
      message: string;
      language?: string;
    }) => {
      const result = await askOutOfSessionQuestionAction(input);
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: (data) => {
      setOutOfSessionReply(data.response);
      toast.success("Question sent");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to ask question");
    },
  });

  const completeTutoringMutation = useMutation({
    mutationFn: async () => {
      const tutoringSessionId = tutoringSessionQuery.data?.data.sessionId;
      if (!tutoringSessionId) {
        throw new Error("No active tutoring session to finish.");
      }

      const result = await completeTutoringSessionAction({
        topicId: lessonId,
        sessionId: tutoringSessionId,
        language: selectedStudyLanguage,
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      setTutoringChatMessages([]);
      tutoringSyncRef.current = 0;
      toast.success("Session finished. The teacher report is being prepared.");

      await queryClient.invalidateQueries({
        queryKey: queryKeys.learning.tutoring(lessonId, selectedStudyLanguage),
      });
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to finish tutoring session",
      );
    },
  });

  const sessionState = tutoringSessionQuery.data?.data.sessionState ?? null;
  const tutoringInitializationState = useMemo(() => {
    if (!selectedMembership) {
      return {
        status: "error" as const,
        title: "Classroom not available",
        message: "This classroom is no longer available on your account.",
      };
    }

    if (!selectedLesson) {
      return {
        status: "error" as const,
        title: "Lesson not available",
        message: "This lesson is not available in the selected classroom.",
      };
    }

    if (selectedMembership.needsOnboarding) {
      return {
        status: "blocked" as const,
        title: "Complete profile setup first",
        message:
          "Your tutor needs your profile setup before it can personalise explanations and examples for this lesson.",
        ctaHref: "/student/profile/edit",
        ctaLabel: "Open profile setup",
      };
    }

    if (tutoringSessionQuery.isPending) {
      return {
        status: "loading" as const,
        title: "Preparing your tutor",
        message:
          "Convy is loading this lesson, restoring your tutoring session, and preparing your study context.",
      };
    }

    if (tutoringSessionQuery.isError) {
      const error = tutoringSessionQuery.error;
      return {
        status: "error" as const,
        title: "Could not start this tutoring session",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while initializing the session.",
        errorCode: error instanceof ApiClientError ? error.code : null,
      };
    }

    return {
      status: "ready" as const,
      title: "Tutor ready",
      message: "Your tutoring session is ready.",
    };
  }, [
    selectedLesson,
    selectedMembership,
    tutoringSessionQuery.error,
    tutoringSessionQuery.isError,
    tutoringSessionQuery.isPending,
  ]);

  return {
    memberships,
    patternsQuery,
    selectedStudyLanguage,
    setSelectedStudyLanguage,
    tutoringSessionQuery,
    tutoringChatMessages,
    sendTutoringChatMessage,
    setTutoringChatMessages,
    tutoringChatStatus,
    addTutoringToolResult,
    outOfSessionMutation,
    completeTutoringMutation,
    outOfSessionReply,
    setOutOfSessionReply,
    selectedMembership,
    selectedLesson,
    sessionState,
    tutoringInitializationState,
    canUseTutoringChat: tutoringInitializationState.status === "ready",
  };
}
