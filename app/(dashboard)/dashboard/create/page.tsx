"use client";

import { useState, useRef, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  Sparkles,
  Send,
  ArrowLeft,
  Mic,
  MicOff,
  Volume2,
  Loader2,
  MessageSquare,
  Bot,
  User,
  CheckCircle,
  ChevronRight,
  Play,
  Pause,
  RotateCcw,
  Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
};

type CreationStep = "objective" | "audience" | "questions" | "tone" | "review";

// Steps removed from UI but kept for logic
const steps: { id: CreationStep; label: string; description: string }[] = [
  { id: "objective", label: "Objective", description: "What do you want to learn?" },
  { id: "audience", label: "Audience", description: "Who are you surveying?" },
  { id: "questions", label: "Questions", description: "Key topics to cover" },
  { id: "tone", label: "Tone", description: "How should AI communicate?" },
  { id: "review", label: "Review", description: "Finalize your survey" },
];

const suggestedPrompts = [
  "I want to understand customer satisfaction with our product",
  "I need feedback on our new mobile app features",
  "I'm researching employee engagement and workplace culture",
  "I want to gather market research for a new product launch",
];

export default function CreateSurveyPage() {
  const router = useRouter();
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "1",
      role: "assistant",
      content: "Hi! I'm here to help you create the perfect survey. Let's start with the basics - what's the main objective of your survey? What do you want to learn from your respondents?",
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [currentStep, setCurrentStep] = useState<CreationStep>("objective");
  const [isVoiceMode, setIsVoiceMode] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [duration, setDuration] = useState(0);
  const [transcribedText, setTranscribedText] = useState("");
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recognitionRef = useRef<any>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (textOverride?: string) => {
    const textToSend = textOverride || input;
    if (!textToSend.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: "user",
      content: textToSend,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setIsLoading(true);

    // Simulate AI response
    await new Promise((resolve) => setTimeout(resolve, 1500));

    const stepResponses: Record<CreationStep, string> = {
      objective: "Great objective! Now let's talk about your target audience. Who will be taking this survey? Consider their demographics, relationship to your product/service, and any specific segments you want to reach.",
      audience: "Perfect! I understand your audience. Now, what are the key topics or questions you want to cover? What specific information do you need from your respondents?",
      questions: "Excellent topics! Now let's set the tone. How would you like the AI to communicate with your respondents? Should it be formal, casual, friendly, or professional?",
      tone: "Great! I have all the information I need. Let me summarize your survey configuration. You can review it and then we'll create your survey!",
      review: "Your survey has been created! You can now share it with your respondents or test it with sample conversations.",
    };

    const nextSteps: Record<CreationStep, CreationStep> = {
      objective: "audience",
      audience: "questions",
      questions: "tone",
      tone: "review",
      review: "review",
    };

    const assistantMessage: Message = {
      id: (Date.now() + 1).toString(),
      role: "assistant",
      content: stepResponses[currentStep],
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, assistantMessage]);
    setCurrentStep(nextSteps[currentStep]);
    setIsLoading(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleSuggestedPrompt = (prompt: string) => {
    setInput(prompt);
  };

  const toggleVoiceMode = () => {
    setIsVoiceMode(!isVoiceMode);
  };

  const toggleRecording = async () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
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
      alert("Could not access microphone. Please ensure you have granted permission.");
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

  const handleVoiceSend = () => {
    if (transcribedText) {
      setInput(transcribedText);
      handleSend(transcribedText); // Pass text directly
      setTranscribedText("");
      setAudioUrl(null);
      audioRef.current = null;
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
    if (isRecording) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const currentStepIndex = steps.findIndex((s) => s.id === currentStep);

  return (
    <div className="h-[calc(100vh-7rem)] flex flex-col max-w-6xl mx-auto">
      {/* Header - SalesX Inspired Design */}
      <div className="bg-white rounded-2xl border border-gray-100 p-6 mb-6">
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

            {/* Voice/Text Toggle */}
            <div className="flex items-center gap-2">
                <button
                    onClick={toggleVoiceMode}
                    className={cn(
                        "flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors",
                        isVoiceMode
                            ? "bg-gray-900 text-white"
                            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
                    )}
                >
                    {isVoiceMode ? <Volume2 className="w-4 h-4" /> : <MessageSquare className="w-4 h-4" />}
                    {isVoiceMode ? "Voice Mode" : "Text Mode"}
                </button>
            </div>
        </div>
        <p className="text-gray-500 mt-3 ml-14 text-sm">AI-powered survey creation assistant</p>
      </div>

      {/* Steps Removed from UI */}

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
                        isRecording
                            ? "bg-red-600 scale-110"
                            : "bg-gray-900 hover:scale-105"
                    )}
                >
                    {isRecording ? (
                        <MicOff className="w-10 h-10 text-white" />
                    ) : (
                        <Mic className="w-10 h-10 text-white" />
                    )}
                </button>
            </div>

            {/* Status Text & Visualizer */}
            <div className="mt-8 text-center space-y-6 w-full max-w-md px-4">
                {isRecording ? (
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
                        
                        {transcribedText && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-left max-h-32 overflow-y-auto">
                                <p className="text-gray-900 text-sm leading-relaxed">{transcribedText}</p>
                            </div>
                        )}
                    </>
                ) : audioUrl ? (
                    <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4">
                        <div className="space-y-2">
                            <h3 className="text-xl font-semibold text-gray-900">Recording Finished</h3>
                            <p className="text-sm text-gray-500">Review your message before sending</p>
                        </div>

                        {/* Audio Player */}
                        <div className="flex items-center justify-center gap-4">
                            <button 
                                onClick={handleVoiceSend}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                                <Check className="w-4 h-4" />
                                Send Message
                            </button>
                            <button 
                                onClick={tooglePlayback}
                                className="p-3 bg-white border border-gray-200 text-gray-900 rounded-xl hover:bg-gray-50 transition-colors"
                                title={isPlaying ? "Pause" : "Play Recording"}
                            >
                                {isPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                            </button>
                            <button 
                                onClick={resetRecording}
                                className="p-3 bg-white border border-gray-200 text-gray-500 rounded-xl hover:bg-gray-50 hover:text-red-600 transition-colors"
                                title="Discard & Retake"
                            >
                                <RotateCcw className="w-5 h-5" />
                            </button>
                        </div>

                        {transcribedText && (
                            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 text-left">
                                <p className="text-xs text-gray-400 font-medium mb-1 uppercase tracking-wider">Transcript</p>
                                <p className="text-gray-900 text-sm leading-relaxed">{transcribedText}</p>
                            </div>
                        )}
                    </div>
                ) : (
                    <p className="text-gray-500 max-w-xs mx-auto">
                        Describe your survey objectives, audience, and questions naturally.
                    </p>
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
          {messages.map((message) => (
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
                <p className="text-sm leading-relaxed whitespace-pre-wrap">{message.content}</p>
              </div>
            </div>
          ))}

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
            <div className="relative bg-white border border-gray-200 rounded-2xl shadow-sm focus-within:ring-2 focus-within:ring-purple-500/10 focus-within:border-purple-500/50 transition-all overflow-hidden">
                <textarea
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Describe your survey..."
                  rows={1}
                  className="w-full pl-4 pr-12 py-3.5 bg-transparent outline-none resize-none text-sm min-h-[52px] max-h-32"
                />
                
                <div className="absolute right-2 bottom-2">
                    <button
                        onClick={() => handleSend()}
                        disabled={!input.trim() || isLoading}
                        className="p-2 bg-gray-900 text-white rounded-xl hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                    >
                        {isLoading ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                            <Send className="w-4 h-4" />
                        )}
                    </button>
                </div>
            </div>
            <p className="text-center text-xs text-gray-400 mt-2">
                Convy AI can make mistakes. Review generated surveys carefully.
            </p>
         </div>
        )}
      </div>

      {/* Preview Section */}
      {currentStep === "review" && (
            <div className="mt-6 bg-white rounded-xl border border-gray-100 p-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
                <div className="flex items-center justify-between mb-6">
                    <div>
                        <h2 className="text-lg font-bold text-gray-900">Survey Preview</h2>
                        <p className="text-sm text-gray-500">Based on your requirements</p>
                    </div>
                    <div className="flex gap-3">
                        <button className="px-4 py-2 text-sm font-medium text-gray-600 hover:bg-gray-50 rounded-lg transition-colors">
                            Regenerate
                        </button>
                        <button
                            onClick={() => router.push("/surveys")}
                            className="flex items-center gap-2 px-6 py-2 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-shadow shadow-lg shadow-gray-200"
                        >
                            <Sparkles className="w-4 h-4" />
                            Create & Publish
                        </button>
                    </div>
                </div>

                <div className="bg-gray-50 rounded-xl p-8 max-w-2xl mx-auto border border-gray-200 shadow-sm">
                    <div className="bg-white rounded-xl p-6 shadow-sm mb-4">
                        <h3 className="font-semibold text-xl text-gray-900 mb-2">Product Feedback Survey</h3>
                        <p className="text-gray-500 text-sm">Help us improve our services by answering a few questions.</p>
                    </div>

                    <div className="space-y-4">
                        {[1, 2, 3].map((i) => (
                            <div key={i} className="bg-white rounded-xl p-4 border border-gray-100">
                                <div className="flex gap-3">
                                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-50 text-blue-600 flex items-center justify-center text-xs font-medium">
                                        {i}
                                    </span>
                                    <div className="space-y-3 flex-1">
                                        <div className="h-4 bg-gray-100 rounded w-3/4" />
                                        <div className="h-8 bg-gray-50 rounded w-full border border-gray-200" />
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
      )}
    </div>
  );
}
