"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { X, Loader2, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    getSlackChannelList,
    updateSlackIntegrationSettings,
    disconnectSlack,
} from "@/app/actions/slack";

interface SlackSettingsModalProps {
    onClose: () => void;
    onDisconnect: () => void;
    metadata: any;
}

export function SlackSettingsModal({
    onClose,
    onDisconnect,
    metadata,
}: SlackSettingsModalProps) {
    const queryClient = useQueryClient();
    const [selectedChannel, setSelectedChannel] = useState(
        metadata?.defaultChannelId || ""
    );
    const [autoPostNewSurveys, setAutoPostNewSurveys] = useState(
        metadata?.autoPostNewSurveys ?? false
    );
    const [autoPostAnalytics, setAutoPostAnalytics] = useState(
        metadata?.autoPostAnalytics ?? false
    );
    const [autoPostOnConversation, setAutoPostOnConversation] = useState(
        metadata?.autoPostOnConversation ?? false
    );

    const { data: channelsData, isLoading: isLoadingChannels } = useQuery({
        queryKey: ["slack-channels"],
        queryFn: async () => {
            const result = await getSlackChannelList();
            if (!result.success) throw new Error(result.error);
            return result.data;
        },
    });

    const saveMutation = useMutation({
        mutationFn: async () => {
            const selectedChannelData = channelsData?.find(
                (ch: any) => ch.id === selectedChannel
            );

            return await updateSlackIntegrationSettings({
                defaultChannelId: selectedChannel || undefined,
                defaultChannelName: selectedChannelData?.name || undefined,
                autoPostNewSurveys,
                autoPostAnalytics,
                autoPostOnConversation,
            });
        },
        onSuccess: (result) => {
            if (result?.success) {
                toast.success("Slack settings updated!");
                queryClient.invalidateQueries({ queryKey: ["slack-integration"] });
                onClose();
            } else {
                toast.error(result?.error || "Failed to update settings");
            }
        },
        onError: () => {
            toast.error("Failed to update settings");
        },
    });

    const disconnectMutation = useMutation({
        mutationFn: async () => await disconnectSlack(),
        onSuccess: (result) => {
            if (result?.success) {
                toast.success("Slack disconnected successfully");
                onDisconnect();
            } else {
                toast.error(result?.error || "Failed to disconnect");
            }
        },
        onError: () => {
            toast.error("Failed to disconnect");
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                onClick={onClose}
            />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl mx-4 max-h-[90vh] overflow-y-auto">
                {/* Header */}
                <div className="sticky top-0 bg-white p-6 border-b border-gray-100 flex items-center justify-between">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900">
                            Slack Settings
                        </h3>
                        <p className="text-sm text-gray-500">
                            Workspace: {metadata?.teamName || "Unknown"}
                        </p>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                {/* Content */}
                <div className="p-6 space-y-6">
                    {/* Channel Selection */}
                    <div>
                        <label className="block text-sm font-medium text-gray-700 mb-2">
                            Default Channel
                        </label>
                        {isLoadingChannels ? (
                            <div className="flex items-center gap-2 text-sm text-gray-500 py-2">
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Loading channels...
                            </div>
                        ) : (
                            <select
                                value={selectedChannel}
                                onChange={(e) => setSelectedChannel(e.target.value)}
                                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                            >
                                <option value="">Select a channel</option>
                                {channelsData?.map((channel: any) => (
                                    <option key={channel.id} value={channel.id}>
                                        #{channel.name}
                                    </option>
                                ))}
                            </select>
                        )}
                        <p className="text-xs text-gray-400 mt-1.5">
                            All automatic notifications will be sent to this channel
                        </p>
                    </div>

                    {/* Auto-Posting Settings */}
                    <div className="space-y-4">
                        <h4 className="text-sm font-medium text-gray-900">
                            Auto-Posting
                        </h4>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={autoPostNewSurveys}
                                    onChange={(e) =>
                                        setAutoPostNewSurveys(e.target.checked)
                                    }
                                    className="w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-purple-500 checked:bg-purple-600 checked:border-purple-600"
                                />
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-700">
                                    Post new surveys
                                </span>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Automatically share when you create a survey
                                </p>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={autoPostAnalytics}
                                    onChange={(e) =>
                                        setAutoPostAnalytics(e.target.checked)
                                    }
                                    className="w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-purple-500 checked:bg-purple-600 checked:border-purple-600"
                                />
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-700">
                                    Post analytics updates
                                </span>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Share insights when analytics are ready
                                </p>
                            </div>
                        </label>

                        <label className="flex items-start gap-3 cursor-pointer">
                            <div className="relative flex items-center">
                                <input
                                    type="checkbox"
                                    checked={autoPostOnConversation}
                                    onChange={(e) =>
                                        setAutoPostOnConversation(e.target.checked)
                                    }
                                    className="w-5 h-5 border-2 border-gray-300 rounded focus:ring-2 focus:ring-purple-500 checked:bg-purple-600 checked:border-purple-600"
                                />
                            </div>
                            <div>
                                <span className="text-sm font-medium text-gray-700">
                                    Post new responses
                                </span>
                                <p className="text-xs text-gray-500 mt-0.5">
                                    Get notified on each survey response
                                </p>
                            </div>
                        </label>
                    </div>

                    {/* Disconnect Section */}
                    <div className="pt-6 border-t border-gray-100">
                        <div className="p-4 bg-red-50 rounded-xl border border-red-100">
                            <p className="text-sm text-red-700 mb-3">
                                Disconnecting will remove access to Slack and stop all
                                automated workflows.
                            </p>
                            <button
                                onClick={() => disconnectMutation.mutate()}
                                disabled={disconnectMutation.isPending}
                                className="w-full px-4 py-2 bg-red-600 text-white rounded-lg text-sm font-medium hover:bg-red-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                            >
                                {disconnectMutation.isPending ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Disconnecting...
                                    </>
                                ) : (
                                    "Disconnect Slack"
                                )}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Footer */}
                <div className="sticky bottom-0 bg-gray-50 px-6 py-4 border-t border-gray-100 flex items-center justify-end gap-3">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={() => saveMutation.mutate()}
                        disabled={saveMutation.isPending || isLoadingChannels}
                        className="px-4 py-2 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition-colors disabled:opacity-50 flex items-center gap-2"
                    >
                        {saveMutation.isPending ? (
                            <>
                                <Loader2 className="w-4 h-4 animate-spin" />
                                Saving...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Save Changes
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
