"use client";

import Link from "next/link";
import {
    MessageSquare,
    Mic,
    MoreVertical,
    Users,
    Clock,
    BarChart3,
    Eye,
    Edit,
    Trash2,
    Copy,
    Share2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useState } from "react";

type SurveyStatus = "active" | "draft" | "completed" | "paused" | "creating";

interface SurveyCardProps {
    id: string;
    title: string;
    status: SurveyStatus;
    responses: number;
    maxResponses: number;
    lastActivity: string;
    createdAt: string;
    isVoice?: boolean;
    projectName?: string;
    onDelete?: (id: string) => void;
    onDuplicate?: (id: string) => void;
}

const statusConfig: Record<SurveyStatus, { label: string; color: string; bgColor: string }> = {
    active: { label: "Active", color: "text-emerald-700", bgColor: "bg-emerald-50 border-emerald-200" },
    draft: { label: "Draft", color: "text-amber-700", bgColor: "bg-amber-50 border-amber-200" },
    completed: { label: "Completed", color: "text-gray-700", bgColor: "bg-gray-50 border-gray-200" },
    paused: { label: "Paused", color: "text-orange-700", bgColor: "bg-orange-50 border-orange-200" },
    creating: { label: "Creating", color: "text-blue-700", bgColor: "bg-blue-50 border-blue-200" },
};

export function SurveyCard({
    id,
    title,
    status,
    responses,
    maxResponses,
    lastActivity,
    createdAt,
    isVoice = false,
    projectName,
    onDelete,
    onDuplicate,
}: SurveyCardProps) {
    const [showMenu, setShowMenu] = useState(false);
    const statusStyle = statusConfig[status];
    const progress = maxResponses > 0 ? (responses / maxResponses) * 100 : 0;

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-5 hover:shadow-lg hover:border-gray-200 transition-all duration-300 group relative">
            {/* Header */}
            <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    {/* Type Icon */}
                    <div className={cn(
                        "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
                        isVoice
                            ? "bg-gradient-to-br from-purple-500 to-pink-500 text-white"
                            : "bg-gradient-to-br from-blue-500 to-cyan-500 text-white"
                    )}>
                        {isVoice ? <Mic className="w-5 h-5" /> : <MessageSquare className="w-5 h-5" />}
                    </div>

                    <div className="min-w-0 flex-1">
                        <Link
                            href={`/surveys/${id}`}
                            className="text-base font-semibold text-gray-900 hover:text-blue-600 transition-colors truncate block"
                        >
                            {title}
                        </Link>
                        {projectName && (
                            <p className="text-xs text-gray-400 truncate">in {projectName}</p>
                        )}
                    </div>
                </div>

                {/* Status Badge & Menu */}
                <div className="flex items-center gap-2 flex-shrink-0">
                    <span className={cn(
                        "px-2.5 py-1 rounded-full text-xs font-medium border",
                        statusStyle.bgColor,
                        statusStyle.color
                    )}>
                        {statusStyle.label}
                    </span>

                    <div className="relative">
                        <button
                            onClick={() => setShowMenu(!showMenu)}
                            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
                        >
                            <MoreVertical className="w-4 h-4" />
                        </button>

                        {showMenu && (
                            <>
                                <div
                                    className="fixed inset-0 z-40"
                                    onClick={() => setShowMenu(false)}
                                />
                                <div className="absolute right-0 top-full mt-1 w-44 bg-white rounded-xl border border-gray-200 shadow-xl z-50 py-1 animate-in fade-in slide-in-from-top-2 duration-150">
                                    <Link
                                        href={`/surveys/${id}`}
                                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        onClick={() => setShowMenu(false)}
                                    >
                                        <Eye className="w-4 h-4" />
                                        View Details
                                    </Link>
                                    <Link
                                        href={`/surveys/${id}/edit`}
                                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        onClick={() => setShowMenu(false)}
                                    >
                                        <Edit className="w-4 h-4" />
                                        Edit Survey
                                    </Link>
                                    <Link
                                        href={`/surveys/${id}/analytics`}
                                        className="flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                        onClick={() => setShowMenu(false)}
                                    >
                                        <BarChart3 className="w-4 h-4" />
                                        View Analytics
                                    </Link>
                                    <button
                                        onClick={() => {
                                            onDuplicate?.(id);
                                            setShowMenu(false);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Copy className="w-4 h-4" />
                                        Duplicate
                                    </button>
                                    <button
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                                    >
                                        <Share2 className="w-4 h-4" />
                                        Share Link
                                    </button>
                                    <div className="border-t border-gray-100 my-1" />
                                    <button
                                        onClick={() => {
                                            onDelete?.(id);
                                            setShowMenu(false);
                                        }}
                                        className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        Delete
                                    </button>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-4">
                <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-1.5 text-sm text-gray-600">
                        <Users className="w-4 h-4" />
                        <span className="font-medium">{responses}</span>
                        <span className="text-gray-400">/ {maxResponses} responses</span>
                    </div>
                    <span className="text-sm font-medium text-gray-500">{Math.round(progress)}%</span>
                </div>
                <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div
                        className={cn(
                            "h-full rounded-full transition-all duration-500",
                            progress >= 90 ? "bg-emerald-500" :
                                progress >= 50 ? "bg-blue-500" :
                                    "bg-gray-400"
                        )}
                        style={{ width: `${Math.min(progress, 100)}%` }}
                    />
                </div>
            </div>

            {/* Footer */}
            <div className="flex items-center justify-between text-xs text-gray-400">
                <div className="flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    <span>Last activity: {lastActivity}</span>
                </div>
                <span>Created {createdAt}</span>
            </div>
        </div>
    );
}
