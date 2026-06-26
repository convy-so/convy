"use client";

import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import {
  DefaultChatTransport,
  type CreateUIMessage,
  type UIMessage,
} from "ai";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";

import { askOutOfSessionQuestionAction } from "@/app/actions/classroom";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import {
  ApiClientError,
  fetchMyPatterns,
  fetchTutoringSession,
  type StudentMeData,
} from "@/features/tutoring/public-client";
import {
  isAppLocale,
  type AppLocale,
} from "@/shared/i18n/config";
import { queryKeys } from "@/shared/http/query-keys";
import type { getStudentWorkspaceInitialData } from "@/shared/http/page-data";
import {
  logTutoringDebug,
  logTutoringWarn,
  summarizeTutoringMessages,
  summarizeTutoringText,
} from "@/features/tutoring/public-server";
import {
  toPersistedUIChatMessages,
  toUIMessages,
} from "@/shared/chat/chat-ui-messages";

type StudentStudentMeData = Extract<StudentMeData, { role: "student" }>;
export type TutoringChatDraftMessage = CreateUIMessage<UIMessage>;
export type TutoringTextWithFilesMessage = {
  text: string;
  files?: FileList;
};
export type TutoringOutgoingMessage =
  | TutoringChatDraftMessage
  | TutoringTextWithFilesMessage;
export type TutoringToolResultPayload =
  | {
      state?: "output-available";
      tool: string;
      toolCallId: string;
      output: unknown;
      errorText?: never;
    }
  | {
      state: "output-error";
      tool: string;
      toolCallId: string;
      output?: never;
      errorText: string;
    };

function retryTransientTutoringApiFailure(failureCount: number, error: Error) {
  return (
    error instanceof ApiClientError &&
    error.code === "SERVICE_UNAVAILABLE" &&
    failureCount < 2
  );
}

function extractMessageText(message: UIMessage) {
  const parts = Array.isArray(message.parts) ? message.parts : [];
  return summarizeTutoringText(
    parts.flatMap((part) => (part.type === "text" ? [part.text] : [])).join(" "),
    180,
  );
}

function isTextWithFilesMessage(
  message: TutoringOutgoingMessage,
): message is TutoringTextWithFilesMessage {
  return "text" in message;
}

function buildChatLogPreview(message: TutoringOutgoingMessage) {
  if (isTextWithFilesMessage(message)) {
    return summarizeTutoringText(message.text, 180);
  }

  if (Array.isArray(message.parts)) {
    return summarizeTutoringText(
      message.parts
        .flatMap((part) => (part.type === "text" ? [part.text] : []))
        .join(" "),
      180,
    );
  }

  return null;
}

export function useStudentTutoringWorkspace({
  classroomId,
  lessonId,
  studentMe,
  initialPatterns,
  initialTutoringSession,
}: {
  classroomId: string;
  lessonId: string;
  studentMe: StudentStudentMeData;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentWorkspaceInitialData>
  >["initialPatterns"];
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentWorkspaceInitialData>
  >["initialTutoringSession"];
}) {
  const locale = useLocale();

  const [selectedStudyLanguage, setSelectedStudyLanguage] = useState<AppLocale>(
    isAppLocale(locale) ? locale : "en",
  );
  const [outOfSessionReply, setOutOfSessionReply] = useState<string | null>(null);

  const memberships = studentMe.student;
  const selectedMembership =
    memberships.find((membership) => membership.classroom.id === classroomId) ?? null;
  const selectedLesson =
    selectedMembership?.lessons.find((lesson) => lesson.id === lessonId) ?? null;

  const patternsQuery = useQuery<Awaited<ReturnType<typeof fetchMyPatterns>>>({
    queryKey: queryKeys.tutoring.myPatterns,
    queryFn: fetchMyPatterns,
    initialData:
      initialPatterns as Awaited<ReturnType<typeof fetchMyPatterns>> | undefined,
    staleTime: 30_000,
  });

  const tutoringSessionQuery = useQuery<
    Awaited<ReturnType<typeof fetchTutoringSession>>
  >({
    queryKey: queryKeys.tutoring.tutoring(lessonId, selectedStudyLanguage),
    queryFn: () => fetchTutoringSession(lessonId, selectedStudyLanguage),
    enabled: Boolean(selectedMembership && selectedLesson && !selectedMembership.needsOnboarding),
    initialData:
      selectedMembership &&
      selectedLesson &&
      !selectedMembership.needsOnboarding &&
      initialTutoringSession
        ? (initialTutoringSession as Awaited<
            ReturnType<typeof fetchTutoringSession>
          >)
        : undefined,
    staleTime: 30_000,
    retry: retryTransientTutoringApiFailure,
  });

  const initialTutoringMessages = useMemo(
    () =>
      toUIMessages(
        toPersistedUIChatMessages(tutoringSessionQuery.data?.data.messages ?? []),
      ),
    [tutoringSessionQuery.data?.data.messages],
  );

  const tutoringTransport = useMemo(
    () =>
      new DefaultChatTransport({
        api: `/api/tutoring/sessions/${tutoringSessionQuery.data?.data.sessionId ?? "pending"}/chat`,
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
    id: `student-tutoring-${lessonId}-${selectedStudyLanguage}-${tutoringSessionQuery.data?.data.sessionId ?? "pending"}`,
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
    message: TutoringOutgoingMessage,
  ) => {
    logTutoringDebug("client:chat:send", {
      lessonId,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      status: tutoringChatStatus,
      text: buildChatLogPreview(message),
    });
    return sendTutoringChatMessageRaw(message);
  };

  const addTutoringToolResult = (
    payload: TutoringToolResultPayload,
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
      lessonId: string;
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
    const lastMessage = tutoringChatMessages.at(-1);
    logTutoringDebug("client:chat:status", {
      lessonId,
      sessionId: tutoringSessionQuery.data?.data.sessionId ?? null,
      status: tutoringChatStatus,
      messageCount: tutoringChatMessages.length,
      recentMessages: summarizeTutoringMessages(tutoringChatMessages.slice(-3)),
      lastMessageRole: lastMessage?.role ?? null,
      lastMessageText: lastMessage ? extractMessageText(lastMessage) : null,
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
          "Complete your profile setup before Convy personalises explanations and examples for this lesson.",
        ctaHref: "/student/profile/edit",
        ctaLabel: "Open profile setup",
      };
    }

    if (tutoringSessionQuery.isPending) {
      return {
        status: "loading" as const,
        title: "Preparing your lesson",
        message:
          "Convy is loading this lesson, restoring your progress, and preparing your study context.",
      };
    }

    if (tutoringSessionQuery.isError) {
      const error = tutoringSessionQuery.error;
      return {
        status: "error" as const,
        title: "Could not open this lesson",
        message:
          error instanceof Error
            ? error.message
            : "Something went wrong while initializing the session.",
        errorCode: error instanceof ApiClientError ? error.code : null,
      };
    }

    return {
      status: "ready" as const,
      title: "Lesson ready",
      message: sessionCompleted
        ? "This lesson session is complete."
        : "Your lesson is ready.",
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


