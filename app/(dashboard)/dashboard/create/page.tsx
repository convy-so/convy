"use client";

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  MicOff,
  Loader2,
  MessageSquare,
  User,
  Share2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import toast from "react-hot-toast";
import { useAuth } from "@/components/providers/auth-provider";
import { PublishSurveyModal } from "@/components/surveys/publish-survey-modal";
import { useVoiceWebSocket } from "@/hooks/use-voice-websocket";
import { clientEnv } from "@/lib/env.client";

type CreationStep = "objective" | "audience" | "questions" | "tone" | "review";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  displayedContent?: string; // For typing animation
  isTyping?: boolean;
};

const suggestedPrompts = [
  "I want to understand customer satisfaction with our product",
  "I need feedback on our new mobile app features",
  "I'm researching employee engagement and workplace culture",
  "I want to gather market research for a new product launch",
];

// Typing animation delay in milliseconds per character
const TYPING_DELAY_MS = 15;

export default function CreateSurveyPage() {
  const router = useRouter();
  const { user, isLoading: authLoading } = useAuth();
  const [surveyId, setSurveyId] = useState<string | null>(null);
  const [isInitializing, setIsInitializing] = useState(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [currentStep, setCurrentStep] = useState<CreationStep>("objective");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showPublishModal, setShowPublishModal] = useState(false);

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
          // Add AI message to chat
          const assistantMessage: Message = {
            id: Date.now().toString(),
            role: "assistant",
            content: data.text,
            displayedContent: data.text,
            isTyping: false,
          };
          setMessages(prev => [...prev, assistantMessage]);
      } else if (data.type === "transcription" && data.isFinal) {
          // Add user message to chat for visual consistency
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
    
    // Check if user mentioned completion keywords
    const userMentionedCompletion = recentMessages.some(msg => {
      if (msg.role !== 'user') return false;
      const content = msg.content.toLowerCase();
      return completionKeywords.some(keyword => content.includes(keyword));
    });
    
    // Check if AI confirmed survey is ready
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

  // Typing animation function
  const animateTyping = useCallback((messageId: string, fullContent: string) => {
    let charIndex = 0;
    
    const typeNextChar = () => {
      if (charIndex < fullContent.length) {
        charIndex++;
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, displayedContent: fullContent.slice(0, charIndex) }
              : msg
          )
        );
        typingIntervalRef.current = setTimeout(typeNextChar, TYPING_DELAY_MS);
      } else {
        // Finished typing
        setMessages(prev => 
          prev.map(msg => 
            msg.id === messageId 
              ? { ...msg, isTyping: false, displayedContent: fullContent }
              : msg
          )
        );
      }
    };
    
    typeNextChar();
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

  // Lazy creation state
  const [isCreatingDraft, setIsCreatingDraft] = useState(false);

  // Helper to ensure draft exists before sending message
  const ensureDraftExists = async (): Promise<string | null> => {
    if (surveyId) return surveyId;
    if (isCreatingDraft) return null; // Avoid dual creation
    
    setIsCreatingDraft(true);
    try {
      const response = await fetch("/api/surveys", { 
        method: "POST",
        credentials: "include"
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
        // Handle streaming response - collect all content
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
    } catch (error) {
      console.error("Chat error:", error);
      toast.error("Failed to send message. Please try again.");
      // Remove the user message if there was an error
      setMessages(prev => prev.filter(msg => msg.id !== userMessage.id));
    } finally {
      setIsLoading(false);
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
    <div className="h-[calc(100vh-7rem)] flex flex-col md:flex-row gap-6 max-w-[1600px] mx-auto p-4 overflow-hidden">
      {/* Left Side: Header + Chat */}
      <div className="flex-1 flex flex-col min-w-0 h-full">
        {/* Header - SalesX Inspired Design */}
        <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-4 flex-shrink-0">
        <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
                <Link
                    href="/dashboard"
                    className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                    <ArrowLeft className="w-5 h-5 text-gray-600" />
                </Link>
                <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold text-gray-900">Create New Survey</h1>
                    <span className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-900 border border-gray-200">
                        AI Draft
                    </span>
                </div>
            </div>

            {/* Publish Button (Header) - Replaces Preview Toggle */}
            <div className="flex items-center gap-2">
                 <button
                      onClick={() => setShowPublishModal(true)}
                     disabled={!isReadyToPublish}
                      className={cn(
                          "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all shadow-sm border",
                          isReadyToPublish
                              ? "bg-gray-900 text-white border-transparent hover:bg-gray-800 shadow-md transform hover:-translate-y-0.5"
                              : "bg-gray-50 text-gray-400 border-gray-100 cursor-not-allowed"
                      )}
                  >
                      <Share2 className="w-4 h-4" />
                      Publish Survey
                  </button>

                <button
                    onClick={toggleVoiceMode}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all shadow-sm",
                        isVoiceMode
                            ? "bg-red-50 text-red-600 border border-red-100 animate-pulse"
                            : "bg-indigo-600 text-white hover:bg-indigo-700 border border-transparent shadow-md hover:shadow-lg hover:-translate-y-0.5"
                    )}
                >
                    {isVoiceMode ? <MicOff className="w-4 h-4" /> : <Mic className="w-4 h-4" />}
                    {isVoiceMode ? "Stop Voice Mode" : "Design with Voice"}
                </button>
            </div>
        </div>
        <p className="text-gray-500 mt-3 ml-14 text-sm">AI-powered survey creation assistant</p>
      </div>

      {/* Chat Container */}
      <div className="flex-1 bg-white rounded-xl border border-gray-100 flex flex-col overflow-hidden relative">
        {/* Voice Mode Overlay */}
        {isVoiceMode && (
          <div className="absolute inset-0 z-20 bg-white/95 flex flex-col items-center justify-center backdrop-blur-sm transition-all animate-in fade-in duration-300">
             <div className="relative">
                {/* Visualizer Ring */}
                {isRecording && (
                    <div className="absolute inset-0 rounded-full border-4 border-gray-900/20 animate-ping" />
                )}
                
                {/* Main Mic Button */}
                <button
                    onClick={toggleRecording}
                    className={cn(
                        "relative w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-xl",
                        voiceWs.isRecording
                            ? "bg-red-600 scale-110"
                            : "bg-gray-900 hover:scale-105"
                    )}
                >
                    {voiceWs.isRecording ? (
                        <MicOff className="w-10 h-10 text-white" />
                    ) : (
                        <Mic className="w-10 h-10 text-white" />
                    )}
                </button>
            </div>

            {/* Status Text & Visualizer */}
            <div className="mt-8 text-center space-y-6 w-full max-w-md px-4">
                {voiceWs.isRecording ? (
                    <>
                        <div className="space-y-2">
                             <h3 className="text-3xl font-bold text-gray-900 font-mono tracking-wider">
                                {formatTime(duration)}
                            </h3>
                            <p className="text-gray-500 font-medium animate-pulse">
                                Listening...
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-1.5 h-12 justify-center">
                            {[...Array(8)].map((_, i) => (
                                <div
                                    key={i}
                                    className="w-1.5 bg-gray-900 rounded-full animate-bounce"
                                    style={{
                                        height: `${20 + Math.random() * 40}px`,
                                        animationDelay: `${i * 0.1}s`,
                                        animationDuration: '0.8s'
                                    }}
                                />
                            ))}
                        </div>
                        
                        {(voiceWs.transcription || voiceWs.interimTranscription) && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-left max-h-32 overflow-y-auto">
                                <p className="text-gray-900 text-sm leading-relaxed">
                                    {voiceWs.transcription}
                                    <span className="text-gray-400">{voiceWs.interimTranscription}</span>
                                </p>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="space-y-4">
                        <h3 className="text-xl font-semibold text-gray-900">
                            {voiceWs.status === "connected" ? "Voice Assistant Ready" : "Connecting..."}
                        </h3>
                        <p className="text-sm text-gray-500">
                            {voiceWs.status === "connected" 
                                ? "Click the microphone to start talking" 
                                : "Please wait while we establish a secure connection"}
                        </p>
                    </div>
                )}
            </div>

            <button
                onClick={toggleVoiceMode}
                className="absolute bottom-8 text-sm text-gray-500 hover:text-gray-900 font-medium px-4 py-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
                Switch to Text Mode
            </button>
          </div>
        )}

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {messages.map((message) => {
            // console.log("Rendering message:", message); // Debug log
            return (
            <div
              key={message.id}
              className={cn(
                "flex gap-3",
                message.role === "user" ? "flex-row-reverse" : ""
              )}
            >
              <div
                className={cn(
                  "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0",
                  message.role === "assistant"
                    ? "bg-gray-900"
                    : "bg-gray-200"
                )}
              >
                {message.role === "assistant" ? (
                  <Sparkles className="w-4 h-4 text-white" />
                ) : (
                  <User className="w-4 h-4 text-gray-700" />
                )}
              </div>

              <div
                className={cn(
                  "max-w-[80%] rounded-2xl px-5 py-3.5 shadow-sm",
                  message.role === "assistant"
                    ? "bg-white border border-gray-100 text-gray-800"
                    : "bg-gray-900 text-white"
                )}
              >
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.displayedContent || message.content}
                  {message.isTyping && message.role === "assistant" && (
                    <span className="inline-block w-0.5 h-4 bg-gray-900 ml-0.5 animate-pulse" />
                  )}
                </p>
              </div>
            </div>
          )})}

          {isLoading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-xl bg-gray-900 flex items-center justify-center">
                <Sparkles className="w-4 h-4 text-white" />
              </div>
              <div className="bg-white border border-gray-100 rounded-2xl px-4 py-3 shadow-sm">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                  <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Suggested Prompts */}
        {!isVoiceMode && messages.length === 1 && (
          <div className="px-6 pb-4">
            <p className="text-xs text-gray-500 mb-2 font-medium uppercase tracking-wider">Suggested prompts</p>
            <div className="flex flex-wrap gap-2">
              {suggestedPrompts.map((prompt, index) => (
                <button
                  key={index}
                  onClick={() => handleSuggestedPrompt(prompt)}
                  className="px-3 py-2 bg-white hover:bg-gray-50 border border-gray-200 rounded-xl text-sm text-gray-600 transition-all hover:border-gray-300 hover:shadow-sm text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Input Area */}
        {!isVoiceMode && (
         <div className="border-t border-gray-100 p-4 bg-gray-50/50">
            <form onSubmit={handleSubmit} className="relative bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-purple-500/10 focus-within:border-purple-500/50 transition-all overflow-hidden">
                <textarea
                  value={input}
                  onChange={handleInputChange}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your survey..."
                  rows={1}
                  className="w-full pl-4 pr-12 py-3.5 bg-transparent outline-none resize-none text-sm min-h-[52px] max-h-32"
                />
                
                <div className="absolute right-2 bottom-2">
                    <button
                        type="submit"
                        disabled={!input?.trim() || isLoading || !!authError}
                        className="p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </form>
            <p className="text-center text-xs text-gray-400 mt-2">
                Convy AI can make mistakes. Review generated surveys carefully.
            </p>
         </div>
        )}
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
    </div>
  );
}
