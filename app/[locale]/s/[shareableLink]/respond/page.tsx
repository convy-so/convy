"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, useMemo, Suspense } from "react";
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
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { SurveyStartOverlay } from "@/components/surveys/survey-start-overlay";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { usePathname, useRouter } from "@/i18n/routing";
import { Globe } from "lucide-react";

interface Survey {
  id: string;
  title: string;
  objective?: { description?: string };
  targetAudience?: { description?: string };
  tone?: string;
  isVoice?: boolean;
  media?: any[];
  language?: "en" | "fr" | "de" | "es" | "it";
}

interface SurveyInitResponse {
  survey: Survey;
  conversationId: string;
  participantId: string;
  messages?: any[];
  completed?: boolean;
}

interface MessageWithTools extends UIMessage {
  media?: any;
  toolInvocations?: Array<any>;
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
  const [isCompleted, setIsCompleted] = useState(false);
  const [hasStarted, setHasStarted] = useState(searchParams.get("started") === "true");

  // Sync completion state from API
  useEffect(() => {
    if (initiallyCompleted) {
      setIsCompleted(true);
    }
  }, [initiallyCompleted]);

  // Auto-resume if the user has already started interacting (has more than just the initial greeting)
  useEffect(() => {
    if (resumedMessages && resumedMessages.length > 1) {
      setHasStarted(true);
    }
  }, [resumedMessages]);

  // Redirect to survey language if different from current locale on first load
  useEffect(() => {
    if (survey?.language && survey.language !== locale) {
      const storageKey = `convy_redirected_${shareableLink}`;
      // Only redirect if we haven't already redirected for this session
      const hasRedirected = sessionStorage.getItem(storageKey);

      if (!hasRedirected) {
        sessionStorage.setItem(storageKey, "true");
        router.replace({ pathname, query: { shareableLink } } as any, {
          locale: survey.language as any,
        });
      }
    }
  }, [survey, locale, shareableLink, pathname, router]);

  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "en" | "fr" | "de" | "es" | "it"
  >((locale as any) || "en");

  // Prepare initial messages for useChat
  // Sync Greeting: If voice survey and only 1 message exists (the initial greeting), 
  // clear it so the Voice Agent can initiate the conversation naturally.
  const initialChatMessages =
    resumedMessages.length > 1 || (!survey?.isVoice && resumedMessages.length > 0)
      ? resumedMessages.map((msg: any, i) => {
        // Ensure we handle the transition from 'content' (old) to 'parts' (v6) robustly
        const hasTextPart = msg.parts?.some((p: any) => p.type === 'text' && p.text);
        let parts = msg.parts && msg.parts.length > 0 ? msg.parts : [];
        let contentStr = msg.content || "";

        // If old DB records saved content as an array of parts
        if (Array.isArray(msg.content)) {
          parts = msg.content;
          contentStr = msg.content.find((p: any) => p.type === 'text')?.text || "";
        } else if (parts.length === 0 && contentStr) {
          parts = [{ type: "text", text: contentStr }];
        }

        console.log(`[SurveyPage] Mapping resumed message ${i}:`, {
          role: msg.role,
          hasParts: !!msg.parts,
          partsCount: msg.parts?.length,
          hasContent: !!msg.content,
          finalPartsCount: parts.length
        });

        return {
          id: msg.id || `msg-${i}`,
          role: msg.role as "system" | "user" | "assistant" | "data",
          content: contentStr, // Always send as string for fallback renderer
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
    messages: initialChatMessages as any, // Cast to avoid strict type issues with mapped messages
    onFinish: ({ message }: { message: UIMessage }) => {
      // Check for explicit tool calls (robust detection)
      const hasToolCompletion = message.parts?.some(
        (part: any) =>
          (part.type === "tool-invocation" || part.type === "tool-call") &&
          (part as any).toolName === "finishSurvey",
      );

      // Fallback to text detection
      const messageText =
        message.parts
          ?.filter((part: any) => part.type === "text")
          .map((part: any) => part.text)
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

    const lastMessage = messages[messages.length - 1] as MessageWithTools;
    if (!lastMessage || lastMessage.role !== "assistant") return;

    const hasToolCompletion = lastMessage.parts?.some(
      (part: any) =>
        (part.type === "tool-invocation" || part.type === "tool-call") &&
        (part as any).toolName === "finishSurvey",
    );

    if (hasToolCompletion) {
      setIsCompleted(true);
    }
  }, [messages, isCompleted]);

  const setMessages = originalSetMessages;
  const isChatLoading = status === "streaming" || status === "submitted";


  // Voice WebSocket Integration
  const wsUrl = survey?.isVoice
    ? `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${shareableLink}&language=${selectedLanguage}`
    : "";

  if (survey?.isVoice) {
    console.log("[Survey Page] WS URL:", wsUrl);
    console.log("[Survey Page] Survey State:", {
      isVoice: survey?.isVoice,
      isVoiceMode,
      isCompleted,
    });
  }

  const voiceWs = useVoiceWebSocket({
    url: wsUrl,
    onMessage: (data) => {
      console.log("[SurveyPage] Voice WS Message:", data.type);

      // Chain of Trust: Unified message handling via Voice Agent events
      if (data.type === "conversation_text") {
        const { role, content } = data;

        // Filter out internal thinking/directives
        if (content.includes("<thinking>") || content.includes("Internal instructions:")) {
          // console.log("[SurveyPage] Filtering internal directive from UI:", content.substring(0, 30));
          return;
        }

        const assistantMessage = {
          id: `voice-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          role: role as "assistant" | "user",
          parts: [{ type: "text" as const, text: content }],
        };

        setMessages((prev) => {
          // Avoid duplicate messages if the same text was already transcribed or sent
          const lastMsg = prev[prev.length - 1];
          const lastText = lastMsg?.parts?.find(p => p.type === 'text')?.text;
          if (lastText === content && lastMsg?.role === role) return prev;

          return [...prev, assistantMessage];
        });

        if (role === "assistant") {
          const lowerText = content.toLowerCase();
          if (
            lowerText.includes("thank you for completing") ||
            lowerText.includes("survey is now complete")
          ) {
            setIsCompleted(true);
          }
        }
      } else if (data.type === "audio_sent" || data.type === "text_response") {
        // AI started speaking (legacy or fallback)
        // We handle this for backward compatibility but prefer conversation_text
        if (!data.text) return;

        const assistantMessage = {
          id: `legacy-${Date.now()}`,
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: data.text }],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        const lowerText = data.text.toLowerCase();
        if (
          lowerText.includes("thank you for completing") ||
          lowerText.includes("survey is now complete")
        ) {
          setIsCompleted(true);
        }
      } else if (data.type === "transcription" && data.isFinal) {
        if (isCompleted) return;
        // DUAL-AGENT BUG FIX: 
        // We NO LONGER call sendMessage() here because the Voice Agent 
        // back-end already receives the audio and generates the response.
        // Calling sendMessage() triggers a redundant Text AI response.
        console.log("[SurveyPage] Final transcription received (Voice Mode):", data.text);
      } else if (data.type === "display_media" && survey?.media) {
        const fullMedia = survey.media.find((m: any) => m.id === data.media.id);
        if (fullMedia) {
          setMessages((prev) => [
            ...prev,
            {
              id: `media-${Date.now()}`,
              role: "assistant" as const,
              parts: [{ type: "text" as const, text: t("sharedMedia") }],
              media: fullMedia,
            },
          ]);
        }
      } else if (data.type === "survey_completed") {
        setIsCompleted(true);
        // Disconnect voice immediately to stop recording
        setIsVoiceMode(false);
        voiceWs.disconnect();
      }
    },
  });

  // Initial setup based on survey type
  useEffect(() => {
    if (survey?.isVoice) {
      setIsVoiceMode(true);
    } else {
      setIsVoiceMode(false);
    }
  }, [survey?.isVoice]);

  // Handle initial start (User Gesture)
  const handleStartSurvey = async (lang?: string) => {
    if (lang && lang !== locale) {
      handleLanguageChange(lang);
    }

    setHasStarted(true);
    if (isVoiceMode) {
      try {
        await voiceWs.connect();
      } catch (e) {
        console.error("Failed to connect voice:", e);
        // Fallback to allowing manual retry
      }
    }
  };

  // Handle language switch behavior
  useEffect(() => {
    // If the user hasn't manually switched and survey has a specific language, redirect (optional)
    // But for now, we'll let the user choose.
    if (isVoiceMode && voiceWs.status === "connected") {
      // Reconnect on language change to ensure correct voice parameters
      voiceWs.disconnect();
      setTimeout(() => voiceWs.connect(), 100);
    }
  }, [locale]);

  const handleLanguageChange = (newLocale: string) => {
    router.replace({ pathname, query: { shareableLink, started: "true" } } as any, {
      locale: newLocale,
    });
  };

  const toggleVoiceMode = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    if (newMode) {
      voiceWs.connect();
    } else {
      voiceWs.disconnect();
    }
  };

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Manual handleSubmit
  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) {
      e.preventDefault();
    }

    // Prevent sending messages after survey completion
    if (isCompleted) return;

    if (!input.trim() || isChatLoading || !conversationId) return;

    const currentInput = input;
    setInput("");

    try {
      await sendMessage({
        role: "user",
        parts: [{ type: 'text', text: currentInput }]
      } as any);
    } catch (error) {
      console.error("Failed to send message:", error);
    }
  };

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
            (initError.message === "This survey is no longer accepting responses" ||
              initError.message === "Survey has reached its participant limit")
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

  // Premium UI Components
  const VisualizerRing = ({
    isRecording,
    isAgentSpeaking,
    size = "normal",
  }: {
    isRecording: boolean;
    isAgentSpeaking: boolean;
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
          voiceWs.status === "error"
            ? "bg-red-500 shadow-red-500/50"
            : isAgentSpeaking
              ? "bg-gradient-to-br from-emerald-500 to-teal-600 scale-110 shadow-emerald-500/30"
              : isRecording
                ? "bg-gradient-to-br from-indigo-600 to-violet-600 scale-110 shadow-indigo-500/30"
                : "bg-gray-900 shadow-md hover:scale-105",
          size === "large" ? "w-32 h-32" : "w-20 h-20",
        )}
      >
        {voiceWs.status === "error" ? (
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

  // Main UI Render
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-0 sm:p-4 font-sans selection:bg-gray-900 selection:text-white">
      {/* Start Survey Overlay for All Modes */}
      {!hasStarted && !isCompleted && !isInitializing && (
        <SurveyStartOverlay
          onStart={handleStartSurvey}
          initialLanguage={(locale as any) || "en"}
          title={survey?.title || t("voiceSurveyTitle")}
          description={
            survey?.objective?.description ||
            t("voiceSurveyIntro") ||
            "Join our interview. Choose your preferred language to begin."
          }
          isVoice={survey?.isVoice}
          t={t as any}
        />
      )}

      {/* Main Card */}
      <div
        className={cn(
          "w-full max-w-5xl h-[100dvh] sm:h-[85vh] bg-white rounded-none shadow-sm flex flex-col overflow-hidden relative transition-opacity duration-500",
          !isEmbed && "sm:rounded-3xl sm:border border-gray-200",
          !hasStarted ? "opacity-0" : "opacity-100",
        )}
      >
        {!isEmbed && (
          <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-10 flex-shrink-0">
            <div className="flex items-center justify-between gap-4 h-14">
              {/* Brand - Left */}
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <img
                  src="/logo.svg"
                  alt="Convyy Logo"
                  width={32}
                  height={32}
                  className="w-8 h-8 flex-shrink-0"
                />
                <span className="font-bold text-gray-900 text-lg hidden sm:block">
                  Convyy
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
              .filter((m: any) => m.id !== "init_ping_hidden")
              .map((message: any) => (
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
                        message.parts.map((part: any, index: number) =>
                          part.type === "text" ? (
                            <MarkdownMessage key={index} content={part.text} />
                          ) : null,
                        )
                      ) : (
                        /* Fallback if parts are missing or empty but content exists */
                        message.content && <MarkdownMessage content={message.content} />
                      )}

                      {/* Handle direct media attachment */}
                      {message.media && <MediaDisplay media={message.media} />}

                      {message.toolInvocations?.map((inv: any, idx: number) => {
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
                      {!message.toolInvocations && message.parts?.map((part: any, idx: number) => {
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
                          disabled={!hasStarted || isChatLoading || isCompleted}
                          className="flex-1 py-4 px-4 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[60px] sm:min-h-[96px] max-h-60 disabled:opacity-50 disabled:cursor-not-allowed"
                        />

                        <div className="p-2 mb-1 mr-1">
                          <button
                            type="submit"
                            disabled={
                              !hasStarted || !input.trim() || isChatLoading || isCompleted
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
