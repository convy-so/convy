"use client";

import {
    MessageSquare,
    Mic,
    Users,
    TrendingUp,
    Clock,
    CheckCircle2,
    Activity
} from "lucide-react";
import { cn } from "@/lib/utils";

type ActivityType =
    | "new_response"
    | "survey_created"
    | "survey_completed"
    | "team_joined"
    | "analytics_ready"
    | "voice_session";

interface ActivityItem {
    id: string;
    type: ActivityType;
    title: string;
    description: string;
    time: string;
    surveyId?: string;
    userId?: string;
}

const activityConfig: Record<ActivityType, {
    icon: React.ReactNode;
    iconBg: string;
    iconColor: string;
}> = {
    new_response: {
        icon: <MessageSquare className="w-4 h-4" />,
        iconBg: "bg-blue-50",
        iconColor: "text-blue-600"
    },
    survey_created: {
        icon: <CheckCircle2 className="w-4 h-4" />,
        iconBg: "bg-green-50",
        iconColor: "text-green-600"
    },
    survey_completed: {
        icon: <TrendingUp className="w-4 h-4" />,
        iconBg: "bg-purple-50",
        iconColor: "text-purple-600"
    },
    team_joined: {
        icon: <Users className="w-4 h-4" />,
        iconBg: "bg-amber-50",
        iconColor: "text-amber-600"
    },
    analytics_ready: {
        icon: <Activity className="w-4 h-4" />,
        iconBg: "bg-cyan-50",
        iconColor: "text-cyan-600"
    },
    voice_session: {
        icon: <Mic className="w-4 h-4" />,
        iconBg: "bg-pink-50",
        iconColor: "text-pink-600"
    },
};

interface ActivityFeedProps {
    activities: ActivityItem[];
    title?: string;
    showViewAll?: boolean;
    onViewAll?: () => void;
    maxItems?: number;
}

export function ActivityFeed({
    activities,
    title = "Recent Activity",
    showViewAll = true,
    onViewAll,
    maxItems = 5,
}: ActivityFeedProps) {
    const displayedActivities = activities.slice(0, maxItems);

    if (activities.length === 0) {
        return (
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <h3 className="text-base font-semibold text-gray-900 mb-4">{title}</h3>
                <div className="flex flex-col items-center justify-center py-8 text-center">
                    <div className="w-12 h-12 rounded-full bg-gray-50 flex items-center justify-center mb-3">
                        <Clock className="w-6 h-6 text-gray-400" />
                    </div>
                    <p className="text-sm text-gray-500">No activity yet</p>
                    <p className="text-xs text-gray-400 mt-1">
                        Activity will appear here as you use Convy
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-2xl border border-gray-100 p-6 hover:shadow-md transition-shadow duration-300">
            <div className="flex items-center justify-between mb-5">
                <h3 className="text-base font-semibold text-gray-900">{title}</h3>
                {showViewAll && activities.length > maxItems && (
                    <button
                        onClick={onViewAll}
                        className="text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
                    >
                        View all
                    </button>
                )}
            </div>

            <div className="space-y-1">
                {displayedActivities.map((activity, index) => {
                    const config = activityConfig[activity.type];
                    const isLast = index === displayedActivities.length - 1;

                    return (
                        <div key={activity.id} className="relative">
                            <div className="flex items-start gap-3 py-3 rounded-lg hover:bg-gray-50 transition-colors px-2 -mx-2 group cursor-pointer">
                                {/* Icon */}
                                <div className={cn(
                                    "w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-110",
                                    config.iconBg,
                                    config.iconColor
                                )}>
                                    {config.icon}
                                </div>

                                {/* Content */}
                                <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-900 truncate">
                                        {activity.title}
                                    </p>
                                    <p className="text-xs text-gray-500 truncate mt-0.5">
                                        {activity.description}
                                    </p>
                                </div>

                                {/* Time */}
                                <span className="text-xs text-gray-400 flex-shrink-0 mt-0.5">
                                    {activity.time}
                                </span>
                            </div>

                            {/* Connector Line */}
                            {!isLast && (
                                <div className="absolute left-[26px] top-12 w-px h-4 bg-gray-100" />
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
