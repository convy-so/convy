"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import toast from "react-hot-toast";
import { finalizeSurveyCreationAction } from "@/app/actions/survey";
import { useAuth } from "@/features/auth/public-ui";
import { useAudioTranscription } from "@/features/surveys/client/hooks/use-audio-transcription";
import type { SurveyDetailsResponse } from "@/features/surveys/client/api/surveys-api";
import type { AppLocale } from "@/shared/i18n/config";
import { readJsonResponseValue } from "@/shared/http/json";
import {
  useSurveyCreationDraft,
  type SurveyExtractedData,
} from "@/features/surveys/client/hooks/use-survey-creation-draft";
import {
  normalizeCreateMessages,
  normalizeCollectedInfo,
  normalizeExtractedData,
} from "@/features/surveys/server/message-normalizer";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";
import { AuthRequiredState } from "./auth-required-state";
import {
  createHiddenGreetingMessage,
  isReadyForSampleConversation,
  type InitialSurveyCreationState,
  resolveInitialCreationAccess,
  resolveLoadedCreationAccess,
  type SurveyCreationSyncResponse,
} from "./creation-session-state";
import { CreationPageChrome } from "./creation-page-chrome";
import { CreationEntryScreen } from "./creation-entry-screen";
import { CreationWorkspace } from "./creation-workspace";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeSurveyCreationSyncResponse(
  value: unknown,
): SurveyCreationSyncResponse {
  if (!isRecord(value)) {
    return {};
  }

  return {
    messages: Array.isArray(value.messages) ? value.messages : undefined,
    collectedInfo: value.collectedInfo,
    extractedData: value.extractedData,
    status: typeof value.status === "string" ? value.status : undefined,
  };
}

async function readSurveyCreationSyncResponse(
  response: Response,
): Promise<SurveyCreationSyncResponse> {
  return normalizeSurveyCreationSyncResponse(await readJsonResponseValue(response));
}

export function CreateSurveyPageClient({
  locale,
  initialLanguage,
  initialSurveyId = null,
  initialCreationState = null,
  initialSurveyData = null,
  initialLoadError = null,
}: {
  locale: string;
  initialLanguage: AppLocale;
  initialSurveyId?: string | null;
  initialCreationState?: InitialSurveyCreationState | null;
  initialSurveyData?: SurveyDetailsResponse | null;
  initialLoadError?: string | null;
}) {
  const translations = useTranslations("Survey.Create");
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id") ?? searchParams.get("surveyId");

  const {
    surveyId,
    setSurveyId,
    isInitializing,
    setIsInitializing,
    authError,
    isReadOnly,
    setIsReadOnly,
    surveyStatus,
    setSurveyStatus,
    language,
    setLanguage,
    setIsVoiceSurvey,
    extractedData,
    setExtractedData,
    setCollectedInfo,
    isCreatingDraft,
    ensureDraftExists,
  } = useSurveyCreationDraft({
    authLoading,
    initialLanguage,
    initialSurveyId,
    locale,
    t: translations,
    user,
  });

  // Page-local UI state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [input, setInput] = useState("");

  // Keep refs in sync for the chat transport closure without re-initialising useChat
  const surveyIdRef = useRef<string | null>(surveyId);
  const extractedDataRef = useRef<SurveyExtractedData | null>(extractedData);
  const bootstrappedConversationIdsRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    surveyIdRef.current = surveyId;
  }, [surveyId]);
  useEffect(() => {
    extractedDataRef.current = extractedData;
  }, [extractedData]);

  const { messages, setMessages, status, sendMessage } =
    useChat({
      id: "survey-creation-session",
      transport: new DefaultChatTransport({
        api: "/api/surveys/draft-required",
        prepareSendMessagesRequest: ({
          body,
          id,
          messages: msgs,
          trigger,
          messageId,
        }) => {
          const sid = surveyIdRef.current;
          if (!sid) {
            throw new Error(
              "Survey draft is not initialized. Start the creation session first.",
            );
          }
          return {
            api: `/api/surveys/${sid}/create`,
            body: {
              id,
              messages: msgs,
              trigger,
              messageId,
              ...(body || {}),
              extractedData: extractedDataRef.current,
            },
          };
        },
      }),
      messages: [],
      onToolCall: ({ toolCall }) => {
        if (toolCall.toolName === "researchBestPractices") {
          setIsResearching(true);
        }
      },
      onFinish: () => {},
      onError: (error) => {
        console.error("[Chat] Error:", error);
      },
    });

  const bootstrapConversation = useCallback(
    async (currentSurveyId: string) => {
      if (bootstrappedConversationIdsRef.current.has(currentSurveyId)) {
        return;
      }

      bootstrappedConversationIdsRef.current.add(currentSurveyId);

      try {
        const bootstrapRes = await fetch(
          `/api/surveys/${currentSurveyId}/create`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              messages: [createHiddenGreetingMessage()],
            }),
          },
        );

        if (!bootstrapRes.ok) {
          throw new Error("Failed to bootstrap creation conversation.");
        }

        const refreshedRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
        if (!refreshedRes.ok) {
          throw new Error("Failed to refresh creation state.");
        }

        const refreshedData = await readSurveyCreationSyncResponse(refreshedRes);
        setMessages(normalizeCreateMessages(refreshedData.messages ?? []));
        setCollectedInfo(normalizeCollectedInfo(refreshedData.collectedInfo));
        setExtractedData(normalizeExtractedData(refreshedData.extractedData));
      } catch (error) {
        bootstrappedConversationIdsRef.current.delete(currentSurveyId);
        throw error;
      }
    },
    [setCollectedInfo, setExtractedData, setMessages],
  );

  const isLoading = status === "streaming" || status === "submitted";

  const {
    startTranscription,
    stopRecording,
  } = useAudioTranscription({
    onError: (message) => {
      toast.error(message);
    },
  });

  useEffect(() => {
    if (!initialSurveyId || !initialCreationState) {
      return;
    }

    const normalizedMessages = normalizeCreateMessages(
      initialCreationState.messages ?? [],
    );
    const normalizedCollectedInfo = normalizeCollectedInfo(
      initialCreationState.collectedInfo,
    );
    const normalizedExtractedData = normalizeExtractedData(
      initialCreationState.extractedData,
    );
    setMessages(normalizedMessages);

    setCollectedInfo(normalizedCollectedInfo);
    setExtractedData(normalizedExtractedData);

    const initialAccessState = resolveInitialCreationAccess({
      surveyData: initialSurveyData,
      creationState: initialCreationState,
      extractedData: normalizedExtractedData,
    });

    setSurveyStatus(initialAccessState.status);

    if (initialAccessState.language) {
      setLanguage(initialAccessState.language);
    }

    if (typeof initialAccessState.isVoice === "boolean") {
      setIsVoiceSurvey(initialAccessState.isVoice);
      setIsVoiceMode(initialAccessState.isVoice);
    }

    setIsReadOnly(
      Boolean(
        initialAccessState.isFinished ||
          !initialAccessState.canEdit ||
          initialAccessState.readyForSampling,
      ),
    );
    setIsInitializing(false);

    if (
      normalizedMessages.length === 0 &&
      !initialAccessState.isFinished &&
      initialAccessState.canEdit &&
      !initialAccessState.readyForSampling
    ) {
      void bootstrapConversation(initialSurveyId);
    }
  }, [
    bootstrapConversation,
    initialCreationState,
    initialSurveyData,
    initialSurveyId,
    setCollectedInfo,
    setExtractedData,
    setIsInitializing,
    setIsReadOnly,
    setIsVoiceSurvey,
    setLanguage,
    setMessages,
    setSurveyStatus,
  ]);

  useEffect(() => {
    if (!initialLoadError) return;
    toast.error(initialLoadError);
  }, [initialLoadError]);

  // Load existing survey from URL param
  useEffect(() => {
    if (!idFromUrl || authLoading || !user || surveyId === idFromUrl) return;

    setSurveyId(idFromUrl);
    setIsInitializing(true);

    const loadConversation = async () => {
      try {
        const [conversationRes, surveyRes] = await Promise.all([
          fetch(`/api/surveys/${idFromUrl}/create`),
          fetch(`/api/surveys/${idFromUrl}/details`),
        ]);

        let normalizedMessages: ReturnType<typeof normalizeCreateMessages> = [];
        let normalizedConversationExtractedData: ReturnType<
          typeof normalizeExtractedData
        > | null = null;
        let canBootstrapConversation = false;

        if (conversationRes.ok) {
          const data = await readSurveyCreationSyncResponse(conversationRes);
          normalizedMessages = normalizeCreateMessages(data.messages ?? []);
          setMessages(normalizedMessages);
          const ci = normalizeCollectedInfo(data.collectedInfo);
          if (ci) setCollectedInfo(ci);
          const ed = normalizeExtractedData(data.extractedData);
          normalizedConversationExtractedData = ed;
          if (ed) setExtractedData(ed);
        }

        if (surveyRes.ok) {
          const surveyData = await readJsonResponseValue(surveyRes);
          const loadedAccessState = resolveLoadedCreationAccess({
            surveyData,
            extractedData: normalizedConversationExtractedData,
          });

          setSurveyStatus(loadedAccessState.status);

          if (loadedAccessState.language) {
            setLanguage(loadedAccessState.language);
          }
          if (typeof loadedAccessState.isVoice === "boolean") {
            setIsVoiceSurvey(loadedAccessState.isVoice);
          }

          setIsReadOnly(
            Boolean(
              loadedAccessState.isFinished ||
                !loadedAccessState.canEdit ||
                loadedAccessState.readyForSampling,
            ),
          );
          canBootstrapConversation =
            !loadedAccessState.isFinished &&
            loadedAccessState.canEdit &&
            !loadedAccessState.readyForSampling;
        }

        if (normalizedMessages.length === 0 && canBootstrapConversation) {
          await bootstrapConversation(idFromUrl);
        }
      } catch (error) {
        console.error("[LoadConversation] Failed:", error);
        toast.error("Failed to load conversation.");
      } finally {
        setIsInitializing(false);
      }
    };

    void loadConversation();
  }, [
    idFromUrl,
    authLoading,
    user,
    surveyId,
    setSurveyId,
    setIsInitializing,
    setMessages,
    setCollectedInfo,
    setExtractedData,
    setSurveyStatus,
    setLanguage,
    setIsVoiceSurvey,
    setIsReadOnly,
    bootstrapConversation,
  ]);

  // Poll server state while streaming, instant refresh on finish
  const fetchUpdatedData = useCallback(async () => {
    if (!surveyId) return;
    try {
      const res = await fetch(
        `/api/surveys/${encodeURIComponent(surveyId)}/create`,
      );
      if (!res.ok) return;
      const data = await readSurveyCreationSyncResponse(res);
      const normalizedCollectedInfo = normalizeCollectedInfo(data.collectedInfo);
      if (normalizedCollectedInfo) {
        setCollectedInfo(normalizedCollectedInfo);
      }
      const normalizedExtractedData = normalizeExtractedData(data.extractedData);
      if (
        normalizedExtractedData &&
        Object.keys(normalizedExtractedData).length > 0
      ) {
        setExtractedData(normalizedExtractedData);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") return;
      console.error("[fetchUpdatedData] ERROR:", err);
    }
  }, [surveyId, setCollectedInfo, setExtractedData]);

  useEffect(() => {
    if (!surveyId || status === "ready") return;
    const timer = setInterval(() => {
      void fetchUpdatedData();
    }, 3000);
    void fetchUpdatedData();
    return () => clearInterval(timer);
  }, [fetchUpdatedData, status, surveyId]);

  useEffect(() => {
    if (status === "ready" && surveyId) {
      void fetchUpdatedData();
    }
  }, [fetchUpdatedData, status, surveyId]);

  // Dismiss research animation once result arrives
  useEffect(() => {
    const hasResult = messages.some((m) =>
      m.parts?.some(
        (p) =>
          p.type === "tool-researchBestPractices" ||
          ((p.type === "tool-invocation" || p.type === "tool-call") &&
            "toolName" in p &&
            p.toolName === "researchBestPractices"),
      ),
    );
    if (hasResult) setIsResearching(false);
  }, [messages]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // â”€â”€ Derived state â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const isReadyForSample = useMemo(
    () =>
      isReadyForSampleConversation({
        surveyId,
        surveyStatus,
        extractedData,
      }),
    [surveyId, surveyStatus, extractedData],
  );

  const isConversationLocked = isReadOnly || isReadyForSample;

  // â”€â”€ Handlers â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const handleStart = async () => {
    let currentSurveyId = surveyId;
    let existingMessages: unknown[] | null = null;

    if (!currentSurveyId) {
      try {
        const surveyData = await ensureDraftExists();
        if (!surveyData) return;
        if (typeof surveyData === "string") {
          currentSurveyId = surveyData;
        } else {
          currentSurveyId = surveyData.id;
          existingMessages =
            Array.isArray(surveyData.messages) ? surveyData.messages : null;
        }
      } catch {
        toast.error(translations("Toasts.InitFailed"));
        return;
      }
    }

    if (!currentSurveyId) return;

    try {
      const currentStateRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
      if (!currentStateRes.ok) {
        throw new Error("Failed to load creation state.");
      }

      const currentState = await readSurveyCreationSyncResponse(currentStateRes);
      const currentMessages =
        existingMessages ?? (Array.isArray(currentState.messages) ? currentState.messages : []);

      if (normalizeCreateMessages(currentMessages).length === 0) {
        await bootstrapConversation(currentSurveyId);
      } else {
        const refreshedRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
        if (!refreshedRes.ok) {
          throw new Error("Failed to refresh creation state.");
        }

        const refreshedData = await readSurveyCreationSyncResponse(refreshedRes);
        setMessages(normalizeCreateMessages(refreshedData.messages ?? []));
        if (refreshedData.collectedInfo) {
          setCollectedInfo(normalizeCollectedInfo(refreshedData.collectedInfo));
        }
        if (refreshedData.extractedData) {
          setExtractedData(normalizeExtractedData(refreshedData.extractedData));
        }
      }
    } catch (error) {
      console.error("[Start] Failed:", error);
      toast.error("Failed to start. Please try again.");
    }
  };

  const submitCurrentInput = (transcribedText?: string) => {
    const textToSubmit = transcribedText || input;
    if (!textToSubmit?.trim() || isLoading || authError || isConversationLocked) return;

    if (!transcribedText) setInput("");
    void sendMessage({
      role: "user",
      parts: [{ type: "text" as const, text: textToSubmit }],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentInput();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input?.trim() || isLoading || isConversationLocked) return;
      submitCurrentInput();
    }
  };

  const setCreationVoiceMode = (enabled: boolean) => {
    setIsVoiceMode(enabled);
    if (enabled) {
      void startTranscription({
        target: "survey-create-input",
        language,
        onTranscript: (transcript) => submitCurrentInput(transcript),
      });
    } else {
      stopRecording();
    }
  };

  const handleGoToSampleConversations = async () => {
    if (!surveyId) return;
    setIsFinalizing(true);
    try {
      const result = await finalizeSurveyCreationAction(surveyId);

      if (!result.success) {
        toast.error(
          getFriendlyActionError(
            result.error,
            translations("Toasts.FinalizeFailed"),
          ),
        );
        return;
      }

      toast.success(translations("Toasts.Finalized"));
      router.push(`/dashboard/surveys/${surveyId}/sample-review`);
    } catch (error) {
      console.error("[Finalize] Failed:", error);
      toast.error(translations("Toasts.GenericError"));
    } finally {
      setIsFinalizing(false);
    }
  };

  // â”€â”€ Auth gate â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  if (authError) {
    return (
      <AuthRequiredState
        authError={authError}
        translations={translations}
      />
    );
  }

  // â”€â”€ Render â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  return (
    <CreationPageChrome
      surveyId={surveyId}
      isConversationLocked={isConversationLocked}
      isCreatingDraft={isCreatingDraft}
      surveyStatus={surveyStatus}
      initialLoadError={initialLoadError}
      isInitializing={isInitializing}
      translations={translations}
    >
      {!surveyId ? (
        <CreationEntryScreen
          isVoiceMode={isVoiceMode}
          setCreationVoiceMode={setCreationVoiceMode}
          handleStart={() => {
            void handleStart();
          }}
          translations={translations}
        />
      ) : (
        <CreationWorkspace
          isConversationLocked={isConversationLocked}
          isReadyForSample={isReadyForSample}
          isFinalizing={isFinalizing}
          messages={messages}
          isLoading={isLoading}
          isResearching={isResearching}
          isInitializing={isInitializing}
          isVoiceMode={isVoiceMode}
          input={input}
          setInput={setInput}
          handleSubmit={handleSubmit}
          handleKeyDown={handleKeyDown}
          setCreationVoiceMode={setCreationVoiceMode}
          messagesEndRef={messagesEndRef}
          handleGoToSampleConversations={() => {
            void handleGoToSampleConversations();
          }}
        />
      )}
    </CreationPageChrome>
  );
}
