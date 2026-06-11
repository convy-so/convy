"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  useCallback,
} from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  Loader2,
  User,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { finalizeSurveyCreationAction } from "@/app/actions/survey";
import { useAuth } from "@/components/providers/auth-provider";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { isAppLocale, type AppLocale } from "@/lib/i18n/config";
import {
  useSurveyCreationDraft,
  type SurveyExtractedData,
} from "@/components/surveys/hooks/use-survey-creation-draft";
import {
  normalizeCreateMessages,
  normalizeCollectedInfo,
  normalizeExtractedData,
} from "@/lib/surveys/message-normalizer";
import { CreatorChatSection } from "@/components/surveys/creator/CreatorChatSection";
import { getFriendlyActionError } from "@/lib/action-ux";
import type { SurveyDetailsResponse } from "@/lib/api/surveys";

type SurveyCreationSyncResponse = {
  messages?: unknown[];
  collectedInfo?: unknown;
  extractedData?: unknown;
  status?: string;
};

type InitialSurveyCreationState = {
  surveyId: string;
  status: string;
  language?: string | null;
  isVoice?: boolean;
  permission?: {
    canEdit?: boolean;
  } | null;
  messages?: unknown[];
  collectedInfo?: unknown;
  extractedData?: unknown;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function createHiddenGreetingMessage() {
  return {
    id: `survey-create-bootstrap-${Date.now()}`,
    role: "user" as const,
    parts: [
      {
        type: "text" as const,
        text: "Start the conversation now. Greet the participant according to the system prompt instructions.",
      },
    ],
  };
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
  const t = useTranslations("Survey.Create");
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
    t,
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
        fetch: fetch as typeof fetch,
        prepareSendMessagesRequest: async ({
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
      onToolCall: async ({ toolCall }) => {
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

        const refreshedData =
          (await refreshedRes.json()) as SurveyCreationSyncResponse;
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

    const surveyRecord = initialSurveyData?.survey;
    const nextStatus = surveyRecord?.status ?? initialCreationState.status ?? null;
    const nextLanguage = surveyRecord?.language ?? initialCreationState.language;
    const nextIsVoice =
      typeof surveyRecord?.isVoice === "boolean"
        ? surveyRecord.isVoice
        : typeof initialCreationState.isVoice === "boolean"
          ? initialCreationState.isVoice
          : null;
    const canEdit =
      surveyRecord?.permission?.canEdit === true ||
      initialCreationState.permission?.canEdit === true;
    const isFinished = Boolean(nextStatus && nextStatus !== "creating");

    setSurveyStatus(nextStatus);

    if (isAppLocale(nextLanguage)) {
      setLanguage(nextLanguage);
    }

    if (typeof nextIsVoice === "boolean") {
      setIsVoiceSurvey(nextIsVoice);
      setIsVoiceMode(nextIsVoice);
    }

    setIsReadOnly(
      Boolean(
        isFinished ||
          !canEdit ||
          (normalizedExtractedData as
            | { readyForSampling?: boolean }
            | null)?.readyForSampling,
      ),
    );
    setIsInitializing(false);

    if (
      normalizedMessages.length === 0 &&
      !isFinished &&
      canEdit &&
      !normalizedExtractedData.readyForSampling
    ) {
      void bootstrapConversation(initialSurveyId);
    }
  }, [
    bootstrapConversation,
    initialCreationState,
    initialLanguage,
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
          const data = (await conversationRes.json()) as SurveyCreationSyncResponse;
          normalizedMessages = normalizeCreateMessages(data.messages ?? []);
          setMessages(normalizedMessages);
          const ci = normalizeCollectedInfo(data.collectedInfo);
          if (ci) setCollectedInfo(ci);
          const ed = normalizeExtractedData(data.extractedData);
          normalizedConversationExtractedData = ed;
          if (ed) setExtractedData(ed);
        }

        if (surveyRes.ok) {
          const surveyData = await surveyRes.json();
          const surveyRecord = isRecord(surveyData) ? surveyData.survey : null;
          const surveyStatus =
            isRecord(surveyRecord) && typeof surveyRecord.status === "string"
              ? surveyRecord.status
              : null;
          const canEdit =
            isRecord(surveyRecord) &&
            isRecord(surveyRecord.permission) &&
            surveyRecord.permission.canEdit === true;

          setSurveyStatus(surveyStatus);

          if (
            isRecord(surveyRecord) &&
            isAppLocale(surveyRecord.language)
          ) {
            setLanguage(surveyRecord.language);
          }
          if (
            isRecord(surveyRecord) &&
            typeof surveyRecord.isVoice === "boolean"
          ) {
            setIsVoiceSurvey(surveyRecord.isVoice);
          }

          const isFinished = surveyStatus && surveyStatus !== "creating";
          const readyToSample = Boolean(
            (normalizedConversationExtractedData as
              | { readyForSampling?: boolean }
              | null)?.readyForSampling,
          );
          setIsReadOnly(Boolean(isFinished || !canEdit || readyToSample));
          canBootstrapConversation =
            !isFinished && canEdit && !readyToSample;
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
      const data = await res.json();
      if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
      if (
        data.extractedData &&
        Object.keys(data.extractedData as object).length > 0
      ) {
        setExtractedData(data.extractedData);
      }
    } catch (err) {
      if (err instanceof TypeError && err.message === "Failed to fetch") return;
      console.error("[fetchUpdatedData] ERROR:", err);
    }
  }, [surveyId, setCollectedInfo, setExtractedData]);

  useEffect(() => {
    if (!surveyId || status === "ready") return;
    const timer = setInterval(fetchUpdatedData, 3000);
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

  // ── Derived state ─────────────────────────────────────────────────────────
  const isReadyForSample = useMemo(() => {
    if (!surveyId) return false;

    if (
      surveyStatus === "sample_review" ||
      surveyStatus === "active" ||
      surveyStatus === "completed"
    ) {
      return true;
    }

    return Boolean(extractedData?.readyForSampling);
  }, [surveyId, surveyStatus, extractedData]);

  const isConversationLocked = isReadOnly || isReadyForSample;

  // ── Handlers ──────────────────────────────────────────────────────────────
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
            "messages" in surveyData
              ? (surveyData.messages as unknown[])
              : null;
        }
      } catch {
        toast.error(t("Toasts.InitFailed"));
        return;
      }
    }

    if (!currentSurveyId) return;

    try {
      const currentStateRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
      if (!currentStateRes.ok) {
        throw new Error("Failed to load creation state.");
      }

      const currentState = (await currentStateRes.json()) as SurveyCreationSyncResponse;
      const currentMessages =
        existingMessages ?? (Array.isArray(currentState.messages) ? currentState.messages : []);

      if (normalizeCreateMessages(currentMessages).length === 0) {
        await bootstrapConversation(currentSurveyId);
      } else {
        const refreshedRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
        if (!refreshedRes.ok) {
          throw new Error("Failed to refresh creation state.");
        }

        const refreshedData =
          (await refreshedRes.json()) as SurveyCreationSyncResponse;
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
    sendMessage({
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
        toast.error(getFriendlyActionError(result.error, t("Toasts.FinalizeFailed")));
        return;
      }

      toast.success(t("Toasts.Finalized"));
      router.push(`/dashboard/surveys/${surveyId}/sample-review`);
    } catch (error) {
      console.error("[Finalize] Failed:", error);
      toast.error(t("Toasts.GenericError"));
    } finally {
      setIsFinalizing(false);
    }
  };

  // ── Auth gate ──────────────────────────────────────────────────────────────
  if (authError) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">
            {t("Authentication.Required")}
          </h2>
          <p className="text-gray-600 max-w-md">{authError}</p>
          <div className="flex gap-3 justify-center">
            {authError.includes("verify") ? (
              <>
                <Link
                  href="/verify-email"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {t("Authentication.VerifyEmail")}
                </Link>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t("Authentication.GoBack")}
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  {t("Authentication.SignIn")}
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  {t("Authentication.GoHome")}
                </Link>
              </>
            )}
          </div>
        </div>
      </div>
    );
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      <div className="min-h-screen flex flex-col bg-white text-slate-950">
        <div
          className={cn(
            "relative flex flex-1 flex-col overflow-hidden",
            surveyId ? "bg-white" : "bg-white",
          )}
        >
          {initialLoadError ? (
            <div className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {initialLoadError}
            </div>
          ) : null}

          {/* Header */}
          <div
            className={cn(
              "flex flex-col items-center justify-between gap-4 border-b border-slate-200 px-4 py-4 sm:flex-row sm:px-6 lg:px-8",
              surveyId
                ? "bg-white"
                : "bg-white",
            )}
          >
            {!surveyId ? (
              <div className="w-full py-2 text-center">
                <h1 className="flex items-center justify-center gap-2 text-2xl font-semibold tracking-tight text-slate-950">
                  <Sparkles className="w-5 h-5" />
                  {t("Title.Create")}
                </h1>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="p-1 text-slate-400 transition-colors hover:text-slate-950"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="flex items-center gap-2 text-xl font-semibold tracking-tight text-slate-950">
                    {isConversationLocked ? "View Survey" : "Build Survey"}
                    {isCreatingDraft && (
                      <Loader2 className="w-4 h-4 animate-spin text-slate-400" />
                    )}
                  </h1>
                  <div className="mt-1 flex items-center gap-2">
                    {(isConversationLocked || surveyStatus === "completed") && (
                      <span className="border border-slate-200 px-2 py-0.5 text-[10px] uppercase tracking-[0.18em] text-slate-500">
                        Read Only
                      </span>
                    )}
                  </div>
                </div>
              </div>
            )}
            <div className="flex items-center gap-4 w-full sm:w-auto mt-4 sm:mt-0" />
          </div>

          {/* Read-only banner */}
          {isConversationLocked && (
            <div className="flex items-center justify-center gap-2 border-b border-slate-200 px-4 py-2 text-sm text-slate-600">
              <Sparkles className="w-4 h-4" />
              <span>
                {surveyStatus === "creating"
                  ? "This brief is ready for sample review. The creation chat is now locked."
                  : "This survey is finalized and cannot be edited."}
              </span>
              <Link
                href={`/dashboard/surveys/${surveyId}`}
                className="font-medium hover:underline"
              >
                View Dashboard
              </Link>
            </div>
          )}

          {/* Main area */}
          <div
            className={cn(
              "relative flex flex-1 flex-col overflow-hidden",
              surveyId ? "bg-white" : "bg-white",
            )}
          >
            {isInitializing && (
              <div className="flex items-center justify-center border-b border-slate-200 px-4 py-3 text-sm text-slate-500">
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Loading survey state...
              </div>
            )}

            {/* Pre-start configuration */}
            {!surveyId ? (
              <div className="flex-1 overflow-y-auto px-4 py-10 sm:px-6 lg:px-8">
                <div className="mx-auto max-w-3xl">
                  <div className="space-y-8 text-center">
                    <h2 className="text-4xl font-semibold tracking-tight text-slate-950">
                      {t("Title.ChooseTopic")}
                    </h2>
                    <p className="mx-auto max-w-2xl text-lg leading-8 text-slate-500">
                      {t("Subtitle")}
                    </p>

                    <div className="mx-auto max-w-2xl space-y-6">
                      <div className="grid grid-cols-1 gap-px border-y border-slate-200 sm:grid-cols-2">
                        {[
                          {
                            active: !isVoiceMode,
                            icon: <Send className="w-4 h-4" />,
                            label: t("CreationMode.Text"),
                            desc: t("CreationMode.TextDescription"),
                            onClick: () => setCreationVoiceMode(false),
                          },
                          {
                            active: isVoiceMode,
                            icon: <Mic className="w-4 h-4" />,
                            label: t("CreationMode.Voice"),
                            desc: t("CreationMode.VoiceDescription"),
                            onClick: () => setCreationVoiceMode(true),
                          },
                        ].map(({ active, icon, label, desc, onClick }) => (
                          <button
                            key={label}
                            onClick={onClick}
                            className={cn(
                              "flex items-start gap-3 border-x border-slate-200 bg-white px-4 py-4 text-left transition",
                              active
                                ? "text-slate-950"
                                : "text-slate-500 hover:text-slate-950",
                            )}
                          >
                            <span className="mt-0.5">{icon}</span>
                            <span>
                              <span className="block text-sm font-medium">{label}</span>
                              <span className="mt-1 block text-xs leading-5 text-slate-500">
                                {desc}
                              </span>
                            </span>
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center justify-between gap-4 border-t border-slate-200 pt-6 text-left">
                        <div>
                          <p className="text-sm font-medium text-slate-950">
                            Start the creation session
                          </p>
                          <p className="mt-1 text-sm text-slate-500">
                            Open the transcript and begin shaping the brief.
                          </p>
                        </div>
                        <button
                          onClick={handleStart}
                          className="inline-flex h-11 items-center gap-2 border border-slate-950 bg-slate-950 px-4 text-sm font-medium text-white transition hover:bg-slate-800"
                        >
                          <Play className="h-4 w-4" />
                          Start
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 overflow-hidden">
                <div className="mx-auto flex h-full w-full max-w-4xl flex-col px-4 pb-4 sm:px-6 lg:px-8">
                  <div className="border-b border-slate-200 py-5">
                    <p className="text-xs uppercase tracking-[0.18em] text-slate-400">
                      Survey creation
                    </p>
                    <h2 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
                      Build the brief in conversation.
                    </h2>
                    <p className="mt-2 text-sm leading-6 text-slate-500">
                      Keep the page quiet. The transcript is the primary workspace.
                    </p>
                  </div>

                  <div className="min-h-0 flex-1">
                    <CreatorChatSection
                      messages={messages}
                      isLoading={isLoading}
                      isResearching={isResearching}
                      isInitializing={isInitializing}
                      isReadOnly={isConversationLocked}
                      isVoiceMode={isVoiceMode}
                      input={input}
                      setInput={setInput}
                      handleSubmit={handleSubmit}
                      handleKeyDown={handleKeyDown}
                      setCreationVoiceMode={setCreationVoiceMode}
                      messagesEndRef={messagesEndRef}
                    />
                  </div>

                  <div className="flex items-center justify-between gap-4 border-t border-slate-200 py-4">
                    <p className="text-sm text-slate-500">
                      Generate sample conversations when the brief is complete.
                    </p>
                    <button
                      onClick={handleGoToSampleConversations}
                      disabled={!isReadyForSample || isFinalizing}
                      className={cn(
                        "inline-flex h-10 items-center gap-2 border px-4 text-sm font-medium transition",
                        !isReadyForSample || isFinalizing
                          ? "cursor-not-allowed border-slate-200 bg-slate-100 text-slate-400"
                          : "border-slate-950 bg-slate-950 text-white hover:bg-slate-800",
                      )}
                    >
                      {isFinalizing ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      Generate Sample Conversations
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </>
  );
}
