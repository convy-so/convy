"use client";

import { useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
    ArrowLeft,
    User,
    ThumbsUp,
    ThumbsDown,
    Minus,
    Bot,
    Download
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock response data
const getResponseData = (surveyId: string, responseId: string) => ({
    id: responseId,
    surveyId,
    surveyTitle: "Customer Satisfaction Survey",
    participantId: "p1",
    startedAt: "2024-01-15 14:25:00",
    completedAt: "2024-01-15 14:32:00",
    duration: "3:45",
    status: "completed",
    sentiment: "positive",
    sentimentScore: 0.78,
    keyInsights: [
        "Happy with product quality",
        "Appreciates fast customer support",
        "Would like faster shipping options",
    ],
    summary: "The participant expressed overall satisfaction with the product and service. They particularly praised the product quality and customer support responsiveness. The main suggestion was to improve shipping times.",
    conversation: [
        {
            role: "assistant",
            content: "Hi there! Thanks for taking the time to share your feedback. First, I'd like to know - how would you rate your overall experience with our product?",
            timestamp: "14:25:12",
        },
        {
            role: "user",
            content: "I'd say it's been really positive overall. The product quality is great and it does exactly what I needed it to do.",
            timestamp: "14:25:45",
            sentiment: "positive",
        },
        {
            role: "assistant",
            content: "That's wonderful to hear! We put a lot of effort into our product quality. What specific aspects of the product impressed you the most?",
            timestamp: "14:26:02",
        },
        {
            role: "user",
            content: "The build quality is excellent, and it feels very premium. Also, the features are intuitive and easy to use without having to read a manual.",
            timestamp: "14:26:38",
            sentiment: "positive",
        },
        {
            role: "assistant",
            content: "We're glad the intuitive design worked well for you! Now, have you had any interactions with our customer support team? If so, how was that experience?",
            timestamp: "14:27:05",
        },
        {
            role: "user",
            content: "Yes, I had a question about setup and they got back to me within an hour. Very impressed with the response time.",
            timestamp: "14:27:42",
            sentiment: "positive",
        },
        {
            role: "assistant",
            content: "Great to know our support team was helpful! Is there anything about your experience that could have been better or any suggestions for improvement?",
            timestamp: "14:28:10",
        },
        {
            role: "user",
            content: "The only thing I'd mention is that shipping took a bit longer than expected. Would be nice to have faster shipping options, even if it costs more.",
            timestamp: "14:28:52",
            sentiment: "neutral",
        },
        {
            role: "assistant",
            content: "That's valuable feedback about shipping - we're always looking to improve delivery times. Finally, how likely would you be to recommend our product to a friend or colleague?",
            timestamp: "14:29:20",
        },
        {
            role: "user",
            content: "I've already recommended it to two friends! Definitely a 9 out of 10 for me.",
            timestamp: "14:29:55",
            sentiment: "positive",
        },
        {
            role: "assistant",
            content: "That's fantastic! Thank you so much for your feedback and for recommending us. We truly appreciate your support. Have a great day!",
            timestamp: "14:30:15",
        },
    ],
});

export default function ResponseDetailPage() {
    const params = useParams();
    const surveyId = params.surveyId as string;
    const responseId = params.responseId as string;
    const response = getResponseData(surveyId, responseId);

    const [expandedMessages, setExpandedMessages] = useState<Set<number>>(new Set());

    const toggleMessage = (index: number) => {
        const newSet = new Set(expandedMessages);
        if (newSet.has(index)) {
            newSet.delete(index);
        } else {
            newSet.add(index);
        }
        setExpandedMessages(newSet);
    };

    const getSentimentIcon = (sentiment: string | null) => {
        switch (sentiment) {
            case "positive":
                return <ThumbsUp className="w-3.5 h-3.5 text-emerald-500" />;
            case "negative":
                return <ThumbsDown className="w-3.5 h-3.5 text-red-500" />;
            case "neutral":
                return <Minus className="w-3.5 h-3.5 text-amber-500" />;
            default:
                return null;
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            {/* Header */}
            <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                    <Link
                        href={`/dashboard/surveys/${surveyId}`}
                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors mt-1"
                    >
                        <ArrowLeft className="w-5 h-5 text-gray-600" />
                    </Link>
                    <div>
                        <p className="text-sm text-gray-500 mb-1">
                            Response for{" "}
                            <Link href={`/dashboard/surveys/${surveyId}`} className="text-gray-700 hover:underline">
                                {response.surveyTitle}
                            </Link>
                        </p>
                        <h1 className="text-2xl font-bold text-gray-900">Participant {response.participantId}</h1>
                    </div>
                </div>

                <button className="flex items-center gap-2 px-4 py-2 border border-gray-200 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-50 transition-colors">
                    <Download className="w-4 h-4" />
                    Export
                </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Conversation - ChatGPT Style */}
                <div className="lg:col-span-2 space-y-4">
                    <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
                        <div className="px-5 py-4 border-b border-gray-100 flex items-center justify-between">
                            <h2 className="font-semibold text-gray-900">Conversation Transcript</h2>
                            <span className="text-xs text-gray-500">{response.conversation.length} messages</span>
                        </div>
                        <div className="max-h-[600px] overflow-y-auto">
                            {response.conversation.map((message, index) => (
                                <div
                                    key={index}
                                    className={cn(
                                        "px-6 py-5",
                                        message.role === "assistant" ? "bg-white" : "bg-gray-50"
                                    )}
                                >
                                    <div className="max-w-3xl mx-auto flex gap-4">
                                        {/* Avatar */}
                                        <div className={cn(
                                            "w-9 h-9 rounded-lg flex items-center justify-center flex-shrink-0",
                                            message.role === "assistant"
                                                ? "bg-gradient-to-br from-teal-500 to-emerald-500"
                                                : "bg-gray-900"
                                        )}>
                                            {message.role === "assistant" ? (
                                                <Bot className="w-5 h-5 text-white" />
                                            ) : (
                                                <User className="w-5 h-5 text-white" />
                                            )}
                                        </div>

                                        {/* Message Content */}
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 mb-1">
                                                <span className="font-semibold text-sm text-gray-900">
                                                    {message.role === "assistant" ? "Convy AI" : "Participant"}
                                                </span>
                                                <span className="text-xs text-gray-400">{message.timestamp}</span>
                                                {message.role === "user" && (message as any).sentiment && (
                                                    <span className="flex items-center gap-1 ml-auto">
                                                        {getSentimentIcon((message as any).sentiment)}
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-gray-700 text-sm leading-relaxed">
                                                {message.content}
                                            </p>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Sidebar */}
                <div className="space-y-4">
                    {/* Response Info */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                        <h3 className="font-semibold text-gray-900 mb-4">Response Details</h3>
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Status</span>
                                <span className={cn(
                                    "px-2 py-0.5 rounded-full text-xs font-medium capitalize",
                                    response.status === "completed" && "bg-emerald-50 text-emerald-700",
                                    response.status === "abandoned" && "bg-red-50 text-red-700"
                                )}>
                                    {response.status}
                                </span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Duration</span>
                                <span className="text-sm font-medium text-gray-900">{response.duration}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Started</span>
                                <span className="text-sm text-gray-900">{response.startedAt}</span>
                            </div>
                            <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-500">Completed</span>
                                <span className="text-sm text-gray-900">{response.completedAt}</span>
                            </div>
                        </div>
                    </div>

                    {/* Sentiment Analysis */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                        <h3 className="font-semibold text-gray-900 mb-4">Sentiment Analysis</h3>
                        <div className="text-center mb-4">
                            <div className={cn(
                                "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-medium capitalize",
                                response.sentiment === "positive" && "bg-emerald-50 text-emerald-700",
                                response.sentiment === "neutral" && "bg-amber-50 text-amber-700",
                                response.sentiment === "negative" && "bg-red-50 text-red-700"
                            )}>
                                {getSentimentIcon(response.sentiment)}
                                {response.sentiment}
                            </div>
                            <p className="text-sm text-gray-500 mt-2">Score: {(response.sentimentScore * 100).toFixed(0)}%</p>
                        </div>
                        <div className="h-3 bg-gradient-to-r from-red-400 via-amber-400 to-emerald-400 rounded-full relative">
                            <div
                                className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white border-2 border-gray-900 rounded-full"
                                style={{ left: `calc(${response.sentimentScore * 100}% - 8px)` }}
                            />
                        </div>
                    </div>

                    {/* Key Insights */}
                    <div className="bg-white rounded-xl border border-gray-100 p-5">
                        <h3 className="font-semibold text-gray-900 mb-4">Key Insights</h3>
                        <ul className="space-y-2">
                            {response.keyInsights.map((insight, index) => (
                                <li key={index} className="flex items-start gap-2 text-sm">
                                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500 mt-1.5 flex-shrink-0" />
                                    <span className="text-gray-700">{insight}</span>
                                </li>
                            ))}
                        </ul>
                    </div>

                    {/* AI Summary */}
                    <div className="bg-gradient-to-br from-purple-50 to-blue-50 rounded-xl border border-purple-100 p-5">
                        <h3 className="font-semibold text-gray-900 mb-2">AI Summary</h3>
                        <p className="text-sm text-gray-700 leading-relaxed">{response.summary}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
