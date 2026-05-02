"use client";

import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";
import { GlassPanel } from "@/components/learning/glass-panel";

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
    iconColor = "bg-slate-50 text-slate-500",
    description,
}: StatsCardProps) {
    return (
        <GlassPanel className="p-6 transition-all duration-300 group cursor-default">
            <div className="flex items-start justify-between">
                <div className="flex-1">
                    <p className="text-[10px] font-medium text-slate-400 mb-2 uppercase tracking-widest">{title}</p>
                    <p className="text-2xl font-medium text-slate-900 leading-none">{value}</p>

                    {change && (
                        <div className="flex items-center gap-1.5 mt-3">
                            {changeType === "positive" && (
                                <TrendingUp className="w-4 h-4 text-emerald-500" />
                            )}
                            {changeType === "negative" && (
                                <TrendingDown className="w-4 h-4 text-red-500" />
                            )}
                            <span className={cn(
                                "text-xs font-medium",
                                changeType === "positive" && "text-emerald-600",
                                changeType === "negative" && "text-red-600",
                                changeType === "neutral" && "text-slate-400"
                            )}>
                                {change}
                            </span>
                        </div>
                    )}

                    {description && (
                        <p className="text-[10px] font-medium text-slate-400 mt-3 uppercase tracking-widest">{description}</p>
                    )}
                </div>

                <div className={cn(
                    "w-12 h-12 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-105 border border-slate-100",
                    iconColor
                )}>
                    {icon}
                </div>
            </div>
        </GlassPanel>
    );
}
