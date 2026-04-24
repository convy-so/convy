"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  Suspense,
  useCallback,
} from "react";
import { useSearchParams, useParams } from "next/navigation";
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
import { useAuth } from "@/components/providers/auth-provider";
import { PublishSurveyModal } from "@/components/surveys/publish-survey-modal";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import {
  isCreationMediaDecisionResolved,
  normalizeCreationMediaDecision,
} from "@/lib/education/agent-tools";
import { isAppLocale } from "@/lib/i18n/config";
import {
  useSurveyCreationDraft,
  type SurveyExtractedData,
} from "@/components/surveys/hooks/use-survey-creation-draft";
import {
  type UIMessage,
  normalizeCreateMessages,
  normalizeCollectedInfo,
  normalizeExtractedData,
} from "@/lib/surveys/message-normalizer";
import { CreatorChatSection } from "@/components/surveys/creator/CreatorChatSection";
import { CreatorSidebarSection } from "@/components/surveys/creator/CreatorSidebarSection";

type SurveyCreationSyncResponse = {
  messages?: unknown[];
  collectedInfo?: unknown;
  extractedData?: unknown;
  status?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function CreateSurveyContent() {
  const t = useTranslations("Survey.Create");
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id") ?? searchParams.get("surveyId");
  const params = useParams();
  const locale = typeof params.locale === "string" ? params.locale : "en";

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
    isVoiceSurvey,
    setIsVoiceSurvey,
    extractedData,
    setExtractedData,
    collectedInfo,
    setCollectedInfo,
    isCreatingDraft,
    ensureDraftExists,
    updateSurveyMode,
  } = useSurveyCreationDraft({ authLoading, locale, t, user });

  // Page-local UI state
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isResearching, setIsResearching] = useState(false);
  const [hasAutoGreeted, setHasAutoGreeted] = useState(false);
  const [input, setInput] = useState("");

  // Keep refs in sync for the chat transport closure without re-initialising useChat
  const surveyIdRef = useRef<string | null>(surveyId);
  const extractedDataRef = useRef<SurveyExtractedData | null>(extractedData);
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
        api: "/api/surveys/create-draft",
        fetch: fetch as typeof fetch,
        prepareSendMessagesRequest: async ({
          api,
          body,
          id,
          messages: msgs,
          trigger,
          messageId,
        }) => {
          const sid = surveyIdRef.current;
          return {
            api: sid ? `/api/surveys/${sid}/create` : api,
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

  const isLoading = status === "streaming" || status === "submitted";

  const {
    isSupported: isVoiceInputSupported,
    phase: transcriptionPhase,
    startTranscription,
    stopRecording,
  } = useAudioTranscription({
    onError: (message) => {
      toast.error(message);
    },
  });

  const mediaDecision = useMemo(
    () => normalizeCreationMediaDecision(extractedData?.mediaDecision),
    [extractedData],
  );
  const mediaDecisionResolved = isCreationMediaDecisionResolved(mediaDecision);

  const resolveLocalMediaToolResult = useCallback(
    (toolCallId: string, output: Record<string, unknown>) => {
      setMessages((prev: UIMessage[]) =>
        prev.map((message) => ({
          ...message,
          parts: message.parts?.map((part) => {
            const isSdkTool =
              part.type === "tool-requestMediaUpload" &&
              part.toolCallId === toolCallId;
            if (!isSdkTool) return part;
            return {
              type: part.type as `tool-${string}`,
              toolCallId: part.toolCallId,
              state: "output-available" as const,
              input: "input" in part ? part.input : {},
              output,
            };
          }),
        })),
      );
    },
    [setMessages],
  );

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

        if (conversationRes.ok) {
          const data = (await conversationRes.json()) as SurveyCreationSyncResponse;
          if (data.messages && (data.messages as unknown[]).length > 0) {
            setMessages(normalizeCreateMessages(data.messages));
          }
          const ci = normalizeCollectedInfo(data.collectedInfo);
          if (ci) setCollectedInfo(ci);
          const ed = normalizeExtractedData(data.extractedData);
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
          setIsReadOnly(Boolean(isFinished || !canEdit));
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
  ]);

  // Auto-greet when draft loads empty
  useEffect(() => {
    if (
      isInitializing ||
      authLoading ||
      !user ||
      !surveyId ||
      isReadOnly ||
      hasAutoGreeted ||
      status === "submitted" ||
      status === "streaming" ||
      messages.length > 0
    )
      return;

    sendMessage({
      role: "user",
      parts: [
        {
          type: "text" as const,
          text: "Start the conversation now. Greet the participant according to the system prompt instructions.",
        },
      ],
    });
    setHasAutoGreeted(true);
  }, [
    isInitializing,
    authLoading,
    user,
    surveyId,
    messages.length,
    status,
    isReadOnly,
    hasAutoGreeted,
    sendMessage,
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
    if (!surveyId || !collectedInfo || !mediaDecisionResolved) return false;

    const finishToolCalled = messages.some((m) =>
      m.parts?.some((p) => p.type === "tool-finishSurvey"),
    );
    if (finishToolCalled) return true;

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    const msgContent =
      lastAssistantMessage?.parts
        ?.filter((p) => p.type === "text")
        .map((p) => ("text" in p ? p.text : ""))
        .join("") || "";

    const aiMentionedSamples =
      (msgContent.toLowerCase().includes("sample conversation") ||
        (msgContent.toLowerCase().includes("click") &&
          msgContent.toLowerCase().includes("button")));

    const criticalFlagsCollected =
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.subjectDefined &&
      collectedInfo.programIdentified;

    if (aiMentionedSamples && criticalFlagsCollected) return true;

    const allFlagsCollected =
      criticalFlagsCollected &&
      collectedInfo.scope &&
      collectedInfo.successCriteria &&
      collectedInfo.constraints &&
      collectedInfo.tone &&
      collectedInfo.requiredQuestions &&
      collectedInfo.metrics &&
      collectedInfo.personalInfo;

    if (!allFlagsCollected || !extractedData)
      return Boolean(extractedData?.readyForSampling);
    if (extractedData.readyForSampling) return true;

    return Boolean(
      allFlagsCollected &&
        extractedData.objective?.goal &&
        extractedData.targetAudience?.description &&
        extractedData.programId?.trim(),
    );
  }, [
    surveyId,
    collectedInfo,
    extractedData,
    mediaDecisionResolved,
    messages,
  ]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  const handleStart = async () => {
    let currentSurveyId = surveyId;
    let initialGreetingMessages: unknown[] | null = null;

    if (!currentSurveyId) {
      try {
        const surveyData = await ensureDraftExists();
        if (!surveyData) return;
        if (typeof surveyData === "string") {
          currentSurveyId = surveyData;
        } else {
          currentSurveyId = surveyData.id;
          initialGreetingMessages =
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

    if (!initialGreetingMessages) {
      await updateSurveyMode(currentSurveyId, isVoiceSurvey);
    }

    try {
      if (!initialGreetingMessages) {
        await fetch(`/api/surveys/${currentSurveyId}/create`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        });
      }

      if (initialGreetingMessages) {
        setMessages(normalizeCreateMessages(initialGreetingMessages));
      } else {
        const greetingRes = await fetch(
          `/api/surveys/${currentSurveyId}/create`,
        );
        if (greetingRes.ok) {
          const greetingData = (await greetingRes.json()) as SurveyCreationSyncResponse;
          if (greetingData.messages && (greetingData.messages as unknown[]).length > 0) {
            setMessages(normalizeCreateMessages(greetingData.messages));
          }
          if (greetingData.collectedInfo)
            setCollectedInfo(normalizeCollectedInfo(greetingData.collectedInfo));
          if (greetingData.extractedData)
            setExtractedData(normalizeExtractedData(greetingData.extractedData));
        }
      }
    } catch (error) {
      console.error("[Start] Failed:", error);
      toast.error("Failed to start. Please try again.");
    }
  };

  const submitCurrentInput = (transcribedText?: string) => {
    const textToSubmit = transcribedText || input;
    if (!textToSubmit?.trim() || isLoading || authError) return;

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
      if (!input?.trim() || isLoading) return;
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
      const response = await fetch(
        `/api/surveys/${surveyId}/finalize-creation`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "include",
        },
      );

      if (!response.ok) {
        toast.error(t("Toasts.FinalizeFailed"));
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
      <div className="h-full flex flex-col w-full mx-auto overflow-hidden">
        <div
          className={cn(
            "flex-1 flex flex-col overflow-hidden relative transition-all duration-500",
            surveyId ? "bg-transparent" : "",
          )}
        >
          {/* Header */}
          <div
            className={cn(
              "flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 transition-all duration-500",
              surveyId
                ? "bg-transparent border-b border-gray-100"
                : "bg-transparent",
            )}
          >
            {!surveyId ? (
              <div className="w-full text-center py-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                  {t("Title.Create")}
                </h1>
              </div>
            ) : (
              <div className="flex items-center gap-3">
                <Link
                  href="/dashboard"
                  className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900"
                >
                  <ArrowLeft className="w-5 h-5" />
                </Link>
                <div>
                  <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                    {isReadOnly ? "View Survey" : "Build Survey"}
                    {isCreatingDraft && (
                      <Loader2 className="w-4 h-4 animate-spin text-gray-400" />
                    )}
                  </h1>
                  <div className="flex items-center gap-2 mt-1">
                    {(isReadOnly || surveyStatus === "completed") && (
                      <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
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
          {isReadOnly && (
            <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-2 flex items-center justify-center gap-2 text-sm text-blue-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>This survey is finalized and cannot be edited.</span>
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
              "flex-1 overflow-hidden relative flex flex-col",
              surveyId ? "bg-white" : "bg-transparent",
            )}
          >
            {isInitializing && (
              <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            )}

            {/* Pre-start configuration */}
            {!surveyId ? (
              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 py-10">
                  <div className="text-center space-y-6">
                    <h2 className="text-4xl font-bold text-gray-900 tracking-tight">
                      {t("Title.ChooseTopic")}
                    </h2>
                    <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
                      {t("Subtitle")}
                    </p>

                    <div className="mt-8">
                      <div className="max-w-4xl mx-auto w-full bg-white rounded-2xl p-8 lg:p-12 border border-gray-200">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">

                          {/* Creator input mode */}
                          <div className="space-y-6">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                                <Sparkles className="w-6 h-6 text-black" />
                              </div>
                              <div>
                                <h3 className="text-xl font-medium text-black">
                                  {t("CreationMode.Title")}
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                  {t("CreationMode.Description")}
                                </p>
                              </div>
                            </div>
                            <div className="grid grid-cols-1 gap-4">
                              {[
                                {
                                  active: !isVoiceMode,
                                  icon: <Send className="w-5 h-5" />,
                                  label: t("CreationMode.Text"),
                                  desc: t("CreationMode.TextDescription"),
                                  onClick: () => setCreationVoiceMode(false),
                                },
                                {
                                  active: isVoiceMode,
                                  icon: <Mic className="w-5 h-5" />,
                                  label: t("CreationMode.Voice"),
                                  desc: t("CreationMode.VoiceDescription"),
                                  onClick: () => setCreationVoiceMode(true),
                                },
                              ].map(({ active, icon, label, desc, onClick }) => (
                                <button
                                  key={label}
                                  onClick={onClick}
                                  className={cn(
                                    "flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 border",
                                    active
                                      ? "bg-gray-50 text-black border-black shadow-none ring-1 ring-black"
                                      : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900 shadow-sm",
                                  )}
                                >
                                  <div className="shrink-0 w-10 h-10 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center">
                                    {icon}
                                  </div>
                                  <div className="space-y-1">
                                    <span className="block font-bold text-sm lg:text-base">
                                      {label}
                                    </span>
                                    <span className="text-[11px] lg:text-xs opacity-70 leading-tight block">
                                      {desc}
                                    </span>
                                  </div>
                                </button>
                              ))}
                            </div>
                          </div>

                          {/* Quick Actions */}
                          <div className="space-y-6">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                                <Play className="w-6 h-6 text-black" />
                              </div>
                              <div>
                                <h3 className="text-xl font-medium text-black">
                                  Get Started
                                </h3>
                                <p className="text-sm text-gray-500 mt-1">
                                  Launch your survey creation session
                                </p>
                              </div>
                            </div>
                            <div className="flex flex-col h-full justify-center">
                              <button
                                onClick={handleStart}
                                className="group relative w-full bg-black text-white p-6 rounded-2xl font-bold text-lg hover:bg-gray-900 transition-all duration-300 shadow-xl shadow-black/10 overflow-hidden"
                              >
                                <div className="relative z-10 flex items-center justify-center gap-3">
                                  <span>Start Creation Session</span>
                                  <Sparkles className="w-5 h-5 animate-pulse" />
                                </div>
                                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/10 to-transparent -translate-x-full group-hover:translate-x-full transition-transform duration-1000" />
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex-1 flex flex-col lg:flex-row overflow-hidden">
                {/* Chat Section */}
                <CreatorChatSection
                  messages={messages}
                  isLoading={isLoading}
                  isResearching={isResearching}
                  isInitializing={isInitializing}
                  isReadOnly={isReadOnly}
                  isVoiceMode={isVoiceMode}
                  input={input}
                  setInput={setInput}
                  handleSubmit={handleSubmit}
                  handleKeyDown={handleKeyDown}
                  setCreationVoiceMode={setCreationVoiceMode}
                  messagesEndRef={messagesEndRef}
                  t={t}
                />

                {/* Sidebar Section */}
                <CreatorSidebarSection
                  surveyId={surveyId}
                  collectedInfo={collectedInfo}
                  extractedData={extractedData}
                  mediaDecision={mediaDecision}
                  mediaDecisionResolved={mediaDecisionResolved}
                  resolveLocalMediaToolResult={resolveLocalMediaToolResult}
                  isReadyForSample={isReadyForSample}
                  isFinalizing={isFinalizing}
                  handleGoToSampleConversations={handleGoToSampleConversations}
                  t={t}
                />
              </div>
            )}
          </div>
        </div>

        {surveyId && (
          <PublishSurveyModal
            isOpen={showPublishModal}
            onClose={() => setShowPublishModal(false)}
            surveyId={surveyId}
          />
        )}
      </div>
    </>
  );
}

export default function CreateSurveyPage() {
  return (
    <Suspense
      fallback={
        <div className="h-screen flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
        </div>
      }
    >
      <CreateSurveyContent />
    </Suspense>
  );
}
