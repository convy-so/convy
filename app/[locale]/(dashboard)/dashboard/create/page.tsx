"use client";

import {
  useState,
  useRef,
  useEffect,
  useMemo,
  Suspense,
  useId,
  useCallback,
} from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { UIMessage as SDKMessage, DefaultChatTransport } from "ai";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  Loader2,
  User,
  Paperclip,
  Play,
  CheckCircle2,
  Keyboard,
  Users,
  Upload,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { fetchWorkspaceLocalizationSettings } from "@/lib/api/workspace";
import { PublishSurveyModal } from "@/components/surveys/publish-survey-modal";
import { useAudioTranscription } from "@/hooks/use-audio-transcription";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";
import { CollaborationSidebar } from "@/components/surveys/collaboration-sidebar";
import { ActiveUsers } from "@/components/dashboard/active-users";
import { useRealtime } from "@/hooks/use-realtime";
import {
  isCreationMediaDecisionResolved,
  normalizeCreationMediaDecision,
  type CreationMediaRecommendation,
} from "@/lib/education/agent-tools";
import {
  appLocaleLabels,
  appLocales,
  isAppLocale,
  type AppLocale,
} from "@/lib/i18n/config";





import { ChatMessagePart } from "@/lib/chat-types";

type SurveyExtractedData = {
  objective?: { goal?: string };
  targetAudience?: { description?: string };
  programId?: string;
  readyForSampling?: boolean;
  mediaDecision?: unknown;
};

type SurveyCollectedInfo = {
  objective?: boolean;
  targetAudience?: boolean;
  subjectDefined?: boolean;
  programIdentified?: boolean;
  scope?: boolean;
  successCriteria?: boolean;
  constraints?: boolean;
  tone?: boolean;
  requiredQuestions?: boolean;
  metrics?: boolean;
  personalInfo?: boolean;
};

type SurveyDraftResponse = {
  id: string;
  messages?: Array<{ id?: string; role: string; content?: string; parts?: ChatMessagePart[] }>;
  collectedInfo?: SurveyCollectedInfo;
  extractedData?: SurveyExtractedData;
  status?: string;
};

type SurveyCreationSyncResponse = {
  messages?: Array<{ id?: string; role: string; content?: string; parts?: ChatMessagePart[] }>;
  collectedInfo?: SurveyCollectedInfo;
  extractedData?: SurveyExtractedData;
  status?: string;
};

type UIMessage = SDKMessage & {
  displayedContent?: string;
  isTyping?: boolean;
  timestamp?: number;
};

type SupportedLocale = AppLocale;

type StoredCreateMessage = {
  id?: string;
  role: string;
  content?: string;
  parts?: unknown;
  timestamp?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isSupportedLocale(value: unknown): value is SupportedLocale {
  return isAppLocale(value);
}

function getSupportedLocale(value: unknown, fallback: SupportedLocale = "en"): SupportedLocale {
  return isSupportedLocale(value) ? value : fallback;
}

function isConversationRole(role: string): role is "user" | "assistant" {
  return role === "user" || role === "assistant";
}

function getTextFromChatParts(parts?: unknown): string {
  if (!Array.isArray(parts)) return "";
  return parts
    ?.filter((part): part is { type: "text"; text: string } => isRecord(part) && part.type === "text" && typeof part.text === "string")
    .map((part) => part.text)
    .join("") || "";
}

function getDisplayedMessageText(message: {
  displayedContent?: string;
  parts?: SDKMessage["parts"];
}): string {
  return message.displayedContent || getTextFromChatParts(message.parts);
}

function normalizeChatMessageParts(value: unknown): NonNullable<UIMessage["parts"]> {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((part): NonNullable<UIMessage["parts"]> => {
    if (!isRecord(part) || typeof part.type !== "string") {
      return [];
    }

    switch (part.type) {
      case "text":
        return typeof part.text === "string"
          ? [{ type: "text" as const, text: part.text }]
          : [];
      case "image":
        return typeof part.image === "string"
          ? [{
              type: "data-image" as const,
              data: { image: part.image, mimeType: part.mimeType },
            }]
          : [];
      case "file":
        return typeof part.file === "string" && typeof part.mimeType === "string"
          ? [{ type: "data-file" as const, data: { file: part.file, mimeType: part.mimeType } }]
          : [];
      case "tool-call":
        return typeof part.toolCallId === "string" && typeof part.toolName === "string"
          ? [{
              type: `tool-${part.toolName}` as `tool-${string}`,
              toolCallId: part.toolCallId,
              state: "input-streaming" as const,
              input: part.input || {},
            }]
          : [];
      case "tool-result":
        return typeof part.toolCallId === "string" && typeof part.toolName === "string"
          ? [{
              type: `tool-${part.toolName}` as `tool-${string}`,
              toolCallId: part.toolCallId,
              state: "output-available" as const,
              input: {},
              output: part.result,
            }]
          : [];
      default:
        return [];
    }
  });
}

function normalizeCreateMessage(
  message: StoredCreateMessage,
  index: number,
): UIMessage | null {
  if (!isConversationRole(message.role)) {
    return null;
  }

  const parts =
    Array.isArray(message.parts) && message.parts.length > 0
      ? normalizeChatMessageParts(message.parts)
      : message.content
        ? [{ type: "text" as const, text: message.content }]
        : [];

  return {
    id: message.id || `msg-${index}-${Date.now()}`,
    role: message.role,
    displayedContent: message.content || getTextFromChatParts(parts),
    isTyping: false,
    parts,
    timestamp: message.timestamp ? new Date(message.timestamp).getTime() : undefined,
  };
}

function normalizeCreateMessages(messages: unknown): UIMessage[] {
  if (!Array.isArray(messages)) {
    return [];
  }

  return messages.flatMap((message, index) => {
    if (!isRecord(message) || typeof message.role !== "string") {
      return [];
    }

    const normalized = normalizeCreateMessage(
      {
        id: typeof message.id === "string" ? message.id : undefined,
        role: message.role,
        content: typeof message.content === "string" ? message.content : undefined,
        parts: normalizeChatMessageParts(message.parts),
        timestamp: typeof message.timestamp === "string" ? message.timestamp : undefined,
      },
      index,
    );

    return normalized ? [normalized] : [];
  });
}

function normalizeCollectedInfo(value: unknown): SurveyCollectedInfo | null {
  if (!isRecord(value)) {
    return null;
  }

  return {
    objective: typeof value.objective === "boolean" ? value.objective : undefined,
    targetAudience: typeof value.targetAudience === "boolean" ? value.targetAudience : undefined,
    subjectDefined: typeof value.subjectDefined === "boolean" ? value.subjectDefined : undefined,
    programIdentified: typeof value.programIdentified === "boolean" ? value.programIdentified : undefined,
    scope: typeof value.scope === "boolean" ? value.scope : undefined,
    successCriteria: typeof value.successCriteria === "boolean" ? value.successCriteria : undefined,
    constraints: typeof value.constraints === "boolean" ? value.constraints : undefined,
    tone: typeof value.tone === "boolean" ? value.tone : undefined,
    requiredQuestions: typeof value.requiredQuestions === "boolean" ? value.requiredQuestions : undefined,
    metrics: typeof value.metrics === "boolean" ? value.metrics : undefined,
    personalInfo: typeof value.personalInfo === "boolean" ? value.personalInfo : undefined,
  };
}

function normalizeExtractedData(value: unknown): SurveyExtractedData | null {
  if (!isRecord(value)) {
    return null;
  }

  const objective = isRecord(value.objective) && typeof value.objective.goal === "string"
    ? { goal: value.objective.goal }
    : undefined;
  const targetAudience =
    isRecord(value.targetAudience) && typeof value.targetAudience.description === "string"
      ? { description: value.targetAudience.description }
      : undefined;

  return {
    objective,
    targetAudience,
    programId: typeof value.programId === "string" ? value.programId : undefined,
    readyForSampling:
      typeof value.readyForSampling === "boolean" ? value.readyForSampling : undefined,
    mediaDecision: value.mediaDecision,
  };
}

function normalizeCreationRealtimeEvent(value: unknown): {
  actorId?: string;
  eventType?: string;
} {
  if (!isRecord(value)) {
    return {};
  }

  return {
    actorId: typeof value.actorId === "string" ? value.actorId : undefined,
    eventType: typeof value.eventType === "string" ? value.eventType : undefined,
  };
}

function parseMediaUploadArgs(input: unknown): {
  allowedTypes: string[];
  recommendation: CreationMediaRecommendation;
  suggestedDescription?: string;
  suggestedFeedbackFocus?: string;
  rationale?: string;
} {
  const args = isRecord(input) ? input : {};
  const allowedTypes = Array.isArray(args.allowedTypes)
    ? args.allowedTypes.filter((item): item is string => typeof item === "string")
    : ["image", "audio", "video"];
  const recommendation =
    args.recommendation === "add_media" || args.recommendation === "not_needed"
      ? args.recommendation
      : "not_needed";

  return {
    allowedTypes,
    recommendation,
    suggestedDescription:
      typeof args.suggestedDescription === "string"
        ? args.suggestedDescription
        : typeof args.description === "string"
          ? args.description
          : undefined,
    suggestedFeedbackFocus:
      typeof args.suggestedFeedbackFocus === "string"
        ? args.suggestedFeedbackFocus
        : typeof args.learningGoal === "string"
          ? args.learningGoal
          : undefined,
    rationale: typeof args.rationale === "string" ? args.rationale : undefined,
  };
}

function CreateSurveyContent() {
  const t = useTranslations("Survey.Create");
  const router = useRouter();
  const { user, session, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const params = useParams();
  const locale = typeof params.locale === "string" ? params.locale : "en";
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [voiceFallbackNotice, setVoiceFallbackNotice] = useState<string | null>(null);


  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [_isResearching, setIsResearching] = useState(false); // Research animation state

  // Language state initialized from locale
  const [language, setLanguage] = useState<SupportedLocale>(getSupportedLocale(locale));
  const [availableLanguages, setAvailableLanguages] = useState<SupportedLocale[]>([...appLocales]);
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);

  const [canManageCollaborators, setCanManageCollaborators] = useState(false);
  const [editors, setEditors] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);
  const [isCollaborationOpen, setIsCollaborationOpen] = useState(false);

  useRealtime({
    channels: surveyId && orgId ? [`survey:${surveyId}`] : [],
    onEvent: async (event: unknown) => {
      const e = normalizeCreationRealtimeEvent(event);
      if (!surveyId || e.actorId === user?.id) return;
      
      const type = e.eventType;
      if (
        type === "survey.creation_turn_added" ||
        type === "survey.editor_granted" ||
        type === "survey.editor_revoked" ||
        type === "survey.deleting"
      ) {
        try {
          const response = await fetch(`/api/surveys/${surveyId}/create`, {
            cache: "no-store",
          });
          if (!response.ok) return;
          const data = await response.json();
          setMessages(normalizeCreateMessages(data.messages));
          const collectedInfo = normalizeCollectedInfo(data.collectedInfo);
          const extractedData = normalizeExtractedData(data.extractedData);
          if (collectedInfo) setCollectedInfo(collectedInfo);
          if (extractedData) setExtractedData(extractedData);
          if (data.status) setSurveyStatus(data.status);
        } catch (error) {
          console.error("[Create Page] Failed to sync realtime survey event:", error);
        }
      }
    },
  });

  const handleStart = async () => {
    // 1. Optimistic UI
    setVoiceFallbackNotice(null);

    // 2. Ensure draft exists
    let currentSurveyId = surveyId;
    let initialGreetingMessages = null;

    if (!currentSurveyId) {
      try {
        const surveyData = await ensureDraftExists();
        if (surveyData) {
          currentSurveyId = typeof surveyData === 'string' ? surveyData : surveyData.id;
          initialGreetingMessages = typeof surveyData === 'string' ? null : surveyData.messages;
        }
      } catch (e) {
        console.error("[Start] Init failed:", e);
        toast.error(t("Toasts.InitFailed"));
        return;
      }
    }

    if (!currentSurveyId) {
      return;
    }

    // 3. Set the survey respondent mode once ID is known
    // Optimistically skip if we just created it (since POST already set it)
    if (!initialGreetingMessages) {
      await updateSurveyMode(currentSurveyId, isVoiceSurvey);
    }

    try {
      // 4. Update Backend - NOTE: Skip for new surveys as they are already initialized
      if (!initialGreetingMessages) {
        await fetch(`/api/surveys/${currentSurveyId}/create`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({})
        });
      }

      // Persist creation modality if voice was chosen
      // 5. Trigger Interaction based on Mode
      if (initialGreetingMessages) {
        setMessages(normalizeCreateMessages(initialGreetingMessages));
      } else {
        try {
          const greetingRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
          if (greetingRes.ok) {
            const greetingData: SurveyCreationSyncResponse = await greetingRes.json();
            if (greetingData.messages && greetingData.messages.length > 0) {
              setMessages(normalizeCreateMessages(greetingData.messages));
            }
            if (greetingData.collectedInfo) setCollectedInfo(greetingData.collectedInfo);
            if (greetingData.extractedData) setExtractedData(greetingData.extractedData);
          }
        } catch (greetingErr) {
          console.error("[Start] Greeting failed:", greetingErr);
        }
      }

    } catch (error) {
      console.error("Failed to start discovery:", error);
      toast.error("Failed to save topic. Please try again.");
    }
  };


  const updateSurveyMode = async (id: string | null, isVoice: boolean) => {
    setIsVoiceSurvey(isVoice);

    if (id) {
      try {
        await fetch(`/api/surveys/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isVoice })
        });
      } catch (error) {
        console.error("[UpdateMode] Failed:", error);
        toast.error(t("Toasts.ModeUpdateFailed"));
      }
    }
  };

  const [hasAutoGreeted, setHasAutoGreeted] = useState(false);



  const [extractedData, setExtractedData] = useState<SurveyExtractedData | null>(null);
  const [collectedInfo, setCollectedInfo] = useState<SurveyCollectedInfo | null>(null);

  // Local input state for the chat (AI SDK v6 migration)
  const [input, setInput] = useState("");

  // Refs to track the latest surveyId and extractedData without causing useChat to reinitialize
  const surveyIdRef = useRef<string | null>(surveyId);
  const extractedDataRef = useRef<SurveyExtractedData | null>(extractedData);

  useEffect(() => { surveyIdRef.current = surveyId; }, [surveyId]);
  useEffect(() => { extractedDataRef.current = extractedData; }, [extractedData]);

  const {
    messages,
    setMessages,
    status,
    sendMessage,
    addToolOutput,
  } = useChat({
    id: "survey-creation-session",
    transport: new DefaultChatTransport({
      api: "/api/surveys/create-draft", // base default — overridden per-request via prepareSendMessagesRequest
      fetch: (async (url: RequestInfo | URL, init?: RequestInit) => {
        const response = await fetch(url, init);
        return response;
      }) as typeof fetch,
      prepareSendMessagesRequest: async ({ api, body, id, messages: msgs, trigger, messageId }) => {
        const sid = surveyIdRef.current;
        const targetApi = sid ? `/api/surveys/${sid}/create` : api;


        return {
          api: targetApi,
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
      if (toolCall.toolName === 'researchBestPractices') {
        setIsResearching(true);
      }
      // NOTE: finishSurvey is server-executed — no client resolution needed here.
      // NOTE: requestMediaUpload is client-side — the MediaUploadFlow component resolves it.
    },
    onFinish: () => {},
    onError: (error) => {
      console.error("[Chat] Error:", error);
      console.error("[useChat:onError] Chat encountered an error:", error);
    }
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
  }, [status]);

  const {
    isSupported: isVoiceInputSupported,
    phase: transcriptionPhase,
    startTranscription,
    stopRecording,
  } = useAudioTranscription({
    onError: (message) => {
      setVoiceFallbackNotice(message);
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

            if (!isSdkTool) {
              return part;
            }

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

  // Detect if all required info has been collected for sample conversations
  const isReadyForSample = useMemo(() => {
    if (!surveyId || !collectedInfo) return false;
    if (!mediaDecisionResolved) return false;

    // 1. Check for explicit completion signal in messages (Fallback)
    // If the assistant says "click the button" or "sample conversations", we should show it
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const messageContent = lastAssistantMessage?.parts
      ?.filter(p => p.type === 'text')
      .map((p) => "text" in p ? p.text : "")
      .join('') || "";

    const aiMentionedSamples = messageContent.toLowerCase().includes('sample conversation') ||
      messageContent.toLowerCase().includes('click') &&
      messageContent.toLowerCase().includes('button');

    // Check for finishSurvey tool call - AI SDK uses type 'tool-{toolName}'
    const finishToolCalled = messages.some(m =>
      m.parts?.some((p) =>
        p.type === 'tool-finishSurvey'
      )
    );

    if (finishToolCalled) {
      //       return true;
    }

    // 2. Main Logic: Check all truly required flags are collected
    // These must now match our REQUIRED_INFORMATION priorities and Agent keys
    const criticalFlagsCollected = (
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.subjectDefined &&
      collectedInfo.programIdentified
    );

    // If AI mentioned samples, we skip strict structural validation and trust the AI
    // We only enforce that we have the absolute minimums (objective, audience, domain)
    if (aiMentionedSamples && criticalFlagsCollected) {
      //       return true;
    }

    // 3. Structural Validation (Strict path)
    // If AI hasn't explicitly said "click the button", we fall back to strict validation
    const allRequiredFlagsCollected = (
      criticalFlagsCollected &&
      collectedInfo.scope &&
      collectedInfo.successCriteria &&
      collectedInfo.constraints &&
      collectedInfo.tone &&
      collectedInfo.requiredQuestions &&
      collectedInfo.metrics &&
      collectedInfo.personalInfo
    );

    if (!allRequiredFlagsCollected || !extractedData) {
      return Boolean(extractedData?.readyForSampling);
    }

    if (extractedData.readyForSampling) {
      return true;
    }

    const hasObjective = !!(extractedData.objective?.goal);
    const hasAudience = !!(extractedData.targetAudience?.description);
    const hasProgram =
      (typeof extractedData.programId === 'string' &&
        extractedData.programId.trim().length > 0);

    // We trust allRequiredFlagsCollected for everything else (opt-outs are valid)
    const isReady = allRequiredFlagsCollected && hasObjective && hasAudience && hasProgram;

    return isReady;
  }, [surveyId, collectedInfo, extractedData, mediaDecisionResolved, messages]);


  const messagesEndRef = useRef<HTMLDivElement>(null);


  // Check authentication status using AuthContext
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      setAuthError(t("Authentication.Required"));
      setIsInitializing(false);
      return;
    }

    if (!user.emailVerified) {
      setAuthError("Please verify your email to continue.");
      setIsInitializing(false);
      return;
    }

    setAuthError(null);
    setIsInitializing(false);
  }, [user, authLoading, t]);

  // Resolve the initial content language for new drafts:
  // workspace default content locale wins inside a workspace,
  // otherwise fall back to the user's UI locale.
  useEffect(() => {
    if (!user || authLoading || surveyId) return;

    let cancelled = false;

    const resolveInitialLanguage = async () => {
      try {
        let nextLanguage = getSupportedLocale(locale);
        const response = await fetch("/api/user/language");

        if (response.ok) {
          const data = await response.json();
          if (isRecord(data)) {
            const userLocale = isAppLocale(data.uiLocale)
              ? data.uiLocale
              : isAppLocale(data.preferredLanguage)
                ? data.preferredLanguage
                : null;

            if (userLocale) {
              nextLanguage = userLocale;
            }
          }
        }

        if (session?.activeOrganizationId) {
          const workspaceLocalization = await fetchWorkspaceLocalizationSettings(
            session.activeOrganizationId,
          ).catch(() => null);

          if (workspaceLocalization) {
            setAvailableLanguages(workspaceLocalization.allowedLocales);
            nextLanguage = workspaceLocalization.defaultContentLocale;
          }
        } else if (!cancelled) {
          setAvailableLanguages([...appLocales]);
        }

        if (cancelled) {
          return;
        }

        setLanguage((currentLanguage) =>
          currentLanguage === nextLanguage ? currentLanguage : nextLanguage,
        );

      } catch (error) {
        console.error("Failed to fetch user language:", error);
      }
    };

    void resolveInitialLanguage();

    return () => {
      cancelled = true;
    };
  }, [
    user,
    authLoading,
    locale,
    session?.activeOrganizationId,
    surveyId,
  ]);


  useEffect(() => {
    if (idFromUrl && !authLoading && user) {
      if (surveyId === idFromUrl) {
        return;
      }

      setSurveyId(idFromUrl);
      const loadConversation = async () => {
        setIsInitializing(true);
        try {
          // Fetch both conversation data and survey details
          const [conversationRes, surveyRes] = await Promise.all([
            fetch(`/api/surveys/${idFromUrl}/create`),
            fetch(`/api/surveys/${idFromUrl}/details`)
          ]);

          if (conversationRes.ok) {
            const data = await conversationRes.json();

            if (data.messages && data.messages.length > 0) {
              setMessages(normalizeCreateMessages(data.messages));
            }

            const collectedInfo = normalizeCollectedInfo(data.collectedInfo);
            if (collectedInfo) setCollectedInfo(collectedInfo);

            const extractedData = normalizeExtractedData(data.extractedData);
            if (extractedData) {
              setExtractedData(extractedData);
            }
          }

          // Get survey status to determine read-only mode
          if (surveyRes.ok) {
            const surveyData = await surveyRes.json();
            const status = surveyData.survey?.status || null;
            setSurveyStatus(status);
            const organizationId = surveyData.survey?.organizationId || null;
            setOrgId(organizationId);


              let currentEditors: string[] = [];
              let hasEditAccess = false;

              setCanManageCollaborators(Boolean(surveyData.survey?.permission?.canManageCollaborators));
              if (surveyData.survey?.editors) {
                currentEditors = surveyData.survey.editors;
                setEditors(currentEditors);
            }
            hasEditAccess = Boolean(surveyData.survey?.permission?.canEdit);

            // Set language if available
            if (isSupportedLocale(surveyData.survey?.language)) {
              setLanguage(surveyData.survey.language);
            }
            // Set voice mode if available
            if (typeof surveyData.survey?.isVoice === 'boolean') {
              setIsVoiceSurvey(surveyData.survey.isVoice);
            }

            // Read-only if survey is NOT in "creating" status OR if user has no edit access
            const isFinished = status && status !== "creating";

            if (isFinished || !hasEditAccess) {
              setIsReadOnly(true);
            } else {
              setIsReadOnly(false);
            }
          }
        } catch (error) {
          console.error("[LoadConversation] Failed:", error);
          toast.error("Failed to load conversation.");
        } finally {
          setIsInitializing(false);
        }
      };

      loadConversation();
    }
  }, [idFromUrl, authLoading, user, surveyId, setMessages]);

  // PROACTIVE GREETING: Trigger initial greeting if the draft is empty (e.g. returning to cold draft)
  useEffect(() => {
    if (isInitializing || authLoading || !user || !surveyId || isReadOnly) return;
    if (hasAutoGreeted) return;

    // If messages are empty after initialization, trigger the first ping
    if (status !== "submitted" && status !== "streaming" && messages.length === 0) {
      sendMessage({
        role: "user",
        parts: [{ type: "text" as const, text: "Start the conversation now. Greet the participant according to the system prompt instructions." }]
      });
      setHasAutoGreeted(true);
    }
  }, [isInitializing, authLoading, user, surveyId, messages.length, status, isReadOnly, hasAutoGreeted, sendMessage]);

  // Lazy creation state
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Helper to ensure draft exists before sending message
  const ensureDraftExists = async (): Promise<SurveyDraftResponse | string | null> => {
    if (surveyId) return surveyId;
    if (isCreatingDraft) {
      console.warn("[Client] ensureDraftExists skipped: already creating...");
      return null;
    }

    setIsCreatingDraft(true);
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ language, isVoice: isVoiceSurvey }),
      });


      if (response.status === 401) {
        setAuthError(t("Authentication.Required"));
        return null;
      }

      if (!response.ok) {
        const contentType = response.headers.get("content-type");
        let errorMsg = "";

        if (contentType && contentType.includes("application/json")) {
          const errorData = await response.json();
          errorMsg = errorData.error || errorData.message || `Error: ${response.status}`;
        } else {
          errorMsg = await response.text();
        }

        console.error(`[Client] ensureDraftExists FAILED: ${response.status} ${errorMsg}`);

        if (errorMsg === "EMAIL_NOT_VERIFIED") {
          setAuthError("Please verify your email to continue.");
          return null;
        }

        if (response.status === 403) {
          toast.error(errorMsg);
          setAuthError(errorMsg);
          return null;
        }

        throw new Error(errorMsg);
      }

      const surveyData = await response.json();
      setSurveyId(surveyData.id);

      // Update URL to include the survey ID to prevent reload issues
      window.history.replaceState(null, '', `?id=${surveyData.id}`);

      return surveyData;
    } catch (error) {
      console.error("[EnsureDraft] Failed:", error);
      toast.error("Failed to initialize draft.");
      setAuthError("Failed to initialize draft.");
      console.error("[Client] ensureDraftExists UNCAUGHT ERROR:", error);
      return null;
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };



  // Poll for extracted data to update preview
  const fetchUpdatedData = useCallback(async () => {
    if (!surveyId) return;
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/create`);
      if (res.ok) {
        const data = await res.json();
        // Always update collectedInfo if present — do NOT gate it on extractedData being non-empty
        if (data.collectedInfo) {
          setCollectedInfo(data.collectedInfo);
        }
        // Only update extractedData if there's meaningful data to avoid unnecessary re-renders
        if (data.extractedData && Object.keys(data.extractedData).length > 0) {
          setExtractedData(data.extractedData);
        }
      } else {
        console.warn(`[Client] fetchUpdatedData non-OK: ${res.status}`);
      }
    } catch (err) {
      // Suppress "Failed to fetch" (network error) which is common during dev/HMR
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        return;
      }
      console.error("[Client] fetchUpdatedData ERROR:", err);
    }
  }, [surveyId]);


  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const submitCurrentInput = (transcribedText?: string) => {
    const textToSubmit = transcribedText || input;

    if (!textToSubmit?.trim()) {
      console.warn("[handleSubmit] Aborting: Input is empty");
      return;
    }
    if (isLoading) {
      console.warn("[handleSubmit] Aborting: Already loading/streaming");
      return;
    }
    if (authError) {
      console.warn("[handleSubmit] Aborting: Auth error active:", authError);
      return;
    }

    const currentInput = textToSubmit;
    if (!transcribedText) {
      setInput(""); // Clear input locally if it came from the textarea
    }

    sendMessage({
      role: "user",
      parts: [{ type: 'text', text: currentInput }],
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitCurrentInput();
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-dismiss research animation when tool-result lands
  useEffect(() => {
    const hasResearchResult = messages.some(m =>
      m.parts?.some(
        (p) =>
          ((p.type === "tool-invocation" || p.type === "tool-call") && "toolName" in p && p.toolName === "researchBestPractices") ||
          (p.type === "tool-researchBestPractices")
      )
    );
    if (hasResearchResult) {
      setIsResearching(false);
    }
  }, [messages]);

  // Poll for extracted data to update preview
  useEffect(() => {
    if (!surveyId || status === "ready") return;

    const timer = setInterval(fetchUpdatedData, 3000);
    void fetchUpdatedData();

    return () => clearInterval(timer);
  }, [fetchUpdatedData, status, surveyId]);

  // Instant refresh when AI finishes response
  useEffect(() => {
    if (status === "ready" && surveyId) {
      void fetchUpdatedData();
    }
  }, [fetchUpdatedData, status, surveyId]);

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
      setVoiceFallbackNotice(null);
      // Automatically start recording when voice mode is toggled on
      void startTranscription({
        target: "survey-create-input",
        language,
        onTranscript: (transcript) => {
          // Rule: Auto-send to AI as requested by user
          submitCurrentInput(transcript);
        },
      });
    } else {
      // Ensure we stop recording if the user manually switches voice mode off
      stopRecording();
    }
  };


  const handleGoToSampleConversations = async () => {
    if (!surveyId) return;

    setIsFinalizing(true);
    try {
      // Call finalize endpoint to transfer extracted data to survey
      const response = await fetch(`/api/surveys/${surveyId}/finalize-creation`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include"
      });

      if (!response.ok) {
        const error = await response.text();
        console.error("Failed to finalize survey:", error);
        toast.error(t("Toasts.FinalizeFailed"));
        setIsFinalizing(false);
        return;
      }

      await response.json();
      toast.success(t("Toasts.Finalized"));

      // Navigate to sample review page
      router.push(`/dashboard/surveys/${surveyId}/sample-review`);
    } catch (error) {
      console.error("[Finalize] Failed:", error);
      toast.error(t("Toasts.GenericError"));
      setIsFinalizing(false);
    }
  };

  if (authError) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="text-center space-y-4">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
            <User className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-semibold text-gray-900">{t("Authentication.Required")}</h2>
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

  return (
    <>
      <div className="h-full flex flex-col w-full mx-auto overflow-hidden">
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden relative transition-all duration-500",
          surveyId ? "bg-transparent" : ""
        )}>

          {/* Integrated Header */}
          <div className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 py-4 px-2 transition-all duration-500",
            surveyId ? "bg-transparent border-b border-gray-100" : "bg-transparent"
          )}>
            {!surveyId ? (
              <div className="w-full text-center py-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                  {t("Title.Create")}
                </h1>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-3">
                  <Link href="/dashboard" className="p-2 -ml-2 hover:bg-gray-100 rounded-full transition-colors text-gray-400 hover:text-gray-900">
                    <ArrowLeft className="w-5 h-5" />
                  </Link>
                  <div>
                    <h1 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                      {surveyId ? (isReadOnly ? "View Survey" : "Build Survey") : "Create Survey"}
                      {isCreatingDraft && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {(isReadOnly || surveyStatus === 'completed') && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          Read Only
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-4 w-full sm:w-auto mt-4 sm:mt-0">
              {surveyId && orgId && (
                <div
                  className="flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-100 rounded-2xl px-3 py-1.5 transition-all cursor-pointer group"
                  onClick={() => setIsCollaborationOpen(true)}
                >
                  <ActiveUsers workspaceId={orgId} surveyId={surveyId} className="scale-90" />
                  <div className="h-4 w-px bg-gray-200" />
                  <button className="flex items-center gap-2 text-sm font-semibold text-gray-600 group-hover:text-indigo-600 transition-colors">
                    <Users className="w-4 h-4" />
                    Collaborate
                  </button>
                </div>
              )}
            </div>
          </div>


          {/* Read-Only Banner (Integrated) */}
          {isReadOnly && (
            <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-2 flex items-center justify-center gap-2 text-sm text-blue-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>This survey is finalized and cannot be edited.</span>
              <Link href={`/dashboard/surveys/${surveyId}`} className="font-medium hover:underline">
                View Dashboard
              </Link>
            </div>
          )}



          {/* Chat Area / Domain Selection */}
          <div className={cn(
            "flex-1 overflow-hidden relative flex flex-col",
            surveyId ? "bg-white" : "bg-transparent"
          )}>
            {isInitializing && (
              <div className="absolute inset-0 z-50 bg-white/50 backdrop-blur-sm flex items-center justify-center">
                <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
              </div>
            )}
            {!surveyId ? (

              <div className="flex-1 overflow-y-auto p-4 md:p-8">
                <div className="max-w-5xl mx-auto space-y-12 animate-in fade-in slide-in-from-bottom-4 duration-500 py-10">

                  {/* Hero Section */}
                  <div className="text-center space-y-6">
                    <h2 className="text-4xl font-bold text-gray-900 tracking-tight">
                      {t("Title.ChooseTopic")}
                    </h2>
                    <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
                      {t("Subtitle")}
                    </p>

                    {/* Section: Configuration */}
                    <div className="mt-8">
                      {/* Configuration Container - Framer Style */}
                      <div className="max-w-4xl mx-auto w-full bg-white rounded-2xl p-8 lg:p-12 border border-gray-200">

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 lg:gap-16">

                          {/* 1. AI Designer Experience */}
                          <div className="space-y-6">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                                <Sparkles className="w-6 h-6 text-black" />
                              </div>
                              <div>
                                <h3 className="text-xl font-medium text-black">{t("CreationMode.Title")}</h3>
                                <p className="text-sm text-gray-500 mt-1">{t("CreationMode.Description")}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <button
                                onClick={() => setCreationVoiceMode(false)}
                                className={cn(
                                  "flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 border",
                                  !isVoiceMode
                                    ? "bg-gray-50 text-black border-black shadow-none ring-1 ring-black"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900 shadow-sm"
                                )}
                              >
                                <div className="shrink-0 w-10 h-10 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center text-current">
                                  <Send className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <span className="block font-bold text-sm lg:text-base">{t("CreationMode.Text")}</span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block">{t("CreationMode.TextDescription")}</span>
                                </div>
                              </button>

                              <button
                                onClick={() => setCreationVoiceMode(true)}
                                className={cn(
                                  "flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 border",
                                  isVoiceMode
                                    ? "bg-gray-50 text-black border-black shadow-none ring-1 ring-black"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900 shadow-sm"
                                )}
                              >
                                <div className="shrink-0 w-10 h-10 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center text-current">
                                  <Mic className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <span className="block font-bold text-sm lg:text-base">{t("CreationMode.Voice")}</span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block">{t("CreationMode.VoiceDescription")}</span>
                                </div>
                              </button>
                            </div>
                          </div>

                          {/* 2. Participant Experience */}
                          <div className="space-y-6">
                            <div className="flex items-start gap-4">
                              <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center shrink-0 border border-gray-100">
                                <Users className="w-6 h-6 text-black" />
                              </div>
                              <div>
                                <h3 className="text-xl font-medium text-black">{t("RespondentFormat.Title")}</h3>
                                <p className="text-sm text-gray-500 mt-1">{t("RespondentFormat.Description")}</p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <button
                                onClick={() => setIsVoiceSurvey(false)}
                                className={cn(
                                  "flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 border",
                                  !isVoiceSurvey
                                    ? "bg-gray-50 text-black border-black shadow-none ring-1 ring-black"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900 shadow-sm"
                                )}
                              >
                                <div className="shrink-0 w-10 h-10 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center text-current">
                                  <Keyboard className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <span className="block font-bold text-sm lg:text-base">{t("RespondentFormat.Text")}</span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block">{t("RespondentFormat.TextDescription")}</span>
                                </div>
                              </button>

                              <button
                                onClick={() => setIsVoiceSurvey(true)}
                                className={cn(
                                  "flex items-center gap-4 p-5 rounded-xl text-left transition-all duration-200 border",
                                  isVoiceSurvey
                                    ? "bg-gray-50 text-black border-black shadow-none ring-1 ring-black"
                                    : "bg-white text-gray-500 border-gray-200 hover:border-gray-400 hover:text-gray-900 shadow-sm"
                                )}
                              >
                                <div className="shrink-0 w-10 h-10 rounded-full bg-white/80 border border-gray-100 flex items-center justify-center text-current">
                                  <Mic className="w-5 h-5" />
                                </div>
                                <div className="space-y-1">
                                  <span className="block font-bold text-sm lg:text-base">{t("RespondentFormat.Voice")}</span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block">{t("RespondentFormat.VoiceDescription")}</span>
                                </div>
                              </button>
                            </div>
                          </div>

                        </div>

                        <div className="mt-10 border-t border-gray-100 pt-8">
                          <div className="max-w-md mx-auto">
                            <label className="block text-sm font-semibold text-gray-900">
                              {t("Header.Language")}
                            </label>
                            <p className="mt-1 text-sm text-gray-500">
                              Choose the language respondents will use and the AI will use while authoring this survey.
                            </p>
                            <select
                              value={language}
                              onChange={(event) => {
                                const nextLanguage = event.target.value;
                                if (!isSupportedLocale(nextLanguage)) {
                                  return;
                                }

                                setLanguage(nextLanguage);
                              }}
                              className="mt-4 w-full rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none transition focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10"
                            >
                              {availableLanguages.map((localeCode) => (
                                <option key={localeCode} value={localeCode}>
                                  {appLocaleLabels[localeCode]}
                                </option>
                              ))}
                            </select>
                            {session?.activeOrganizationId ? (
                              <p className="mt-2 text-xs text-gray-500">
                                Only the languages enabled for this workspace are available here.
                              </p>
                            ) : null}
                          </div>
                        </div>

                        <div className="mt-12 pt-12 border-t border-gray-100 max-w-md mx-auto">
                          <button
                            onClick={handleStart}
                            disabled={isCreatingDraft}
                            className="w-full py-4 px-6 rounded-xl flex items-center justify-center gap-2 text-white bg-black hover:bg-gray-800 transition-colors font-bold border border-black shadow-lg disabled:opacity-50 text-lg"
                          >
                            {isCreatingDraft ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                Starting...
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-5 h-5" />
                                Start Building
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </div>

                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="contents">
                  {isCreatingDraft && (
                    <div className="absolute inset-0 z-50 bg-white/80 backdrop-blur-sm flex flex-col items-center justify-center rounded-3xl animate-in fade-in duration-300">
                      <Loader2 className="w-8 h-8 animate-spin text-indigo-600 mb-4" />
                      <p className="text-gray-500 font-medium">{t("Feedback.Preparing")}</p>
                    </div>
                  )}

                                    {/* Messages Scroll Area */}
                  <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6">
                    {messages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "flex gap-4 max-w-3xl mx-auto w-full animate-in fade-in slide-in-from-bottom-2",
                          message.role === "user" ? "flex-row-reverse" : ""
                        )}
                      >
                        <div
                          className={cn(
                            "w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 border",
                            message.role === "assistant"
                              ? "bg-white border-gray-200"
                              : "bg-black border-transparent"
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
                            "max-w-[90%] py-2",
                            message.role === "assistant"
                              ? "text-gray-800 flex-1"
                              : "bg-zinc-900 text-gray-100 px-6 py-4 rounded-2xl shadow-sm ml-auto"
                          )}
                        >
                          {message.role === "assistant" ? (
                            <div className="text-[17px] leading-relaxed">
                              <MarkdownMessage
                                content={getDisplayedMessageText(message)}
                                className="text-gray-800 prose-sm"
                              />
                              {/* Single unified path — AI SDK uses type 'tool-{toolName}' for tool parts */}

                              {message.parts?.map((part, idx) => {

                                const isSdkToolPart =
                                  typeof part.type === 'string' && part.type.startsWith('tool-');
                                const isLegacyToolPart =
                                  part.type === 'tool-invocation' || part.type === 'tool-call';
                                if (!isSdkToolPart && !isLegacyToolPart) return null;

                                if (!("toolCallId" in part) || !("state" in part) || !("input" in part)) return null;
                                const toolName = part.type.replace(/^tool-/, '');
                                const toolCallId = part.toolCallId;
                                const toolState = part.state;
                                const args = parseMediaUploadArgs(part.input);
                                const result = "output" in part ? part.output : undefined;



                                const isPending = ['input-available', 'input-streaming', 'call', 'partial-call'].includes(toolState);

                                const isDone = ['output-available', 'result'].includes(toolState);

                                if (toolName === 'finishSurvey') {
                                  return (
                                    <div key={toolCallId || idx} className="text-xs text-emerald-600 italic mt-2 flex items-center gap-1">
                                      <CheckCircle2 className="w-3 h-3" /> Survey finalized
                                    </div>
                                  );
                                }

                                if (toolName === 'requestMediaUpload') {
                                  const aiDescription = args.suggestedDescription;
                                  const aiLearningGoal = args.suggestedFeedbackFocus;
                                  const recommendation = args.recommendation;
                                  const rationale = args.rationale;
                                  return (
                                    <div key={toolCallId || idx} className="mt-4">
                                      {isPending ? (
                                        <>
                                          {/* Compact trigger chip shown in the chat */}
                                          <div className="flex items-center gap-2 bg-white border border-gray-200 rounded-xl px-4 py-3 shadow-sm animate-in zoom-in-95 duration-300">
                                            <div className="w-7 h-7 rounded-lg bg-black flex items-center justify-center">
                                              <Paperclip className="w-3.5 h-3.5 text-white" />
                                            </div>
                                            <p className="text-sm font-medium text-gray-800 flex-1">Ready to upload media</p>
                                          </div>
                                          {/* Full-screen modal */}
                                          <MediaUploadFlow
                                            surveyId={surveyId || ""}
                                            recommendation={recommendation}
                                            rationale={rationale}
                                            aiDescription={aiDescription}
                                            aiLearningGoal={aiLearningGoal}
                                            preferVoiceInput={isVoiceMode}
                                            dictationLanguage={language}
                                            onAllUploaded={(mediaItems) => {
                                              if (!toolCallId) return;
                                              const output = {
                                                success: true,
                                                decision: 'uploaded',
                                                count: mediaItems.length,
                                                media: mediaItems.map(m => ({
                                                  id: m.id,
                                                  url: m.url,
                                                  type: m.type,
                                                  description: m.description,
                                                  contextForUse: m.contextForUse
                                                }))
                                              };
                                              resolveLocalMediaToolResult(toolCallId, output);
                                              addToolOutput({
                                                toolCallId,
                                                tool: 'requestMediaUpload',
                                                output: JSON.stringify(output)
                                              });
                                            }}
                                            onSkip={() => {
                                              if (!toolCallId) return;
                                              const output = {
                                                success: false,
                                                skipped: true,
                                                decision: 'declined',
                                              };
                                              resolveLocalMediaToolResult(toolCallId, output);
                                              addToolOutput({
                                                toolCallId,
                                                tool: 'requestMediaUpload',
                                                output: JSON.stringify(output)
                                              });
                                            }}
                                            allowedTypes={args.allowedTypes}
                                          />
                                        </>
                                      ) : isDone && (
                                        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 mt-2">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          {(() => {
                                            try {
                                              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                                              if (parsed?.skipped) {
                                                return recommendation === 'not_needed'
                                                  ? 'Continuing without media'
                                                  : 'Media skipped';
                                              }
                                              const count = parsed?.count ?? 1;
                                              return `${count} file${count > 1 ? 's' : ''} added to survey`;
                                            } catch { return 'Media added'; }
                                          })()}
                                        </div>
                                      )}
                                    </div>
                                  );
                                }

                                return null;
                              })}
                            </div>
                          ) : (
                            <p className="text-[17px] leading-relaxed whitespace-pre-wrap">
                              {getDisplayedMessageText(message)}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}

                    {isLoading && (
                      <div className="flex gap-4 max-w-3xl mx-auto w-full">
                        <div className="w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
                          <Sparkles className="w-5 h-5 text-indigo-500" />
                        </div>
                        <div className="bg-white border border-gray-200 rounded-2xl px-6 py-4 flex items-center gap-1.5">
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                          <div className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                        </div>
                      </div>
                    )}

                    <div ref={messagesEndRef} className="h-4" />
                  </div>


                </div>

                <div className="bg-slate-50/30 p-4 pb-6 relative z-20">

                  {isReadyForSample && surveyId && (
                    <div className="max-w-3xl mx-auto mb-8 animate-in slide-in-from-bottom-4 fade-in">
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">Ready for Review</h3>
                            <p className="text-sm text-gray-500">Our AI expert has finalized the research design. You can now review sample conversations.</p>
                          </div>
                        </div>
                        <button
                          onClick={handleGoToSampleConversations}
                          disabled={isFinalizing}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all hover:-translate-y-0.5"
                        >
                          {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                          {isFinalizing ? t("ReadyCard.Finalizing") : "Review Sample Conversations"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Input */}
                  {/* Main Input - Shown when survey is active and not finished */}
                  {(!isReadyForSample && !isReadOnly && surveyId) && (
                    <div className="max-w-3xl mx-auto space-y-4">
                      {_isResearching && (
                        <div className="flex items-center gap-3 rounded-2xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-900">
                          <Loader2 className="h-4 w-4 animate-spin flex-shrink-0" />
                          <p>Researching best practices to refine your survey design...</p>
                        </div>
                      )}
                      {voiceFallbackNotice && (
                        <div className="flex items-start gap-3 rounded-2xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                          <p>{voiceFallbackNotice}</p>
                        </div>
                      )}


                      <form onSubmit={handleSubmit} className="relative group">
                        {/* Simple Minimalist Input Bar */}
                        <div className="relative bg-white border border-gray-200 rounded-2xl group-focus-within:border-gray-400 transition-all flex items-end p-2">

                          <textarea
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            placeholder="Type your message..."
                            rows={1}
                            className="flex-1 py-4 px-4 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[96px] max-h-60 my-auto"
                            style={{ minHeight: "96px" }}
                          />

                          <div className="p-2 mb-1 mr-1 flex items-center gap-2">
                            {isVoiceMode && isVoiceInputSupported && (
                              <button
                                type="button"
                                onClick={() =>
                                  startTranscription({
                                    target: "survey-create-input",
                                    language,
                                    onTranscript: (transcript) => {
                                      // Rule: Auto-send to AI as requested by user
                                      submitCurrentInput(transcript);
                                    },
                                  })
                                }
                                className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                title="Use voice input"
                              >
                                {transcriptionPhase === "recording" || transcriptionPhase === "transcribing" ? (
                                  <div className="relative">
                                    <Loader2 className="w-5 h-5 animate-spin text-indigo-600" />
                                    <div className="absolute -top-1 -right-1 w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                                  </div>
                                ) : (
                                  <Mic className="w-5 h-5" />
                                )}
                              </button>
                            )}
                            <button
                              type="submit"
                              disabled={!input?.trim() || isLoading || !!authError}
                              className={cn(
                                "p-2.5 rounded-xl transition-all",
                                input?.trim() && !isLoading
                                  ? "bg-black text-white hover:bg-gray-800 hover:-translate-y-0.5"
                                  : "bg-gray-100 text-gray-300 cursor-not-allowed"
                              )}
                            >
                              {isLoading ? (
                                <Loader2 className="w-5 h-5 animate-spin" />
                              ) : (
                                <Send className="w-5 h-5" />
                              )}
                            </button>
                          </div>
                        </div>
                      </form>
                    </div>
                  )}

                  {isReadOnly && (
                    <div className="max-w-3xl mx-auto text-center py-4">
                      <p className="text-sm text-gray-400 italic">This survey is finalized and cannot be edited.</p>
                    </div>
                  )}

                </div>
              </>
            )}
          </div>
        </div>

        {/* Publish Survey Modal */}
        <PublishSurveyModal
          isOpen={showPublishModal}
          onClose={() => setShowPublishModal(false)}
          surveyId={surveyId || ""}
          initialTitle=""
          initialIsVoice={isVoiceSurvey}
          onPublished={() => {}}
        />

        {/* Real-time Collaboration Sidebar - Only for org surveys or if there are approved editors */}
        {(surveyId && orgId) && (
          <CollaborationSidebar
            surveyId={surveyId}
            workspaceId={orgId}
            canManageCollaborators={canManageCollaborators}
            editors={editors}
            isOpen={isCollaborationOpen}
            onClose={() => setIsCollaborationOpen(false)}
          />
        )}
      </div>
    </>
  );
}

// ---------------------------------------------------------------------------
// Types for the multi-file upload queue
// ---------------------------------------------------------------------------
type QueuedFile = {
  id: string;
  file: File;
  description: string;
  learningGoal: string;
  status: 'pending' | 'uploading' | 'done' | 'error';
  errorMsg?: string;
};

/**
 * Full-screen minimalist media upload modal
 * Black & white / Framer-template aesthetic
 * Supports multiple files, each with its own description and learning goal
 */
function MediaUploadFlow({
  surveyId,
  onAllUploaded,
  onSkip,
  allowedTypes,
  recommendation,
  rationale,
  aiDescription,
  aiLearningGoal,
  preferVoiceInput,
  dictationLanguage,
}: {
  surveyId: string;
  onAllUploaded: (media: Array<{ id: string; url: string; type: string; description?: string; contextForUse?: string }>) => void;
  onSkip: () => void;
  allowedTypes: string[];
  recommendation: CreationMediaRecommendation;
  rationale?: string;
  aiDescription?: string;
  aiLearningGoal?: string;
  preferVoiceInput?: boolean;
  dictationLanguage: "en" | "fr" | "de" | "es" | "it";
}) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = useId();
  const {
    activeTarget: dictationTarget,
    isSupported: speechRecognitionSupported,
    phase: dictationPhase,
    startTranscription,
  } = useAudioTranscription({
    onError: (message) => {
      toast.error(message);
    },
  });

  const makeId = () => `${uid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const acceptAttr = allowedTypes.map((t) => `${t}/*`).join(',');

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    const newItems: QueuedFile[] = Array.from(incoming).map((f) => ({
      id: makeId(),
      file: f,
      description: aiDescription ?? '',
      learningGoal: aiLearningGoal ?? '',
      status: 'pending',
    }));
    setQueue((prev) => [...prev, ...newItems]);
    // reset so same file can be added again if needed
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const removeFile = (id: string) => setQueue((prev) => prev.filter((q) => q.id !== id));

  const updateField = (id: string, field: 'description' | 'learningGoal', value: string) =>
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, [field]: value } : q)));

  const getFileTypeIcon = (file: File) => {
    if (file.type.startsWith('image')) return <ImageIcon className="w-4 h-4 text-gray-500" />;
    if (file.type.startsWith('audio')) return <FileAudio className="w-4 h-4 text-gray-500" />;
    if (file.type.startsWith('video')) return <FileVideo className="w-4 h-4 text-gray-500" />;
    return <Upload className="w-4 h-4 text-gray-500" />;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const canUpload = queue.length > 0 && queue.every((q) => q.description.trim().length >= 10 && q.learningGoal.trim().length >= 10);

  const handleUploadAll = async () => {
    if (!canUpload) {
      toast.error("Each file needs a description and learning goal (min 10 characters each).");
      return;
    }
    setIsUploadingAll(true);
    const uploadedMedia: Array<{ id: string; url: string; type: string; description?: string; contextForUse?: string }> = [];
    for (const item of queue) {
      setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'uploading' } : q));
      try {
        const formData = new FormData();
        formData.append('surveyId', surveyId);
        formData.append('file', item.file);
        formData.append('description', item.description);
        formData.append('contextForUse', item.learningGoal);
        let type: 'image' | 'audio' | 'video' = 'image';
        if (item.file.type.startsWith('audio')) type = 'audio';
        else if (item.file.type.startsWith('video')) type = 'video';
        formData.append('type', type);
        const result = await uploadSurveyMediaAction(formData);
        if (result.success) {
          setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'done' } : q));
          uploadedMedia.push(result.data.media);
        } else {
          setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error', errorMsg: result.error } : q));
          toast.error(`Failed: ${result.error}`);
        }
      } catch {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error', errorMsg: 'Unexpected error' } : q));
        toast.error("Upload failed. Please try again.");
      }
    }
    setIsUploadingAll(false);
    if (uploadedMedia.length > 0) {
      toast.success(`${uploadedMedia.length} file${uploadedMedia.length > 1 ? "s" : ""} uploaded!`);
      onAllUploaded(uploadedMedia);
    }
  };

  // Drag-and-drop handlers
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    addFiles(e.dataTransfer.files);
  };

  return (
    // Fixed full-viewport overlay
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(6px)' }}>
      {/* Modal card */}
      <div
        className="relative w-full max-w-2xl max-h-[90vh] bg-white flex flex-col overflow-hidden animate-in zoom-in-95 fade-in duration-300"
        style={{ borderRadius: '2px', boxShadow: '0 32px 80px rgba(0,0,0,0.35)' }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-8 py-6 border-b border-gray-100">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1">Survey Media</p>
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight">Optional Media</h2>
          </div>
          <button
            onClick={onSkip}
            disabled={isUploadingAll}
            className="w-9 h-9 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-900 disabled:opacity-40"
          >
            <span className="text-lg leading-none select-none">✕</span>
          </button>
        </div>

        {/* AI context hint – only show if AI provided suggestion */}
        {(rationale || aiDescription || aiLearningGoal) && (
          <div className="mx-8 mt-5 px-4 py-3 bg-gray-50 border border-gray-200" style={{ borderRadius: '2px' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1.5">From our conversation</p>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-800">Recommendation</span>{" "}
              {recommendation === 'add_media'
                ? 'Adding media could strengthen this study.'
                : 'Media is optional and not necessary for this study.'}
            </p>
            {rationale && <p className="text-sm text-gray-600 mt-0.5">{rationale}</p>}
            {aiDescription && <p className="text-sm text-gray-600"><span className="font-medium text-gray-800">What it is:</span> {aiDescription}</p>}
            {aiLearningGoal && <p className="text-sm text-gray-600 mt-0.5"><span className="font-medium text-gray-800">Goal:</span> {aiLearningGoal}</p>}
          </div>
        )}

        {/* Drop Zone */}
        <div className="px-8 pt-5">
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => !isUploadingAll && fileInputRef.current?.click()}
            className={cn(
              'border-2 border-dashed transition-all cursor-pointer flex flex-col items-center justify-center py-8 gap-3 select-none',
              isDragging
                ? 'border-black bg-gray-50'
                : 'border-gray-200 hover:border-gray-400 hover:bg-gray-50',
              isUploadingAll && 'opacity-40 cursor-not-allowed'
            )}
            style={{ borderRadius: '2px' }}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept={acceptAttr}
              className="hidden"
              onChange={(e) => addFiles(e.target.files)}
              disabled={isUploadingAll}
            />
            <Upload className="w-7 h-7 text-gray-300" />
            <div className="text-center">
              <p className="text-sm font-medium text-gray-800">{isDragging ? "Drop files here" : "Click or drag files here"}</p>
              <p className="text-xs text-gray-400 mt-0.5">{allowedTypes.join(', ')} — up to 100 MB each</p>
            </div>
          </div>
        </div>

        {/* File Queue */}
        {queue.length > 0 && (
          <div className="flex-1 overflow-y-auto px-8 mt-5 space-y-4 pb-4">
            {queue.map((item) => (
              <div key={item.id} className="border border-gray-100 bg-white" style={{ borderRadius: '2px' }}>
                {/* File row */}
                <div className="flex items-center gap-3 px-4 py-3 border-b border-gray-100">
                  <div className="w-8 h-8 bg-gray-100 flex items-center justify-center flex-shrink-0" style={{ borderRadius: '2px' }}>
                    {item.status === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin text-gray-600" /> :
                      item.status === 'done' ? <CheckCircle2 className="w-4 h-4 text-emerald-600" /> :
                        item.status === 'error' ? <span className="text-red-500 text-xs font-bold">!</span> :
                          getFileTypeIcon(item.file)}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{item.file.name}</p>
                    <p className="text-xs text-gray-400">{formatBytes(item.file.size)}</p>
                    {item.errorMsg && <p className="text-xs text-red-500 mt-0.5">{item.errorMsg}</p>}
                  </div>
                  {item.status === 'pending' && (
                    <button
                      onClick={() => removeFile(item.id)}
                      className="w-6 h-6 flex items-center justify-center rounded-full hover:bg-gray-100 text-gray-300 hover:text-gray-600 transition-colors flex-shrink-0"
                    >
                      <span className="text-sm leading-none">✕</span>
                    </button>
                  )}
                </div>
                {/* Per-file fields */}
                {item.status === 'pending' && (
                  <div className="px-4 py-3 space-y-2">
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium block">Description</label>
                        {preferVoiceInput && speechRecognitionSupported && (
                          <button
                            type="button"
                            onClick={() =>
                              startTranscription({
                                target: `${item.id}:description`,
                                language: dictationLanguage,
                                onTranscript: (transcript) => {
                                  updateField(
                                    item.id,
                                    "description",
                                    item.description.trim()
                                      ? `${item.description.trim()} ${transcript}`.trim()
                                      : transcript,
                                  );
                                },
                              })
                            }
                            disabled={isUploadingAll}
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] transition-colors",
                              dictationTarget === `${item.id}:description`
                                ? "text-emerald-600"
                                : "text-gray-400 hover:text-gray-700",
                            )}
                          >
                            {dictationTarget === `${item.id}:description` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Mic className="w-3 h-3" />
                            )}
                            {dictationTarget === `${item.id}:description`
                              ? dictationPhase === "recording"
                                ? "Listening"
                                : "Transcribing"
                              : "Speak"}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={item.description}
                        onChange={(e) => updateField(item.id, 'description', e.target.value)}
                        placeholder={aiDescription || 'What is this file? (min 10 chars)'}
                        className="w-full px-3 py-2 border border-gray-200 text-sm text-gray-800 outline-none focus:border-gray-900 transition-colors bg-transparent placeholder-gray-300"
                        style={{ borderRadius: '2px' }}
                        disabled={isUploadingAll}
                      />
                    </div>
                    <div>
                      <div className="flex items-center justify-between gap-3 mb-1">
                        <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium block">Learning Goal</label>
                        {preferVoiceInput && speechRecognitionSupported && (
                          <button
                            type="button"
                            onClick={() =>
                              startTranscription({
                                target: `${item.id}:learningGoal`,
                                language: dictationLanguage,
                                onTranscript: (transcript) => {
                                  updateField(
                                    item.id,
                                    "learningGoal",
                                    item.learningGoal.trim()
                                      ? `${item.learningGoal.trim()} ${transcript}`.trim()
                                      : transcript,
                                  );
                                },
                              })
                            }
                            disabled={isUploadingAll}
                            className={cn(
                              "inline-flex items-center gap-1 text-[10px] uppercase tracking-[0.1em] transition-colors",
                              dictationTarget === `${item.id}:learningGoal`
                                ? "text-emerald-600"
                                : "text-gray-400 hover:text-gray-700",
                            )}
                          >
                            {dictationTarget === `${item.id}:learningGoal` ? (
                              <Loader2 className="w-3 h-3 animate-spin" />
                            ) : (
                              <Mic className="w-3 h-3" />
                            )}
                            {dictationTarget === `${item.id}:learningGoal`
                              ? dictationPhase === "recording"
                                ? "Listening"
                                : "Transcribing"
                              : "Speak"}
                          </button>
                        )}
                      </div>
                      <input
                        type="text"
                        value={item.learningGoal}
                        onChange={(e) => updateField(item.id, 'learningGoal', e.target.value)}
                        placeholder={aiLearningGoal || 'What should respondents reflect on? (min 10 chars)'}
                        className="w-full px-3 py-2 border border-gray-200 text-sm text-gray-800 outline-none focus:border-gray-900 transition-colors bg-transparent placeholder-gray-300"
                        style={{ borderRadius: '2px' }}
                        disabled={isUploadingAll}
                      />
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between px-8 py-5 border-t border-gray-100 mt-auto">
          <button
            onClick={onSkip}
            disabled={isUploadingAll}
            className="text-sm text-gray-400 hover:text-gray-700 transition-colors disabled:opacity-40"
          >
            Continue without media
          </button>
          <div className="flex items-center gap-3">
            {queue.length > 0 && !isUploadingAll && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                + Add more
              </button>
            )}
            <button
              onClick={handleUploadAll}
              disabled={!canUpload || isUploadingAll}
              className={cn(
                'px-6 py-2.5 text-sm font-medium transition-all',
                canUpload && !isUploadingAll
                  ? 'bg-black text-white hover:bg-gray-800'
                  : 'bg-gray-100 text-gray-300 cursor-not-allowed'
              )}
              style={{ borderRadius: '2px' }}
            >
              {isUploadingAll ? (
                <span className="flex items-center gap-2"><Loader2 className="w-3.5 h-3.5 animate-spin" /> Uploading…</span>
              ) : (
                `Upload ${queue.length > 0 ? queue.length + ` file${queue.length > 1 ? 's' : ''}` : ''}`
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

}

export default function CreateSurveyPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center min-h-screen bg-gray-50">
        <Loader2 className="w-8 h-8 animate-spin text-indigo-600" />
      </div>
    }>
      <CreateSurveyContent />
    </Suspense>
  );
}

