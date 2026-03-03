"use client";

import { clientEnv } from "@/lib/env.client";

import { useState, useRef, useEffect, useMemo } from "react";
import { useParams } from "next/navigation";
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
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, UIMessage } from "ai";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";

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

export default function SurveyRespondPage() {
  const params = useParams();
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
  const [hasStarted, setHasStarted] = useState(false);

  // Sync completion state from API
  useEffect(() => {
    if (initiallyCompleted) {
      setIsCompleted(true);
    }
  }, [initiallyCompleted]);

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
  const [showTranscript, setShowTranscript] = useState(true);
  const [selectedLanguage, setSelectedLanguage] = useState<
    "en" | "fr" | "de" | "es" | "it"
  >((locale as any) || "en");

  // Prepare initial messages for useChat
  const initialChatMessages =
    resumedMessages.length > 0
      ? resumedMessages.map((msg: any, i) => ({
        id: msg.id || `msg-${i}`,
        role: msg.role as "system" | "user" | "assistant" | "data",
        parts:
          msg.parts ||
          (msg.content ? [{ type: "text", text: msg.content }] : []),
      }))
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

  // Auto-start or Resume for text mode is now handled SERVER-SIDE
  // The frontend no longer injects fake "user" messages like "Start the conversation..."
  // This prevents LLM confusion and corrupting the database chat history.
  // The backend's GET endpoint already initializes the conversation with a greeting.
  useEffect(() => {
    if (
      !isInitializing &&
      !initError &&
      survey &&
      !isVoiceMode &&
      !isCompleted &&
      !hasStarted &&
      conversationId
    ) {
      // Just mark it as started, the backend already provided the initial messages
      setHasStarted(true);
    }
  }, [
    isInitializing,
    initError,
    survey,
    isVoiceMode,
    isCompleted,
    hasStarted,
    conversationId,
  ]);

  // Voice WebSocket Integration
  const wsUrl = `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${shareableLink}&language=${selectedLanguage}`;
  console.log("[Survey Page] WS URL:", wsUrl);
  console.log("[Survey Page] Survey State:", {
    isVoice: survey?.isVoice,
    isVoiceMode,
    isCompleted,
  });

  const voiceWs = useVoiceWebSocket({
    url: wsUrl,
    onMessage: (data) => {
      // ... (keep existing handler)
      if (data.type === "audio_sent" || data.type === "text_response") {
        const assistantMessage = {
          id: Date.now().toString(),
          role: "assistant" as const,
          parts: [{ type: "text" as const, text: data.text }],
        };
        setMessages((prev) => [...prev, assistantMessage]);

        if (
          data.text.toLowerCase().includes("thank you for completing") ||
          data.text.toLowerCase().includes("survey is now complete")
        ) {
          setIsCompleted(true);
        }
      } else if (data.type === "transcription" && data.isFinal) {
        if (isCompleted) return;

        if (data.text && data.text.trim()) {
          sendMessage({ role: "user", content: data.text } as any);
        }
      } else if (data.type === "display_media" && survey?.media) {
        const fullMedia = survey.media.find((m: any) => m.id === data.media.id);
        if (fullMedia) {
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString(),
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
      setShowTranscript(false);
    }
  }, [survey?.isVoice]);

  // Handle initial start (User Gesture)
  const handleStartSurvey = async () => {
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
    router.replace({ pathname, query: { shareableLink } } as any, {
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

  // Premium UI Components
  const VisualizerRing = ({
    isRecording,
    size = "normal",
  }: {
    isRecording: boolean;
    size?: "normal" | "large";
  }) => (
    <div className="relative flex items-center justify-center">
      {isRecording && (
        <>
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-indigo-500/20 animate-[ping_2s_cubic-bezier(0,0,0.2,1)_infinite]",
              size === "large" ? "border-8" : "border-4",
            )}
          />
          <div
            className={cn(
              "absolute inset-0 rounded-full border-4 border-indigo-500/10 animate-[ping_3s_cubic-bezier(0,0,0.2,1)_infinite]",
              size === "large" ? "border-8" : "border-4",
            )}
          />
        </>
      )}
      <div
        className={cn(
          "relative z-10 rounded-full flex items-center justify-center transition-all duration-500 shadow-xl backdrop-blur-sm border border-white/10",
          voiceWs.status === "error"
            ? "bg-red-500 shadow-red-500/50"
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
      {/* Start Survey Overlay for Voice Mode */}
      {survey?.isVoice && !hasStarted && !isCompleted && !isInitializing && (
        <div className="fixed inset-0 z-50 bg-white/95 backdrop-blur-md flex items-center justify-center p-4 transition-all duration-700">
          <div className="flex flex-col items-center max-w-md w-full animate-in fade-in zoom-in-95 duration-700 slide-in-from-bottom-4">
            {/* Minimalist Pulse Icon */}
            <div className="relative mb-6 group">
              <div className="absolute inset-0 bg-indigo-500/20 rounded-full animate-ping opacity-20 duration-3000" />
              <div className="relative w-20 h-20 bg-gradient-to-tr from-indigo-50 to-white rounded-full flex items-center justify-center shadow-lg shadow-indigo-500/5 ring-1 ring-indigo-50 transition-transform duration-500">
                <Mic className="w-7 h-7 text-indigo-600/80" />
              </div>
            </div>

            {/* Typography */}
            <h2 className="text-2xl font-bold text-gray-900 mb-2 tracking-tight text-center">
              {t("voiceSurveyTitle") || "Voice Survey"}
            </h2>
            <p className="text-gray-500 mb-6 text-center leading-relaxed font-light text-base max-w-xs mx-auto">
              {t("voiceSurveyIntro") ||
                "Choose your language and start speaking."}
            </p>

            {/* Language Selection */}
            <div className="w-full mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3 text-center">
                <Globe className="w-4 h-4 inline mr-2" />
                {t("selectLanguage") || "Select Language"}
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { code: "en", name: "English", flag: "🇺🇸" },
                  { code: "fr", name: "Français", flag: "🇫🇷" },
                  { code: "de", name: "Deutsch", flag: "🇩🇪" },
                  { code: "es", name: "Español", flag: "🇪🇸" },
                  { code: "it", name: "Italiano", flag: "🇮🇹" },
                ].map((lang) => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLanguage(lang.code as any)}
                    className={cn(
                      "flex items-center gap-2 px-3 py-2.5 rounded-lg border transition-all text-left text-sm",
                      selectedLanguage === lang.code
                        ? "border-indigo-600 bg-indigo-50 ring-2 ring-indigo-600/20"
                        : "border-gray-200 hover:border-gray-300 hover:bg-gray-50",
                    )}
                  >
                    <span className="text-lg">{lang.flag}</span>
                    <span
                      className={cn(
                        "font-medium",
                        selectedLanguage === lang.code
                          ? "text-indigo-900"
                          : "text-gray-700",
                      )}
                    >
                      {lang.name}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Premium Button */}
            <button
              onClick={handleStartSurvey}
              className="group relative px-8 py-4 bg-gray-900 text-white rounded-full font-medium text-base hover:bg-black transition-all duration-300 hover:shadow-xl hover:shadow-gray-900/10 hover:-translate-y-0.5 active:scale-95 w-full max-w-[240px] overflow-hidden"
            >
              <span className="relative z-10 flex items-center justify-center gap-2">
                {t("startConversation") || "Start Survey"}
                <ArrowRight className="w-4 h-4 opacity-70 group-hover:translate-x-1 transition-transform" />
              </span>
            </button>
          </div>
        </div>
      )}

      {/* Main Card */}
      <div
        className={cn(
          "w-full max-w-5xl h-[100dvh] sm:h-[85vh] bg-white rounded-none sm:rounded-3xl border-0 sm:border border-gray-200 shadow-sm flex flex-col overflow-hidden relative transition-opacity duration-500",
          survey?.isVoice && !hasStarted ? "opacity-0" : "opacity-100",
        )}
      >
        {/* Header */}
        <header className="bg-white border-b border-gray-100 px-6 py-4 z-10 flex-shrink-0">
          <div className="relative flex items-center justify-between h-14">
            {/* Left Spacer for Balance */}
            <div className="w-[100px]" />

            {/* Centered Logo & Title */}
            <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-3">
              <img
                src="/logo.svg"
                alt="Convy Logo"
                width={32}
                height={32}
                className="w-8 h-8 object-contain"
              />
              <h1 className="font-bold text-gray-900 tracking-tight text-lg">
                {survey?.title}
              </h1>
            </div>
            <div className="flex items-center gap-2">
              {survey?.isVoice && (
                <>
                  {isVoiceMode && (
                    <button
                      onClick={() => setShowTranscript(!showTranscript)}
                      className="px-4 py-2.5 rounded-full text-sm font-medium text-gray-600 hover:bg-gray-100 transition-colors"
                    >
                      {showTranscript ? t("hideText") : t("showText")}
                    </button>
                  )}
                  <button
                    onClick={toggleVoiceMode}
                    className={cn(
                      "flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-semibold transition-all duration-300",
                      isVoiceMode
                        ? "bg-gray-900 text-white shadow-md scale-105"
                        : "bg-gray-100 text-gray-600 hover:bg-gray-200",
                    )}
                  >
                    {isVoiceMode ? (
                      <>
                        <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                        {t("voiceMode")}
                      </>
                    ) : (
                      <>
                        <Mic className="w-4 h-4" />
                        {t("tryVoice")}
                      </>
                    )}
                  </button>
                </>
              )}
            </div>

            {/* Language Switcher */}
            <div className="ml-4 border-l border-gray-200 pl-4 flex items-center">
              <div className="relative group">
                <button
                  disabled={messages.length > 0 || hasStarted}
                  className={cn(
                    "flex items-center gap-2 text-gray-500 hover:text-gray-900 transition-colors text-sm font-medium",
                    (messages.length > 0 || hasStarted) &&
                    "opacity-50 cursor-not-allowed hover:text-gray-500",
                  )}
                >
                  <Globe className="w-4 h-4" />
                  <span className="uppercase">{locale}</span>
                </button>
                {messages.length === 0 && !hasStarted && (
                  <div className="absolute top-full right-0 mt-2 w-32 bg-white rounded-xl shadow-lg border border-gray-100 py-1 hidden group-hover:block z-50 animate-in fade-in zoom-in-95 duration-200">
                    {["en", "fr", "de", "es", "it"].map((l) => (
                      <button
                        key={l}
                        onClick={() => handleLanguageChange(l)}
                        className={cn(
                          "w-full text-left px-4 py-2 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between",
                          locale === l
                            ? "text-indigo-600 font-medium"
                            : "text-gray-600",
                        )}
                      >
                        <span className="uppercase">{l}</span>
                        {locale === l && (
                          <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </header>

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
                      {message.parts?.map((part: any, index: number) =>
                        part.type === "text" ? (
                          <MarkdownMessage key={index} content={part.text} />
                        ) : null,
                      )}

                      {/* Fallback for backwards compatibility */}
                      {!message.parts && message.content}

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
                  {showTranscript ? (
                    <>
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

                        {/* Live Transcription Display */}
                        {voiceWs.isRecording &&
                          (voiceWs.transcription ||
                            voiceWs.interimTranscription) && (
                            <div className="mt-4 bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200">
                              <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">
                                {t("liveTranscription")}
                              </p>
                              <p className="text-sm text-gray-900 leading-relaxed text-left">
                                {voiceWs.transcription}
                                <span className="text-gray-400 italic">
                                  {voiceWs.interimTranscription}
                                </span>
                              </p>
                            </div>
                          )}
                      </div>
                    </>
                  ) : (
                    // Minimal Footer for Focused Mode
                    <div className="w-full">
                      {voiceWs.isRecording &&
                        (voiceWs.transcription ||
                          voiceWs.interimTranscription) && (
                          <div className="bg-gray-50 border border-gray-200 rounded-2xl p-4 animate-in fade-in slide-in-from-bottom-2 duration-200 max-w-lg mx-auto">
                            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 text-center">
                              {t("liveTranscription")}
                            </p>
                            <p className="text-sm text-gray-900 leading-relaxed text-center">
                              {voiceWs.transcription}
                              <span className="text-gray-400 italic">
                                {voiceWs.interimTranscription}
                              </span>
                            </p>
                          </div>
                        )}
                    </div>
                  )}
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
