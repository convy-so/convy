"use client";

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { useChat } from "@ai-sdk/react";
import { UIMessage as SDKMessage, DefaultChatTransport, lastAssistantMessageIsCompleteWithToolCalls } from "ai";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  MicOff,
  Loader2,
  User,
  Paperclip,
  Play,
  CheckCircle2,
  Globe,
  ChevronDown,
  Keyboard,
  Plus,
  Smile,
  Target,
  Users,
  GraduationCap,
  Flag,
  Beaker,
  Fingerprint,
  Server,
  Upload,
  FileAudio,
  FileVideo,
  Image as ImageIcon,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { PublishSurveyModal } from "@/components/surveys/publish-survey-modal";
import { AddMediaModal } from "@/components/surveys/add-media-modal";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { clientEnv } from "@/lib/env.client";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { SURVEY_DOMAINS, type SurveyDomainId } from "@/lib/domains/domain-registry";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";

const DOMAIN_UI_METADATA: Record<number, { icon: any; color: string; bgColor: string }> = {
  1: { icon: Smile, color: "text-emerald-600", bgColor: "bg-emerald-100" },          // CX
  2: { icon: Target, color: "text-blue-600", bgColor: "bg-blue-100" },              // Market Research
  3: { icon: Users, color: "text-purple-600", bgColor: "bg-purple-100" },           // Workforce
  5: { icon: GraduationCap, color: "text-orange-600", bgColor: "bg-orange-100" },   // Education
  6: { icon: Flag, color: "text-red-600", bgColor: "bg-red-100" },                  // Civic
  7: { icon: Beaker, color: "text-cyan-600", bgColor: "bg-cyan-100" },              // Scientific
  9: { icon: Fingerprint, color: "text-pink-600", bgColor: "bg-pink-100" },         // Demographic
  10: { icon: Server, color: "text-slate-600", bgColor: "bg-slate-100" },          // Infrastructure
};


type CreationStep = "objective" | "audience" | "questions" | "tone" | "review";

// Extended Message type to support custom UI properties if needed
// but we mostly rely on the AI SDK Message type
type UIMessage = SDKMessage & {
  content?: string;
  parts?: any[]; // Ensure parts is available for SDK compatibility
  displayedContent?: string;
  isTyping?: boolean;
  timestamp?: number;
};

const MERGE_THRESHOLD_MS = 3000;

function CreateSurveyContent() {
  const router = useRouter();
  const t = useTranslations("Survey.Create");
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const params = useParams();
  const locale = params.locale as string;
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track when user is actively speaking

  // Domain Selection
  const [selectedDomainId, setSelectedDomainId] = useState<SurveyDomainId | null>(null);



  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false); // Research animation state

  // Language state initialized from locale
  const [language, setLanguage] = useState<"en" | "fr" | "de" | "es" | "it">((locale as any) || "en");
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);
  const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);

  const handleDomainSelect = async (domainId: SurveyDomainId) => {
    // 1. Optimistic UI: Immediately show the chat view
    setSelectedDomainId(domainId);

    // 2. Set the survey mode based on the respondent format choice
    updateSurveyMode(isVoiceSurvey);

    // 3. Ensure draft exists (Background Process)
    let currentSurveyId = surveyId;
    if (!currentSurveyId) {
      try {
        currentSurveyId = await ensureDraftExists();
      } catch (e) {
        console.error("Failed to create draft", e);
        toast.error(t("Toasts.InitFailed"));
        setSelectedDomainId(null);
        return;
      }
    }

    if (!currentSurveyId) return;

    try {
      // 4. Update Domain in Backend
      await fetch(`/api/surveys/${currentSurveyId}/create`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(messages.length === 0 ? { messages: [] } : {}),
          extractedData: { domainId }
        })
      });
      console.log(`[Client] Domain ${domainId} saved for survey ${currentSurveyId}`);

      // 5. Trigger Interaction based on Mode
      if (messages.length === 0) {
        if (isVoiceMode) {
          // VOICE MODE: Start recording (or signal readyness)
        } else {
          // TEXT MODE: Trigger AI Text Greeting
          triggerAIInitialResponse();
        }
      }
    } catch (error) {
      console.error("Failed to save domain selection:", error);
      toast.error(t("Toasts.SaveTopicFailed"));
      setSelectedDomainId(null); // Revert on failure
    }
  };

  const toggleInputMenu = () => setIsInputMenuOpen(!isInputMenuOpen);

  const updateSurveyMode = async (isVoice: boolean) => {
    setIsVoiceSurvey(isVoice);

    if (surveyId) {
      try {
        await fetch(`/api/surveys/${surveyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isVoice })
        });
      } catch (error) {
        console.error("Failed to update survey mode:", error);
        toast.error(t("Toasts.ModeUpdateFailed"));
      }
    }
  };

  const [isConnecting, setIsConnecting] = useState(false);
  const [hasGreetingPlayed, setHasGreetingPlayed] = useState(false);



  const [extractedData, setExtractedData] = useState<any>(null);
  const [collectedInfo, setCollectedInfo] = useState<any>(null);

  // Local input state for the chat (AI SDK v6 migration)
  const [input, setInput] = useState("");

  // Chat state managed by useChat
  const {
    messages,
    setMessages,
    status,
    sendMessage,
    addToolOutput,
  } = useChat({
    id: surveyId || "new-survey",
    transport: new DefaultChatTransport({
      api: surveyId ? `/api/surveys/${surveyId}/create` : "/api/surveys/create-draft",
      body: {
        extractedData: extractedData
      }
    }),
    messages: [],
    sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithToolCalls,
    onToolCall: async ({ toolCall }) => {
      console.log("[Client] Tool call received:", toolCall);
      if (toolCall.toolName === 'researchBestPractices') {
        // Show research animation — the tool runs server-side, we just signal UI
        setIsResearching(true);
        // Tool resolves on its own via server-side execution; hide banner when done
        // (handled by detecting the tool-result part in messages via useEffect)
      }
      if (toolCall.toolName === 'finishSurvey') {
        console.log("[Client] Survey finished via tool call");
        addToolOutput({
          toolCallId: toolCall.toolCallId,
          tool: 'finishSurvey',
          output: "Survey marked as complete.",
        });
      }
      if (toolCall.toolName === 'requestMediaUpload') {
        console.log("[Client] Media upload requested via tool call");
        // We don't resolve automatically; the MediaUploadTool component handles this.
      }
    },
  });

  const isLoading = status === "streaming" || status === "submitted";

  const [surveyStateLoaded, setSurveyStateLoaded] = useState(false);
  const [isServerReady, setIsServerReady] = useState(false);

  const voiceWs = useVoiceWebSocket({
    url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-creation`,
    onReady: () => {
      console.log("[Client] WebSocket open, waiting for server ready signal...");
    },
    onMessage: (data) => {
      // Handle speech activity events from Deepgram
      if (data.type === "ready") {
        console.log("[Client] Server sent READY signal");
        setIsServerReady(true);
      } else if (data.type === "speech_start") {
        console.log("[Client] 🗣️ Speech started (from Deepgram)");
        setIsSpeaking(true);
      } else if (data.type === "speech_end") {
        console.log("[Client] 🤐 Speech ended (from Deepgram)");
        setIsSpeaking(false);
      } else if (data.type === "survey_state_loaded") {
        console.log("[Client] Server state loaded, ready to start conversation");
        setSurveyStateLoaded(true);
      } else if (data.type === "conversation_text") {
        const { role, content } = data;
        const now = Date.now();
        setMessages((prev: UIMessage[]) => {
          const lastMessage = prev[prev.length - 1];
          // Use a smaller threshold or no threshold for Voice Agent unified events to ensure clarity
          // but reuse the merge logic for consistency
          if (
            lastMessage &&
            lastMessage.role === role &&
            lastMessage.timestamp &&
            now - lastMessage.timestamp < MERGE_THRESHOLD_MS
          ) {
            const updated = [...prev];
            const updatedContent = (lastMessage.content || "") + " " + content;
            updated[updated.length - 1] = {
              ...lastMessage,
              content: updatedContent,
              displayedContent: (lastMessage.displayedContent || "") + " " + content,
              timestamp: now,
              parts: [{ type: 'text', text: updatedContent }] // Keep parts in sync
            } as UIMessage;
            return updated;
          }

          const newMessage: UIMessage = {
            id: Date.now().toString(),
            role: role as "user" | "assistant",
            content: content,
            displayedContent: content,
            isTyping: false,
            timestamp: now,
            parts: [{ type: 'text', text: content }] // Satisfy mandatory SDK property
          };
          return [...prev, newMessage];
        });
      } else if (data.type === "request_media_upload") {
        console.log("[Client] Voice Agent requested media upload:", data.allowedTypes);
        const { allowedTypes } = data;
        const toolId = `voice-tool-${Date.now()}`;

        setMessages((prev: UIMessage[]) => [
          ...prev,
          {
            id: toolId,
            role: 'assistant',
            timestamp: Date.now(),
            parts: [{
              type: 'tool-requestMediaUpload',
              toolCallId: toolId,
              state: 'input-available',
              input: { allowedTypes }
            }]
          }
        ]);
      } else if (data.type === "update_extracted_data") {
        setExtractedData(data.extractedData);
        setCollectedInfo(data.collectedInfo);
      } else if (data.type === "transcription_interim") {
        console.log("[Client] 💬 Interim transcription:", data.text);
      } else if (data.type === "survey_state_loaded") {
        console.log("[Client] Survey state loaded on server — safe to start conversation");
        setSurveyStateLoaded(true);
      } else if (data.type === "survey_completed") {
        console.log("[Client] ✅ Survey completed signal received from Voice Agent");
        // Refresh survey data to ensure we have the latest status/extracted info
        // This will trigger the 'isReadyForSample' check in the main effect
        router.refresh();

        // Optimistically set status to allow immediate UI update
        setSurveyStatus("completed");

        // Force a fetch of the latest data
        if (surveyId) {
          fetch(`/api/surveys/${surveyId}/create`)
            .then(res => res.json())
            .then(data => {
              if (data.status) setSurveyStatus(data.status);
              if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
            })
            .catch(console.error);
        }
      }
    }
  });

  // Monitor playback to handle the "Mute until Greeting Ends" flow
  useEffect(() => {
    // New Logic: We trust 'voiceWs.hasAudioPlayed' to tell us if the greeting actually started
    console.log("[Voice UI] Effect Check -> isConnecting:", isConnecting, "isPlaying:", voiceWs.isPlaying, "hasRecordedAudio:", voiceWs.hasAudioPlayed, "hasGreetingPlayed:", hasGreetingPlayed, "MicMuted:", voiceWs.isMicMuted, "isRecording:", voiceWs.isRecording);

    if (isConnecting && voiceWs.hasAudioPlayed) {
      // Audio started playing (The greeting arrived!)
      console.log("[Voice UI] 🟣 Audio started (Greeting detected) - Transitioning to Speaking State");
      setIsConnecting(false);
      setHasGreetingPlayed(true);
    }
  }, [
    voiceWs.hasAudioPlayed,
    isConnecting,
    voiceWs.status
  ]);

  // Effect to sync surveyId with WebSocket - ONLY when server is ready
  useEffect(() => {
    if (surveyId && voiceWs.status === "connected" && isServerReady) {
      console.log("[Client] Server ready, sending survey ID:", surveyId);
      voiceWs.sendJson({ type: "set_survey_id", surveyId });
    }
  }, [surveyId, voiceWs.status, isServerReady]);

  // Reset ready state on disconnect
  useEffect(() => {
    if (voiceWs.status !== "connected") {
      setIsServerReady(false);
    }
  }, [voiceWs.status]);



  // Auto-connect for Voice Mode when Survey ID becomes available
  useEffect(() => {
    if (isVoiceMode && surveyId && voiceWs.status === "disconnected" && messages.length === 0) {
      console.log("[Client] Auto-connecting voice for new survey...");
      voiceWs.connect();
    }
  }, [isVoiceMode, surveyId, voiceWs.status, messages.length, voiceWs]);

  // Trigger conversation start once server state is loaded
  useEffect(() => {
    if (isVoiceMode && surveyStateLoaded && voiceWs.status === "connected") {
      console.log("[Client] Server state loaded, sending start_conversation signal...");
      voiceWs.sendJson({ type: "start_conversation" });
    }
  }, [isVoiceMode, surveyStateLoaded, voiceWs.status, voiceWs]);

  // Detect if all required info has been collected for sample conversations
  const isReadyForSample = useMemo(() => {
    if (!surveyId || !collectedInfo) return false;

    // 1. Check for explicit completion signal in messages (Fallback)
    // If the assistant says "click the button" or "sample conversations", we should show it
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const messageContent = (lastAssistantMessage as any)?.content ||
      (lastAssistantMessage?.parts?.filter(p => p.type === 'text').map((p: any) => p.text).join('') || "");

    const aiMentionedSamples = messageContent.toLowerCase().includes('sample conversation') ||
      messageContent.toLowerCase().includes('click') &&
      messageContent.toLowerCase().includes('button');

    // Check for tool invocations
    const finishToolCalled = messages.some(m =>
      m.parts?.some(p => (p.type === 'tool-call' || p.type === 'tool-result') && (p as any).toolName === 'finishSurvey')
    );

    if (finishToolCalled) {
      console.log('[isReadyForSample] ✅ finishSurvey tool called');
      return true;
    }

    // 2. Main Logic: Check all truly required flags are collected
    // These must now match our REQUIRED_INFORMATION priorities
    const criticalFlagsCollected = (
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.subjectDefined &&
      collectedInfo.domainIdentified
    );

    // If AI mentioned samples, we skip strict structural validation and trust the AI
    // We only enforce that we have the absolute minimums (objective, audience, domain)
    if (aiMentionedSamples && criticalFlagsCollected) {
      console.log('[isReadyForSample] ✅ AI explicitly mentioned samples and critical info is collected');
      return true;
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
      console.log('[isReadyForSample] ⏳ Missing required flags or extractedData', {
        criticalFlagsCollected,
        allRequiredFlagsCollected,
        aiMentionedSamples,
        hasExtractedData: !!extractedData,
        collectedInfo
      });
      return false;
    }

    const hasObjective = !!(extractedData.objective?.goal);
    const hasAudience = !!(extractedData.targetAudience?.description);
    const hasDomain = typeof extractedData.domainId === 'number';

    // We trust allRequiredFlagsCollected for everything else (opt-outs are valid)
    const isReady = allRequiredFlagsCollected && hasObjective && hasAudience && hasDomain;

    console.log('[isReadyForSample] Validation results:', {
      isReady,
      allRequiredFlagsCollected,
      hasObjective,
      hasAudience,
      hasDomain,
      extractedDataKeys: extractedData ? Object.keys(extractedData) : []
    });

    return isReady;
  }, [surveyId, collectedInfo, extractedData, messages]);


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
      setAuthError(t("Authentication.VerifyEmail"));
      setIsInitializing(false);
      return;
    }

    setAuthError(null);
    setIsInitializing(false);
  }, [user, authLoading]);

  // Fetch user's preferred language on mount
  useEffect(() => {
    if (!user || authLoading) return;

    const fetchUserLanguage = async () => {
      try {
        const response = await fetch("/api/user/language");
        if (response.ok) {
          const data = await response.json();
          const preferredLang = data.preferredLanguage;

          // Only update if it's different from current and is a valid language
          if (preferredLang && ["en", "fr", "de", "es", "it"].includes(preferredLang) && preferredLang !== language) {
            setLanguage(preferredLang);

            // If we have a surveyId and websocket is connected, update it
            if (surveyId && voiceWs.status === "connected") {
              voiceWs.sendJson({ type: "set_language", language: preferredLang });
            }
          }
        }
      } catch (error) {
        console.error("Failed to fetch user language:", error);
        // Silently fail - will use default "en"
      }
    };

    fetchUserLanguage();
  }, [user, authLoading]);


  useEffect(() => {
    if (idFromUrl && !authLoading && user) {
      if (surveyId === idFromUrl && messages.length > 0) {
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
              setMessages(data.messages.map((m: any, idx: number) => ({
                id: m.id || `msg-${idx}-${Date.now()}`,
                role: m.role,
                content: m.content,
                displayedContent: m.content,
                isTyping: false,
                parts: m.parts || (m.content ? [{ type: 'text', text: m.content }] : [])
              })));
            }

            if (data.collectedInfo) setCollectedInfo(data.collectedInfo);

            if (data.extractedData) {
              setExtractedData(data.extractedData);
              if (data.extractedData.domainId) {
                setSelectedDomainId(data.extractedData.domainId as SurveyDomainId);
              }
            }
          }

          // Get survey status to determine read-only mode
          if (surveyRes.ok) {
            const surveyData = await surveyRes.json();
            const status = surveyData.survey?.status || null;
            setSurveyStatus(status);

            // Set language if available
            if (surveyData.survey?.language) {
              setLanguage(surveyData.survey.language);
            }
            // Set voice mode if available
            if (typeof surveyData.survey?.isVoice === 'boolean') {
              setIsVoiceSurvey(surveyData.survey.isVoice);
            }

            // Read-only if survey is NOT in "creating" status
            if (status && status !== "creating") {
              setIsReadOnly(true);
            } else {
              setIsReadOnly(false);
            }
          }
        } catch (error) {
          console.error("Failed to load survey data:", error);
          toast.error(t("Toasts.LoadFailed"));
        } finally {
          setIsInitializing(false);
        }
      };

      loadConversation();
    }
  }, [idFromUrl, authLoading, user, surveyId, messages.length]);

  // Lazy creation state
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);
  const [showMediaModal, setShowMediaModal] = useState(false);

  // Helper to ensure draft exists before sending message
  const ensureDraftExists = async (): Promise<string | null> => {
    if (surveyId) return surveyId;
    if (isCreatingDraft) return null;

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
        const errorText = await response.text();
        if (errorText === "EMAIL_NOT_VERIFIED") {
          setAuthError(t("Authentication.VerifyEmail"));
          return null;
        }
        throw new Error(`Failed to create draft: ${response.status}`);
      }

      const survey = await response.json();
      setSurveyId(survey.id);

      // Update URL to include the survey ID to prevent reload issues
      router.replace(`/dashboard/create?id=${survey.id}`, { scroll: false });

      return survey.id;
    } catch (error) {
      toast.error(t("Toasts.InitFailed"));
      console.error(error);
      setAuthError(t("Toasts.InitFailed"));
      return null;
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const triggerAIInitialResponse = async () => {
    if (authError || messages.length > 0) return;

    try {
      await sendMessage({
        text: "Start the conversation now. Greet the user.",
      });
    } catch (error) {
      console.error("Failed to trigger AI response:", error);
      toast.error(t("Toasts.InitFailed"));
    }
  };

  // Poll for extracted data to update preview
  const fetchUpdatedData = async () => {
    if (!surveyId) return;
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/create`);
      if (res.ok) {
        const data = await res.json();
        // Only update if we get valid data
        if (data.extractedData && Object.keys(data.extractedData).length > 0) {
          setExtractedData(data.extractedData);
        }
        if (data.collectedInfo) {
          setCollectedInfo(data.collectedInfo);
        }
      }
    } catch (err) {
      // Suppress "Failed to fetch" (network error) which is common during dev/HMR
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        return;
      }
      console.error("Failed to fetch extraction data", err);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input?.trim() || isLoading || authError) return;

    const currentInput = input;
    setInput(""); // Clear input locally

    sendMessage({ text: currentInput });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  // Auto-dismiss research animation when tool-result lands
  useEffect(() => {
    const hasResearchResult = messages.some(m =>
      m.parts?.some(
        (p: any) =>
          (p.type === "tool-result" || p.type === "tool-call") &&
          p.toolName === "researchBestPractices"
      )
    );
    if (hasResearchResult) {
      setIsResearching(false);
    }
  }, [messages]);

  useEffect(() => {
    if (isVoiceMode) {
      scrollToBottom();
    }
  }, [isVoiceMode, voiceWs.interimTranscription]);

  // Poll for extracted data to update preview
  useEffect(() => {
    if (!surveyId) return;

    const timer = setInterval(fetchUpdatedData, 3000);
    fetchUpdatedData(); // Initial fetch

    return () => clearInterval(timer);
  }, [surveyId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input?.trim() || isLoading) return;
      handleSubmit(e as any);
    }
  };



  const toggleVoiceMode = () => {
    const newMode = !isVoiceMode;
    setIsVoiceMode(newMode);
    if (newMode) {
      setSurveyStateLoaded(false);
      voiceWs.connect();
    } else {
      voiceWs.disconnect();
    }
  };

  const [hasSentStartSignal, setHasSentStartSignal] = useState(false);

  const toggleRecording = async () => {
    // Voice-activated mode with AI-First flow
    // 1. Start recording (get permissions) - NO MUTING
    // 2. Connect critical WebSocket
    // 3. Wait for WS connected
    // 4. Send start signal
    if (!voiceWs.isRecording) {
      console.log("[Client] 🎤 Starting recording sequence...");
      setIsConnecting(true);
      setHasGreetingPlayed(false);
      setHasSentStartSignal(false);

      try {
        // 1. Start Microphone
        await voiceWs.startRecording();
        console.log("[Client] ✅ Recording started");

        // 2. Connect WebSocket explicitly
        console.log("[Client] 🔌 Establishing WebSocket connection...");
        await voiceWs.connect();

        // 3. Wait for connection to be ready (Polling with timeout)
        let attempts = 0;
        const maxAttempts = 50;

        while (voiceWs.statusRef.current !== "connected" && attempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 100));
          attempts++;
        }

        if (voiceWs.statusRef.current !== "connected") {
          throw new Error("WebSocket connection timed out based on statusRef");
        }

        console.log("[Client] 🟢 WebSocket connected. Sending start signal...");

      } catch (err) {
        console.error("[Client] ❌ Failed to start voice session:", err);
        setIsConnecting(false);
        voiceWs.stopRecording(); // Cleanup
        toast.error("Failed to connect. Please try again.");
      }
    }
  };

  const handleMediaUploaded = (media: any, toolCallId?: string) => {
    console.log("[Client] Media uploaded:", media);
    const msg = `I have uploaded a ${media.type}: "${media.description}". Context for use: ${media.contextForUse}`;

    if (toolCallId) {
      addToolOutput({
        toolCallId: toolCallId,
        tool: 'requestMediaUpload',
        output: JSON.stringify({
          success: true,
          media: {
            id: media.id,
            url: media.url,
            type: media.type,
            description: media.description,
            contextForUse: media.contextForUse
          }
        })
      });
    } else {
      sendMessage({ text: msg });
    }
  };

  const handleOpenMediaModal = async () => {
    let currentSurveyId = surveyId;
    if (!currentSurveyId) {
      currentSurveyId = await ensureDraftExists();
      if (!currentSurveyId) return;
    }
    setShowMediaModal(true);
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

      const data = await response.json();
      console.log("Survey finalized:", data);
      toast.success(t("Toasts.Finalized"));

      // Navigate to sample review page
      router.push(`/dashboard/surveys/${surveyId}/sample-review`);
    } catch (error) {
      console.error("Error finalizing survey:", error);
      toast.error(t("Toasts.GenericError"));
      setIsFinalizing(false);
    }
  };

  if (isInitializing) {
    return (
      <div className="h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    );
  }

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
      <div className="h-[calc(100vh-2rem)] md:h-[calc(100vh-4rem)] flex flex-col md:flex-row gap-6 max-w-7xl w-full mx-auto p-4 overflow-hidden">
        <div className="flex-1 bg-white rounded-3xl border border-gray-200 flex flex-col overflow-hidden relative shadow-sm">

          {/* Integrated Header */}
          <div className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 p-6 border-b transition-all duration-500 bg-white border-gray-200"
          )}>
            {!selectedDomainId && !surveyId ? (
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
                      {surveyId ? (isReadOnly ? t("Title.View") : t("Title.Create")) : t("Title.Create")}
                      {isCreatingDraft && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {(isReadOnly || surveyStatus === 'completed') && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {t("Badges.ReadOnly")}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </>
            )}

            <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0" />
          </div>


          {/* Read-Only Banner (Integrated) */}
          {isReadOnly && (
            <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-2 flex items-center justify-center gap-2 text-sm text-blue-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>{t("ReadOnlyBanner.Message")}</span>
              <Link href={`/dashboard/surveys/${surveyId}`} className="font-medium hover:underline">
                {t("ReadOnlyBanner.Link")}
              </Link>
            </div>
          )}



          {/* Chat Area / Domain Selection */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50/30">
            {!selectedDomainId && !surveyId ? (

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
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8 mt-8">
                      {/* Creation Mode Choice */}
                      <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-indigo-500/5 -rotate-45 translate-x-12 -translate-y-12 group-hover:bg-indigo-500/10 transition-colors" />
                        <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 bg-indigo-100 rounded-2xl shrink-0">
                            <Sparkles className="w-6 h-6 text-indigo-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{t("CreationMode.Title")}</h3>
                            <p className="text-sm text-gray-500 mt-1">{t("CreationMode.Description")}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-1.5 bg-gray-100/80 rounded-2xl relative z-10">
                          <button
                            onClick={() => setIsVoiceMode(false)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300",
                              !isVoiceMode
                                ? "bg-white text-indigo-600 shadow-xl scale-100 ring-1 ring-black/[0.05]"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                          >
                            <Keyboard className="w-4 h-4" />
                            {t("CreationMode.Text")}
                          </button>
                          <button
                            onClick={() => setIsVoiceMode(true)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300",
                              isVoiceMode
                                ? "bg-white text-indigo-600 shadow-xl scale-100 ring-1 ring-black/[0.05]"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                          >
                            <Mic className="w-4 h-4" />
                            {t("CreationMode.Voice")}
                          </button>
                        </div>
                      </div>

                      {/* Respondent Format Choice */}
                      <div className="bg-white/50 backdrop-blur-sm p-6 rounded-3xl border border-gray-200 shadow-sm relative overflow-hidden group">
                        <div className="absolute top-0 right-0 w-24 h-24 bg-purple-500/5 -rotate-45 translate-x-12 -translate-y-12 group-hover:bg-purple-500/10 transition-colors" />
                        <div className="flex items-start gap-4 mb-6">
                          <div className="p-3 bg-purple-100 rounded-2xl shrink-0">
                            <Users className="w-6 h-6 text-purple-600" />
                          </div>
                          <div>
                            <h3 className="text-lg font-bold text-gray-900">{t("RespondentFormat.Title")}</h3>
                            <p className="text-sm text-gray-500 mt-1">{t("RespondentFormat.Description")}</p>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-3 p-1.5 bg-gray-100/80 rounded-2xl relative z-10">
                          <button
                            onClick={() => setIsVoiceSurvey(false)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300",
                              !isVoiceSurvey
                                ? "bg-white text-purple-600 shadow-xl scale-100 ring-1 ring-black/[0.05]"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                          >
                            <Send className="w-4 h-4" />
                            {t("RespondentFormat.Text")}
                          </button>
                          <button
                            onClick={() => setIsVoiceSurvey(true)}
                            className={cn(
                              "flex items-center justify-center gap-2 py-3 rounded-xl text-sm font-semibold transition-all duration-300",
                              isVoiceSurvey
                                ? "bg-white text-purple-600 shadow-xl scale-100 ring-1 ring-black/[0.05]"
                                : "text-gray-500 hover:text-gray-700 hover:bg-gray-200/50"
                            )}
                          >
                            <Mic className="w-4 h-4" />
                            {t("RespondentFormat.Voice")}
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Domain Cards (Masonry/Grid) */}
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {Object.values(SURVEY_DOMAINS).map((domain) => {
                      const ui = DOMAIN_UI_METADATA[domain.id];
                      const Icon = ui?.icon || Sparkles;
                      const color = ui?.color || "text-gray-600";
                      const bgColor = ui?.bgColor || "bg-gray-100";

                      return (
                        <button
                          key={domain.id}
                          onClick={() => handleDomainSelect(domain.id)}
                          className="group relative flex flex-col text-left p-8 rounded-3xl border border-gray-200 bg-white hover:border-indigo-500/30 hover:shadow-2xl hover:shadow-indigo-500/10 transition-all duration-300 hover:-translate-y-1 overflow-hidden"
                        >
                          <div className={cn(
                            "w-14 h-14 rounded-2xl flex items-center justify-center mb-6 transition-transform duration-300 group-hover:scale-110",
                            bgColor
                          )}>
                            <Icon className={cn("w-7 h-7", color)} />
                          </div>

                          <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-indigo-600 transition-colors">
                            {t(`Domains.${domain.id}.Title`)}
                          </h3>
                          <p className="text-base text-gray-500 leading-relaxed group-hover:text-gray-600">
                            {t(`Domains.${domain.id}.Description`)}
                          </p>

                          {/* Hover Decoration */}
                          <div className="absolute bottom-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent scale-x-0 group-hover:scale-x-100 transition-transform duration-500" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <>
                <div className="contents">
                  {isVoiceMode && !isReadyForSample && (
                    <div className="absolute inset-0 z-30 bg-slate-50/95 backdrop-blur-md flex flex-col md:flex-row animate-in fade-in duration-500">

                      {/* Left Side: Chat History (WhatsApp Style) */}
                      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
                        <div className="flex flex-col space-y-4 max-w-3xl mx-auto pb-20">
                          {/* Welcome / Context */}
                          <div className="text-center py-8 text-gray-400 text-sm">
                            <p>{t("Chat.Started")}</p>
                            <p className="text-xs mt-1">{t("Chat.Instruction")}</p>
                          </div>

                          {/* Message History */}
                          {messages.map((msg, idx) => (
                            <div
                              key={msg.id || idx}
                              className={cn(
                                "flex w-full items-end gap-2 animate-in fade-in slide-in-from-bottom-2 duration-300",
                                msg.role === 'user' ? "justify-end" : "justify-start"
                              )}
                            >
                              {msg.role === 'assistant' && (
                                <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                  <Sparkles className="w-4 h-4 text-indigo-600" />
                                </div>
                              )}

                              <div className={cn(
                                "px-4 py-3 max-w-[80%] rounded-2xl shadow-sm text-sm md:text-base leading-relaxed whitespace-pre-wrap",
                                msg.role === 'user'
                                  ? "bg-slate-900 text-white rounded-tr-none"
                                  : "bg-white border border-gray-100 text-gray-800 rounded-tl-none"
                              )}>
                                {((msg as any).content || (msg.parts?.filter(p => p.type === 'text').map((p: any) => p.text).join('') || ""))}
                              </div>

                              {msg.role === 'user' && (
                                <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                                  <User className="w-4 h-4 text-gray-600" />
                                </div>
                              )}
                            </div>
                          ))}

                          {/* Live Transcription Bubble (Pending User Input) */}
                          {(voiceWs.interimTranscription || voiceWs.isRecording) && (
                            <div className="flex w-full items-end gap-2 justify-end">
                              <div className={cn(
                                "px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-none shadow-sm text-sm md:text-base leading-relaxed",
                                voiceWs.interimTranscription
                                  ? "bg-slate-800/80 text-white backdrop-blur-sm"
                                  : "bg-gray-100 text-gray-400 italic"
                              )}>
                                {voiceWs.interimTranscription || t("Chat.Listening")}
                                {voiceWs.isRecording && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full ml-1 animate-pulse" />}
                              </div>
                              <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0 animate-pulse">
                                <div className="w-2 h-2 bg-slate-900 rounded-full" />
                              </div>
                            </div>
                          )}

                          {/* AI Thinking / Speaking Indicator */}
                          {voiceWs.isPlaying && (
                            <div className="flex w-full items-end gap-2 justify-start">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0 animate-bounce">
                                <Sparkles className="w-4 h-4 text-indigo-600" />
                              </div>
                              <div className="px-4 py-3 bg-white/50 border border-gray-100 rounded-2xl rounded-tl-none text-gray-400 text-sm italic">
                                {t("Chat.Speaking")}
                                <div className="flex gap-1 mt-1 h-3 items-end">
                                  <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite]" style={{ height: '40%' }} />
                                  <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" style={{ height: '80%' }} />
                                  <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" style={{ height: '50%' }} />
                                </div>
                              </div>
                            </div>
                          )}

                          {/* Research Animation Banner */}
                          {isResearching && (
                            <div className="flex w-full items-end gap-2 justify-start animate-in fade-in slide-in-from-bottom-2 duration-300">
                              <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center shrink-0">
                                <Search className="w-4 h-4 text-indigo-600 animate-pulse" />
                              </div>
                              <div className="px-4 py-3 bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-100 rounded-2xl rounded-tl-none shadow-sm max-w-[85%]">
                                <p className="text-sm font-medium text-indigo-700">
                                  Researching best practices for your survey
                                  <span className="inline-flex gap-0.5 ml-1">
                                    <span className="w-1 h-1 bg-indigo-500 rounded-full inline-block animate-bounce" style={{ animationDelay: "0ms" }} />
                                    <span className="w-1 h-1 bg-indigo-500 rounded-full inline-block animate-bounce" style={{ animationDelay: "150ms" }} />
                                    <span className="w-1 h-1 bg-indigo-500 rounded-full inline-block animate-bounce" style={{ animationDelay: "300ms" }} />
                                  </span>
                                </p>
                                <p className="text-xs text-indigo-400 mt-0.5">✨ Building your personalized survey plan</p>
                              </div>
                            </div>
                          )}

                          <div ref={messagesEndRef} />
                        </div>
                      </div>

                      {/* Right Side: Voice Controls Sidebar */}
                      <div className="w-full md:w-80 h-auto md:h-full border-t md:border-t-0 md:border-l border-gray-100 bg-white shadow-xl z-40 flex flex-col items-center justify-center p-6 md:p-8 relative overflow-hidden flex-shrink-0">
                        {/* Background Ambient Effect */}
                        <div className={cn(
                          "absolute inset-0 bg-gradient-to-br from-indigo-50/50 to-purple-50/50 pointer-events-none transition-opacity duration-1000",
                          voiceWs.isPlaying || voiceWs.isRecording ? "opacity-100" : "opacity-0"
                        )} />

                        <div className="relative z-10 flex flex-col items-center gap-8">
                          {/* Status Label - Shows current conversation state */}
                          <div className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest transition-all",
                            isConnecting ? "bg-yellow-100 text-yellow-700 animate-pulse" :
                              voiceWs.isPlaying ? "bg-indigo-100 text-indigo-700" :
                                isSpeaking ? "bg-red-100 text-red-700 animate-pulse" :
                                  voiceWs.isRecording ? "bg-emerald-100 text-emerald-700" :
                                    "bg-gray-100 text-gray-500"
                          )}>
                            {isConnecting ? t("Status.Connecting") :
                              voiceWs.isPlaying ? t("Status.AISpeaking") :
                                isSpeaking ? t("Status.SpeakingUser") :
                                  voiceWs.isRecording ? t("Status.Listening") :
                                    t("Status.Ready")}
                          </div>

                          {/* Main Interaction Button */}
                          <div className="relative group">
                            {/* Ripple Effects during active states */}
                            {(isSpeaking || voiceWs.isPlaying || voiceWs.isRecording) && (
                              <>
                                <div className={cn("absolute inset-0 rounded-full opacity-20 animate-ping",
                                  isSpeaking ? "bg-red-500 duration-1000" :
                                    isConnecting ? "bg-amber-500 duration-[1500ms]" :
                                      voiceWs.isPlaying ? "bg-indigo-500 duration-[2000ms]" :
                                        "bg-emerald-500 duration-[1500ms]")} />
                                <div className={cn("absolute inset-[-12px] rounded-full opacity-10 animate-pulse",
                                  isSpeaking ? "bg-red-500" :
                                    isConnecting ? "bg-amber-500" :
                                      voiceWs.isPlaying ? "bg-indigo-500" :
                                        "bg-emerald-500")} />
                              </>
                            )}

                            <button
                              onClick={toggleRecording}
                              disabled={voiceWs.isRecording || isConnecting || !selectedDomainId} // Disable if recording, connecting, or no domain selected
                              className={cn(
                                "relative w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 shadow-2xl z-20",
                                isSpeaking
                                  ? "bg-red-50 border-red-500 text-red-600 scale-110"
                                  : isConnecting
                                    ? "bg-amber-50 border-amber-400 text-amber-600 scale-105 animate-pulse"
                                    : voiceWs.isPlaying
                                      ? "bg-indigo-50 border-indigo-300 text-indigo-600 scale-105"
                                      : voiceWs.isRecording
                                        ? "bg-emerald-50 border-emerald-400 text-emerald-600 scale-105"
                                        : "bg-white border-gray-200 text-slate-600 hover:scale-105 hover:bg-slate-50 hover:border-slate-300 cursor-pointer"
                              )}
                            >
                              <div className="flex flex-col items-center gap-2">
                                {isSpeaking ? (
                                  <>
                                    <div className="flex gap-1 items-center h-8">
                                      {[...Array(5)].map((_, i) => (
                                        <div key={i} className="w-1.5 bg-red-500 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite]"
                                          style={{
                                            height: `${Math.random() * 100}%`,
                                            animationDelay: `${i * 0.1}s`
                                          }}
                                        />
                                      ))}
                                    </div>
                                    <span className="text-xs font-medium text-red-500">{t("Status.SpeakingUser")}</span>
                                  </>
                                ) : isConnecting ? (
                                  <>
                                    <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
                                  </>
                                ) : !selectedDomainId ? (
                                  <>
                                    <span className="text-xs font-medium text-gray-400 text-center px-2">{t("Status.SelectTopicFirst")}</span>
                                  </>
                                ) : voiceWs.isPlaying ? (
                                  <>
                                    <Sparkles className="w-10 h-10 animate-spin-slow" />
                                    <span className="text-xs font-medium">{t("Status.Listening")}...</span>
                                  </>
                                ) : (
                                  <>
                                    <Mic className="w-10 h-10 opacity-80" />
                                    <span className="text-xs font-medium text-gray-400">{t("Status.TapToSpeak")}</span>
                                  </>
                                )}
                              </div>
                            </button>
                          </div>

                          {/* Text Hint */}
                          <div className="text-center space-y-2 max-w-[200px]">
                            <h3 className="font-bold text-gray-900">
                              {voiceWs.isRecording ? t("Chat.Listening") :
                                voiceWs.isPlaying ? t("Chat.Speaking") :
                                  t("Chat.VoiceActive")}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                              {voiceWs.isRecording ? t("Chat.VoiceInstruction") :
                                voiceWs.isPlaying ? t("Chat.VoiceListening") :
                                  t("Chat.VoiceStart")}
                            </p>
                          </div>
                        </div>
                      </div>

                      {/* Footer Exit Button */}
                      <div className="absolute top-6 right-6">
                        <button
                          onClick={toggleVoiceMode}
                          className="px-4 py-2 rounded-xl bg-white/50 border border-gray-200 hover:bg-white text-gray-500 font-medium transition-colors text-sm backdrop-blur-sm"
                        >
                          {t("Chat.ExitVoice")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Voice Completion Overlay */}
                  {isVoiceMode && isReadyForSample && (
                    <div className="absolute inset-0 z-30 bg-white/95 backdrop-blur-sm flex flex-col items-center justify-center p-8 animate-in fade-in">
                      <div className="w-24 h-24 bg-emerald-100 rounded-full flex items-center justify-center mb-6 animate-in zoom-in duration-300">
                        <CheckCircle2 className="w-12 h-12 text-emerald-600" />
                      </div>
                      <h2 className="text-2xl font-bold text-gray-900 mb-2">{t("Completion.Title")}</h2>
                      <p className="text-gray-500 max-w-md text-center mb-8">
                        {t("Completion.Message")}
                      </p>
                      <button
                        onClick={toggleVoiceMode}
                        className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all hover:-translate-y-0.5"
                      >
                        {t("Completion.Button")}
                      </button>
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
                            "max-w-[85%] rounded-2xl px-6 py-4 border",
                            message.role === "assistant"
                              ? "bg-white text-gray-800 border-gray-200"
                              : "bg-zinc-900 text-gray-100 border-transparent"
                          )}
                        >
                          {message.role === "assistant" ? (
                            <div className="text-[15px] leading-7">
                              <MarkdownMessage
                                content={(message as any).content || (message.parts?.filter(p => p.type === 'text').map((p: any) => p.text).join('') || "")}
                                className="text-gray-800 prose-sm"
                              />
                              {message.parts?.map((part: any, idx) => (
                                part.type === 'tool-finishSurvey' && (
                                  <div key={part.toolCallId || idx} className="text-xs text-emerald-600 italic mt-2 flex items-center gap-1">
                                    <CheckCircle2 className="w-3 h-3" /> Survey finalized
                                  </div>
                                )
                              ))}
                              {message.parts?.map((part: any, idx) => (
                                part.type === 'tool-requestMediaUpload' && (
                                  <div key={part.toolCallId || idx} className="mt-4">
                                    {(part.state === 'input-available' || part.state === 'input-streaming') ? (
                                      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 animate-in zoom-in-95 duration-300">
                                        <div className="flex items-center gap-2 mb-4">
                                          <div className="w-8 h-8 rounded-full bg-indigo-100 flex items-center justify-center">
                                            <Paperclip className="w-4 h-4 text-indigo-600" />
                                          </div>
                                          <h4 className="font-bold text-gray-900 text-sm">Media Upload Requested</h4>
                                        </div>
                                        <MediaUploadFlow
                                          surveyId={surveyId || ""}
                                          onUploaded={(media) => handleMediaUploaded(media, part.toolCallId)}
                                          allowedTypes={part.input?.allowedTypes || ['image', 'audio', 'video']}
                                        />
                                      </div>
                                    ) : part.state === 'output-available' && (
                                      <div className="flex items-center gap-2 text-xs text-indigo-600 bg-indigo-50/50 px-3 py-2 rounded-lg border border-indigo-100 mt-2">
                                        <CheckCircle2 className="w-3 h-3" />
                                        Media added: {typeof part.output === 'string' ? JSON.parse(part.output).media?.description : part.output?.media?.description || 'File uploaded'}
                                      </div>
                                    )}
                                  </div>
                                )
                              ))}
                            </div>
                          ) : (
                            <p className="text-[15px] leading-7 whitespace-pre-wrap">
                              {(message as any).content || (message.parts?.filter(p => p.type === 'text').map((p: any) => p.text).join('') || "")}
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

                    {/* Suggested Prompts Grid - Minimalist & Integrated */}
                    {/* Step 1: Domain Selection */}
                    {!selectedDomainId && !isReadyForSample && !isReadOnly && (
                      <div className="w-full max-w-6xl mx-auto px-4 py-8 animate-in fade-in slide-in-from-bottom-4">
                        <div className="text-center mb-10">
                          <h2 className="text-2xl font-bold text-gray-900 mb-3">{t("DomainSelection.Title")}</h2>
                          <p className="text-base text-gray-500 max-w-2xl mx-auto leading-relaxed">{t("DomainSelection.Description")}</p>
                        </div>

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 pb-12">
                          {Object.values(SURVEY_DOMAINS).map((domain) => (
                            <button
                              key={domain.id}
                              onClick={() => handleDomainSelect(domain.id)}
                              className="flex flex-col text-left p-5 bg-white border border-gray-200 hover:border-black rounded-xl transition-all hover:shadow-lg hover:-translate-y-1 group h-full duration-300"
                            >
                              <div className="mb-4 p-2.5 bg-gray-50 rounded-lg w-fit group-hover:bg-black group-hover:text-white transition-colors duration-300">
                                <Sparkles className="w-5 h-5" />
                              </div>
                              <h3 className="text-base font-bold text-gray-900 mb-2 leading-tight">{t(`Domains.${domain.id}.Title`)}</h3>
                              <p className="text-sm text-gray-500 leading-relaxed line-clamp-3 group-hover:text-gray-600 transition-colors">{t(`Domains.${domain.id}.Description`)}</p>
                            </button>
                          ))}
                        </div>
                      </div>
                    )}


                  </div>


                </div>

                <div className="bg-slate-50/30 p-4 pb-6 relative z-20">

                  {isReadyForSample && surveyId && !isVoiceMode && (
                    <div className="max-w-3xl mx-auto mb-8 animate-in slide-in-from-bottom-4 fade-in">
                      <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-5 flex items-center justify-between gap-6">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                            <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                          </div>
                          <div>
                            <h3 className="font-bold text-gray-900">{t("ReadyCard.Title")}</h3>
                            <p className="text-sm text-gray-500">{t("ReadyCard.Description")}</p>
                          </div>
                        </div>
                        <button
                          onClick={handleGoToSampleConversations}
                          disabled={isFinalizing}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all hover:-translate-y-0.5"
                        >
                          {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                          {isFinalizing ? t("ReadyCard.Finalizing") : t("ReadyCard.Button")}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Input */}
                  {/* Main Input - Only shown when domain is selected */}
                  {(selectedDomainId && !isReadyForSample && !isReadOnly && !isVoiceMode) && (
                    <div className="max-w-3xl mx-auto space-y-4">


                      <form onSubmit={handleSubmit} className="relative group">
                        {/* Simple Minimalist Input Bar */}
                        <div className="relative bg-white border border-gray-200 rounded-2xl group-focus-within:border-gray-400 transition-all flex items-end p-2">

                          {/* Expandable Action Menu Button */}
                          <div className="relative">
                            <button
                              type="button"
                              onClick={toggleInputMenu}
                              disabled={isLoading || isCreatingDraft}
                              className={cn(
                                "p-3 rounded-full transition-all duration-300 transform active:scale-95",
                                isInputMenuOpen ? "bg-black text-white rotate-45" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                              )}
                              title={t("Input.ActionsTitle")}
                            >
                              <Plus className="w-5 h-5" />
                            </button>

                            {/* Popup Menu */}
                            {isInputMenuOpen && (
                              <>
                                <div className="fixed inset-0 z-40" onClick={() => setIsInputMenuOpen(false)} />
                                <div className="absolute bottom-full left-0 mb-3 bg-white rounded-2xl shadow-xl border border-gray-100 p-2 min-w-[200px] z-50 flex flex-col gap-1 animate-in slide-in-from-bottom-2 fade-in zoom-in-95 origin-bottom-left">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      handleOpenMediaModal();
                                      setIsInputMenuOpen(false);
                                    }}
                                    className="flex items-center gap-3 px-4 py-3 text-sm font-medium text-gray-700 hover:bg-gray-50 rounded-xl transition-colors w-full text-left group"
                                  >
                                    <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg group-hover:bg-indigo-100 transition-colors">
                                      <Paperclip className="w-4 h-4" />
                                    </div>
                                    <div>
                                      <div className="text-gray-900 font-semibold">{t("Menu.AddMedia")}</div>
                                      <div className="text-gray-400 text-xs font-normal">{t("Menu.MediaTypes")}</div>
                                    </div>
                                  </button>
                                </div>
                              </>
                            )}
                          </div>

                          <textarea
                            value={input}
                            onChange={handleInputChange}
                            onKeyDown={handleKeyDown}
                            disabled={isLoading}
                            placeholder={t("Input.Placeholder")}
                            rows={1}
                            className="flex-1 py-4 px-4 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[96px] max-h-60 my-auto"
                            style={{ minHeight: "96px" }}
                          />

                          <div className="p-2 mb-1 mr-1">
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
                      <p className="text-sm text-gray-400 italic">{t("ReadOnlyBanner.Message")}</p>
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
          onPublished={(shareUrl) => {
            console.log("Survey published:", shareUrl);
          }}
        />

        <AddMediaModal
          isOpen={showMediaModal}
          onClose={() => setShowMediaModal(false)}
          surveyId={surveyId || ""}
          onUploaded={handleMediaUploaded}
        />
      </div>
    </>
  );
}

/**
 * Inline Media Upload Flow Component
 * Handles file selection, description, and context collection
 */
function MediaUploadFlow({
  surveyId,
  onUploaded,
  allowedTypes
}: {
  surveyId: string;
  onUploaded: (media: any) => void;
  allowedTypes: string[];
}) {
  const t = useTranslations("Survey.AddMedia");
  const [file, setFile] = useState<File | null>(null);
  const [description, setDescription] = useState("");
  const [context, setContext] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file || !description || !context) {
      toast.error(t("Toasts.FillAllFields"));
      return;
    }

    setIsUploading(true);
    try {
      const formData = new FormData();
      formData.append("surveyId", surveyId);
      formData.append("file", file);
      formData.append("description", description);
      formData.append("contextForUse", context);

      let type: "image" | "audio" | "video" = "image";
      if (file.type.startsWith("audio")) type = "audio";
      else if (file.type.startsWith("video")) type = "video";

      formData.append("type", type);

      const result = await uploadSurveyMediaAction(formData);

      if (result.success) {
        toast.success(t("Toasts.Success"));
        onUploaded(result.data.media);
      } else {
        toast.error(result.error);
      }
    } catch (error) {
      console.error(error);
      toast.error(t("Toasts.Failed"));
    } finally {
      setIsUploading(false);
    }
  };

  const getFileIcon = () => {
    if (!file) return <Upload className="w-6 h-6 text-gray-400" />;
    if (file.type.startsWith("image")) return <ImageIcon className="w-6 h-6 text-purple-600" />;
    if (file.type.startsWith("audio")) return <FileAudio className="w-6 h-6 text-blue-600" />;
    if (file.type.startsWith("video")) return <FileVideo className="w-6 h-6 text-red-600" />;
    return <Upload className="w-6 h-6 text-gray-600" />;
  };

  return (
    <div className="space-y-4">
      <div
        onClick={() => fileInputRef.current?.click()}
        className={cn(
          "border-2 border-dashed rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer transition-all",
          file ? "border-indigo-200 bg-indigo-50/30" : "border-gray-200 hover:border-indigo-300 hover:bg-gray-50"
        )}
      >
        <input
          type="file"
          ref={fileInputRef}
          className="hidden"
          onChange={handleFileChange}
          accept={allowedTypes.map(t => `${t}/*`).join(',')}
        />
        <div className="mb-2">{getFileIcon()}</div>
        <p className="text-xs font-medium text-gray-700 text-center">
          {file ? file.name : "Click or drag media here"}
        </p>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="e.g. 'This is our company logo'"
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm"
        />
        <textarea
          value={context}
          onChange={(e) => setContext(e.target.value)}
          placeholder="e.g. 'Ask users what defects they see in the logo'"
          rows={2}
          className="w-full px-3 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500/20 outline-none text-sm resize-none"
        />
        <button
          onClick={handleUpload}
          disabled={isUploading || !file || !description || !context}
          className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg font-semibold hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isUploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
          {isUploading ? "Uploading..." : "Add to Survey"}
        </button>
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