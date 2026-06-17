"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";

import { askOutOfSessionQuestionAction } from "@/app/actions/classroom";
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
import {
  logTutoringDebug,
  logTutoringWarn,
  summarizeTutoringMessages,
  summarizeTutoringText,
} from "@/lib/learning/tutoring-debug";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

function toTextUIMessages(
  messages:
    | Array<{
        id: string;
        role: string;
        content: string;
        parts?: Array<Record<string, unknown>> | null;
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
        parts:
          message.parts && message.parts.length > 0
            ? (message.parts as UIMessage["parts"])
            : [{ type: "text", text: message.content }],
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

function extractMessageText(message: UIMessage) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return summarizeTutoringText(
    parts
      .map((part) =>
        part && typeof part === "object" && "text" in part
          ? String((part as { text?: unknown }).text ?? "")
          : "",
      )
      .join(" "),
    180,
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
          parts: message.parts ?? undefined,
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
    sendMessage: sendTutoringChatMessageRaw,
    setMessages: setTutoringChatMessages,
    status: tutoringChatStatus,
    addToolResult: addTutoringToolResultRaw,
    error: tutoringChatError,
  } = useChat({
    id: `learning-tutoring-${lessonId}-${selectedStudyLanguage}-${tutoringSessionQuery.data?.data.sessionId ?? "pending"}`,
    messages: initialTutoringMessages,
    transport: tutoringTransport,
    onError: (error) => {
      logTutoringWarn("client:chat:error", {
        lessonId,
        sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
        status: tutoringChatStatus,
        error: error instanceof Error ? error.message : String(error),
      });
    },
  });

  const sendTutoringChatMessage = async (
    message: Parameters<typeof sendTutoringChatMessageRaw>[0],
  ) => {
    logTutoringDebug("client:chat:send", {
      lessonId,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      status: tutoringChatStatus,
      text:
        message != null &&
        "parts" in message &&
        Array.isArray(message.parts)
          ? extractMessageText(message as UIMessage)
          : null,
    });
    return sendTutoringChatMessageRaw(message);
  };

  const addTutoringToolResult = (
    payload: Parameters<typeof addTutoringToolResultRaw>[0],
  ) => {
    logTutoringDebug("client:chat:add-tool-result", {
      lessonId,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      toolCallId: payload.toolCallId,
      tool: payload.tool,
      state: payload.state,
    });
    return addTutoringToolResultRaw(payload);
  };



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

  useEffect(() => {
    logTutoringDebug("client:session:query-state", {
      lessonId,
      selectedStudyLanguage,
      queryStatus: tutoringSessionQuery.status,
      isPending: tutoringSessionQuery.isPending,
      isError: tutoringSessionQuery.isError,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      messageCount: tutoringSessionQuery.data?.data.messages.length ?? 0,
    });
  }, [
    lessonId,
    selectedStudyLanguage,
    tutoringSessionQuery.data?.data.messages.length,
    tutoringSessionQuery.data?.data.sessionId,
    tutoringSessionQuery.isError,
    tutoringSessionQuery.isPending,
    tutoringSessionQuery.status,
  ]);

  useEffect(() => {
    logTutoringDebug("client:chat:status", {
      lessonId,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      status: tutoringChatStatus,
      messageCount: tutoringChatMessages.length,
      recentMessages: summarizeTutoringMessages(tutoringChatMessages.slice(-3)),
      lastMessageRole: tutoringChatMessages.at(-1)?.role ?? null,
      lastMessageText:
        tutoringChatMessages.at(-1) && tutoringChatMessages.at(-1)?.role
          ? extractMessageText(tutoringChatMessages.at(-1) as UIMessage)
          : null,
      error: tutoringChatError instanceof Error ? tutoringChatError.message : tutoringChatError ? String(tutoringChatError) : null,
    });
  }, [
    lessonId,
    tutoringChatError,
    tutoringChatMessages,
    tutoringChatStatus,
    tutoringSessionQuery.data?.data.sessionId,
  ]);

  const sessionState = tutoringSessionQuery.data?.data.sessionState ?? null;
  const sessionStatus = tutoringSessionQuery.data?.data.sessionStatus ?? null;
  const sessionCompleted =
    sessionStatus === "completed" || sessionState?.completed === true;
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
      message: sessionCompleted
        ? "This tutoring session is complete."
        : "Your tutoring session is ready.",
    };
  }, [
    selectedLesson,
    selectedMembership,
    tutoringSessionQuery.error,
    tutoringSessionQuery.isError,
    tutoringSessionQuery.isPending,
    sessionCompleted,
  ]);

  useEffect(() => {
    logTutoringDebug("client:init-state", {
      lessonId,
      status: tutoringInitializationState.status,
      title: tutoringInitializationState.title,
      message: tutoringInitializationState.message,
      canUseTutoringChat: tutoringInitializationState.status === "ready",
      selectedMembership: Boolean(selectedMembership),
      selectedLesson: Boolean(selectedLesson),
      needsOnboarding: selectedMembership?.needsOnboarding ?? null,
    });
  }, [
    lessonId,
    selectedLesson,
    selectedMembership,
    tutoringInitializationState.message,
    tutoringInitializationState.status,
    tutoringInitializationState.title,
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
    outOfSessionReply,
    setOutOfSessionReply,
    selectedMembership,
    selectedLesson,
    sessionState,
    sessionCompleted,
    tutoringInitializationState,
    canUseTutoringChat:
      tutoringInitializationState.status === "ready" && !sessionCompleted,
  };
}
