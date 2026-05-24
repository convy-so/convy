"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { useLocale } from "next-intl";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import {
  askOutOfSessionQuestionAction,
  completeTutoringSessionAction,
  respondToInvitationAction,
} from "@/app/actions/classroom";
import { useRouter } from "@/i18n/routing";
import {
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
import { getFriendlyActionError } from "@/lib/action-ux";
import type {
  getOnboardingStateData,
  getStudentLearningWorkspaceInitialData,
} from "@/lib/server/app-queries";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }> & {
  invitations?: Array<{
    id: string;
    classroomId: string;
    classroomTitle: string;
    invitedEmail: string;
    status: string;
    expiresAt: string | null;
  }>;
};

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

export function useStudentLearningWorkspace({
  learningMe,
  initialPatterns,
  initialOnboardingState,
  initialTutoringSession,
}: {
  learningMe: StudentLearningMeData;
  initialPatterns?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialPatterns"];
  initialOnboardingState?: Awaited<ReturnType<typeof getOnboardingStateData>>;
  initialTutoringSession?: Awaited<
    ReturnType<typeof getStudentLearningWorkspaceInitialData>
  >["initialTutoringSession"];
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const locale = useLocale();
  const searchParams = useSearchParams();
  const classroomId = searchParams.get("classroomId");
  const requestedTopicId = searchParams.get("topicId");

  const [selectedStudyLanguage, setSelectedStudyLanguage] = useState<AppLocale>(
    isAppLocale(locale) ? locale : "en",
  );
  const memberships = learningMe.student;
  const invitations = learningMe.invitations ?? [];

  // Find membership matching the classroomId from URL, or default to the first one
  const selectedMembership = useMemo(() => {
    if (classroomId) {
      const match = memberships.find(m => m.classroom.id === classroomId);
      if (match) return match;
    }
    return memberships?.[0] ?? null;
  }, [classroomId, memberships]);

  const selectedMembershipId = selectedMembership?.classroomStudentId ?? null;
  const initialMembershipId = selectedMembershipId;

  const availableTopics = selectedMembership?.topics ?? [];
  const availableSurveys = selectedMembership?.surveys ?? [];

  const effectiveSelectedTopicId = useMemo(() => {
    if (requestedTopicId && availableTopics.some((topic) => topic.id === requestedTopicId)) {
      return requestedTopicId;
    }
    return availableTopics[0]?.id ?? null;
  }, [requestedTopicId, availableTopics]);

  const [outOfSessionReply, setOutOfSessionReply] = useState<string | null>(null);

  const onboardingQuery = useQuery({
    queryKey: queryKeys.learning.onboarding,
    queryFn: fetchOnboardingState,
    enabled: Boolean(selectedMembership?.needsOnboarding),
    initialData:
      selectedMembership?.needsOnboarding &&
      selectedMembership.classroomStudentId === initialMembershipId
        ? initialOnboardingState
        : undefined,
    staleTime: 30_000,
  });

  const patternsQuery = useQuery<Awaited<ReturnType<typeof fetchMyPatterns>>>({
    queryKey: queryKeys.learning.myPatterns,
    queryFn: fetchMyPatterns,
    initialData:
      initialPatterns as Awaited<ReturnType<typeof fetchMyPatterns>> | undefined,
    staleTime: 30_000,
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
    initialData:
      initialTutoringSession &&
      !selectedMembership?.needsOnboarding &&
      selectedMembership?.classroomStudentId === initialMembershipId &&
      effectiveSelectedTopicId === (selectedMembership?.topics[0]?.id ?? null)
        ? initialTutoringSession
        : undefined,
    staleTime: 30_000,
  });

  const initialOnboardingMessages = useMemo(
    () =>
      onboardingQuery.data && !onboardingQuery.data.completed
        ? toTextUIMessages(
            onboardingQuery.data.messages.map((message) => ({
              id: message.id,
              role: message.role,
              content: message.content,
              metadata: message.metadata ?? undefined,
            })),
          )
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
          metadata: message.metadata ?? undefined,
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
            api: `/api/learning/sessions/${tutoringSessionQuery.data?.data.sessionId || effectiveSelectedTopicId}/chat`,
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
    addToolResult: addTutoringToolResult,
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
        queryClient.invalidateQueries({ queryKey: queryKeys.learning.myPatterns }),
      ]);
    }
  }, [onboardingChatMessages.length, onboardingChatStatus, queryClient]);

  useEffect(() => {
    if (onboardingQuery.data?.completed) {
      router.refresh();
    }
  }, [onboardingQuery.data?.completed, router]);

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
      if (!effectiveSelectedTopicId || !tutoringSessionQuery.data?.data.sessionId) {
        throw new Error("No active tutoring session to finish.");
      }

      const result = await completeTutoringSessionAction({
        topicId: effectiveSelectedTopicId,
        sessionId: tutoringSessionQuery.data.data.sessionId,
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

  const acceptInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await respondToInvitationAction({
        invitationId,
        decision: "accepted",
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Invitation accepted");
      await router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to accept invitation");
    },
  });

  const rejectInvitationMutation = useMutation({
    mutationFn: async (invitationId: string) => {
      const result = await respondToInvitationAction({
        invitationId,
        decision: "rejected",
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }
      return result.data;
    },
    onSuccess: async () => {
      toast.success("Invitation dismissed");
      await router.refresh();
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to reject invitation");
    },
  });

  const selectedTopic =
    selectedMembership?.topics.find((topic) => topic.id === effectiveSelectedTopicId) ?? null;
  const sessionState = tutoringSessionQuery.data?.data.sessionState ?? null;

  const conceptCount = sessionState?.knowledgeFocus?.length ?? 0;
  const patterns = patternsQuery.data?.data ?? [];
  const setSelectedMembershipId = (membershipId: string | null) => {
    const membership = memberships.find(m => m.classroomStudentId === membershipId);
    if (membership) {
      const firstTopicId = membership.topics[0]?.id;
      const topicParam = firstTopicId ? `&topicId=${firstTopicId}` : "";
      router.replace(`/student/dashboard?classroomId=${membership.classroom.id}${topicParam}`);
    } else {
      router.replace(`/student/dashboard`);
    }
  };

  const setSelectedTopicId = (topicId: string | null) => {
    if (selectedMembership) {
      if (topicId) {
        router.replace(`/student/dashboard?classroomId=${selectedMembership.classroom.id}&topicId=${topicId}`);
      } else {
        router.replace(`/student/dashboard?classroomId=${selectedMembership.classroom.id}`);
      }
    }
  };

  const strongestPattern = patterns[0] ?? null;
  const membershipCount = memberships?.length ?? 0;

  return {
    memberships,
    selectedStudyLanguage,
    setSelectedStudyLanguage,
    selectedMembershipId,
    setSelectedMembershipId,
    selectedMembership,
    availableTopics,
    availableSurveys,
    selectedTopicId: effectiveSelectedTopicId,
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
    conceptCount,
    patterns,
    strongestPattern,
    membershipCount,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
    addTutoringToolResult,
  };
}
