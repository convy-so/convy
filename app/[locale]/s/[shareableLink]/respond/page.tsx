"use client";

import { clientEnv } from "@/lib/env.client";
import Image from "next/image";

import { useState, useRef, useEffect, useMemo, useCallback, Suspense } from "react";
import toast from "react-hot-toast";
import { useSearchParams } from "next/navigation";
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
  Globe,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { MediaDisplay } from "@/components/surveys/media-display";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { SurveyStartOverlay } from "@/components/surveys/survey-start-overlay";
import { ChatMessage, ChatMessagePart, VoiceAgentMessage, SurveyMedia } from "@/lib/chat-types";
import { toUIMessages } from "@/lib/chat-ui-messages";
import { nanoid } from "nanoid";

import { useQuery } from "@tanstack/react-query";
import { useLocale, useTranslations } from "next-intl";
import { useRouter, usePathname } from "@/i18n/routing";

interface Survey {
  id: string;
  title: string;
  objective?: { description?: string };
  targetAudience?: { description?: string };
  tone?: string;
  isVoice?: boolean;
  media?: SurveyMedia[];
  language?: "en" | "fr" | "de";
}

function getDefaultMimeType(mediaType: SurveyMedia["type"]): string {
  switch (mediaType) {
    case "image":
      return "image/*";
    case "video":
      return "video/*";
    case "audio":
      return "audio/*";
  }
}

function getMediaFromPart(part: UIMessage["parts"][number]): SurveyMedia | null {
  if (part.type !== "file") {
    return null;
  }

  if (part.mediaType.startsWith("image/")) {
    return { type: "image", url: part.url, mimeType: part.mediaType };
  }

  if (part.mediaType.startsWith("video/")) {
    return { type: "video", url: part.url, mimeType: part.mediaType };
  }

  if (part.mediaType.startsWith("audio/")) {
    return { type: "audio", url: part.url, mimeType: part.mediaType };
  }

  return null;
}

interface SurveyInitResponse {
  survey: Survey;
  conversationId: string;
  participantId: string;
  messages?: Array<{ id?: string; role: string; content?: string | ChatMessagePart[]; parts?: ChatMessagePart[] }>;
  completed?: boolean;
}

type SurveyResponseLocale = "en" | "fr" | "de";

function isConversationRole(role: string): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

function normalizeStoredSurveyMessage(
  message: NonNullable<SurveyInitResponse["messages"]>[number],
  index: number,
): ChatMessage | null {
  if (!isConversationRole(message.role)) {
    return null;
  }

  const parts =
    Array.isArray(message.parts) && message.parts.length > 0
      ? message.parts
      : Array.isArray(message.content)
        ? message.content
        : undefined;
  const content =
    typeof message.content === "string"
      ? message.content
      : parts
        ? parts
            .filter(
              (part): part is Extract<ChatMessagePart, { type: "text" }> =>
                part.type === "text",
            )
            .map((part) => part.text)
            .join("")
        : "";

  return {
    id: message.id || `msg-${index}`,
    role: message.role,
    content,
    parts:
      parts && parts.length > 0
        ? parts
        : content
          ? [{ type: "text", text: content }]
          : undefined,
    timestamp: new Date().toISOString(),
  };
}

// Premium UI Components moved outside to avoid re-creation on every render
// Premium UI Components moved outside to avoid re-creation on every render
const VisualizerRing = ({
  isRecording,
  isAgentSpeaking,
  size = "normal",
  status = "idle"
}: {
  isRecording: boolean;
  isAgentSpeaking: boolean;
  size?: "normal" | "large";
  status?: string;
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

function getVoiceFallbackMessage(error: unknown): string {
  const detail =
    typeof error === "string"
      ? error
      : error instanceof Error
        ? error.message
        : "";

  if (
    detail &&
    detail !== "[object Event]" &&
    detail !== "null" &&
    detail.length <= 120
  ) {
    return `Voice ran into a problem (${detail}). You can continue in text below and retry voice later.`;
  }

  return "Voice ran into a problem, so we switched you to text. You can continue below and retry voice later.";
}

async function initializeSurvey(
  shareableLink: string,
  resumeToken?: string | null,
): Promise<SurveyInitResponse> {
  const url = resumeToken
    ? `/api/surveys/respond/${shareableLink}?resume=${encodeURIComponent(resumeToken)}`
    : `/api/surveys/respond/${shareableLink}`;

  const response = await fetch(url, {
    cache: "no-store",
  });

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

function getUpdatedQuery(search: string, updates: Record<string, string | null>) {
  const next = new URLSearchParams(search);

  for (const [key, value] of Object.entries(updates)) {
    if (!value) {
      next.delete(key);
      continue;
    }

    next.set(key, value);
  }

  return Object.fromEntries(next.entries());
}

async function copyText(text: string) {
  if (navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  const input = document.createElement("input");
  input.value = text;
  input.setAttribute("readonly", "true");
  input.style.position = "absolute";
  input.style.left = "-9999px";
  document.body.appendChild(input);
  input.select();
  document.execCommand("copy");
  input.remove();
}

function SurveyContent() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const resumeParam = searchParams.get("resume");
  const startedParam = searchParams.get("started");
  const completedParam = searchParams.get("completed");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const shareableLink = useMemo(() => {
    const parts = pathname.split("/").filter(Boolean);
    const sIdx = parts.indexOf("s");
    if (sIdx !== -1 && parts[sIdx + 2] === "respond") {
      return parts[sIdx + 1] ?? null;
    }
    return null;
  }, [pathname]);
  const t = useTranslations("Survey.Response");

  const {
    data: initData,
    isLoading: isInitializing,
    error: initError,
  } = useQuery({
    queryKey: ["survey-respond", shareableLink, resumeParam ?? ""],
    queryFn: () => {
      if (!shareableLink) {
        throw new Error("Missing shareable link");
      }
      return initializeSurvey(shareableLink, resumeParam);
    },
    enabled: !!shareableLink,
    staleTime: Infinity,
    retry: false,
  });

  const survey = initData?.survey ?? null;
  const conversationId = initData?.conversationId ?? null;
  const resumedMessages = initData?.messages ?? [];
  const initiallyCompleted = initData?.completed ?? false;
  const apiEndpoint = shareableLink ? `/api/surveys/respond/${shareableLink}` : "";
  const hasRespondentSession = Boolean(survey?.id && conversationId);

  // State declarations - must be before hooks that reference them
  // State declarations
  const [input, setInput] = useState("");
  const [completedOverride, setCompletedOverride] = useState<boolean | null>(null);
  const [startedOverride, setStartedOverride] = useState<boolean | null>(null);
  const [voiceFallbackNotice, setVoiceFallbackNotice] = useState<string | null>(null);
  const [isPrivacyActionLoading, setIsPrivacyActionLoading] = useState(false);
  const [isResumeLinkLoading, setIsResumeLinkLoading] = useState(false);

  // Derived states to avoid effect-based setState (cascading renders)
  // isCompleted moved below useChat

  const hasStarted =
    startedOverride ??
    (startedParam === "true" || (resumedMessages && resumedMessages.length > 1));

  useEffect(() => {
    if (!initData || !resumeParam) {
      return;
    }

    router.replace(
      {
        pathname,
        query: {
          shareableLink,
          ...getUpdatedQuery(queryString, { resume: null }),
        },
      },
      { locale },
    );
  }, [initData, locale, pathname, queryString, resumeParam, router, shareableLink]);

  // Redirect to survey language if different from current locale on first load
  useEffect(() => {
    if (survey?.language && survey.language !== locale) {
      const storageKey = `convy_redirected_${shareableLink}`;
      // Only redirect if we haven't already redirected for this session
      const hasRedirected = sessionStorage.getItem(storageKey);

      if (!hasRedirected) {
        sessionStorage.setItem(storageKey, "true");
        router.replace(`/s/${shareableLink}/respond`, { locale: survey.language });
      }
    }
  }, [survey, locale, shareableLink, router]);

  const [localIsVoiceMode, setLocalIsVoiceMode] = useState<boolean | null>(null);
  const isVoiceMode = localIsVoiceMode ?? (survey?.isVoice || false);
  const setIsVoiceMode = setLocalIsVoiceMode;

  const selectedLanguage: SurveyResponseLocale =
    locale === "fr" || locale === "de"
      ? locale
      : "en";

  // Prepare initial messages for useChat
  // Sync Greeting: If voice survey and only 1 message exists (the initial greeting),
  // clear it so the Voice Agent can initiate the conversation naturally.
  const initialChatMessages: ChatMessage[] =
    resumedMessages.length > 1 || (!survey?.isVoice && resumedMessages.length > 0)
      ? resumedMessages.flatMap((message, index) => {
        const normalizedMessage = normalizeStoredSurveyMessage(message, index);
        return normalizedMessage ? [normalizedMessage] : [];
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
    messages: toUIMessages(
      initialChatMessages.filter((message) =>
        message.parts?.some((part) => part.type === "text"),
      ),
    ),
    onFinish: ({ message }: { message: UIMessage }) => {
      // Check for explicit tool calls (robust detection)
      const hasToolCompletion = message.parts?.some(
        (part) =>
          part.type === "tool-finishSurvey",
      );

      // Fallback to text detection
      const messageText =
        message.parts
          ?.filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
          .map((part) => part.text)
          .join(" ")
          .toLowerCase() || "";

      const hasTextCompletion =
        messageText.includes("thank you for completing") ||
        messageText.includes("survey is now complete");

      if (hasToolCompletion || hasTextCompletion) {
        setCompletedOverride(true);
      }
    },
  });

  const isCompleted = useMemo(() => {
    if (completedOverride) return true;
    if (initiallyCompleted || completedParam === "true") return true;

    // Detect completion from messages (robust detection)
    const lastAssistantMessage = messages.findLast(m => m.role === "assistant");
    if (!lastAssistantMessage) return false;

    const hasToolCompletion = lastAssistantMessage.parts?.some(
      (part) => part.type === "tool-finishSurvey",
    );

    const messageText = lastAssistantMessage.parts
      ?.filter((part): part is Extract<UIMessage["parts"][number], { type: "text" }> => part.type === "text")
      .map((part) => part.text)
      .join(" ")
      .toLowerCase() || "";

    const hasTextCompletion =
      messageText.includes("thank you for completing") ||
      messageText.includes("survey is now complete");

    return hasToolCompletion || hasTextCompletion;
  }, [messages, initiallyCompleted, completedParam, completedOverride]);

  const setMessages = originalSetMessages;
  const isChatLoading = status === "streaming" || status === "submitted";

  // Voice WebSocket Integration
  const wsUrl = survey?.isVoice && conversationId && shareableLink
    ? `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${encodeURIComponent(shareableLink)}&conversationId=${encodeURIComponent(conversationId)}&language=${encodeURIComponent(selectedLanguage)}`
    : "";

  if (survey?.isVoice) {
  }

  const handleVoiceFailure = (error: unknown) => {
    const message = getVoiceFallbackMessage(error);
    setVoiceFallbackNotice(message);
    setLocalIsVoiceMode(false);
  };

  const onVoiceMessage = useCallback((data: VoiceAgentMessage) => {

    // Chain of Trust: Unified message handling via Voice Agent events
    if (data.type === "conversation_text") {
      const role = typeof data.role === "string" ? data.role : "assistant";
      const content = typeof data.content === "string" ? data.content : "";

      // Filter out internal thinking/directives
      if (content?.includes("<thinking>") || content?.includes("Internal instructions:")) {
        return;
      }

      const assistantMessage: ChatMessage = {
        id: `voice-${nanoid()}`,
        role: (role === "user" || role === "assistant" || role === "system" ? role : "assistant"),
        content: content || "",
        parts: [{ type: "text" as const, text: content }],
        timestamp: new Date().toISOString(),
      };

      setMessages((prev) => {
        // Avoid duplicate messages if the same text was already transcribed or sent
        const lastMsg = prev[prev.length - 1];
        const textPart = lastMsg?.parts?.find((p) => p.type === "text");
        const lastText = textPart && "text" in textPart ? textPart.text : undefined;
        if (lastText === content && lastMsg?.role === role) return prev;

        return [...prev, toUIMessages([assistantMessage])[0]];
      });

      if (role === "assistant" && content) {
        const lowerText = content.toLowerCase();
        if (
          lowerText.includes("thank you for completing") ||
          lowerText.includes("survey is now complete")
        ) {
          setCompletedOverride(true);
        }
      }
    } else if (data.type === "audio_sent" || data.type === "text_response") {
      // AI started speaking (legacy or fallback)
      // We handle this for backward compatibility but prefer conversation_text
      if (!data.text) return;

      const assistantMessage: ChatMessage = {
        id: `legacy-${nanoid()}`,
        role: "assistant",
        content: data.text || "",
        parts: [{ type: "text" as const, text: data.text || "" }],
        timestamp: new Date().toISOString()
      };
      setMessages((prev) => [...prev, toUIMessages([assistantMessage])[0]]);

      const lowerText = data.text.toLowerCase();
      if (
        lowerText.includes("thank you for completing") ||
        lowerText.includes("survey is now complete")
      ) {
        setCompletedOverride(true);
      }
    } else if (data.type === "transcription" && data.isFinal) {
      // Use completedOverride (raw state) instead of derived `isCompleted` to avoid
      // needing isCompleted in the dep array (which would re-create the callback on every message).
      if (completedOverride) return;
    } else if (data.type === "display_media" && survey?.media && data.media?.id) {
      const mediaId = data.media?.id;
      const fullMedia = survey.media.find((media) => media.id === mediaId);
      if (fullMedia) {
        setMessages((prev) => [
          ...prev,
          toUIMessages([{
            id: `media-${nanoid()}`,
            role: "assistant",
            content: t("sharedMedia"),
            parts: [
              { type: "text", text: t("sharedMedia") },
              fullMedia.type === "image"
                ? {
                    type: "image",
                    image: fullMedia.url,
                    mimeType: fullMedia.mimeType,
                  }
                : {
                    type: "file",
                    file: fullMedia.url,
                    mimeType: fullMedia.mimeType ?? getDefaultMimeType(fullMedia.type),
                  },
            ],
            timestamp: new Date().toISOString(),
          }])[0],
        ]);
      }
    } else if (data.type === "survey_completed") {
      setCompletedOverride(true);
      // Disconnect voice immediately to stop recording
      setLocalIsVoiceMode(false);
    }
  // Do NOT add isCompleted — it would force a new callback on every completion state change,
  // causing the WebSocket to re-subscribe unnecessarily.
  }, [survey, t, setMessages, setCompletedOverride, completedOverride]);

  const voiceWs = useVoiceWebSocket({
    url: wsUrl,
    onMessage: onVoiceMessage,
    onReady: () => setVoiceFallbackNotice(null),
    onError: handleVoiceFailure,
  });

  // No longer needed to sync from survey prop due to derived state isVoiceMode

  // Handle initial start (User Gesture)
  const handleStartSurvey = async (lang?: string) => {
    if (lang && lang !== locale) {
      handleLanguageChange(lang);
    }

    setStartedOverride(true);
    if (isVoiceMode && conversationId) {
      setVoiceFallbackNotice(null);
      try {
        await voiceWs.connect();
      } catch (e) {
        handleVoiceFailure(e);
      }
    }
  };

  // Reconnect voice socket when locale changes so the server picks up the new language.
  // voiceWs methods are stable references from useVoiceWebSocket — safe to call inside effect
  // without adding the whole object to deps (doing so would run on every render).
  useEffect(() => {
    if (!isVoiceMode || !conversationId) return;
    voiceWs.disconnect();
    const timer = setTimeout(() => {
      voiceWs.connect().catch(handleVoiceFailure);
    }, 100);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const handleLanguageChange = (newLocale: string) => {
    router.replace(
      {
        pathname,
        query: {
          shareableLink,
          ...getUpdatedQuery(searchParams.toString(), { started: "true" }),
        },
      },
      {
        locale: newLocale,
      },
    );
  };

  const toggleVoiceMode = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    if (newMode && conversationId) {
      setVoiceFallbackNotice(null);
      voiceWs.connect().catch((error) => {
        handleVoiceFailure(error);
      });
    } else {
      if (newMode && !conversationId) {
        handleVoiceFailure("Missing conversation session");
      }
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
        id: `user-${nanoid()}`,
        role: "user",
        parts: [{ type: "text", text: currentInput }],
      });
    } catch (error) {
      console.error("[Respondent] sendMessage failed:", error);
      toast.error("Failed to send message. Please try again.");
      setInput(currentInput);
    }
  };

  const handleRespondentExport = async () => {
    if (!survey?.id || !conversationId) {
      return;
    }

    setIsPrivacyActionLoading(true);
    try {
      const response = await fetch("/api/privacy/respondent-export", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          surveyId: survey.id,
          conversationId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to export your response data.",
        );
      }

      const blob = new Blob([JSON.stringify(data.data ?? {}, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `convy-respondent-export-${conversationId}.json`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to export your response data.",
      );
    } finally {
      setIsPrivacyActionLoading(false);
    }
  };

  const handleRespondentDelete = async () => {
    if (!survey?.id || !conversationId) {
      return;
    }

    const confirmed = window.confirm(
      "Delete this response and the linked conversation data? This cannot be undone.",
    );
    if (!confirmed) {
      return;
    }

    setIsPrivacyActionLoading(true);
    try {
      const response = await fetch("/api/privacy/respondent-delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          surveyId: survey.id,
          conversationId,
        }),
      });
      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to delete your response data.",
        );
      }

      window.location.reload();
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : "Failed to delete your response data.",
      );
    } finally {
      setIsPrivacyActionLoading(false);
    }
  };

  const handleCopyResumeLink = async () => {
    if (!conversationId) {
      return;
    }

    setIsResumeLinkLoading(true);
    try {
      const response = await fetch(
        `/api/surveys/respond/${shareableLink}/resume-link`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            conversationId,
            locale,
          }),
        },
      );
      const data = await response.json().catch(() => ({}));

      if (!response.ok || typeof data.resumeLink !== "string") {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Failed to create a resume link.",
        );
      }

      await copyText(data.resumeLink);
      window.alert(
        "Resume link copied. Anyone with this link can continue this survey response, so keep it private.",
      );
    } catch (error) {
      window.alert(
        error instanceof Error
          ? error.message
          : "Failed to create a resume link.",
      );
    } finally {
      setIsResumeLinkLoading(false);
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
          <div className="space-y-3">
            {hasRespondentSession ? (
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <button
                  onClick={handleCopyResumeLink}
                  disabled={isResumeLinkLoading}
                  className="px-5 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  {isResumeLinkLoading ? "Preparing resume link..." : "Copy resume link"}
                </button>
                <button
                  onClick={handleRespondentExport}
                  disabled={isPrivacyActionLoading}
                  className="px-5 py-3 rounded-2xl border border-gray-200 bg-white text-gray-900 font-medium hover:bg-gray-50 transition-colors disabled:opacity-50"
                >
                  Export my data
                </button>
                <button
                  onClick={handleRespondentDelete}
                  disabled={isPrivacyActionLoading}
                  className="px-5 py-3 rounded-2xl border border-red-200 bg-red-50 text-red-700 font-medium hover:bg-red-100 transition-colors disabled:opacity-50"
                >
                  Delete my data
                </button>
              </div>
            ) : null}
            <button
              onClick={() => window.close()}
              className="px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold hover:bg-gray-800 transition-all hover:shadow-md hover:-translate-y-1 active:scale-95 w-full"
            >
              {t("close")}
            </button>
          </div>
        </div>
      </div>
    );
  }


  // Main UI Render
  return (
    <div className="min-h-[100dvh] bg-gray-50 flex items-center justify-center p-0 sm:p-4 font-sans selection:bg-gray-900 selection:text-white">
      {/* Start Survey Overlay for All Modes */}
      {!hasStarted && !isCompleted && !isInitializing && (
        <SurveyStartOverlay
          onStart={handleStartSurvey}
          initialLanguage={locale || "en"}
          title={survey?.title || t("voiceSurveyTitle")}
          description={
            survey?.objective?.description ||
            t("voiceSurveyIntro") ||
            "Join our interview. Choose your preferred language to begin."
          }
          isVoice={survey?.isVoice}
          translations={{
            selectLanguage: t("selectLanguage"),
            micPermissionDenied: t("micPermissionDenied"),
            micConsentTitle: t("micConsentTitle"),
            micConsentDescription: t("micConsentDescription"),
            initializing: t("initializing"),
            startInterview: t("startInterview"),
          }}
        />
      )}

      {/* Main Card */}
      <div
        className={cn(
          "w-full max-w-5xl h-[100dvh] sm:h-[85vh] bg-white rounded-none shadow-sm flex flex-col overflow-hidden relative transition-opacity duration-500",
          "sm:rounded-3xl sm:border border-gray-200",
          !hasStarted ? "opacity-0" : "opacity-100",
        )}
      >
        <header className="bg-white border-b border-gray-100 px-4 sm:px-6 py-3 z-10 flex-shrink-0">
          <div className="flex items-center justify-between gap-4 h-14">
            {/* Brand - Left */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <Image
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
              {conversationId ? (
                <button
                  onClick={handleCopyResumeLink}
                  disabled={isResumeLinkLoading}
                  className="hidden sm:inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-semibold transition-all bg-gray-100 text-gray-700 hover:bg-gray-200 disabled:opacity-50"
                >
                  {isResumeLinkLoading ? "Preparing link..." : "Copy resume link"}
                </button>
              ) : null}
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

        {/* Chat Area */}
        <main className="flex-1 overflow-y-auto scroll-smooth bg-slate-50/30 relative">
          <div className="max-w-3xl mx-auto px-4 py-8 space-y-8">
            {messages
              .filter((m) => m.id !== "init_ping_hidden")
              .map((message) => {
                const messageParts = message.parts ?? [];

                return (
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
                        {messageParts.length > 0 ? (
                          messageParts.map((part, index) => {
                            if (part.type === "text") {
                              return <MarkdownMessage key={index} content={part.text} />;
                            }
                            return null;
                          })
                        ) : (
                          null
                        )}

                        {messageParts.map((part, index) => {
                          const media = getMediaFromPart(part);
                          return media ? (
                            <MediaDisplay
                              key={`media-${message.id}-${index}`}
                              media={media}
                            />
                          ) : null;
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}
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
                        setVoiceFallbackNotice(null);
                        voiceWs.connect().catch((error) => {
                          handleVoiceFailure(error);
                        });
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
                      status={voiceWs.status}
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
                          onClick={() => {
                            setVoiceFallbackNotice(null);
                            voiceWs.connect().catch((error) => {
                              handleVoiceFailure(error);
                            });
                          }}
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
                    {voiceFallbackNotice && (
                      <div className="mb-4 flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                        <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                        <p>{voiceFallbackNotice}</p>
                      </div>
                    )}
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
