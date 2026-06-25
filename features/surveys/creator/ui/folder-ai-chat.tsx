"use client";

import { useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Sparkles, Send, X,ChevronDown } from "lucide-react";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { MarkdownMessage } from "@/shared/ui/markdown-message";

type FolderWithSurveys = {
    name: string;
    surveys: Array<{ id: string }>;
    stats?: {
        totalSurveys: number;
        totalResponses: number;
        avgCompletion: number;
    }
};

type FolderAIChatProps = {
    folder: FolderWithSurveys;
};

export function FolderAIChat({ folder }: FolderAIChatProps) {
    const [isOpen, setIsOpen] = useState(false);
    const [aiQuery, setAiQuery] = useState("");
    const [aiMessages, setAiMessages] = useState<Array<{ role: 'user' | 'assistant', content: string }>>([
        { role: 'assistant', content: `Hi! I've analyzed your folder "${folder.name}". Ask me anything about your surveys or responses!` }
    ]);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (isOpen) {
            messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        }
    }, [aiMessages, isOpen]);

    const handleSend = () => {
        if (!aiQuery.trim()) return;

        const userMsg = aiQuery;
        setAiMessages(prev => [...prev, { role: 'user', content: userMsg }]);
        setAiQuery("");

        // Mock AI response
        const totalSurveys = folder.surveys?.length || folder.stats?.totalSurveys || 0;
        
        setTimeout(() => {
            setAiMessages(prev => [...prev, {
                role: 'assistant',
                content: `Based on your ${totalSurveys} surveys, I can see that you are making progress. Would you like specific recommendations to improve engagement?`
            }]);
        }, 1000);
    };

    if (typeof document === "undefined") return null;

    return createPortal(
        <div className="fixed bottom-6 right-6 z-[90] flex flex-col items-end gap-4 pointer-events-none">
            {/* Chat Window */}
            <div className={cn(
                "w-80 sm:w-96 bg-white rounded-2xl shadow-2xl border border-gray-200 overflow-hidden transition-all duration-300 origin-bottom-right pointer-events-auto",
                isOpen ? "opacity-100 scale-100 mb-2" : "opacity-0 scale-95 translate-y-4 h-0 mb-0 hidden"
            )}>
                {/* Header */}
                <div className="bg-gray-900 p-4 flex items-center justify-between">
                    <div className="flex items-center gap-2 text-white">
                        <Sparkles className="w-5 h-5" />
                        <span className="font-semibold">AI Assistant</span>
                    </div>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="text-white/80 hover:text-white transition-colors"
                    >
                        <ChevronDown className="w-5 h-5" />
                    </button>
                </div>

                {/* Messages */}
                <div className="h-80 overflow-y-auto p-4 space-y-4 bg-gray-50">
                    {aiMessages.map((msg, i) => (
                        <div key={i} className={cn(
                            "flex gap-2 max-w-[85%]",
                            msg.role === 'user' ? "ml-auto flex-row-reverse" : ""
                        )}>
                            <div className={cn(
                                "w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-1",
                                msg.role === 'assistant' ? "bg-gray-900" : "bg-gray-200"
                            )}>
                                {msg.role === 'assistant' ? 
                                    <Sparkles className="w-4 h-4 text-white" /> : 
                                    <div className="text-gray-700 text-xs font-medium">U</div>
                                }
                            </div>
                            <div className={cn(
                                "p-3 rounded-2xl text-sm shadow-sm",
                                msg.role === 'assistant'
                                    ? "bg-white text-gray-800 rounded-tl-none border border-gray-100 max-w-full overflow-hidden"
                                    : "bg-gray-900 text-white rounded-tr-none"
                            )}>
                                {msg.role === 'assistant' ? (
                                    <MarkdownMessage content={msg.content} />
                                ) : (
                                    msg.content
                                )}
                            </div>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>

                {/* Input */}
                <div className="p-3 bg-white border-t border-gray-100">
                    <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 focus-within:ring-2 focus-within:ring-gray-900/10 focus-within:border-gray-900 transition-all">
                        <input
                            type="text"
                            value={aiQuery}
                            onChange={(e) => setAiQuery(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                            placeholder="Ask about your folder..."
                            className="flex-1 bg-transparent text-sm outline-none min-w-0"
                        />
                        <button 
                            onClick={handleSend}
                            disabled={!aiQuery.trim()}
                            className="p-1.5 bg-gray-900 text-white rounded-lg hover:bg-gray-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            <Send className="w-3.5 h-3.5" />
                        </button>
                    </div>
                </div>
            </div>

            {/* Toggle Button */}
            <button
                onClick={() => setIsOpen(!isOpen)}
                className={cn(
                    "flex items-center justify-center w-14 h-14 rounded-full shadow-xl hover:scale-105 transition-all duration-200 pointer-events-auto bg-gray-900 text-white",
                    isOpen ? "rotate-90" : ""
                )}
            >
                {isOpen ? <X className="w-6 h-6" /> : <Sparkles className="w-6 h-6" />}
            </button>
        </div>,
        document.body
    );
}


