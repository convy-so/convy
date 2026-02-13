"use client";

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { useRouter, Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { PublishSurveyModal } from "@/components/surveys/publish-survey-modal";
import { AddMediaModal } from "@/components/surveys/add-media-modal";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { clientEnv } from "@/lib/env.client";
import { MarkdownMessage } from "@/components/ui/markdown-message";


type CreationStep = "objective" | "audience" | "questions" | "tone" | "review";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayedContent?: string;
  isTyping?: boolean;
};

const TYPING_DELAY_MS = 15;

function CreateSurveyContent() {
  const router = useRouter();
  const t = useTranslations("Survey.Create");
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false); // Track when user is actively speaking
  // Define prompts inside component to use translations
  const suggestedPrompts = [
    t("SuggestedPrompts.CustomerSat"),
    t("SuggestedPrompts.ProductFeedback"),
    t("SuggestedPrompts.EmployeeEngagement"),
    t("SuggestedPrompts.MarketResearch"),
  ];

  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);
  const [isFinalizing, setIsFinalizing] = useState(false);
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [surveyStatus, setSurveyStatus] = useState<string | null>(null);

  // Language state
  const [language, setLanguage] = useState<"en" | "fr" | "de" | "es" | "it">("en");
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);
  const [isVoiceSurvey, setIsVoiceSurvey] = useState(false);
  const [isInputMenuOpen, setIsInputMenuOpen] = useState(false);

  const toggleLanguage = () => setIsLanguageOpen(!isLanguageOpen);
  const toggleInputMenu = () => setIsInputMenuOpen(!isInputMenuOpen);

  const updateLanguage = async (newLang: "en" | "fr" | "de" | "es" | "it") => {
    setLanguage(newLang);
    setIsLanguageOpen(false);

    if (surveyId) {
      try {
        await fetch(`/api/surveys/${surveyId}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ language: newLang })
        });

        if (voiceWs.status === "connected") {
          voiceWs.sendJson({ type: "set_language", language: newLang });
        }
      } catch (error) {
        console.error("Failed to update language:", error);
        toast.error(t("Toasts.LanguageUpdateFailed"));
      }
    }
  };

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



  const voiceWs = useVoiceWebSocket({
    url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-creation`,
    onReady: () => {
      if (surveyId) {
        voiceWs.sendJson({ type: "set_survey_id", surveyId });
      }
    },
    onMessage: (data) => {
      // Handle speech activity events from Deepgram
      if (data.type === "speech_start") {
        console.log("[Client] 🗣️ Speech started (from Deepgram)");
        setIsSpeaking(true);
      } else if (data.type === "speech_end") {
        console.log("[Client] 🤐 Speech ended (from Deepgram)");
        setIsSpeaking(false);
      } else if (data.type === "update_extracted_data") {
        setExtractedData(data.extractedData);
        setCollectedInfo(data.collectedInfo);
      } else if (data.type === "audio_sent" || data.type === "text_response") {
        console.log("[Client] 🤖 AI response received:", data.text?.substring(0, 50));
        // Check if this is a duplicate of the initial welcome message
        setMessages(prev => {
          const isDuplicate = prev.some(m =>
            m.id === "welcome" &&
            (m.content === data.text || m.displayedContent === data.text)
          );

          if (isDuplicate) return prev;

          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: data.text,
            displayedContent: data.text,
            isTyping: false,
          };
          return [...prev, assistantMessage];
        });
      } else if (data.type === "transcription" && data.isFinal) {
        console.log("[Client] ✅ FINAL transcription received:", data.text);
        const userMessage: Message = {
          id: Date.now().toString(),
          role: "user",
          content: data.text,
          displayedContent: data.text,
          isTyping: false,
        };
        setMessages(prev => [...prev, userMessage]);
      } else if (data.type === "transcription_interim") {
        console.log("[Client] 💬 Interim transcription:", data.text);
      }
    }
  });

  // Monitor playback to handle the "Mute until Greeting Ends" flow
  useEffect(() => {
    // Safety check: if connecting for too long without greeting, force clear state
    // This prevents "stuck in yellow" issues if the greeting packet is dropped
    let safetyTimeout: NodeJS.Timeout;

    if (isConnecting) {
      safetyTimeout = setTimeout(() => {
        console.warn("[Voice UI] ⚠️ Greeting safety timeout reached. Forcing state clear.");
        setIsConnecting(false);
        setHasGreetingPlayed(true);
        voiceWs.setMicMuted(false); // Ensure user can speak
      }, 8000); // 8 seconds max wait for greeting
    }

    // New Logic: We trust 'voiceWs.hasAudioPlayed' to tell us if the greeting actually started
    if (isConnecting && (voiceWs.isPlaying || voiceWs.hasAudioPlayed)) {
      // Audio started playing (The greeting arrived!)
      console.log("[Voice UI] 🟣 Audio started (Greeting detected)");
      setIsConnecting(false);
      setHasGreetingPlayed(true);
    } else if (hasGreetingPlayed && !voiceWs.isPlaying && voiceWs.isRecording) {
      // Greeting finished playing! Now we can UNMUTE the mic
      if (voiceWs.isMicMuted) {
        console.log("[Voice UI] 🟢 Greeting finished (isPlaying=false), unmuting microphone");
        voiceWs.setMicMuted(false);
      }
    }

    return () => {
      if (safetyTimeout) clearTimeout(safetyTimeout);
    };
  }, [
    voiceWs.isPlaying,
    voiceWs.hasAudioPlayed, // Added dependency
    isConnecting,
    hasGreetingPlayed,
    voiceWs.isRecording,
    voiceWs.isMicMuted,
    voiceWs.setMicMuted,
    voiceWs.status
  ]);


  // Effect to sync surveyId with WebSocket
  useEffect(() => {
    if (surveyId && voiceWs.status === "connected") {
      voiceWs.sendJson({ type: "set_survey_id", surveyId });
    }
  }, [surveyId, voiceWs.status]);

  // Chat state
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "welcome",
      role: "assistant",
      content: "Hi! I'm here to help you create the perfect survey. Let's start with the basics - what's the main objective of your survey? What do you want to learn from your respondents?",
      displayedContent: "Hi! I'm here to help you create the perfect survey. Let's start with the basics - what's the main objective of your survey? What do you want to learn from your respondents?",
      isTyping: false,
    }
  ]);

  // Update initial message when translation loads
  useEffect(() => {
    setMessages(prev => prev.map(msg =>
      msg.id === "welcome"
        ? {
          ...msg,
          content: t("Chat.Welcome"),
          displayedContent: msg.displayedContent === msg.content ? t("Chat.Welcome") : msg.displayedContent // Only update display if fully shown/matching
        }
        : msg
    ));
  }, []);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);

  const [extractedData, setExtractedData] = useState<any>(null);
  const [collectedInfo, setCollectedInfo] = useState<any>(null);

  // Detect if all required info has been collected for sample conversations
  const isReadyForSample = useMemo(() => {
    if (!surveyId || !collectedInfo) return false;

    // 1. Check for explicit completion signal in messages (Fallback)
    // If the assistant says "click the button" or "sample conversations", we should show it
    const lastAssistantMessage = [...messages].reverse().find(m => m.role === 'assistant');
    const aiMentionedSamples = lastAssistantMessage?.content.toLowerCase().includes('sample conversation') ||
      lastAssistantMessage?.content.toLowerCase().includes('click') &&
      lastAssistantMessage?.content.toLowerCase().includes('button');

    // 2. Main Logic: Check all truly required flags are collected
    // These must now match our REQUIRED_INFORMATION priorities
    const allRequiredFlagsCollected = (
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.scope &&
      collectedInfo.successCriteria &&
      collectedInfo.constraints &&
      collectedInfo.tone &&
      collectedInfo.requiredQuestions &&
      collectedInfo.metrics &&
      collectedInfo.personalInfo &&
      collectedInfo.subjectDefined &&
      collectedInfo.domainIdentified
    );

    // If AI mentioned samples, we skip strict structural validation and trust the AI
    if (aiMentionedSamples && allRequiredFlagsCollected) {
      console.log('[isReadyForSample] ✅ AI explicitly mentioned samples and all info is collected');
      return true;
    }

    // 3. Structural Validation (Strict path)
    if (!allRequiredFlagsCollected || !extractedData) {
      console.log('[isReadyForSample] ⏳ Missing required flags or extractedData', {
        allRequiredFlagsCollected,
        hasExtractedData: !!extractedData,
        collectedInfo
      });
      return false;
    }

    const hasObjective = !!(extractedData.objective?.goal);
    const hasAudience = !!(extractedData.targetAudience?.description);
    const hasScope = !!(extractedData.scope?.mainTopics && extractedData.scope.mainTopics.length > 0);
    const hasSuccessCriteria = !!(extractedData.successCriteria?.insightTypes);
    const hasDomain = typeof extractedData.domainId === 'number';
    const hasTone = !!(extractedData.tone);
    const hasRequiredQuestions = Array.isArray(extractedData.requiredQuestions);

    const isReady = hasObjective && hasAudience && hasScope && hasSuccessCriteria && hasDomain && hasTone && hasRequiredQuestions;

    console.log('[isReadyForSample] Validation results:', {
      isReady,
      hasObjective,
      hasAudience,
      hasScope,
      hasSuccessCriteria,
      hasDomain,
      hasTone,
      hasRequiredQuestions,
      extractedDataKeys: extractedData ? Object.keys(extractedData) : []
    });

    return isReady;
  }, [surveyId, collectedInfo, extractedData, messages]);

  // Detect if the user is ready to publish based on conversation content
  const isReadyToPublish = useMemo(() => {
    if (!surveyId || messages.length < 4) return false;

    // Check if the last few messages indicate completion
    const recentMessages = messages.slice(-4);
    const completionKeywords = [
      'publish', 'done', 'finished', 'complete', 'ready', 'perfect',
      'looks good', 'satisfied', "that's all", 'thats all', 'go live',
      'share', 'launch', 'good to go', 'approved', 'confirmed'
    ];

    const userMentionedCompletion = recentMessages.some(msg => {
      if (msg.role !== 'user') return false;
      const content = msg.content.toLowerCase();
      return completionKeywords.some(keyword => content.includes(keyword));
    });

    const aiConfirmedReady = recentMessages.some(msg => {
      if (msg.role !== 'assistant') return false;
      const content = msg.content.toLowerCase();
      return content.includes('ready to publish') ||
        content.includes('survey is now published') ||
        content.includes('looks great') ||
        content.includes('ready to collect') ||
        content.includes('all set');
    });

    // Check if enough data has been collected (at least objective and audience)
    const hasEnoughData = collectedInfo &&
      (collectedInfo.objective && collectedInfo.targetAudience);

    return (userMentionedCompletion && aiConfirmedReady) ||
      (hasEnoughData && messages.length >= 6);
  }, [messages, surveyId, collectedInfo]);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const typingIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const animateTyping = useCallback((messageId: string, fullContent: string) => {
    const startTime = Date.now();
    const totalDuration = fullContent.length * TYPING_DELAY_MS;

    if (typingIntervalRef.current) {
      clearInterval(typingIntervalRef.current);
    }

    const updateTyping = () => {
      const now = Date.now();
      const elapsed = now - startTime;

      const charIndex = Math.min(Math.floor(elapsed / TYPING_DELAY_MS), fullContent.length);

      setMessages(prev =>
        prev.map(msg =>
          msg.id === messageId
            ? { ...msg, displayedContent: fullContent.slice(0, charIndex) }
            : msg
        )
      );

      if (charIndex >= fullContent.length) {
        if (typingIntervalRef.current) {
          clearInterval(typingIntervalRef.current);
          typingIntervalRef.current = null;
        }

        setMessages(prev =>
          prev.map(msg =>
            msg.id === messageId
              ? { ...msg, isTyping: false, displayedContent: fullContent }
              : msg
          )
        );
      }
    };

    // Use setInterval instead of recursive setTimeout for more reliable timing
    typingIntervalRef.current = setInterval(updateTyping, TYPING_DELAY_MS);

    // Initial call
    updateTyping();
  }, []);

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
    setIsInitializing(false); // Just finish init without creating draft
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
                isTyping: false
              })));
            }

            if (data.collectedInfo) setCollectedInfo(data.collectedInfo);
            if (data.extractedData) setExtractedData(data.extractedData);
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

  // Replace useChat with manual implementation
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  const sendMessage = async (content: string) => {
    if (authError) return;

    // Clear any existing typing animation
    if (typingIntervalRef.current) {
      clearTimeout(typingIntervalRef.current);
      typingIntervalRef.current = null;
    }

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content,
      displayedContent: content,
      isTyping: false,
    };

    setMessages(prev => [...prev, userMessage]);
    setIsLoading(true);

    try {
      // Ensure we have a survey ID (create lazily if needed)
      let currentSurveyId = surveyId;
      if (!currentSurveyId) {
        currentSurveyId = await ensureDraftExists();
        if (!currentSurveyId) {
          setIsLoading(false);
          return; // Failed to create
        }
      }

      const response = await fetch(`/api/surveys/${currentSurveyId}/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "include",
        body: JSON.stringify({
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          }))
        }),
      });

      if (response.status === 401) {
        setAuthError(t("Authentication.Required"));
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (errorText === "EMAIL_NOT_VERIFIED") {
          setAuthError(t("Authentication.VerifyEmail"));
          return;
        }
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      // Collect full response content first, then animate
      let fullContent = "";
      const assistantMessageId = (Date.now() + 1).toString();

      // Check if response is streaming
      const contentType = response.headers.get('content-type');

      if (contentType?.includes('text/plain') || contentType?.includes('text/stream')) {
        const reader = response.body?.getReader();
        if (!reader) throw new Error("No response body");

        // Add placeholder message with typing indicator
        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: "",
          displayedContent: "",
          isTyping: true,
        };
        setMessages(prev => [...prev, assistantMessage]);

        const decoder = new TextDecoder();
        let done = false;
        let buffer = '';

        while (!done) {
          const { value, done: readerDone } = await reader.read();
          done = readerDone;

          if (value) {
            const chunk = decoder.decode(value, { stream: true });
            buffer += chunk;

            // Process complete lines
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              if (line.trim()) {
                // Handle AI SDK streaming format
                if (line.startsWith('0:')) {
                  const lineContent = line.slice(2);
                  if (lineContent) {
                    fullContent += lineContent;
                  }
                } else if (line.startsWith('data: ')) {
                  const lineContent = line.slice(6);
                  if (lineContent && lineContent !== '[DONE]') {
                    try {
                      const parsed = JSON.parse(lineContent);
                      if (parsed.choices?.[0]?.delta?.content) {
                        fullContent += parsed.choices[0].delta.content;
                      }
                    } catch (e) {
                      fullContent += lineContent;
                    }
                  }
                } else {
                  fullContent += line;
                }
              }
            }
          }
        }

        // Process any remaining buffer content
        if (buffer.trim()) {
          fullContent += buffer;
        }

        // Update the message with full content and start typing animation
        setMessages(prev =>
          prev.map(msg =>
            msg.id === assistantMessageId
              ? { ...msg, content: fullContent, displayedContent: "", isTyping: true }
              : msg
          )
        );

        // Start typing animation after a short delay
        setTimeout(() => {
          animateTyping(assistantMessageId, fullContent);
        }, 100);

      } else {
        // Handle non-streaming response (fallback)
        const responseText = await response.text();

        const assistantMessage: Message = {
          id: assistantMessageId,
          role: "assistant",
          content: responseText,
          displayedContent: "",
          isTyping: true,
        };

        setMessages(prev => [...prev, assistantMessage]);

        // Start typing animation
        setTimeout(() => {
          animateTyping(assistantMessageId, responseText);
        }, 100);
      }

      // Fetch updated extraction data after AI response completes
      await fetchUpdatedData();

    } catch (error) {
      console.error("Chat error:", error);
      toast.error(t("Toasts.SendFailed"));
      // Remove the user message if there was an error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch latest extraction data from server
  const fetchUpdatedData = async () => {
    if (!surveyId) return;

    try {
      const response = await fetch(`/api/surveys/${surveyId}/create`);
      if (response.ok) {
        const data = await response.json();
        if (data.collectedInfo) {
          console.log('[fetchUpdatedData] Updated collectedInfo:', data.collectedInfo);
          setCollectedInfo(data.collectedInfo);
        }
        if (data.extractedData) {
          console.log('[fetchUpdatedData] Updated extractedData:', data.extractedData);
          setExtractedData(data.extractedData);
        }
      }
    } catch (error) {
      console.error('Failed to fetch updated data:', error);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input?.trim() || isLoading || authError) return;

    const message = input.trim();
    setInput("");
    sendMessage(message);
  };

  const append = async (message: { role: "user" | "assistant"; content: string }) => {
    await sendMessage(message.content);
  };

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  useEffect(() => {
    if (isVoiceMode) {
      scrollToBottom();
    }
  }, [isVoiceMode, transcribedText, voiceWs.interimTranscription]);

  // Poll for extracted data to update preview
  useEffect(() => {
    if (!surveyId) return;

    const fetchExtractedData = async () => {
      try {
        const res = await fetch(`/api/surveys/${encodeURIComponent(surveyId)}/create`);
        if (res.ok) {
          const data = await res.json();
          // Only update if we get valid data, don't overwrite with empty if we already have data
          // unless it's a genuine update (this prevents some flickering if API returns temp empty state)
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
          // console.debug("Polling paused (network unavailable)");
          return;
        }
        console.error("Failed to fetch extraction data", err);
      }
    };

    // Poll more frequently to catch real-time updates
    const timer = setInterval(fetchExtractedData, 3000);
    fetchExtractedData(); // Initial fetch

    return () => clearInterval(timer);
  }, [surveyId]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!input?.trim() || isLoading) return;
      handleSubmit(e as any);
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    if (!authError) {
      setInput(prompt);
    }
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

  const toggleRecording = async () => {
    // Voice-activated mode with AI-First flow
    // 1. Start recording (get permissions) but MUTE immediately
    // 2. Send start signal
    // 3. Wait for AI greeting to finish playing
    // 4. Unmute mic
    if (!voiceWs.isRecording) {
      console.log("[Client] 🎤 Starting recording sequence...");
      setIsConnecting(true);
      setHasGreetingPlayed(false); // Reset greeting flag on new session

      try {
        voiceWs.setMicMuted(true); // Mute FIRST to be safe
        await voiceWs.startRecording();
        console.log("[Client] ✅ Recording started (Muted)");

        // Wait for WebSocket to be fully ready before sending start signal
        // Poll every 100ms, max 50 tries (5 seconds)
        let attempts = 0;
        const maxAttempts = 50;

        const waitForConnection = setInterval(() => {
          attempts++;
          if (voiceWs.status === "connected") {
            clearInterval(waitForConnection);
            console.log("[Client] 📤 Connection ready. Sending start_conversation signal...");
            voiceWs.sendJson({ type: "start_conversation" });
          } else if (attempts >= maxAttempts) {
            clearInterval(waitForConnection);
            console.error("[Client] ❌ Timed out waiting for WebSocket connection");
            toast.error("Connection timed out. Please try again.");
            setIsConnecting(false);
            voiceWs.stopRecording();
          }
        }, 100);

      } catch (err) {
        console.error("[Client] ❌ Failed to start recording:", err);
        setIsConnecting(false);
      }
    }
    // Note: We don't stop recording - it stays active for natural conversation
  };

  const startRecording = async () => {
    try {
      audioRef.current = null; // Reset audio player
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;
      const chunks: BlobPart[] = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunks.push(e.data);
      };

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const url = URL.createObjectURL(blob);
        setAudioUrl(url);
      };

      mediaRecorder.start();

      // Speech Recognition
      if ("webkitSpeechRecognition" in window || "SpeechRecognition" in window) {
        // @ts-ignore
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        const recognition = new SpeechRecognition();
        recognition.continuous = true;
        recognition.interimResults = true;

        recognition.onresult = (event: any) => {
          const transcript = Array.from(event.results)
            .map((result: any) => result[0].transcript)
            .join("");
          setTranscribedText(transcript);
        };

        recognition.onerror = (event: any) => {
          console.error("Speech recognition error", event.error);
        };

        recognition.start();
        recognitionRef.current = recognition;
      }

      setIsRecording(true);
      setDuration(0);
      setTranscribedText("");
      setAudioUrl(null);
    } catch (err) {
      console.error("Error accessing microphone:", err);
      // alert("Could not access microphone. Please ensure you have granted permission.");
      toast.error(t("Toasts.MicDenied"));
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    if (recognitionRef.current) {
      recognitionRef.current.stop();
    }
    setIsRecording(false);
  };

  const tooglePlayback = () => {
    if (!audioRef.current && audioUrl) {
      audioRef.current = new Audio(audioUrl);
      audioRef.current.onended = () => setIsPlaying(false);
    }

    if (audioRef.current) {
      if (isPlaying) {
        audioRef.current.pause();
      } else {
        audioRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleVoiceSend = async () => {
    if (transcribedText && !authError) {
      try {
        // Directly append user message using useChat's append
        await append({
          role: 'user',
          content: transcribedText
        });

        setTranscribedText("");
        setAudioUrl(null);
        audioRef.current = null;
      } catch (error) {
        console.error("Voice send error:", error);
        toast.error(t("Toasts.VoiceSendFailed"));
      }
    }
  };

  const resetRecording = () => {
    setAudioUrl(null);
    setTranscribedText("");
    setDuration(0);
    audioRef.current = null;
  };

  const handleMediaUploaded = (media: any) => {
    const msg = `I have uploaded a ${media.type}: "${media.description}". Context for use: ${media.contextForUse}`;
    append({
      role: 'user',
      content: msg
    });
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
      toast.error("An error occurred. Please try again.");
      setIsFinalizing(false);
    }
  };

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (voiceWs.isRecording) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    } else {
      setDuration(0);
    }
    return () => clearInterval(interval);
  }, [voiceWs.isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
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
          <h2 className="text-xl font-semibold text-gray-900">Authentication Required</h2>
          <p className="text-gray-600 max-w-md">{authError}</p>
          <div className="flex gap-3 justify-center">
            {authError.includes("verify") ? (
              <>
                <Link
                  href="/verify-email"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Verify Email
                </Link>
                <Link
                  href="/dashboard"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Go Back
                </Link>
              </>
            ) : (
              <>
                <Link
                  href="/sign-in"
                  className="px-4 py-2 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  href="/"
                  className="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Go Home
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
      <div className="h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6 max-w-7xl mx-auto p-4 overflow-hidden">
        <div className="flex-1 bg-white rounded-3xl border border-gray-200 flex flex-col overflow-hidden relative">

          {/* Integrated Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 p-6 border-b border-gray-100">
            <div className="flex items-center gap-3">
              <Link href="/dashboard" className="p-2 -ml-2 hover:bg-white/10 rounded-full transition-colors text-white/60 hover:text-white">
                <ArrowLeft className="w-5 h-5" />
              </Link>
              <div>
                <h1 className="text-xl font-bold text-white flex items-center gap-2">
                  {surveyId ? (isReadOnly ? t("Title.View") : t("Title.Create")) : t("Title.Create")}
                  {isCreatingDraft && <Loader2 className="w-4 h-4 animate-spin text-white/50" />}
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
            <div className="flex items-center gap-2 w-full sm:w-auto mt-4 sm:mt-0">
              {/* Language Switcher & Controls */}
              {!isReadOnly && (
                <div className="flex items-center gap-3">
                  {/* Language Switcher */}
                  <div className="relative">
                    <button
                      onClick={toggleLanguage}
                      className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-gray-700 bg-gray-50/50 hover:bg-white border border-transparent hover:border-gray-200 hover:shadow-sm rounded-lg transition-all"
                    >
                      <Globe className="w-4 h-4 text-gray-500" />
                      <span className="uppercase">{language}</span>
                      <ChevronDown className={cn("w-3 h-3 text-gray-400 transition-transform", isLanguageOpen && "rotate-180")} />
                    </button>

                    {isLanguageOpen && (
                      <>
                        <div
                          className="fixed inset-0 z-40"
                          onClick={() => setIsLanguageOpen(false)}
                        />
                        <div className="absolute right-0 mt-2 w-48 bg-white rounded-xl shadow-xl border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200 overflow-hidden">
                          {[
                            { code: 'en', label: 'English' },
                            { code: 'fr', label: 'Français' },
                            { code: 'de', label: 'Deutsch' },
                            { code: 'es', label: 'Español' },
                            { code: 'it', label: 'Italiano' }
                          ].map((lang) => (
                            <button
                              key={lang.code}
                              onClick={() => updateLanguage(lang.code as any)}
                              className={cn(
                                "w-full text-left px-4 py-3 text-sm hover:bg-gray-50 transition-colors flex items-center justify-between",
                                language === lang.code ? "text-indigo-600 font-medium bg-indigo-50/30" : "text-gray-600"
                              )}
                            >
                              {lang.label}
                              {language === lang.code && <CheckCircle2 className="w-4 h-4" />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="h-6 w-px bg-gray-200/60" />

                  {/* Voice Mode Toggle (Now in Header) */}
                  <button
                    onClick={toggleVoiceMode}
                    className={cn(
                      "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all ml-2",
                      isVoiceMode
                        ? "bg-red-500 text-white shadow-md animate-pulse"
                        : "bg-slate-900 text-white hover:bg-slate-800 shadow-sm"
                    )}
                  >
                    {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isVoiceMode ? t("Header.Mode.VoiceActive") : t("Menu.VoiceMode")}
                  </button>

                  <div className="h-6 w-px bg-gray-200/60 mx-2" />

                  {/* Default Mode Toggle (Sets Survey Default, NOT Interaction Method) */}
                  <div className="bg-gray-100/50 p-1 rounded-lg flex items-center">
                    <button
                      onClick={() => {
                        if (!isVoiceSurvey) updateSurveyMode(true);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                        isVoiceSurvey
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                      )}
                    >
                      <Mic className="w-4 h-4" />
                      {t("Header.Mode.Voice")}
                    </button>
                    <button
                      onClick={() => {
                        if (isVoiceSurvey) updateSurveyMode(false);
                      }}
                      className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all",
                        !isVoiceSurvey
                          ? "bg-white text-gray-900 shadow-sm"
                          : "text-gray-500 hover:text-gray-900 hover:bg-white/50"
                      )}
                    >
                      <Keyboard className="w-4 h-4" />
                      {t("Header.Mode.Text")}
                    </button>
                  </div>
                </div>
              )}
            </div>
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



          {/* Chat Area */}
          <div className="flex-1 overflow-hidden relative flex flex-col bg-slate-50/30">
            {isVoiceMode && !isReadyForSample && (
              <div className="absolute inset-0 z-30 bg-slate-50/95 backdrop-blur-md flex flex-row animate-in fade-in duration-500">

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
                          {msg.content}
                        </div>

                        {msg.role === 'user' && (
                          <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center shrink-0">
                            <User className="w-4 h-4 text-gray-600" />
                          </div>
                        )}
                      </div>
                    ))}

                    {/* Live Transcription Bubble (Pending User Input) */}
                    {(voiceWs.interimTranscription || isRecording) && (
                      <div className="flex w-full items-end gap-2 justify-end">
                        <div className={cn(
                          "px-4 py-3 max-w-[80%] rounded-2xl rounded-tr-none shadow-sm text-sm md:text-base leading-relaxed",
                          voiceWs.interimTranscription
                            ? "bg-slate-800/80 text-white backdrop-blur-sm"
                            : "bg-gray-100 text-gray-400 italic"
                        )}>
                          {voiceWs.interimTranscription || t("Chat.Listening")}
                          {isRecording && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full ml-1 animate-pulse" />}
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

                    <div ref={messagesEndRef} />
                  </div>
                </div>

                {/* Right Side: Voice Controls Sidebar */}
                <div className="w-80 border-l border-gray-100 bg-white shadow-xl z-40 flex flex-col items-center justify-center p-8 relative overflow-hidden">
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
                      {isConnecting ? "Connecting..." :
                        voiceWs.isPlaying ? t("Status.AISpeaking") :
                          isSpeaking ? t("Status.Speaking") || "You're Speaking" :
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
                        disabled={voiceWs.isRecording} // Disable once activated
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
                              <span className="text-xs font-medium text-red-500">Speaking...</span>
                            </>
                          ) : isConnecting ? (
                            <Loader2 className="h-10 w-10 animate-spin text-amber-500" />
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
                          content={message.displayedContent || message.content}
                          className="text-gray-800 prose-sm"
                        />
                        {message.isTyping && (
                          <span className="inline-block w-1 h-4 bg-indigo-500 ml-1 rounded-full animate-pulse" />
                        )}
                      </div>
                    ) : (
                      <p className="text-[15px] leading-7 whitespace-pre-wrap">
                        {message.displayedContent || message.content}
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

            {/* Suggested Prompts Overlay (Bottom Center) - Minimalist & Larger */}
            {!isVoiceMode && messages.length === 1 && (
              <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-4xl px-4 z-10">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  {suggestedPrompts.map((prompt, index) => (
                    <button
                      key={index}
                      onClick={() => handleSuggestedPrompt(prompt)}
                      className="px-6 py-5 bg-white/50 hover:bg-white border border-gray-200/60 hover:border-gray-300/80 rounded-2xl text-base font-medium text-gray-700 transition-all hover:scale-[1.01] active:scale-[0.99] text-left group"
                    >
                      <span className="flex items-center justify-between w-full">
                        {prompt}
                        <ArrowLeft className="w-4 h-4 opacity-0 -translate-x-2 group-hover:translate-x-0 group-hover:opacity-50 transition-all rotate-180" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}
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
            {(!isReadyForSample && !isReadOnly && !isVoiceMode) && (
              <div className="max-w-3xl mx-auto">
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
                        title="Actions"
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
    </>
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
