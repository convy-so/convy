"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { useSearchParams } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { nanoid } from "nanoid";
import { useLocale, useTranslations } from "next-intl";
import toast from "react-hot-toast";

import { usePathname, useRouter } from "@/i18n/routing";
import { useVoiceWebSocket } from "@/features/surveys/client/hooks/use-voice-websocket";
import type { ChatMessage, VoiceAgentMessage } from "@/shared/chat/chat-types";
import { toUIMessage, toUIMessages } from "@/shared/chat/chat-ui-messages";
import {
  getUIMessageText,
  hasSurveyCompletionText,
  isNamedToolUIPart,
} from "@/shared/chat/chat-ui-signals";
import { clientEnv } from "@/shared/config/client-env";
import { readJsonResponseValue } from "@/shared/http/json";

import {
  copyText,
  getDefaultMimeType,
  getUpdatedQuery,
  getVoiceFallbackMessage,
  initializeSurvey,
  type SurveyResponseLocale,
} from "./survey-respond-models";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getResponseErrorMessage(payload: unknown): string | null {
  if (!isRecord(payload)) {
    return null;
  }

  if (typeof payload.error === "string") {
    return payload.error;
  }

  if (isRecord(payload.error) && typeof payload.error.message === "string") {
    return payload.error.message;
  }

  return null;
}

function getExportedResponseData(payload: unknown): unknown {
  if (!isRecord(payload) || !("data" in payload)) {
    return {};
  }

  return payload.data;
}

function getResumeLink(payload: unknown): string | null {
  if (!isRecord(payload) || typeof payload.resumeLink !== "string") {
    return null;
  }

  return payload.resumeLink;
}

export function useSurveyRespondController() {
  const searchParams = useSearchParams();
  const queryString = searchParams.toString();
  const resumeParam = searchParams.get("resume");
  const startedParam = searchParams.get("started");
  const completedParam = searchParams.get("completed");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const translations = useTranslations("Survey.Response");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  const shareableLink = useMemo(() => {
    const pathSegments = pathname.split("/").filter(Boolean);
    const shareablePathIndex = pathSegments.indexOf("s");

    if (
      shareablePathIndex !== -1 &&
      pathSegments[shareablePathIndex + 2] === "respond"
    ) {
      return pathSegments[shareablePathIndex + 1] ?? null;
    }

    return null;
  }, [pathname]);

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
  const apiEndpoint = shareableLink
    ? `/api/surveys/respond/${shareableLink}`
    : "";
  const hasRespondentSession = Boolean(survey?.id && conversationId);

  const [input, setInput] = useState("");
  const [completedOverride, setCompletedOverride] = useState<boolean | null>(
    null,
  );
  const [startedOverride, setStartedOverride] = useState<boolean | null>(null);
  const [voiceFallbackNotice, setVoiceFallbackNotice] = useState<string | null>(
    null,
  );
  const [isPrivacyActionLoading, setIsPrivacyActionLoading] = useState(false);
  const [isResumeLinkLoading, setIsResumeLinkLoading] = useState(false);
  const [localIsVoiceMode, setLocalIsVoiceMode] = useState<boolean | null>(
    null,
  );

  const hasStarted =
    startedOverride ?? (startedParam === "true" || resumedMessages.length > 1);
  const isVoiceMode = localIsVoiceMode ?? (survey?.isVoice || false);

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

  useEffect(() => {
    if (!survey?.language || survey.language === locale) {
      return;
    }

    const storageKey = `convy_redirected_${shareableLink}`;
    const hasRedirected = sessionStorage.getItem(storageKey);

    if (hasRedirected) {
      return;
    }

    sessionStorage.setItem(storageKey, "true");
    router.replace(`/s/${shareableLink}/respond`, { locale: survey.language });
  }, [survey, locale, shareableLink, router]);

  const selectedLanguage: SurveyResponseLocale =
    locale === "fr" || locale === "de" ? locale : "en";

  const initialChatMessages: ChatMessage[] =
    resumedMessages.length > 1 ||
    (!survey?.isVoice && resumedMessages.length > 0)
      ? resumedMessages
      : [];

  const transport = useMemo(
    () =>
      new DefaultChatTransport({
        api: apiEndpoint,
        body: { conversationId, language: locale },
      }),
    [apiEndpoint, conversationId, locale],
  );

  const { messages, setMessages, status, sendMessage } = useChat({
    id: conversationId ?? "pending",
    transport,
    messages: toUIMessages(
      initialChatMessages.filter((message) =>
        message.parts?.some((part) => part.type === "text"),
      ),
    ),
    onFinish: ({ message }: { message: UIMessage }) => {
      const hasToolCompletion = message.parts?.some((part) =>
        isNamedToolUIPart(part, "finishSurvey"),
      );
      const hasTextCompletion = hasSurveyCompletionText(
        getUIMessageText(message),
      );

      if (hasToolCompletion || hasTextCompletion) {
        setCompletedOverride(true);
      }
    },
  });

  const isCompleted = useMemo(() => {
    if (completedOverride) {
      return true;
    }

    if (initiallyCompleted || completedParam === "true") {
      return true;
    }

    const lastAssistantMessage = messages.findLast(
      (message) => message.role === "assistant",
    );
    if (!lastAssistantMessage) {
      return false;
    }

    const hasToolCompletion = lastAssistantMessage.parts?.some((part) =>
      isNamedToolUIPart(part, "finishSurvey"),
    );
    const hasTextCompletion = hasSurveyCompletionText(
      getUIMessageText(lastAssistantMessage),
    );

    return hasToolCompletion || hasTextCompletion;
  }, [messages, initiallyCompleted, completedParam, completedOverride]);

  const isChatLoading = status === "streaming" || status === "submitted";
  const websocketUrl =
    survey?.isVoice && conversationId && shareableLink
      ? `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-response?surveyId=${encodeURIComponent(shareableLink)}&conversationId=${encodeURIComponent(conversationId)}&language=${encodeURIComponent(selectedLanguage)}`
      : "";

  const handleVoiceFailure = useCallback((error: unknown) => {
    setVoiceFallbackNotice(getVoiceFallbackMessage(error));
    setLocalIsVoiceMode(false);
  }, []);

  const onVoiceMessage = useCallback(
    (message: VoiceAgentMessage) => {
      if (message.type === "conversation_text") {
        const role = typeof message.role === "string" ? message.role : "assistant";
        const content = typeof message.content === "string" ? message.content : "";

        if (
          content.includes("<thinking>") ||
          content.includes("Internal instructions:")
        ) {
          return;
        }

        const assistantMessage: ChatMessage = {
          id: `voice-${nanoid()}`,
          role:
            role === "user" || role === "assistant" || role === "system"
              ? role
              : "assistant",
          content,
          parts: [{ type: "text", text: content }],
          timestamp: new Date().toISOString(),
        };

        setMessages((currentMessages) => {
          const lastMessage = currentMessages[currentMessages.length - 1];
          const lastTextPart = lastMessage?.parts?.find(
            (part) => part.type === "text",
          );
          const lastText =
            lastTextPart && "text" in lastTextPart
              ? lastTextPart.text
              : undefined;

          if (lastText === content && lastMessage?.role === role) {
            return currentMessages;
          }

          const uiMessage = toUIMessage(assistantMessage);
          return uiMessage ? [...currentMessages, uiMessage] : currentMessages;
        });

        if (role === "assistant" && content) {
          const normalizedText = content.toLowerCase();
          if (
            normalizedText.includes("thank you for completing") ||
            normalizedText.includes("survey is now complete")
          ) {
            setCompletedOverride(true);
          }
        }

        return;
      }

      if (message.type === "audio_sent" || message.type === "text_response") {
        if (!message.text) {
          return;
        }

        const assistantMessage: ChatMessage = {
          id: `legacy-${nanoid()}`,
          role: "assistant",
          content: message.text,
          parts: [{ type: "text", text: message.text }],
          timestamp: new Date().toISOString(),
        };

        setMessages((currentMessages) => {
          const uiMessage = toUIMessage(assistantMessage);
          return uiMessage ? [...currentMessages, uiMessage] : currentMessages;
        });

        const normalizedText = message.text.toLowerCase();
        if (
          normalizedText.includes("thank you for completing") ||
          normalizedText.includes("survey is now complete")
        ) {
          setCompletedOverride(true);
        }

        return;
      }

      if (message.type === "display_media" && survey?.media && message.media?.id) {
        const mediaId = message.media.id;
        const matchingMedia = survey.media.find(
          (surveyMedia) => surveyMedia.id === mediaId,
        );

        if (!matchingMedia) {
          return;
        }

        setMessages((currentMessages) => {
          const uiMessage = toUIMessage({
            id: `media-${nanoid()}`,
            role: "assistant",
            content: translations("sharedMedia"),
            parts: [
              { type: "text", text: translations("sharedMedia") },
              matchingMedia.type === "image"
                ? {
                    type: "image",
                    image: matchingMedia.url,
                    mimeType: matchingMedia.mimeType,
                  }
                : {
                    type: "file",
                    file: matchingMedia.url,
                    mimeType:
                      matchingMedia.mimeType ??
                      getDefaultMimeType(matchingMedia.type),
                  },
            ],
            timestamp: new Date().toISOString(),
          });

          return uiMessage ? [...currentMessages, uiMessage] : currentMessages;
        });

        return;
      }

      if (message.type === "survey_completed") {
        setCompletedOverride(true);
        setLocalIsVoiceMode(false);
      }
    },
    [setMessages, survey, translations],
  );

  const voiceSocket = useVoiceWebSocket({
    url: websocketUrl,
    onMessage: onVoiceMessage,
    onReady: () => setVoiceFallbackNotice(null),
    onError: handleVoiceFailure,
  });

  const handleRetryVoice = useCallback(() => {
    setVoiceFallbackNotice(null);
    void voiceSocket.connect().catch(handleVoiceFailure);
  }, [handleVoiceFailure, voiceSocket]);

  const handleLanguageChange = useCallback(
    (newLocale: string) => {
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
    },
    [pathname, router, searchParams, shareableLink],
  );

  const handleStartSurvey = useCallback(
    async (language?: string) => {
      if (language && language !== locale) {
        handleLanguageChange(language);
      }

      setStartedOverride(true);

      if (!isVoiceMode || !conversationId) {
        return;
      }

      setVoiceFallbackNotice(null);

      try {
        await voiceSocket.connect();
      } catch (error) {
        handleVoiceFailure(error);
      }
    },
    [
      conversationId,
      handleLanguageChange,
      handleVoiceFailure,
      isVoiceMode,
      locale,
      voiceSocket,
    ],
  );

  useEffect(() => {
    if (!isVoiceMode || !conversationId) {
      return;
    }

    voiceSocket.disconnect();
    const reconnectTimer = setTimeout(() => {
      void voiceSocket.connect().catch(handleVoiceFailure);
    }, 100);

    return () => clearTimeout(reconnectTimer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  const toggleVoiceMode = useCallback(() => {
    const nextVoiceMode = !isVoiceMode;
    setLocalIsVoiceMode(nextVoiceMode);

    if (!nextVoiceMode) {
      voiceSocket.disconnect();
      return;
    }

    if (!conversationId) {
      handleVoiceFailure("Missing conversation session");
      return;
    }

    setVoiceFallbackNotice(null);
    void voiceSocket.connect().catch(handleVoiceFailure);
  }, [conversationId, handleVoiceFailure, isVoiceMode, voiceSocket]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSubmit = useCallback(
    async (event?: FormEvent) => {
      if (event) {
        event.preventDefault();
      }

      if (isCompleted || !input.trim() || isChatLoading || !conversationId) {
        return;
      }

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
    },
    [conversationId, input, isChatLoading, isCompleted, sendMessage],
  );

  const handleRespondentExport = useCallback(async () => {
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
      const data = await readJsonResponseValue(response);

      if (!response.ok) {
        throw new Error(
          getResponseErrorMessage(data) ??
            "Failed to export your response data.",
        );
      }

      const blob = new Blob(
        [JSON.stringify(getExportedResponseData(data), null, 2)],
        { type: "application/json" },
      );
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
  }, [conversationId, survey?.id]);

  const handleRespondentDelete = useCallback(async () => {
    if (!survey?.id || !conversationId) {
      return;
    }

    const isConfirmed = window.confirm(
      "Delete this response and the linked conversation data? This cannot be undone.",
    );
    if (!isConfirmed) {
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
      const data = await readJsonResponseValue(response);

      if (!response.ok) {
        throw new Error(
          getResponseErrorMessage(data) ??
            "Failed to delete your response data.",
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
  }, [conversationId, survey?.id]);

  const handleCopyResumeLink = useCallback(async () => {
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
      const data = await readJsonResponseValue(response);
      const resumeLink = getResumeLink(data);

      if (!response.ok || !resumeLink) {
        throw new Error(
          getResponseErrorMessage(data) ?? "Failed to create a resume link.",
        );
      }

      await copyText(resumeLink);
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
  }, [conversationId, locale, shareableLink]);

  return {
    conversationId,
    hasRespondentSession,
    hasStarted,
    initError,
    input,
    inputRef,
    isChatLoading,
    isCompleted,
    isInitializing,
    isPrivacyActionLoading,
    isResumeLinkLoading,
    isVoiceMode,
    locale,
    messages,
    messagesEndRef,
    setInput,
    survey,
    translations,
    voiceFallbackNotice,
    voiceSocket,
    handleCopyResumeLink,
    handleLanguageChange,
    handleRespondentDelete,
    handleRespondentExport,
    handleRetryVoice,
    handleStartSurvey,
    handleSubmit,
    toggleVoiceMode,
  };
}
