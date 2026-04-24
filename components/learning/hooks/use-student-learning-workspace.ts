"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocale } from "next-intl";
import toast from "react-hot-toast";

import {
  askOutOfSessionQuestion,
  completeTutoringSession,
  fetchMyPatterns,
  fetchOnboardingState,
  fetchTutoringSession,
  type LearningMeData,
} from "@/lib/api/learning";
import { queryKeys } from "@/lib/query-keys";
import {
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

function toTextUIMessages(
  messages:
    | Array<{
        id: string;
        role: string;
        content: string;
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
      } as UIMessage,
    ];
  });
}

export function useStudentLearningWorkspace({
  learningMe,
}: {
  learningMe: StudentLearningMeData;
}) {
  const queryClient = useQueryClient();
  const locale = useLocale();
  const [selectedStudyLanguage, setSelectedStudyLanguage] = useState<AppLocale>(
    isAppLocale(locale) ? locale : "en",
  );
  const memberships = learningMe.student;
  const [selectedMembershipId, setSelectedMembershipId] = useState<string | null>(
    memberships[0]?.classroomStudentId ?? null,
  );
  const selectedMembership =
    memberships.find((item) => item.classroomStudentId === selectedMembershipId) ??
    memberships[0] ??
    null;

  const availableTopics = selectedMembership?.topics ?? [];
  const availableSurveys = selectedMembership?.surveys ?? [];
  const [selectedTopicId, setSelectedTopicId] = useState<string | null>(
    availableTopics[0]?.id ?? null,
  );
  const effectiveSelectedTopicId = availableTopics.some((topic) => topic.id === selectedTopicId)
    ? selectedTopicId
    : (availableTopics[0]?.id ?? null);
  const [outOfSessionReply, setOutOfSessionReply] = useState<string | null>(null);

  const onboardingQuery = useQuery({
    queryKey: queryKeys.learning.onboarding,
    queryFn: fetchOnboardingState,
    enabled: Boolean(selectedMembership?.needsOnboarding),
  });

  const patternsQuery = useQuery({
    queryKey: queryKeys.learning.myPatterns,
    queryFn: fetchMyPatterns,
  });

  const tutoringSessionQuery = useQuery({
    queryKey: effectiveSelectedTopicId
      ? queryKeys.learning.tutoring(
          effectiveSelectedTopicId,
          selectedStudyLanguage,
        )
      : ["learningTutoring", "idle"],
    queryFn: () =>
      fetchTutoringSession(
        effectiveSelectedTopicId!,
        selectedStudyLanguage,
      ),
    enabled: Boolean(effectiveSelectedTopicId && !selectedMembership?.needsOnboarding),
  });

  const initialOnboardingMessages = useMemo(
    () =>
      onboardingQuery.data && !onboardingQuery.data.completed
        ? toTextUIMessages(onboardingQuery.data.messages)
        : [],
    [onboardingQuery.data],
  );
  const initialTutoringMessages = useMemo(
    () =>
      toTextUIMessages(
        tutoringSessionQuery.data?.data.messages.map((message) => ({
          id: message.id,
          role: message.role,
          content: message.content,
        })),
      ),
    [tutoringSessionQuery.data?.data.messages],
  );

  const onboardingTransport = useMemo(
    () => new DefaultChatTransport({ api: "/api/learning/onboarding" }),
    [],
  );
  const tutoringTransport = useMemo(
    () =>
      effectiveSelectedTopicId
        ? new DefaultChatTransport({
            api: `/api/learning/topics/${effectiveSelectedTopicId}/chat`,
            body: {
              sessionId: tutoringSessionQuery.data?.data.sessionId,
              language: selectedStudyLanguage,
            },
          })
        : null,
    [effectiveSelectedTopicId, selectedStudyLanguage, tutoringSessionQuery.data?.data.sessionId],
  );

  const {
    messages: onboardingChatMessages,
    sendMessage: sendOnboardingMessage,
    setMessages: setOnboardingChatMessages,
    status: onboardingChatStatus,
  } = useChat({
    id: `learning-onboarding-${selectedMembership?.classroomStudentId ?? "none"}`,
    messages: initialOnboardingMessages,
    transport: onboardingTransport,
  });
  const {
    messages: tutoringChatMessages,
    sendMessage: sendTutoringChatMessage,
    setMessages: setTutoringChatMessages,
    status: tutoringChatStatus,
  } = useChat({
    id: `learning-tutoring-${effectiveSelectedTopicId ?? "none"}-${selectedStudyLanguage}`,
    messages: initialTutoringMessages,
    transport: tutoringTransport ?? new DefaultChatTransport({ api: "/api/learning/onboarding" }),
  });

  const tutoringSyncRef = useRef(0);
  const onboardingSyncRef = useRef(0);
  const activeTutoringSessionIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (onboardingChatMessages.length === 0 && initialOnboardingMessages.length > 0) {
      setOnboardingChatMessages(initialOnboardingMessages);
    }
  }, [initialOnboardingMessages, onboardingChatMessages.length, setOnboardingChatMessages]);

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
      onboardingChatStatus === "ready" &&
      onboardingChatMessages.length > onboardingSyncRef.current
    ) {
      onboardingSyncRef.current = onboardingChatMessages.length;
      void Promise.all([
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.onboarding }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.me }),
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.myPatterns }),
      ]);
    }
  }, [onboardingChatMessages.length, onboardingChatStatus, queryClient]);

  useEffect(() => {
    if (
      tutoringChatStatus === "ready" &&
      effectiveSelectedTopicId &&
      tutoringChatMessages.length > tutoringSyncRef.current
    ) {
      tutoringSyncRef.current = tutoringChatMessages.length;
      void queryClient.invalidateQueries({
        queryKey: queryKeys.learning.tutoring(
          effectiveSelectedTopicId,
          selectedStudyLanguage,
        ),
      });
    }
  }, [
    effectiveSelectedTopicId,
    queryClient,
    selectedStudyLanguage,
    tutoringChatMessages.length,
    tutoringChatStatus,
  ]);

  const outOfSessionMutation = useMutation({
    mutationFn: askOutOfSessionQuestion,
    onSuccess: (data) => {
      setOutOfSessionReply(data.data.response);
      toast.success("Question sent");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to ask question");
    },
  });

  const completeTutoringMutation = useMutation({
    mutationFn: async () => {
      if (!effectiveSelectedTopicId || !tutoringSessionQuery.data?.data.sessionId) {
        throw new Error("No active tutoring session to finish.");
      }

      return await completeTutoringSession({
        topicId: effectiveSelectedTopicId,
        sessionId: tutoringSessionQuery.data.data.sessionId,
        language: selectedStudyLanguage,
      });
    },
    onSuccess: async () => {
      setTutoringChatMessages([]);
      tutoringSyncRef.current = 0;
      toast.success("Session finished. The teacher report is being prepared.");

      if (effectiveSelectedTopicId) {
        await queryClient.invalidateQueries({
          queryKey: queryKeys.learning.tutoring(
            effectiveSelectedTopicId,
            selectedStudyLanguage,
          ),
        });
      }
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : "Failed to finish tutoring session",
      );
    },
  });

  const selectedTopic =
    selectedMembership?.topics.find((topic) => topic.id === effectiveSelectedTopicId) ?? null;
  const sessionState = tutoringSessionQuery.data?.data.sessionState ?? null;
  const currentStageId = sessionState?.frameworkState?.currentStageId ?? null;
  const completedPhaseCount =
    sessionState?.frameworkState?.completedStageIds?.length ?? 0;
  const conceptCount = sessionState?.knowledgeFocus?.length ?? 0;
  const patterns = patternsQuery.data?.data ?? [];
  const strongestPattern = patterns[0] ?? null;
  const membershipCount = memberships.length;

  return {
    memberships,
    selectedStudyLanguage,
    setSelectedStudyLanguage,
    selectedMembershipId,
    setSelectedMembershipId,
    selectedMembership,
    availableTopics,
    availableSurveys,
    selectedTopicId,
    setSelectedTopicId,
    effectiveSelectedTopicId,
    onboardingQuery,
    patternsQuery,
    tutoringSessionQuery,
    onboardingChatMessages,
    sendOnboardingMessage,
    setOnboardingChatMessages,
    onboardingChatStatus,
    tutoringChatMessages,
    sendTutoringChatMessage,
    setTutoringChatMessages,
    tutoringChatStatus,
    outOfSessionMutation,
    completeTutoringMutation,
    outOfSessionReply,
    setOutOfSessionReply,
    selectedTopic,
    sessionState,
    currentStageId,
    completedPhaseCount,
    conceptCount,
    patterns,
    strongestPattern,
    membershipCount,
  };
}
