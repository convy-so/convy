"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import { useParams, useSearchParams } from "next/navigation";
import {
  Mic,
  MicOff,
  CheckCircle,
  AlertCircle,
  Send,
  Loader2,
  User,
  Sparkles,
  Paperclip,
} from "lucide-react";
import Image from "next/image";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage, Message as SDKMessage } from "ai";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { VoiceSurveyStartOverlay } from "@/components/surveys/voice-survey-start-overlay";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { Globe } from "lucide-react";

import {
  type SurveyInitResponse,
  type SurveyUIMessage,
  type SurveyLanguage
} from "@/lib/types/survey-flow";

interface MessageWithTools extends SurveyUIMessage {
  toolInvocations?: Array<{ toolName: string; state: string; result?: unknown; toolCallId?: string }>;
}

async function initializeSurvey(
  shareableLink: string,
  conversationId?: string | null,
): Promise<SurveyInitResponse> {
  const url = conversationId
    ? `/api/surveys/respond/${shareableLink}?conversationId=${conversationId}`
    : `/api/surveys/respond/${shareableLink}`;

  const response = await fetch(url);

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error("Survey not found");
    } else if (response.status === 403) {
      const data = await response.json();
      throw new Error(
        data.error || "This survey is no longer accepting responses",
      );
    } else {
      throw new Error("Failed to load survey");
    }
  }

  return response.json();
}

// Premium UI Components
const VisualizerRing = ({
  isRecording,
  isAgentSpeaking,
  status,
  size = "normal",
}: {
  isRecording: boolean;
  isAgentSpeaking: boolean;
  status: string;
  size?: "normal" | "large";
}) => (
  <div className="relative flex items-center justify-center">
    {(isRecording || isAgentSpeaking) && (
      <>
        <div
          className={cn(
            "absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
            size === "large" ? "border-8" : "border-4",
            isAgentSpeaking ? "border-emerald-500/20" : "border-indigo-500/20"
          )}
        />
        <div
          className={cn(
            "absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
            size === "large" ? "border-8" : "border-4",
            isAgentSpeaking ? "border-emerald-500/10" : "border-indigo-500/10"
          )}
        />
      </>
    )}
    <div
      className={cn(
        "relative z-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl backdrop-blur-sm border border-white/10",
        status === "error"
          ? "bg-red-500 shadow-red-500/50"
          : isAgentSpeaking
            ? "bg-gradient-to-br from-emerald-500 to-teal-600 scale-110 shadow-emerald-500/30"
            : isRecording
              ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/30"
              : "bg-gray-900 shadow-md hover:scale-105",
        size === "large" ? "w-32 h-32" : "w-20 h-20",
      )}
    >
      {status === "error" ? (
        <AlertCircle
          className={cn(
            "text-white",
            size === "large" ? "w-12 h-12" : "w-8 h-8",
          )}
        />
      ) : isAgentSpeaking ? (
        <Sparkles
          className={cn(
            "text-white animate-pulse",
            size === "large" ? "w-12 h-12" : "w-8 h-8",
          )}
        />
      ) : isRecording ? (
        <MicOff
          className={cn(
            "text-white",
            size === "large" ? "w-12 h-12" : "w-8 h-8",
          )}
        />
      ) : (
        <Mic
          className={cn(
            "text-white",
            size === "large" ? "w-12 h-12" : "w-8 h-8",
          )}
        />
      )}
    </div>
  </div>
);

function SurveyContent() {
  const params = useParams();
  const searchParams = useSearchParams();
  const isEmbed = searchParams.get("embed") === "true" || (typeof window !== "undefined" && window.parent !== window);
  const shareableLink = params.shareableLink as string;
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("Survey.Response");

  const {
    data: initData,
    isLoading: isInitializing,
    error: initError,
  } = useQuery({
    queryKey: ["survey-respond", shareableLink],
    queryFn: () => {
      // Check for existing session
      let storedConversationId = null;
      if (typeof window !== "undefined") {
        try {
          const stored = localStorage.getItem(`convy_session_${shareableLink}`);
          if (stored) {
            storedConversationId = JSON.parse(stored).conversationId;
          }
        } catch (e) {
          console.error("Failed to parse stored session", e);
        }
      }
      return initializeSurvey(shareableLink, storedConversationId);
    },
    enabled: !!shareableLink,
    staleTime: Infinity,
    retry: false,
  });

  // Save session when initialized
  useEffect(() => {
    if (initData?.conversationId && initData?.participantId) {
      localStorage.setItem(
        `convy_session_${shareableLink}`,
        JSON.stringify({
          conversationId: initData.conversationId,
          participantId: initData.participantId,
        }),
      );
    }
  }, [initData, shareableLink]);

  const survey = initData?.survey ?? null;
  const conversationId = initData?.conversationId ?? null;
  const resumedMessages = initData?.messages ?? [];
  const initiallyCompleted = initData?.completed ?? false;
  const apiEndpoint = `/api/surveys/respond/${shareableLink}`;

  // State declarations - must be before hooks that reference them
  const [input, setInput] = useState("");
  // Sync completion state from API - use initializer to avoid effect
  const [isCompleted, setIsCompleted] = useState(initiallyCompleted);
  const [hasStarted, setHasStarted] = useState(false);

  // Still keep effect for reactive updates if initiallyCompleted changes (edge case)
  const [prevInitiallyCompleted, setPrevInitiallyCompleted] = useState(initiallyCompleted);
  if (initiallyCompleted !== prevInitiallyCompleted) {
    setPrevInitiallyCompleted(initiallyCompleted);
    if (!isCompleted) setIsCompleted(true);
  }

  // Redirect to survey language if different from current locale on first load
  useEffect(() => {
    if (survey?.language && survey.language !== locale) {
      const storageKey = `convy_redirected_${shareableLink}`;
      // Only redirect if we haven't already redirected for this session
      const hasRedirected = sessionStorage.getItem(storageKey);

      if (!hasRedirected) {
        sessionStorage.setItem(storageKey, "true");
        router.replace({ pathname, query: { shareableLink } } as { pathname: string; query: Record<string, string> }, {
          locale: survey.language,
        });
      }
    }
  }, [survey?.language, locale, shareableLink, pathname, router]);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  // Unused state can be removed if not needed, but keeping for now if it was intended for lang switching
  // const [selectedLanguage, setSelectedLanguage] = useState<SurveyLanguage>((locale as SurveyLanguage) || "en");
  const selectedLanguage = (locale as SurveyLanguage) || "en";

  // Prepare initial messages for useChat
  // Sync Greeting: If voice survey and only 1 message exists (the initial greeting), 
  // clear it so the Voice Agent can initiate the conversation naturally.
  const initialChatMessages =
    resumedMessages.length > 1 || (!survey?.isVoice && resumedMessages.length > 0)
      ? resumedMessages.map((msg: SurveyUIMessage, i: number) => {
        // Ensure we handle the transition from 'content' (old) to 'parts' (v6) robustly
        const parts = msg.parts && msg.parts.length > 0
          ? msg.parts
          : (msg.content ? [{ type: "text", text: msg.content }] : []);

        return {
          id: msg.id || `msg-${i}`,
          role: msg.role as "system" | "user" | "assistant" | "data",
          displayedContent: msg.content || (parts.length > 0 && parts[0].type === 'text' ? (parts[0] as { text: string }).text : ""),
          parts
        };
      })
      : [];

  // useChat hook - only meaningful after initialization (AI SDK v6)
  const transport = useMemo(() => new DefaultChatTransport({
    api: apiEndpoint,
    body: { conversationId, language: locale },
  }), [apiEndpoint, conversationId, locale]);

  const {
    messages,
    setMessages: originalSetMessages,
    status,
    sendMessage,
  } = useChat({
    id: conversationId ?? "pending",
    transport,
    messages: initialChatMessages as SDKMessage[],
    onFinish: ({ message }: { message: UIMessage }) => {
      // Check for explicit tool calls (robust detection)
      const hasToolCompletion = message.parts?.some(
        (part) =>
          (part.type === "tool-invocation" || part.type === "tool-call") &&
          (part as { toolName: string }).toolName === "finishSurvey",
      );

      // Fallback to text detection
      const messageText =
        message.parts
          ?.filter((part) => part.type === "text")
          .map((part) => (part as { text: string }).text)
          .join(" ")
          .toLowerCase() || "";

      const hasTextCompletion =
        messageText.includes("thank you for completing") ||
        messageText.includes("survey is now complete");

      if (hasToolCompletion || hasTextCompletion) {
        setIsCompleted(true);
      }
    },
  });

  // Safety check: Watch messages for any missed completion signals
  useEffect(() => {
    if (isCompleted) {
      // Notify parent window of completion for embed scenarios
      if (typeof window !== "undefined" && window.parent !== window) {
        window.parent.postMessage(
          {
            type: "convy-survey-completed",
            surveyId: shareableLink,
          },
          "*",
        );
      }
      return;
    }
  }, [isCompleted, shareableLink]);

  const setMessages = originalSetMessages;
  const isChatLoading = status === "streaming" || status === "submitted";

  // set-state-in-effect fix: move completion detection from messages into render phase
  const lastMessage = messages[messages.length - 1] as MessageWithTools;
  const hasToolCompletion = lastMessage?.role === "assistant" && lastMessage.parts?.some(
    (part) =>
      (part.type === "tool-invocation" || part.type === "tool-call") &&
      (part as { toolName: string }).toolName === "finishSurvey",
  );

  if (hasToolCompletion && !isCompleted) {
    setIsCompleted(true);
  }

  // Auto-start or Resume for text mode is now handled SERVER-SIDE
  // The frontend no longer injects fake "user" messages like "Start the conversation..."
  // This prevents LLM confusion and corrupting the database chat history.
  // The backend's GET endpoint already initializes the conversation with a greeting.
  // set-state-in-effect fix: use render phase update or verify if effect is needed
  const [prevConversationId, setPrevConversationId] = useState(conversationId);
  if (
    !isInitializing &&
    !initError &&
    survey &&
    !survey.isVoice &&
    !isCompleted &&
    !hasStarted &&
    conversationId &&
    conversationId !== prevConversationId
  ) {
    setPrevConversationId(conversationId);
    setHasStarted(true);
  }

  // Voice WebSocket Integration
  const wsUrl = useMemo(() => survey?.isVoice
    ? `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${shareableLink}&language=${selectedLanguage}`
    : "", [survey?.isVoice, shareableLink, selectedLanguage]);

  // Ref for voice message handler to avoid circular dependency
  const onVoiceMessageRef = useRef<(data: Record<string, unknown>) => void>(() => { });

  const voiceWs = useVoiceWebSocket({
    url: wsUrl,
    onMessage: useCallback((data) => onVoiceMessageRef.current(data), []),
  });

  const handleVoiceMessage = useCallback((data: Record<string, unknown>) => {
    const type = data.type as string;
    // Chain of Trust: Unified message handling via Voice Agent events
    if (type === "conversation_text") {
      const { role, content } = data as { role: string; content: string };
      if (content.includes("<thinking>") || content.includes("Internal instructions:")) return;

      const assistantMessage = {
        id: `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        role: role as "assistant" | "user",
        displayedContent: content,
        parts: [{ type: "text" as const, text: content }],
      };

      setMessages((prev) => {
        const lastMsg = prev[prev.length - 1];
        const lastText = lastMsg?.parts?.find(p => p.type === 'text')?.text;
        if (lastText === content && lastMsg?.role === role) return prev;
        return [...prev, assistantMessage];
      });

      if (role === "assistant" && (content.toLowerCase().includes("thank you for completing") || content.toLowerCase().includes("survey is now complete"))) {
        setIsCompleted(true);
      }
    } else if (type === "audio_sent" || type === "text_response") {
      const text = (data as { text: string }).text;
      if (!text) return;
      const assistantMessage = {
        id: `legacy-${Date.now()}`,
        role: "assistant" as const,
        displayedContent: text,
        parts: [{ type: "text" as const, text }],
      };
      setMessages((prev) => [...prev, assistantMessage]);
      if (text.toLowerCase().includes("thank you for completing") || text.toLowerCase().includes("survey is now complete")) {
        setIsCompleted(true);
      }
    } else if (type === "display_media" && survey?.media) {
      const mediaId = (data as { media: { id: string } }).media?.id;
      const fullMedia = survey.media.find((m: { id: string }) => m.id === mediaId);
      if (fullMedia) {
        setMessages((prev) => [
          ...prev,
          {
            id: `media-${Date.now()}`,
            role: "assistant" as const,
            displayedContent: t("sharedMedia"),
            parts: [{ type: "text" as const, text: t("sharedMedia") }],
            media: fullMedia,
          } as SDKMessage,
        ]);
      }
    } else if (type === "survey_completed") {
      setIsCompleted(true);
      setIsVoiceMode(false);
      voiceWs.disconnect();
    }
  }, [survey, t, setMessages, voiceWs, setIsCompleted, setIsVoiceMode]);

  // Sync the ref with the handler
  useEffect(() => {
    onVoiceMessageRef.current = handleVoiceMessage;
  }, [handleVoiceMessage]);

  // Initial setup based on survey type - fix set-state-in-effect
  const [prevSurveyId, setPrevSurveyId] = useState(survey?.id);
  if (survey?.id !== prevSurveyId) {
    setPrevSurveyId(survey?.id);
    if (survey?.isVoice && !isVoiceMode) {
      setIsVoiceMode(true);
    } else if (!survey?.isVoice && isVoiceMode) {
      setIsVoiceMode(false);
    }
  }

  // Handle initial start (User Gesture)
  // Handle language switch behavior
  const handleLanguageChange = useCallback((newLocale: string) => {
    router.replace({ pathname, query: { shareableLink: shareableLink ?? "" } }, {
      locale: newLocale as "en" | "fr" | "de" | "es" | "it",
    });
  }, [router, pathname, shareableLink]);

  // Handle initial start (User Gesture)
  const handleStartSurvey = useCallback(async (lang?: string) => {
    if (lang && lang !== locale) {
      handleLanguageChange(lang);
    }

    setHasStarted(true);
    if (isVoiceMode) {
      try {
        await voiceWs.connect();
      } catch (e) {
        console.error("Failed to connect voice:", e);
      }
    }
  }, [locale, handleLanguageChange, isVoiceMode, voiceWs]);

  useEffect(() => {
    if (isVoiceMode && voiceWs.status === "connected") {
      voiceWs.disconnect();
      setTimeout(() => voiceWs.connect(), 100);
    }
  }, [locale, isVoiceMode, voiceWs]);

  const toggleVoiceMode = useCallback(() => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    if (newMode) {
      voiceWs.connect();
    } else {
      voiceWs.disconnect();
    }
  }, [isVoiceMode, voiceWs]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Manual handleSubmit
  const handleSubmit = useCallback(async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Prevent sending messages after survey completion
    if (isCompleted || !input.trim() || isChatLoading || !conversationId) return;

    const currentInput = input;
    setInput("");

    try {
      await sendMessage({
        role: "user",
        parts: [{ type: 'text', text: currentInput }]
      } as SDKMessage);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  }, [isCompleted, input, isChatLoading, conversationId, sendMessage]);

  // Loading state
  if (isInitializing) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
          </div>
          <p className="text-gray-500 font-medium animate-pulse">
            {t("loading")}
          </p>
        </div>
      </div>
    );
  }

  // Error state
  if (initError) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-xl p-10 max-w-md w-full text-center border border-gray-100">
          <div className="w-20 h-20 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-10 h-10 text-red-500" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900 mb-3">
            {initError instanceof Error &&
              initError.message === "This survey is no longer accepting responses"
              ? t("closed")
              : initError instanceof Error &&
                initError.message === "Failed to load survey"
                ? t("loadFailed")
                : t("notFound")}
          </h1>
          <p className="text-gray-500 text-lg">{t("errorHelp")}</p>
        </div>
      </div>
    );
  }

  // Completed state
  if (isCompleted) {
    return (
      <div className="min-h-screen bg-white flex items-center justify-center p-4 relative overflow-hidden">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,_var(--tw-gradient-stops))] from-gray-50 via-white to-white" />
        <div className="relative bg-white/80 backdrop-blur-xl rounded-[2rem] shadow-2xl p-12 max-w-lg w-full text-center border border-white/20 ring-1 ring-gray-900/5">
          <div className="w-24 h-24 bg-gradient-to-br from-emerald-400 to-emerald-600 rounded-full flex items-center justify-center mx-auto mb-8 shadow-lg shadow-emerald-500/20">
            <CheckCircle className="w-12 h-12 text-white" />
          </div>
          <h1 className="text-4xl font-bold text-gray-900 mb-4 tracking-tight">
            {t("thankYou")}
          </h1>
          <p className="text-xl text-gray-500 mb-10 leading-relaxed font-light">
            {t("thankYouMessage")}
          </p>
          <button
            onClick={() => window.close()}
            className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-gray-800 transition-all hover:shadow-md hover:-translate-y-1 active:scale-95 w-full"
          >
            {t("close")}
          </button>
        </div>
      </div>
    );
  }

  // Main UI Render
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-0 sm:p-4 font-sans selection:bg-gray-900 selection:text-white">
      {/* Start Survey Overlay for Voice Mode */}
      {survey?.isVoice && !hasStarted && !isCompleted && !isInitializing && (
        <VoiceSurveyStartOverlay
          onStart={handleStartSurvey}
          initialLanguage={selectedLanguage}
          title={survey?.title || t("voiceSurveyTitle")}
          description={
            survey?.objective?.description ||
            t("voiceSurveyIntro") ||
            "Join our voice-powered interview. Choose your preferred language and start speaking naturally."
          }
          t={t}
        />
      )}

      {/* Main Card */}
      <div
        className={cn(
          "w-full max-w-5xl h-[100dvh] sm:h-[85vh] bg-white rounded-none shadow-sm flex flex-col overflow-hidden relative transition-opacity duration-500",
          !isEmbed && "sm:rounded-3xl sm:border border-gray-200",
          survey?.isVoice && !hasStarted ? "opacity-0" : "opacity-100",
        )}
      >
        {!isEmbed && (
          <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-10 flex-shrink-0">
            <div className="flex items-center justify-between gap-4 h-14">
              {/* Brand - Left */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <Image
                  src="/logo.svg"
                  alt="Convy Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 flex-shrink-0"
                />
                <span className="font-bold text-gray-900 text-lg hidden sm:block">
                  Convy
                </span>
              </div>

              {/* Title - Center */}
              <div className="flex-[2] flex justify-center min-w-0">
                <h1 className="font-bold text-gray-900 tracking-tight text-base sm:text-lg truncate px-2 text-center">
                  {survey?.title}
                </h1>
              </div>

              <div className="flex-1 flex items-center justify-end gap-2 sm:gap-4">
                {survey?.isVoice && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={toggleVoiceMode}
                      className={cn(
                        "flex items-center gap-2 px-4 sm:px-5 py-2 sm:py-2.5 rounded-full text-xs sm:text-sm font-semibold transition-all duration-300 whitespace-nowrap",
                        isVoiceMode
                          ? "bg-gray-900 text-white shadow-md scale-105"
                          : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                      )}
                    >
                      {isVoiceMode ? (
                        <>
                          <div className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
                          <span className="hidden xs:inline">{t("voiceMode")}</span>
                          <span className="xs:hidden">Live</span>
                        </>
                      ) : (
                        <>
                          <Mic className="w-3.5 h-3.5" />
                          <span className="hidden xs:inline">{t("tryVoice")}</span>
                          <span className="xs:hidden">IA</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Language Switcher */}
                <div className="flex items-center border-l border-gray-100 pl-2 sm:pl-4">
                  <div className="relative group">
                    <button
                      disabled={messages.length > 0 || hasStarted}
                      className={cn(
                        "flex items-center gap-1.5 sm:gap-2 text-gray-500 hover:text-gray-900 transition-colors text-xs sm:text-sm font-medium disabled:opacity-50",
                      )}
                    >
                      <Globe className="w-3.5 h-3.5 sm:w-4 h-4" />
                      <span className="uppercase hidden xs:inline">
                        {locale}
                      </span>
                    </button>
                    {(!hasStarted && messages.length === 0) && (
                      <div className="absolute right-0 top-full pt-2 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div className="bg-white rounded-2xl shadow-xl border border-gray-100 p-2 min-w-[140px]">
                          {(["en", "fr", "de", "es", "it"] as const).map((lang) => (
                            <button
                              key={lang}
                              onClick={() => handleLanguageChange(lang)}
                              className={cn(
                                "w-full flex items-center justify-between px-3 py-2 rounded-xl text-sm transition-colors",
                                locale === lang
                                  ? "bg-gray-50 text-gray-900 font-semibold"
                                  : "text-gray-500 hover:bg-gray-50 hover:text-gray-900",
                              )}
                            >
                              <span className="capitalize">
                                {new Intl.DisplayNames([lang], { type: "language" }).of(lang)}
                              </span>
                              {locale === lang && (
                                <div className="w-1 h-1 rounded-full bg-gray-900" />
                              )}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </header>
        )}

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto scroll-smooth bg-slate-50/30 relative">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            {messages
              .filter((m) => m.id !== "init_ping_hidden")
              .map((message) => (
                <div
                  key={message.id}
                  className={cn(
                    "flex gap-4 max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2",
                    message.role === "user" ? "flex-row-reverse" : "",
                  )}
                >
                  <div
                    className={cn(
                      "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border",
                      message.role === "assistant"
                        ? "bg-white border-gray-200"
                        : "bg-black border-transparent",
                    )}
                  >
                    {message.role === "assistant" ? (
                      <Sparkles className="w-5 h-5 text-indigo-500" />
                    ) : (
                      <User className="w-5 h-5 text-white" />
                    )}
                  </div>

                  <div
                    className={cn(
                      "max-w-[85%] rounded-2xl px-6 py-4 border text-[1.05rem] leading-relaxed",
                      message.role === "assistant"
                        ? "bg-white text-gray-800 border-gray-200"
                        : "bg-zinc-900 text-gray-100 border-transparent",
                    )}
                  >
                    <div className="whitespace-pre-wrap">
                      {/* AI SDK v6 recommended: use parts for rendering */}
                      {message.parts && message.parts.length > 0 ? (
                        message.parts.map((part, index) =>
                          part.type === "text" ? (
                            <MarkdownMessage key={index} content={(part as { text: string }).text} />
                          ) : null,
                        )
                      ) : (
                        /* Fallback if parts are missing or empty but content exists */
                        message.content && <MarkdownMessage content={message.content} />
                      )}

                      {/* Handle direct media attachment */}
                      {message.media && <MediaDisplay media={message.media} />}

                      {message.toolInvocations?.map((inv, idx) => {
                        if (inv.toolName === "showMedia" && inv.state === "result") {
                          const result = inv.result;
                          const media = result?.media || (typeof result === "string" ? JSON.parse(result).media : null);
                          if (media) {
                            return (
                              <MediaDisplay
                                key={inv.toolCallId || idx}
                                media={media}
                              />
                            );
                          }
                        }
                        return null;
                      })}

                      {/* Legacy multipart support */}
                      {!message.toolInvocations && message.parts?.map((part, idx) => {
                        if (
                          part.type === "tool-invocation" ||
                          part.type === "tool-call"
                        ) {
                          const inv = part;
                          if (
                            inv.toolName === "showMedia" &&
                            inv.state === "result"
                          ) {
                            const result = inv.result;
                            const media =
                              result?.media ||
                              (typeof result === "string"
                                ? JSON.parse(result).media
                                : null);
                            if (media) {
                              return (
                                <MediaDisplay
                                  key={inv.toolCallId || idx}
                                  media={media}
                                />
                              );
                            }
                          }
                        }
                        return null;
                      })}
                    </div>
                  </div>
                </div>
              ))}
            <div ref={messagesEndRef} className="h-4" />
          </div>
        </main>

        {/* Input Area */}
        {!isCompleted ? (
          <div className="bg-white border-t border-gray-100 p-4 z-20 flex-shrink-0">
            <div className="max-w-3xl mx-auto">
              {isVoiceMode ? (
                <div className="flex flex-col items-center gap-6 animate-in slide-in-from-bottom-4 duration-500">
                  <button
                    onClick={() => {
                      if (isCompleted) return; // Prevent recording after completion
                      if (
                        voiceWs.status === "error" ||
                        voiceWs.status === "disconnected"
                      ) {
                        voiceWs.connect();
                        return;
                      }
                      if (voiceWs.isRecording) voiceWs.stopRecording();
                      else voiceWs.startRecording();
                    }}
                    disabled={
                      isCompleted || voiceWs.status === "connecting"
                    }
                    className="group focus:outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <VisualizerRing
                      isRecording={voiceWs.isRecording}
                      isAgentSpeaking={voiceWs.isPlaying}
                      status={voiceWs.status}
                      size={voiceWs.status === "error" ? "large" : "normal"}
                    />
                  </button>

                  <div className="text-center space-y-2 w-full max-w-lg">
                    <p className="text-gray-900 font-semibold text-lg tracking-tight">
                      {voiceWs.status === "error" ? (
                        <span className="text-red-600">
                          {t("connectionFailed")}
                        </span>
                      ) : voiceWs.status === "connecting" ? (
                        t("connecting")
                      ) : voiceWs.isRecording ? (
                        t("listening")
                      ) : voiceWs.isPlaying ? (
                        t("aiSpeaking")
                      ) : (
                        t("tapToSpeak")
                      )}
                    </p>

                    {voiceWs.status === "error" ? (
                      <div className="flex flex-col items-center gap-2">
                        <p className="text-sm text-red-500 font-medium px-4 py-2 bg-red-50 rounded-lg border border-red-100">
                          {voiceWs.error || t("connectionFailed")}
                        </p>
                        <button
                          onClick={() => voiceWs.connect()}
                          className="text-xs text-gray-500 underline hover:text-gray-800"
                        >
                          {t("tapToRetry")}
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-400 font-medium uppercase tracking-widest">
                        {voiceWs.status === "connected"
                          ? t("aiReady")
                          : t("initializing")}
                      </p>
                    )}

                    {/* Transcription now unified in message history */}
                  </div>
                </div>
              ) : (
                !isCompleted && (
                  <div className="max-w-3xl mx-auto">
                    <form onSubmit={handleSubmit} className="relative group">
                      <div className="relative bg-white border border-gray-200 rounded-2xl group-focus-within:border-gray-400 transition-all flex items-end overflow-hidden">
                        {/* Placeholder for future attachment button if needed, keeping layout consistent */}
                        <div className="p-3 mb-1 ml-1 text-gray-300">
                          <Paperclip className="w-5 h-5 opacity-50" />
                        </div>

                        <textarea
                          ref={inputRef}
                          value={input}
                          onChange={(e) => setInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter" && !e.shiftKey) {
                              e.preventDefault();
                              handleSubmit(e);
                            }
                          }}
                          placeholder={t("typeAnswer")}
                          rows={1}
                          disabled={isChatLoading || isCompleted}
                          className="flex-1 py-4 px-4 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[60px] sm:min-h-[96px] max-h-60 disabled:opacity-50 disabled:cursor-not-allowed"
                        />

                        <div className="p-2 mb-1 mr-1">
                          <button
                            type="submit"
                            disabled={
                              !input.trim() || isChatLoading || isCompleted
                            }
                            className={cn(
                              "p-2.5 rounded-xl transition-all",
                              input.trim() && !isChatLoading
                                ? "bg-black text-white hover:bg-gray-800 hover:-translate-y-0.5"
                                : "bg-gray-100 text-gray-300 cursor-not-allowed",
                            )}
                          >
                            {isChatLoading ? (
                              <Loader2 className="w-5 h-5 animate-spin" />
                            ) : (
                              <Send className="w-5 h-5" />
                            )}
                          </button>
                        </div>
                      </div>
                    </form>
                  </div>
                )
              )}
            </div>
          </div>
        ) : (
          <div className="bg-white border-t border-gray-100 p-6 z-20 flex-shrink-0">
            <div className="max-w-xl mx-auto text-center animate-in slide-in-from-bottom-4 fade-in duration-700">
              <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Sparkles className="w-8 h-8 text-emerald-600" />
              </div>
              <h3 className="text-xl font-bold text-gray-900 mb-2">
                {t("SurveyCompleted.Title") || "Survey Completed"}
              </h3>
              <p className="text-gray-500">
                {t("SurveyCompleted.Description") ||
                  "Thank you for your time. Your feedback has been recorded."}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function SurveyRespondPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-white flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative">
            <div className="w-12 h-12 rounded-full border-4 border-gray-100" />
            <div className="absolute inset-0 rounded-full border-4 border-gray-900 border-t-transparent animate-spin" />
          </div>
        </div>
      </div>
    }>
      <SurveyContent />
    </Suspense>
  );
}
