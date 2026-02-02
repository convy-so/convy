"use client";

import { useState, useRef, useEffect, useCallback, useMemo, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  MicOff,
  Loader2,
  User,
  Share2,
  Paperclip,
  Play,
  CheckCircle2,
  Globe,
  ChevronDown,
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

const suggestedPrompts = [
  "I want to understand customer satisfaction with our product",
  "I need feedback on our new mobile app features",
  "I'm researching employee engagement and workplace culture",
  "I want to gather market research for a new product launch",
];

const TYPING_DELAY_MS = 15;

function CreateSurveyContent() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const searchParams = useSearchParams();
  const idFromUrl = searchParams.get("id");
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [isVoiceMode, setIsVoiceMode] = useState(false);
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
  const [language, setLanguage] = useState<"en" | "fr" | "de">("en");
  const [isLanguageOpen, setIsLanguageOpen] = useState(false);

  const toggleLanguage = () => setIsLanguageOpen(!isLanguageOpen);
  
  const updateLanguage = async (newLang: "en" | "fr" | "de") => {
    setLanguage(newLang);
    setIsLanguageOpen(false);
    
    // If survey exists, update it
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
        toast.error("Failed to save language preference");
      }
    }
  };

  // WebSocket Voice Hook
  const voiceWs = useVoiceWebSocket({
    url: `${clientEnv.NEXT_PUBLIC_WEBSOCKET_URL}/voice/survey-creation`,
    onReady: () => {
      if (surveyId) {
        voiceWs.sendJson({ type: "set_survey_id", surveyId });
      }
    },
    onMessage: (data) => {
      if (data.type === "update_extracted_data") {
        setExtractedData(data.extractedData);
        setCollectedInfo(data.collectedInfo);
      } else if (data.type === "audio_sent" || data.type === "text_response") {
          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: data.text,
            displayedContent: data.text,
            isTyping: false,
          };
          setMessages(prev => [...prev, assistantMessage]);
      } else if (data.type === "transcription" && data.isFinal) {
          const userMessage: Message = {
            id: Date.now().toString(),
            role: "user",
            content: data.text,
            displayedContent: data.text,
            isTyping: false,
          };
          setMessages(prev => [...prev, userMessage]);
      }
    }
  });


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
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  
  const [extractedData, setExtractedData] = useState<any>(null);
  const [collectedInfo, setCollectedInfo] = useState<any>(null);

  // Detect if all required info has been collected for sample conversations
  const isReadyForSample = useMemo(() => {
    if (!surveyId || !collectedInfo) return false;
    
    // Check ALL required fields are truly collected based on collectedInfo flags
    const allRequiredFlagsCollected = (
      collectedInfo.objective &&
      collectedInfo.targetAudience &&
      collectedInfo.scope &&
      collectedInfo.successCriteria &&
      collectedInfo.constraints &&
      collectedInfo.subjectDefined &&
      collectedInfo.domainIdentified
    );
    
    const hasTone = collectedInfo.tone === true;
    
    if (!allRequiredFlagsCollected || !extractedData) {
      console.log('[isReadyForSample] Missing required flags or extractedData', {
        allRequiredFlagsCollected,
        hasExtractedData: !!extractedData,
        collectedInfo
      });
      return false;
    }
    
    const hasObjective = extractedData.objective?.goal && 
      typeof extractedData.objective.goal === 'string' && 
      extractedData.objective.goal.length > 10;
    
    const hasAudience = extractedData.targetAudience?.description && 
      typeof extractedData.targetAudience.description === 'string' && 
      extractedData.targetAudience.description.length > 5;
    
    const hasScope = extractedData.scope?.mainTopics && 
      Array.isArray(extractedData.scope.mainTopics) && 
      extractedData.scope.mainTopics.length > 0;
    
    const hasSuccessCriteria = extractedData.successCriteria?.insightTypes && 
      Array.isArray(extractedData.successCriteria.insightTypes) && 
      extractedData.successCriteria.insightTypes.length > 0;
    
    // Validate domain is identified
    const hasDomain = typeof extractedData.domainId === 'number' && 
      extractedData.domainId >= 1 && 
      extractedData.domainId <= 10;
    
    // Validate tone has been set (even if just default)
    const hasToneData = extractedData.tone && 
      typeof extractedData.tone === 'string' &&
      ['formal', 'casual', 'playful', 'empathetic'].includes(extractedData.tone);
    
    const isReady = hasObjective && hasAudience && hasScope && hasSuccessCriteria && hasDomain && hasToneData;
    
    console.log('[isReadyForSample] Validation results:', {
      isReady,
      hasObjective,
      hasAudience,
      hasScope,
      hasSuccessCriteria,
      hasDomain,
      hasToneData,
      hasTone,
      extractedDataKeys: extractedData ? Object.keys(extractedData) : []
    });
    
    // All validations must pass
    return isReady;
  }, [surveyId, collectedInfo, extractedData]);

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
      setAuthError("Please sign in to create surveys");
      setIsInitializing(false);
      return;
    }
    
    if (!user.emailVerified) {
      setAuthError("Please verify your email before creating surveys");
      setIsInitializing(false);
      return;
    }
    
    setAuthError(null);
    setIsInitializing(false); // Just finish init without creating draft
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
            
            // Read-only if survey is NOT in "creating" status
            if (status && status !== "creating") {
              setIsReadOnly(true);
            } else {
              setIsReadOnly(false);
            }
          }
        } catch (error) {
          console.error("Failed to load survey data:", error);
          toast.error("Failed to load survey conversation");
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
        body: JSON.stringify({ language }),
      });
      
      if (response.status === 401) {
        setAuthError("Please sign in to create surveys");
        return null;
      }
      
      if (!response.ok) {
        const errorText = await response.text();
        if (errorText === "EMAIL_NOT_VERIFIED") {
          setAuthError("Please verify your email before creating surveys");
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
      toast.error("Failed to initialize survey");
      console.error(error);
      setAuthError("Failed to initialize survey");
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
        setAuthError("Please sign in to continue");
        return;
      }

      if (!response.ok) {
        const errorText = await response.text();
        if (errorText === "EMAIL_NOT_VERIFIED") {
          setAuthError("Please verify your email to continue");
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
      toast.error("Failed to send message. Please try again.");
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
        const res = await fetch(`/api/surveys/${surveyId}/create`);
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
    if (voiceWs.isRecording) {
      voiceWs.stopRecording();
    } else {
      voiceWs.startRecording();
    }
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
      toast.error("Microphone access denied");
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
        toast.error("Failed to send voice message");
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
        toast.error("Failed to finalize survey. Please try again.");
        setIsFinalizing(false);
        return;
      }
      
      const data = await response.json();
      console.log("Survey finalized:", data);
      toast.success("Survey finalized! Loading sample conversations...");
      
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
    <div className="h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6 max-w-[1600px] mx-auto p-4 overflow-hidden">
      <div className="flex-1 bg-white rounded-3xl border border-gray-200 flex flex-col overflow-hidden relative">
        
        {/* Integrated Header */}
        <div className="border-b border-gray-100 p-4 flex items-center justify-between bg-white z-10">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard"
                    className="p-2 rounded-xl hover:bg-gray-50 transition-colors text-gray-500 hover:text-gray-900"
                >
                    <ArrowLeft className="w-5 h-5" />
                </Link>
                <div className="flex items-center gap-3">
                    <h1 className="text-lg font-bold text-gray-900">
                      {isReadOnly ? "View Creation Conversation" : "Create New Survey"}
                    </h1>
                    <span className={cn(
                      "px-2 py-0.5 rounded-md text-xs font-medium border border-gray-200 bg-white text-gray-500",
                      isReadOnly ? "opacity-80" : "" 
                    )}>
                        {isReadOnly ? "Read Only" : "AI DRAFT"}
                    </span>
                    {surveyStatus && isReadOnly && (
                        <span className="text-xs text-gray-400 font-medium px-2 py-0.5 bg-gray-50 rounded-md capitalize">
                             {surveyStatus.replace(/_/g, " ")}
                        </span>
                    )}
                </div>
            </div>

            {/* Actions: Play/Publish & Voice */}
            {!isReadOnly && (
            <div className="flex items-center gap-2">
                 {/* Language Selector */}
                <div className="relative">
                  <button
                    onClick={toggleLanguage}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors text-sm font-medium border border-transparent hover:border-gray-200"
                  >
                    <Globe className="w-4 h-4" />
                    <span className="uppercase">{language}</span>
                    <ChevronDown className={cn("w-3 h-3 transition-transform", isLanguageOpen ? "rotate-180" : "")} />
                  </button>
                  
                  {isLanguageOpen && (
                    <div className="absolute top-full mt-1 right-0 w-32 bg-white rounded-xl shadow-lg border border-gray-100 py-1 z-50 animate-in fade-in zoom-in-95 duration-200">
                      {(["en", "fr", "de"] as const).map((lang) => (
                        <button
                          key={lang}
                          onClick={() => updateLanguage(lang)}
                          className={cn(
                            "w-full px-4 py-2 text-left text-sm hover:bg-gray-50 transition-colors flex items-center justify-between",
                            language === lang ? "text-indigo-600 font-medium bg-indigo-50/50" : "text-gray-600"
                          )}
                        >
                           <span className="capitalize">
                             {lang === "en" ? "English" : lang === "fr" ? "Français" : "Deutsch"}
                           </span>
                           {language === lang && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600" />}
                        </button>
                      ))}
                    </div>
                  )}
                </div>

                <div className="h-6 w-px bg-gray-200 mx-1" />

                 <button
                    onClick={() => setShowPublishModal(true)}
                    disabled={!isReadyForSample || !surveyId}
                    className="flex items-center gap-2 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors text-sm font-medium disabled:opacity-50"
                    title="Publish Survey"
                >
                    <Share2 className="w-4 h-4" />
                    <span className="hidden sm:inline">Publish</span>
                </button>

                <div className="h-6 w-px bg-gray-200 mx-1" />

                <button
                    onClick={toggleVoiceMode}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all border",
                        isVoiceMode
                            ? "bg-red-50 text-red-600 border-red-100"
                            : "bg-gray-900 text-white border-transparent hover:bg-gray-800"
                    )}
                >
                    {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isVoiceMode ? "Stop Voice" : "Voice Mode"}
                </button>
            </div>
            )}
        </div>

        {/* Read-Only Banner (Integrated) */}
        {isReadOnly && (
           <div className="bg-blue-50/50 border-b border-blue-100 px-4 py-2 flex items-center justify-center gap-2 text-sm text-blue-800">
              <Sparkles className="w-4 h-4 text-blue-600" />
              <span>You are viewing a completed conversation.</span>
              <Link href={`/dashboard/surveys/${surveyId}`} className="font-medium hover:underline">
                  Go to Survey Details &rarr;
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
                            <p>Voice Conversation Started</p>
                            <p className="text-xs mt-1">Speak naturally to create your survey</p>
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
                                   {voiceWs.interimTranscription || "Listening..."}
                                   {isRecording && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full ml-1 animate-pulse"/>}
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
                                    Speaking...
                                    <div className="flex gap-1 mt-1 h-3 items-end">
                                        <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite]" style={{height: '40%'}} />
                                        <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.1s]" style={{height: '80%'}} />
                                        <div className="w-1 bg-indigo-400 rounded-full animate-[music-bar_0.5s_ease-in-out_infinite_0.2s]" style={{height: '50%'}} />
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
                     )}/>

                     <div className="relative z-10 flex flex-col items-center gap-8">
                        {/* Status Label */}
                        <div className={cn(
                            "px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-widest transition-all",
                            voiceWs.isPlaying ? "bg-indigo-100 text-indigo-700" :
                            voiceWs.isRecording ? "bg-red-100 text-red-700 animate-pulse" :
                            "bg-gray-100 text-gray-500"
                        )}>
                            {voiceWs.isPlaying ? "AI Speaking" : 
                             voiceWs.isRecording ? "Listening" : "Ready"}
                        </div>

                        {/* Main Interaction Button */}
                        <div className="relative group">
                            {/* Ripple Effects during active states */}
                            {(voiceWs.isRecording || voiceWs.isPlaying) && (
                                <>
                                    <div className={cn("absolute inset-0 rounded-full opacity-20 animate-ping", 
                                        voiceWs.isRecording ? "bg-red-500 duration-1000" : "bg-indigo-500 duration-[2000ms]")} />
                                    <div className={cn("absolute inset-[-12px] rounded-full opacity-10 animate-pulse", 
                                        voiceWs.isRecording ? "bg-red-500" : "bg-indigo-500")} />
                                </>
                            )}
                            
                            <button
                                onClick={toggleRecording}
                                className={cn(
                                "relative w-32 h-32 rounded-full flex flex-col items-center justify-center transition-all duration-300 border-4 shadow-2xl z-20",
                                voiceWs.isRecording
                                    ? "bg-slate-900 border-red-500 text-white scale-110"
                                    : voiceWs.isPlaying
                                    ? "bg-white border-indigo-200 text-indigo-600 scale-105"
                                    : "bg-white border-gray-100 text-slate-900 hover:scale-105 hover:bg-slate-50 hover:border-slate-200"
                                )}
                            >
                                <div className="flex flex-col items-center gap-2">
                                    {voiceWs.isRecording ? (
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
                                            <span className="text-xs font-medium text-red-400">Tap to Pause</span>
                                        </>
                                    ) : voiceWs.isPlaying ? (
                                         <>
                                            <Sparkles className="w-10 h-10 animate-spin-slow" />
                                            <span className="text-xs font-medium">Listening...</span>
                                         </>
                                    ) : (
                                        <>
                                            <Mic className="w-10 h-10 opacity-80" />
                                            <span className="text-xs font-medium text-gray-400">Tap to Speak</span>
                                        </>
                                    )}
                                </div>
                            </button>
                        </div>

                        {/* Text Hint */}
                        <div className="text-center space-y-2 max-w-[200px]">
                            <h3 className="font-bold text-gray-900">
                                {voiceWs.isRecording ? "I'm listening..." : 
                                 voiceWs.isPlaying ? "Speaking..." : 
                                 "Voice Mode Active"}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                {voiceWs.isRecording ? "Speak naturally. I'll respond when you stop." :
                                 voiceWs.isPlaying ? "Listening to response..." :
                                 "Click the microphone to start the conversation."}
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
                      Exit Voice Mode
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
                  <h2 className="text-2xl font-bold text-gray-900 mb-2">Excellent! We're Ready.</h2>
                  <p className="text-gray-500 max-w-md text-center mb-8">
                     I have all the information I need. Let's switch back to view the summary and start testing.
                  </p>
                  <button
                    onClick={toggleVoiceMode}
                    className="px-8 py-3 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all hover:-translate-y-0.5"
                  >
                    View Summary & Test
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
            
            {/* Suggested Prompts Overlay (Bottom Center) */}
            {!isVoiceMode && messages.length === 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-10">
                   <div className="flex flex-wrap gap-2 justify-center">
                      {suggestedPrompts.map((prompt, index) => (
                        <button
                          key={index}
                          onClick={() => handleSuggestedPrompt(prompt)}
                          className="px-4 py-2 bg-white/90 backdrop-blur-sm hover:bg-white border border-gray-200 rounded-full text-sm text-gray-600 transition-all hover:border-gray-300"
                        >
                          {prompt}
                        </button>
                      ))}
                   </div>
                </div>
            )}
        </div>

        <div className="bg-slate-50/30 p-4 pb-6 relative z-20">
             
             {isReadyForSample && surveyId && !isVoiceMode && (
                <div className="max-w-3xl mx-auto mb-4 animate-in slide-in-from-bottom-4 fade-in">
                    <div className="bg-emerald-50/50 border border-emerald-100 rounded-2xl p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-emerald-100 rounded-full flex items-center justify-center">
                                <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                            </div>
                            <div>
                                <h3 className="font-bold text-gray-900">Ready to Test!</h3>
                                <p className="text-sm text-gray-500">I have everything I need to draft your survey.</p>
                            </div>
                        </div>
                        <button
                            onClick={handleGoToSampleConversations}
                            disabled={isFinalizing}
                            className="flex items-center gap-2 px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-semibold transition-all hover:-translate-y-0.5"
                        >
                            {isFinalizing ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4 fill-current" />}
                            {isFinalizing ? "Finalizing..." : "Start Testing"}
                        </button>
                    </div>
                </div>
             )}

             {/* Main Input */}
             {(!isReadyForSample && !isReadOnly && !isVoiceMode) && (
              <div className="max-w-3xl mx-auto">
                <form onSubmit={handleSubmit} className="relative group">
                    {/* Removed gradient background */}
                    <div className="relative bg-white border border-gray-200 rounded-2xl group-focus-within:border-gray-400 transition-all flex items-end overflow-hidden">
                        <button
                            type="button"
                            onClick={handleOpenMediaModal}
                            disabled={isLoading || isCreatingDraft}
                            className="p-3 mb-1 ml-1 text-gray-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-xl transition-colors"
                            title="Add Context/Media"
                        >
                            <Paperclip className="w-5 h-5" />
                        </button>
                        
                        <textarea
                          value={input}
                          onChange={handleInputChange}
                          onKeyDown={handleKeyDown}
                          placeholder="Describe your survey goals..."
                          rows={1}
                          className="flex-1 py-4 px-2 bg-transparent outline-none resize-none text-base text-gray-800 placeholder:text-gray-400 min-h-[56px] max-h-40"
                          style={{ minHeight: "56px" }}
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
                    <p className="text-sm text-gray-400 italic">This conversation is read-only.</p>
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
        initialTitle={extractedData?.title || "Untitled Survey"}
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
