"use client";

import { useState, useRef, useEffect, useMemo, Suspense, useId } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { ClientT } from "@/components/i18n/client-t";
import { getClientTranslation } from "@/app/actions/translate";
import { useChat } from "@ai-sdk/react";
import { UIMessage as SDKMessage, DefaultChatTransport } from "ai";
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
  Keyboard,
  Users,
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
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { clientEnv } from "@/lib/env.client";
import { MarkdownMessage } from "@/components/ui/markdown-message";
import { uploadSurveyMediaAction } from "@/app/actions/survey-media";
import { CollaborationSidebar } from "@/components/surveys/collaboration-sidebar";




type CreationStep = "objective" | "audience" | "questions" | "tone" | "review";

type UIMessage = SDKMessage & {
  displayedContent?: string;
  isTyping?: boolean;
  timestamp?: number;
  toolInvocations?: Array<any>;
  parts: SDKMessage['parts']; // Explicitly include parts
};

const MERGE_THRESHOLD_MS = 3000;

function CreateSurveyContent() {
  const t = useTranslations("Survey.Create");
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const params = useParams();
  const locale = params.locale as string;
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [wasStartedWithVoice, setWasStartedWithVoice] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);


  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);
  const [isResearching, setIsResearching] = useState(false); // Research animation state

  // Language state initialized from locale
  const [language, setLanguage] = useState<"en" | "fr" | "de" | "es" | "it">((locale as any) || "en");
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);

  const [isOwner, setIsOwner] = useState(false);
  const [collaborators, setCollaborators] = useState<string[]>([]);
  const [orgId, setOrgId] = useState<string | null>(null);

  const handleStart = async () => {
    // 1. Optimistic UI: Immediately show loading state
    setIsConnecting(true);

    // Track if started with voice for this builder session
    if (isVoiceMode) {
      setWasStartedWithVoice(true);
      console.log("[Client] 🎤 Pre-emptive mic request for voice mode...");
      voiceWs.startRecording().catch(err => {
        console.error("[Client] Failed to get early mic access:", err);
      });
    }

    // 2. Ensure draft exists
    let currentSurveyId = surveyId;
    if (!currentSurveyId) {
      try {
        currentSurveyId = await ensureDraftExists();
      } catch (e) {
        console.error("Failed to create draft", e);
        getClientTranslation("Failed to initialize survey draft.").then(msg => toast.error(msg));
        setIsConnecting(false);
        voiceWs.stopRecording(); // Cleanup if failed
        return;
      }
    }

    if (!currentSurveyId) {
      setIsConnecting(false);
      voiceWs.stopRecording();
      return;
    }

    // 3. Set the survey respondent mode once ID is known
    await updateSurveyMode(currentSurveyId, isVoiceSurvey);

    try {
      // 4. Update Backend - NOTE: We do NOT send messages here to avoid clobbering the pre-cached greeting
      await fetch(`/api/surveys/${currentSurveyId}/create`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}) // Intentionally empty — greeting is stored server-side at draft creation
      });
      console.log(`[Client] Prepared discovery for survey ${currentSurveyId}`);

      // Persist creation modality if voice was chosen
      if (isVoiceMode) {
        localStorage.setItem(`convy_creation_mode_${currentSurveyId}`, "voice");
      }

      // 5. Trigger Interaction based on Mode
      if (isVoiceMode) {
        // VOICE MODE: Connection is triggered via useEffect monitoring (isVoiceMode && surveyId)
        // or we can call connect() explicitly here now that we have surveyId
        console.log("[Client] Voice mode active, initiating connection...");
        await voiceWs.connect();
      } else {
        // TEXT MODE: Load the cached greeting from server into the messages state
        console.log("[Client] Text mode active, loading cached greeting from server...");
        try {
          const greetingRes = await fetch(`/api/surveys/${currentSurveyId}/create`);
          if (greetingRes.ok) {
            const greetingData = await greetingRes.json();
            if (greetingData.messages && greetingData.messages.length > 0) {
              setMessages(greetingData.messages.map((m: any, idx: number) => ({
                id: m.id || `msg-${idx}-${Date.now()}`,
                role: m.role,
                displayedContent: (m as any).content || m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(''),
                isTyping: false,
                parts: m.parts || ((m as any).content ? [{ type: 'text', text: (m as any).content }] : [])
              })));
              console.log(`[Client] Loaded ${greetingData.messages.length} message(s) incl. greeting.`);
            }
            if (greetingData.collectedInfo) setCollectedInfo(greetingData.collectedInfo);
            if (greetingData.extractedData) setExtractedData(greetingData.extractedData);
          }
        } catch (greetingErr) {
          console.error("[Client] Failed to load cached greeting:", greetingErr);
        }
      }

      if (!isVoiceMode) {
        setIsConnecting(false);
      }

    } catch (error) {
      console.error("Failed to start discovery:", error);
      getClientTranslation("Failed to save topic. Please try again.").then(msg => toast.error(msg));
      setIsConnecting(false);
      voiceWs.stopRecording();
    }
  };


  const updateSurveyMode = async (id: string | null, isVoice: boolean) => {
    setIsVoiceSurvey(isVoice);
    console.log(`[Client] updateSurveyMode: ${isVoice ? 'voice' : 'text'}. SID: ${id}`);

    if (id) {
      try {
        const res = await fetch(`/api/surveys/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ isVoice })
        });
        console.log(`[Client] updateSurveyMode PATCH result: ${res.status}`);
      } catch (error) {
        console.error("[Client] updateSurveyMode ERROR:", error);
        getClientTranslation("Failed to update survey mode.").then(msg => toast.error(msg));
      }
    }
  };

  const [isConnecting, setIsConnecting] = useState(false);
  const [hasGreetingPlayed, setHasGreetingPlayed] = useState(false);



  const [extractedData, setExtractedData] = useState<any>(null);
  const [collectedInfo, setCollectedInfo] = useState<any>(null);

  // Local input state for the chat (AI SDK v6 migration)
  const [input, setInput] = useState("");

  // Refs to track the latest surveyId and extractedData without causing useChat to reinitialize
  const surveyIdRef = useRef<string | null>(surveyId);
  const extractedDataRef = useRef<any>(extractedData);

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
        console.log("[useChat:onResponse] Received response from server:", response.status, response.statusText);
        return response;
      }) as any,
      prepareSendMessagesRequest: async ({ api, body, id, messages: msgs, trigger, messageId }) => {
        const sid = surveyIdRef.current;
        const targetApi = sid ? `/api/surveys/${sid}/create` : api;

        console.log(`[useChat:Prepare] Triggered by ${trigger}. SID: ${sid}. Target API: ${targetApi}`);
        console.log(`[useChat:Prepare] Body length: ${JSON.stringify(body).length}. Messages count: ${msgs.length}`);

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
      console.log("[Client] Tool call received:", toolCall.toolName, toolCall);
      if (toolCall.toolName === 'researchBestPractices') {
        setIsResearching(true);
      }
      // NOTE: finishSurvey is server-executed — no client resolution needed here.
      // NOTE: requestMediaUpload is client-side — the MediaUploadFlow component resolves it.
    },
    onFinish: ({ message }) => {
      const content = (message as any).content || message.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('') || "";
      console.log("[useChat:onFinish] AI finished responding:", content.substring(0, 50) + "...");
    },
    onError: (error) => {
      console.error("[useChat:onError] Chat encountered an error:", error);
    }
  });

  const isLoading = status === "streaming" || status === "submitted";

  useEffect(() => {
    console.log(`[useChat:Status] ${status}`);
  }, [status]);

  const [surveyStateLoaded, setSurveyStateLoaded] = useState(false);
  const [isServerReady, setIsServerReady] = useState(false);

  const voiceWs = useVoiceWebSocket({
    url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-creation`,
    onReady: () => {
      console.log("[ChainOfTrust] [Hook] WebSocket connection established. Waiting for server 'ready'...");
    },
    onMessage: (data) => {
      console.log(`[ChainOfTrust] [Hook] Received message type: ${data.type}`, data);
      // Handle speech activity events from Deepgram
      if (data.type === "ready") {
        console.log("[ChainOfTrust] [Server] Server is READY to accept commands.");
        setIsServerReady(true);
      } else if (data.type === "agent_ready") {
        console.log("[ChainOfTrust] [Deepgram] 🤖 Agent initialized and ready. Clearing UI connection state.");
        setIsConnecting(false);
      } else if (data.type === "speech_start") {
        console.log("[ChainOfTrust] [Deepgram] 🗣️ User speech started (VAD).");
        setIsSpeaking(true);
      } else if (data.type === "speech_end") {
        console.log("[ChainOfTrust] [Deepgram] 🤐 User speech ended (VAD).");
        setIsSpeaking(false);
      } else if (data.type === "survey_state_loaded") {
        console.log("[ChainOfTrust] [Server] Previous survey state successfully restored into handler.");
        setSurveyStateLoaded(true);
      } else if (data.type === "conversation_text") {
        const { role, content } = data;
        console.log(`[ChainOfTrust] [Server] Appending ${role} message to UI: ${content.substring(0, 30)}...`);
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
            const updatedContent = (lastMessage.parts?.find(p => p.type === 'text')?.text || "") + " " + content;
            updated[updated.length - 1] = {
              ...lastMessage,
              displayedContent: (lastMessage.displayedContent || "") + " " + content,
              timestamp: now,
              parts: [{ type: 'text', text: updatedContent }]
            } as UIMessage;
            return updated;
          }

          const newMessage: UIMessage = {
            id: Date.now().toString(),
            role: role as "user" | "assistant",
            displayedContent: content,
            isTyping: false,
            timestamp: now,
            parts: [{ type: 'text', text: content }]
          };
          return [...prev, newMessage];
        });
      } else if (data.type === "request_media_upload") {
        console.log("[ChainOfTrust] [Server] AI requested media upload tool UI:", data.allowedTypes);
        const { allowedTypes } = data;
        const toolId = `voice-tool-${Date.now()}`;

        setMessages((prev: UIMessage[]) => [
          ...prev,
          {
            id: toolId,
            role: 'assistant',
            timestamp: Date.now(),
            parts: [{
              type: 'tool-invocation',
              toolCallId: toolId,
              toolName: 'requestMediaUpload',
              state: 'input-available',
              args: { allowedTypes }
            } as any]
          }
        ]);
      } else if (data.type === "update_extracted_data") {
        console.log("[ChainOfTrust] [Server] Extracted data update received.");
        setExtractedData(data.extractedData);
        setCollectedInfo(data.collectedInfo);
      } else if (data.type === "transcription_interim") {
        // Reduced noise logging
      } else if (data.type === "survey_completed") {
        console.log("[ChainOfTrust] [Server] ✅ Survey completion signal received.");
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
    if (!isVoiceMode) return;

    // New Logic: We trust 'voiceWs.hasAudioPlayed' to tell us if the greeting actually started
    console.log("[ChainOfTrust] [UI] Playback Monitor -> isConnecting:", isConnecting, "isPlaying:", voiceWs.isPlaying, "hasRecordedAudio:", voiceWs.hasAudioPlayed, "hasGreetingPlayed:", hasGreetingPlayed);

    if (isVoiceMode && isConnecting && voiceWs.hasAudioPlayed) {
      // Audio started playing (The greeting arrived!)
      console.log("[ChainOfTrust] [UI] 🟣 Audio playback detected (Greeting likely starting) - Ending connection state.");
      setIsConnecting(false);
      setHasGreetingPlayed(true);
    }
  }, [
    voiceWs.hasAudioPlayed,
    isConnecting,
    voiceWs.status,
    isVoiceMode
  ]);

  // Effect to sync surveyId with WebSocket - ONLY when server is ready
  useEffect(() => {
    if (surveyId && voiceWs.status === "connected" && isServerReady) {
      console.log("[ChainOfTrust] [UI] Server ready. Sending survey ID initialization:", surveyId);
      voiceWs.sendJson({ type: "set_survey_id", surveyId });
    }
  }, [surveyId, voiceWs.status, isServerReady]);

  // Reset ready state on disconnect
  useEffect(() => {
    if (voiceWs.status !== "connected") {
      setIsServerReady(false);
    }
  }, [voiceWs.status]);



  // NOTE: Auto-connect for voice runs via handleStart → voiceWs.connect().
  // The useEffect below is intentionally removed to prevent a double-connect race
  // when handleStart is the entry point. Reconnection on page reload (surveyId from URL)
  // is handled by the useEffect at the bottom of the component.

  // Trigger conversation start once server state is loaded
  useEffect(() => {
    if (isVoiceMode && surveyStateLoaded && voiceWs.status === "connected") {
      console.log("[ChainOfTrust] [UI] State loaded on server. Sending 'start_conversation' request...");
      voiceWs.sendJson({ type: "start_conversation" });
    }
  }, [isVoiceMode, surveyStateLoaded, voiceWs.status]);

  // Detect if all required info has been collected for sample conversations
  const isReadyForSample = useMemo(() => {
    if (!surveyId || !collectedInfo) return false;

    // 1. Check for explicit completion signal in messages (Fallback)
    // If the assistant says "click the button" or "sample conversations", we should show it
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const messageContent = lastAssistantMessage?.parts
      ?.filter(p => p.type === 'text')
      .map((p: any) => p.text)
      .join('') || "";

    const aiMentionedSamples = messageContent.toLowerCase().includes('sample conversation') ||
      messageContent.toLowerCase().includes('click') &&
      messageContent.toLowerCase().includes('button');

    // Check for finishSurvey tool call - AI SDK uses type 'tool-{toolName}'
    const finishToolCalled = messages.some(m =>
      m.parts?.some(p => p.type === 'tool-finishSurvey')
    );

    if (finishToolCalled) {
      // console.log('[isReadyForSample] ✅ finishSurvey tool called');
      return true;
    }

    // 2. Main Logic: Check all truly required flags are collected
    // These must now match our REQUIRED_INFORMATION priorities and Agent keys
    const criticalFlagsCollected = (
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.subjectDefined &&
      collectedInfo.domainIdentified
    );

    // If AI mentioned samples, we skip strict structural validation and trust the AI
    // We only enforce that we have the absolute minimums (objective, audience, domain)
    if (aiMentionedSamples && criticalFlagsCollected) {
      // console.log('[isReadyForSample] ✅ AI explicitly mentioned samples and critical info is collected');
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
      return false;
    }

    const hasObjective = !!(extractedData.objective?.goal);
    const hasAudience = !!(extractedData.targetAudience?.description);
    const hasDomain = typeof extractedData.domainId === 'number';

    // We trust allRequiredFlagsCollected for everything else (opt-outs are valid)
    const isReady = allRequiredFlagsCollected && hasObjective && hasAudience && hasDomain;

    return isReady;
  }, [surveyId, collectedInfo, extractedData, messages]);


  const messagesEndRef = useRef<HTMLDivElement>(null);


  // Check authentication status using AuthContext
  useEffect(() => {
    if (authLoading) return;

    if (!user) {
      getClientTranslation("Authentication Required").then(msg => setAuthError(msg));
      setIsInitializing(false);
      return;
    }

    if (!user.emailVerified) {
      getClientTranslation("Please verify your email to continue.").then(msg => setAuthError(msg));
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

  // Restore voice creation preference
  useEffect(() => {
    if (surveyId) {
      const storedMode = localStorage.getItem(`convy_creation_mode_${surveyId}`);
      if (storedMode === "voice") {
        setWasStartedWithVoice(true);
      }
    }
  }, [surveyId]);


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
              setMessages(data.messages.map((m: any, idx: number) => ({
                id: m.id || `msg-${idx}-${Date.now()}`,
                role: m.role,
                displayedContent: (m as any).content || m.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join(''),
                isTyping: false,
                parts: m.parts || ((m as any).content ? [{ type: 'text', text: (m as any).content }] : [])
              })));
            }

            if (data.collectedInfo) setCollectedInfo(data.collectedInfo);

            if (data.extractedData) {
              setExtractedData(data.extractedData);
            }
          }

          // Get survey status to determine read-only mode
          if (surveyRes.ok) {
            const surveyData = await surveyRes.json();
            const status = surveyData.survey?.status || null;
            setSurveyStatus(status);
            const organizationId = surveyData.survey?.organizationId || null;
            setOrgId(organizationId);


            let isUserOwner = false;
            let currentCollaborators: string[] = [];

            if (surveyData.survey?.userId) {
              isUserOwner = surveyData.survey.userId === user?.id;
              setIsOwner(isUserOwner);
            }
            if (surveyData.survey?.collaborators) {
              currentCollaborators = surveyData.survey.collaborators;
              setCollaborators(currentCollaborators);
            }

            // Set language if available
            if (surveyData.survey?.language) {
              setLanguage(surveyData.survey.language);
            }
            // Set voice mode if available
            if (typeof surveyData.survey?.isVoice === 'boolean') {
              setIsVoiceSurvey(surveyData.survey.isVoice);
            }

            // Read-only if survey is NOT in "creating" status OR if user has no edit access
            const isFinished = status && status !== "creating";
            const hasEditAccess = isUserOwner || currentCollaborators.includes(user?.id || "");

            if (isFinished || !hasEditAccess) {
              setIsReadOnly(true);
            } else {
              setIsReadOnly(false);
            }
          }
        } catch (error) {
          console.error("Failed to load survey data:", error);
          getClientTranslation("Failed to load conversation.").then(msg => toast.error(msg));
        } finally {
          setIsInitializing(false);
        }
      };

      loadConversation();
    }
  }, [idFromUrl, authLoading, user, surveyId, messages.length]);

  // Lazy creation state
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Helper to ensure draft exists before sending message
  const ensureDraftExists = async (): Promise<string | null> => {
    if (surveyId) return surveyId;
    if (isCreatingDraft) {
      console.warn("[Client] ensureDraftExists skipped: already creating...");
      return null;
    }

    console.log("[Client] ensureDraftExists: starting...");
    setIsCreatingDraft(true);
    try {
      const response = await fetch("/api/surveys", {
        method: "POST",
        credentials: "include",
        body: JSON.stringify({ language, isVoice: isVoiceSurvey, domainId: null }),
      });

      console.log(`[Client] ensureDraftExists POST result: ${response.status}`);

      if (response.status === 401) {
        setAuthError(await getClientTranslation("Authentication Required"));
        return null;
      }

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[Client] ensureDraftExists FAILED: ${response.status} ${errorText}`);
        if (errorText === "EMAIL_NOT_VERIFIED") {
          setAuthError(await getClientTranslation("Please verify your email to continue."));
          return null;
        }
        throw new Error(`Failed to create draft: ${response.status}`);
      }

      const survey = await response.json();
      console.log("[Client] ensureDraftExists SUCCESS. New SID:", survey.id);
      setSurveyId(survey.id);

      // Update URL to include the survey ID to prevent reload issues
      window.history.replaceState(null, '', `?id=${survey.id}`);

      return survey.id;
    } catch (error) {
      getClientTranslation("Failed to initialize draft.").then(msg => {
        toast.error(msg);
        setAuthError(msg);
      });
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
  const fetchUpdatedData = async () => {
    if (!surveyId) return;
    try {
      const res = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/create`);
      if (res.ok) {
        const data = await res.json();
        console.log(`[Client] fetchUpdatedData: OK. Msgs: ${data.messages?.length}. Extracted: ${Object.keys(data.extractedData || {}).length}`);
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
  };


  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    console.log("[handleSubmit] Attempting to send message. Input:", input?.trim());
    if (!input?.trim()) {
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

    const currentInput = input;
    setInput(""); // Clear input locally
    console.log("[handleSubmit] Calling sendMessage...");
    sendMessage({
      role: "user",
      parts: [{ type: 'text', text: currentInput }],
    } as any);
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

  // Instant refresh when AI finishes response
  useEffect(() => {
    if ((status as string) === 'idle' && surveyId) {
      fetchUpdatedData();
    }
  }, [status, surveyId]);

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
      // 🔥 Also initiate recording here as this is triggered by a user click
      voiceWs.startRecording().catch(err => {
        console.error("[Client] Failed to start recording on mode toggle:", err);
      });
      voiceWs.connect();
    } else {
      voiceWs.disconnect();
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
        getClientTranslation("Failed to finalize survey.", "Creation finalization error toast").then(msg => toast.error(msg));
        setIsFinalizing(false);
        return;
      }

      const data = await response.json();
      console.log("Survey finalized:", data);
      getClientTranslation("Survey finalized successfully!").then(msg => toast.success(msg));

      // Navigate to sample review page
      router.push(`/dashboard/surveys/${surveyId}/sample-review`);
    } catch (error) {
      console.error("Error finalizing survey:", error);
      getClientTranslation("An error occurred. Please try again.").then(msg => toast.error(msg));
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
          <h2 className="text-xl font-semibold text-gray-900"><ClientT>Authentication Required</ClientT></h2>
          <p className="text-gray-600 max-w-md">{authError}</p>
          <div className="flex gap-3 justify-center">
            {authError.includes("verify") ? (
              <>
                <Link
                  href="/verify-email"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <ClientT>Verify Email</ClientT>
                </Link>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ClientT>Go Back</ClientT>
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  <ClientT>Sign In</ClientT>
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  <ClientT>Go Home</ClientT>
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
        <div className={cn(
          "flex-1 flex flex-col overflow-hidden relative transition-all duration-500",
          surveyId ? "bg-white rounded-3xl border border-gray-200 shadow-sm" : ""
        )}>

          {/* Integrated Header */}
          <div className={cn(
            "flex flex-col sm:flex-row items-center justify-between gap-4 p-6 transition-all duration-500",
            surveyId ? "bg-white border-b border-gray-200" : "bg-transparent"
          )}>
            {!surveyId ? (
              <div className="w-full text-center py-4">
                <h1 className="text-2xl font-bold text-gray-900 flex items-center justify-center gap-2">
                  <Sparkles className="w-6 h-6 text-indigo-600" />
                  <ClientT>Create New Survey</ClientT>
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
                      {surveyId ? (isReadOnly ? <ClientT>View Survey</ClientT> : <ClientT>Build Survey</ClientT>) : <ClientT>Create Survey</ClientT>}
                      {isCreatingDraft && <Loader2 className="w-4 h-4 animate-spin text-gray-400" />}
                    </h1>
                    <div className="flex items-center gap-2 mt-1">
                      {(isReadOnly || surveyStatus === 'completed') && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] uppercase font-bold tracking-wider bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          <ClientT>Read Only</ClientT>
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
              <span><ClientT>This survey is finalized and cannot be edited.</ClientT></span>
              <Link href={`/dashboard/surveys/${surveyId}`} className="font-medium hover:underline">
                <ClientT>View Dashboard</ClientT>
              </Link>
            </div>
          )}



          {/* Chat Area / Domain Selection */}
          <div className={cn(
            "flex-1 overflow-hidden relative flex flex-col",
            surveyId ? "bg-slate-50/30" : "bg-transparent"
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
                      <ClientT>Choose Your Survey Topic</ClientT>
                    </h2>
                    <p className="text-xl text-gray-500 max-w-2xl mx-auto leading-relaxed">
                      <ClientT>Our AI expert will guide you through the research design process to create a high-impact survey.</ClientT>
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
                                <h3 className="text-xl font-medium text-black"><ClientT>AI Designer Experience</ClientT></h3>
                                <p className="text-sm text-gray-500 mt-1"><ClientT>How would you like to build your survey with our AI?</ClientT></p>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-4">
                              <button
                                onClick={() => setIsVoiceMode(false)}
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
                                  <span className="block font-bold text-sm lg:text-base"><ClientT>Chat Interface</ClientT></span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block"><ClientT>Classic text-based conversation with the AI.</ClientT></span>
                                </div>
                              </button>

                              <button
                                onClick={() => setIsVoiceMode(true)}
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
                                  <span className="block font-bold text-sm lg:text-base"><ClientT>Voice Interface</ClientT></span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block"><ClientT>Speak naturally with the AI for a faster experience.</ClientT></span>
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
                                <h3 className="text-xl font-medium text-black"><ClientT>Respondent Format</ClientT></h3>
                                <p className="text-sm text-gray-500 mt-1"><ClientT>Choose the medium for your respondents.</ClientT></p>
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
                                  <span className="block font-bold text-sm lg:text-base"><ClientT>Chat Survey</ClientT></span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block"><ClientT>Respondents answer via a text chat interface.</ClientT></span>
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
                                  <span className="block font-bold text-sm lg:text-base"><ClientT>Voice Survey</ClientT></span>
                                  <span className="text-[11px] lg:text-xs opacity-70 leading-tight block"><ClientT>Real-time conversational voice interviews.</ClientT></span>
                                </div>
                              </button>
                            </div>
                          </div>

                        </div>

                        <div className="mt-12 pt-12 border-t border-gray-100 max-w-md mx-auto">
                          <button
                            onClick={handleStart}
                            disabled={isConnecting}
                            className="w-full py-4 px-6 rounded-xl flex items-center justify-center gap-2 text-white bg-black hover:bg-gray-800 transition-colors font-bold border border-black shadow-lg disabled:opacity-50 text-lg"
                          >
                            {isConnecting ? (
                              <>
                                <Loader2 className="w-5 h-5 animate-spin" />
                                <ClientT>Starting...</ClientT>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-5 h-5" />
                                <ClientT>Start Building</ClientT>
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
                      <p className="text-gray-500 font-medium"><ClientT>Preparing your designer session...</ClientT></p>
                    </div>
                  )}

                  {isVoiceMode && !isReadyForSample && (
                    <div className="absolute inset-0 z-30 bg-slate-50/95 backdrop-blur-md flex flex-col md:flex-row animate-in fade-in duration-500">

                      {/* Left Side: Chat History (WhatsApp Style) */}
                      <div className="flex-1 overflow-y-auto p-4 md:p-8 space-y-6 scroll-smooth">
                        <div className="flex flex-col space-y-4 max-w-3xl mx-auto pb-20">
                          {/* Welcome / Context */}
                          <div className="text-center py-8 text-gray-400 text-sm">
                            <p><ClientT>Voice session started</ClientT></p>
                            <p className="text-xs mt-1"><ClientT>Speak naturally to design your survey</ClientT></p>
                          </div>

                          {/* Message History */}
                          {messages.filter(m => m.id !== "init_ping_hidden").map((msg, idx) => (
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
                                {voiceWs.interimTranscription || <ClientT>Listening...</ClientT>}
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
                                <ClientT>AI Speaking...</ClientT>
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
                            {isConnecting ? <ClientT>Connecting...</ClientT> :
                              voiceWs.isPlaying ? <ClientT>AI Speaking</ClientT> :
                                isSpeaking ? <ClientT>You are speaking</ClientT> :
                                  voiceWs.isRecording ? <ClientT>Listening</ClientT> :
                                    <ClientT>Ready</ClientT>}
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

                            <div
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
                                        : "bg-white border-gray-200 text-slate-600"
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
                                    <span className="text-xs font-medium text-red-500"><ClientT>You are speaking</ClientT></span>
                                  </>
                                ) : isConnecting ? (
                                  <>
                                    <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
                                  </>
                                ) : voiceWs.isPlaying ? (
                                  <>
                                    <Sparkles className="w-10 h-10 animate-spin-slow" />
                                    <span className="text-xs font-medium text-indigo-600"><ClientT>AI Speaking...</ClientT></span>
                                  </>
                                ) : voiceWs.isRecording ? (
                                  <>
                                    <div className="flex gap-1.5 items-center h-6">
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0s' }} />
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.2s' }} />
                                      <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce" style={{ animationDelay: '0.4s' }} />
                                    </div>
                                    <span className="text-xs font-medium text-emerald-600"><ClientT>Listening</ClientT></span>
                                  </>
                                ) : (
                                  <>
                                    <MicOff className="w-10 h-10 opacity-30" />
                                    <span className="text-xs font-medium text-gray-400"><ClientT>Ready</ClientT></span>
                                  </>
                                )}
                              </div>
                            </div>
                          </div>

                          {/* Text Hint */}
                          <div className="text-center space-y-2 max-w-[200px]">
                            <h3 className="font-bold text-gray-900">
                              {voiceWs.isRecording ? <ClientT>Listening...</ClientT> :
                                voiceWs.isPlaying ? <ClientT>AI Speaking...</ClientT> :
                                  <ClientT>Voice Active</ClientT>}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                              {voiceWs.isRecording ? <ClientT>I am listening to your thoughts.</ClientT> :
                                voiceWs.isPlaying ? <ClientT>I am responding to your last input.</ClientT> :
                                  <ClientT>Start speaking to design your survey.</ClientT>}
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
                          <ClientT>Exit Voice Mode</ClientT>
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
                      <h2 className="text-2xl font-bold text-gray-900 mb-2"><ClientT>Design Complete!</ClientT></h2>
                      <p className="text-gray-500 max-w-md text-center mb-8">
                        <ClientT>Your survey research design is ready. You can now review the sample conversations and finalize the survey.</ClientT>
                      </p>
                      <button
                        onClick={toggleVoiceMode}
                        className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all hover:-translate-y-0.5"
                      >
                        <ClientT>Return to Chat</ClientT>
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
                                content={
                                  // Priority 1: standard content field (set after streaming completes)
                                  (message as any).content ||
                                  // Priority 2: text parts (when model writes text-deltas directly — standard AI SDK pattern)
                                  (message.parts?.filter((p: any) => p.type === 'text').map((p: any) => p.text).join('')) ||
                                  ""
                                }
                                className="text-gray-800 prose-sm"
                              />
                              {/* Single unified path — AI SDK uses type 'tool-{toolName}' for tool parts */}

                              {message.parts?.map((part: any, idx) => {

                                // AI SDK v6 emits parts with type 'tool-{toolName}', e.g. 'tool-requestMediaUpload'
                                // The toolName is embedded in the type string
                                if (!part.type?.startsWith('tool-')) return null;

                                const toolName = part.type.replace(/^tool-/, '');

                                // think_and_respond is an internal reasoning tool — its output is never shown to the user
                                if (toolName === 'think_and_respond') return null;

                                const toolCallId = part.toolCallId;

                                const toolState = part.state; // 'input-available' | 'output-available'

                                const args = part.input ?? part.args ?? {};  // SDK uses 'input' not 'args'

                                const result = part.output ?? part.result;   // SDK uses 'output' not 'result'



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
                                  const aiDescription = args?.description as string | undefined;
                                  const aiLearningGoal = args?.learningGoal as string | undefined;
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
                                            aiDescription={aiDescription}
                                            aiLearningGoal={aiLearningGoal}
                                            onAllUploaded={(mediaItems) => {
                                              addToolOutput({
                                                toolCallId: toolCallId,
                                                tool: 'requestMediaUpload',
                                                output: JSON.stringify({
                                                  success: true,
                                                  count: mediaItems.length,
                                                  media: mediaItems.map(m => ({
                                                    id: m.id,
                                                    url: m.url,
                                                    type: m.type,
                                                    description: m.description,
                                                    contextForUse: m.contextForUse
                                                  }))
                                                })
                                              });
                                            }}
                                            onSkip={() => {
                                              addToolOutput({
                                                toolCallId: toolCallId,
                                                tool: 'requestMediaUpload',
                                                output: JSON.stringify({ success: false, skipped: true })
                                              });
                                            }}
                                            allowedTypes={args?.allowedTypes || ['image', 'audio', 'video']}
                                          />
                                        </>
                                      ) : isDone && (
                                        <div className="flex items-center gap-2 text-xs text-gray-600 bg-gray-50 px-3 py-2 rounded-lg border border-gray-200 mt-2">
                                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                          {(() => {
                                            try {
                                              const parsed = typeof result === 'string' ? JSON.parse(result) : result;
                                              if (parsed?.skipped) return 'Media skipped';
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
                            <h3 className="font-bold text-gray-900"><ClientT>Ready for Review</ClientT></h3>
                            <p className="text-sm text-gray-500"><ClientT>Our AI expert has finalized the research design. You can now review sample conversations.</ClientT></p>
                          </div>
                        </div>
                        <button
                          onClick={handleGoToSampleConversations}
                          disabled={isFinalizing}
                          className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all hover:-translate-y-0.5"
                        >
                          {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                          {isFinalizing ? <ClientT>Finalizing...</ClientT> : <ClientT>Review Sample Conversations</ClientT>}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Main Input */}
                  {/* Main Input - Shown when survey is active and not finished */}
                  {(!isReadyForSample && !isReadOnly && !isVoiceMode && surveyId) && (
                    <div className="max-w-3xl mx-auto space-y-4">


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
                            {wasStartedWithVoice && (
                              <button
                                type="button"
                                onClick={toggleVoiceMode}
                                className="p-2.5 rounded-xl text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 transition-all"
                                title={t("Input.VoiceMode")}
                              >
                                <Mic className="w-5 h-5" />
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
                      <p className="text-sm text-gray-400 italic"><ClientT>This survey is finalized and cannot be edited.</ClientT></p>
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

        {/* Real-time Collaboration Sidebar - Only for Org surveys or if there are collaborators */}
        {(surveyId && (orgId || collaborators.length > 0)) && (
          <CollaborationSidebar
            surveyId={surveyId}
            isOwner={isOwner}
            collaborators={collaborators}
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
  aiDescription,
  aiLearningGoal,
}: {
  surveyId: string;
  onAllUploaded: (media: any[]) => void;
  onSkip: () => void;
  allowedTypes: string[];
  aiDescription?: string;
  aiLearningGoal?: string;
}) {
  const [queue, setQueue] = useState<QueuedFile[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploadingAll, setIsUploadingAll] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uid = useId();

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
      toast.error(await getClientTranslation("Each file needs a description and learning goal (min 10 characters each).", "Media upload validation error"));
      return;
    }
    setIsUploadingAll(true);
    const uploadedMedia: any[] = [];
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
          getClientTranslation(`Failed: ${result.error}`, "Media upload failure toast").then(msg => toast.error(msg));
        }
      } catch (err) {
        setQueue((prev) => prev.map((q) => q.id === item.id ? { ...q, status: 'error', errorMsg: 'Unexpected error' } : q));
        getClientTranslation("Upload failed. Please try again.", "Media upload error toast").then(msg => toast.error(msg));
      }
    }
    setIsUploadingAll(false);
    if (uploadedMedia.length > 0) {
      getClientTranslation(`${uploadedMedia.length} file${uploadedMedia.length > 1 ? 's' : ''} uploaded!`, "Media upload success toast").then(msg => toast.success(msg));
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
            <h2 className="text-xl font-semibold text-gray-900 tracking-tight"><ClientT>Upload Files</ClientT></h2>
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
        {(aiDescription || aiLearningGoal) && (
          <div className="mx-8 mt-5 px-4 py-3 bg-gray-50 border border-gray-200" style={{ borderRadius: '2px' }}>
            <p className="text-[10px] uppercase tracking-[0.2em] text-gray-400 font-medium mb-1.5">From our conversation</p>
            {aiDescription && <p className="text-sm text-gray-600"><span className="font-medium text-gray-800"><ClientT>What it is:</ClientT></span> {aiDescription}</p>}
            {aiLearningGoal && <p className="text-sm text-gray-600 mt-0.5"><span className="font-medium text-gray-800"><ClientT>Goal:</ClientT></span> {aiLearningGoal}</p>}
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
              <p className="text-sm font-medium text-gray-800"><ClientT>{isDragging ? 'Drop files here' : 'Click or drag files here'}</ClientT></p>
              <p className="text-xs text-gray-400 mt-0.5">{allowedTypes.join(', ')} — up to 100 MB each</p>
            </div>
          </div>
        </div>

        {/* File Queue */}
        {queue.length > 0 && (
          <div className="flex-1 overflow-y-auto px-8 mt-5 space-y-4 pb-4">
            {queue.map((item, idx) => (
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
                      <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium block mb-1"><ClientT>Description</ClientT></label>
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
                      <label className="text-[10px] uppercase tracking-[0.15em] text-gray-400 font-medium block mb-1"><ClientT>Learning Goal</ClientT></label>
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
            <ClientT>Skip</ClientT>
          </button>
          <div className="flex items-center gap-3">
            {queue.length > 0 && !isUploadingAll && (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
              >
                <ClientT>+ Add more</ClientT>
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