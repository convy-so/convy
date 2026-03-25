"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

interface StatsCardProps {
    title: React.ReactNode;
    value: string | number;
    change?: React.ReactNode;
    changeType?: "positive" | "negative" | "neutral";
    icon: React.ReactNode;
    iconColor?: string;
    description?: React.ReactNode;
}

export function StatsCard({
    title,
    value,
    change,
    changeType = "neutral",
    icon,
    iconColor = "bg-gray-100 text-gray-600",
    description,
}: StatsCardProps) {
    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-lg hover:border-gray-200 transition-all duration-300 group">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-sm font-medium text-gray-500 mb-1">{title}</p>
                    <p className="text-3xl font-bold text-gray-900 tracking-tight">{value}</p>

                    {change && (
                        <div className="flex items-center gap-1.5 mt-2">
                            {changeType === "positive" && (
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                            )}
                            {changeType === "negative" && (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                            <span className={cn(
                                "text-sm font-medium",
                                changeType === "positive" && "text-emerald-600",
                                changeType === "negative" && "text-red-600",
                                changeType === "neutral" && "text-gray-500"
                            )}>
                                {change}
                            </span>
                        </div>
                    )}

                    {description && (
                        <p className="text-xs text-gray-400 mt-2">{description}</p>
                    )}
                </div>

                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110",
                    iconColor
                )}>
                    {icon}
                </div>
            </div>
        </div>
    );
}
