"use client";

import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
    Plug,
    Zap,
    FileText,
    Check,
    ExternalLink,
    Copy,
    RefreshCw,
    Settings as SettingsIcon,
    ChevronRight,
    AlertCircle,
    Loader2,
    X,
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
    getSlackIntegrationStatus,
    disconnectSlack,
} from "@/app/actions/slack";
import {
    getNotionIntegrationStatus,
    disconnectNotionIntegration,
} from "@/app/actions/notion";
import {
    getZapierIntegrationStatus,
    disconnectZapierIntegration,
} from "@/app/actions/zapier";
import { SlackSettingsModal } from "@/components/integrations/slack-settings-modal";

type IntegrationStatus = "connected" | "disconnected" | "loading";

interface Integration {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    iconBg: string;
    status: IntegrationStatus;
    features: string[];
    metadata?: any;
}

export default function IntegrationsPage() {
    const queryClient = useQueryClient();
    const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState<string | null>(null);

    // Query integration statuses
    const { data: slackStatus, isLoading: isLoadingSlack } = useQuery({
        queryKey: ["slack-integration"],
        queryFn: async () => {
            const result = await getSlackIntegrationStatus();
            if (!result.success) throw new Error(result.error);
            return result.data;
        },
    });

    const { data: notionStatus, isLoading: isLoadingNotion } = useQuery({
        queryKey: ["notion-integration"],
        queryFn: async () => {
            const result = await getNotionIntegrationStatus();
            return result;
        },
    });

    const { data: zapierStatus, isLoading: isLoadingZapier } = useQuery({
        queryKey: ["zapier-integration"],
        queryFn: async () => {
            const result = await getZapierIntegrationStatus();
            if (!result.success) throw new Error(result.error);
            return result.data;
        },
    });

    // Check for OAuth callback results
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        
        if (params.get("slack_success")) {
            toast.success("Slack connected successfully!");
            queryClient.invalidateQueries({ queryKey: ["slack-integration"] });
            window.history.replaceState({}, "", "/dashboard/integrations");
        } else if (params.get("slack_error")) {
            toast.error(`Slack connection failed: ${params.get("slack_error")}`);
            window.history.replaceState({}, "", "/dashboard/integrations");
        }

        if (params.get("notion_success")) {
            toast.success("Notion connected successfully!");
            queryClient.invalidateQueries({ queryKey: ["notion-integration"] });
            window.history.replaceState({}, "", "/dashboard/integrations");
        } else if (params.get("notion_error")) {
            toast.error(`Notion connection failed: ${params.get("notion_error")}`);
            window.history.replaceState({}, "", "/dashboard/integrations");
        }
    }, [queryClient]);

    const integrations: Integration[] = [
        {
            id: "zapier",
            name: "Zapier",
            description: "Connect Convy to 5,000+ apps. Automate workflows and sync data in real-time.",
            icon: <Zap className="w-6 h-6" />,
            iconBg: "bg-gradient-to-br from-orange-500 to-orange-600",
            status: isLoadingZapier ? "loading" : zapierStatus?.connected ? "connected" : "disconnected",
            features: [
                "Trigger Zaps on new responses",
                "Send survey data to any app",
                "Create surveys from other tools",
                "Real-time webhook delivery",
            ],
            metadata: zapierStatus,
        },
        {
            id: "notion",
            name: "Notion",
            description: "Automatically sync survey responses and insights to your Notion workspace.",
            icon: <FileText className="w-6 h-6" />,
            iconBg: "bg-gradient-to-br from-gray-800 to-gray-900",
            status: isLoadingNotion ? "loading" : notionStatus?.connected ? "connected" : "disconnected",
            features: [
                "Auto-sync responses to databases",
                "Export analytics as pages",
                "Organize insights in workspaces",
                "Real-time synchronization",
            ],
            metadata: notionStatus,
        },
        {
            id: "slack",
            name: "Slack",
            description: "Get instant notifications and share insights with your team in Slack.",
            icon: <SiSlack className="w-6 h-6" />,
            iconBg: "bg-gradient-to-br from-purple-600 to-purple-700",
            status: isLoadingSlack ? "loading" : slackStatus?.connected ? "connected" : "disconnected",
            features: [
                "New response notifications",
                "Weekly analytics summaries",
                "Share surveys to channels",
                "Team collaboration alerts",
            ],
            metadata: slackStatus,
        },
    ];

    const handleConnect = (integrationId: string) => {
        if (integrationId === "slack") {
            window.location.href = "/api/slack/auth";
        } else if (integrationId === "notion") {
            window.location.href = "/api/notion/auth";
        } else if (integrationId === "zapier") {
            setSelectedIntegration(integrationId);
        }
    };

    const handleManage = (integrationId: string) => {
        setSelectedIntegration(integrationId);
    };

    const handleGenerateApiKey = () => {
        setApiKey("ck_live_" + Math.random().toString(36).substring(2, 15));
        toast.success("API key generated");
    };

    const copyApiKey = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
            toast.success("API key copied to clipboard");
        }
    };

    const selectedInt = integrations.find((i) => i.id === selectedIntegration);

    return (
        <div className="space-y-8 max-w-6xl mx-auto">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Integrations</h1>
                <p className="text-gray-500 mt-1">
                    Connect Convy with your favorite tools to automate workflows
                </p>
            </div>

            {/* Integrations Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {integrations.map((integration) => (
                    <div
                        key={integration.id}
                        className="bg-white rounded-2xl border border-gray-100 overflow-hidden hover:shadow-lg hover:border-gray-200 transition-all duration-300"
                    >
                        {/* Header */}
                        <div className="p-6 pb-4">
                            <div className="flex items-start justify-between mb-4">
                                <div
                                    className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center text-white",
                                        integration.iconBg
                                    )}
                                >
                                    {integration.icon}
                                </div>
                                {integration.status === "loading" ? (
                                    <div className="px-2.5 py-1 rounded-full text-xs font-medium bg-gray-50 text-gray-500 border border-gray-200 flex items-center gap-1.5">
                                        <Loader2 className="w-3 h-3 animate-spin" />
                                        Loading
                                    </div>
                                ) : (
                                    <span
                                        className={cn(
                                            "px-2.5 py-1 rounded-full text-xs font-medium",
                                            integration.status === "connected"
                                                ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                                : "bg-gray-50 text-gray-500 border border-gray-200"
                                        )}
                                    >
                                        {integration.status === "connected" ? "Connected" : "Not Connected"}
                                    </span>
                                )}
                            </div>

                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {integration.name}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                {integration.description}
                            </p>

                            {/* Show metadata for connected integrations */}
                            {integration.status === "connected" && (
                                <div className="mt-3 text-xs text-gray-500">
                                    {integration.id === "slack" && integration.metadata?.teamName && (
                                        <p>Workspace: {integration.metadata.teamName}</p>
                                    )}
                                    {integration.id === "notion" && integration.metadata?.integration?.workspaceName && (
                                        <p>Workspace: {integration.metadata.integration.workspaceName}</p>
                                    )}
                                    {integration.id === "zapier" && integration.metadata?.activeSubscriptions !== undefined && (
                                        <p>{integration.metadata.activeSubscriptions} active Zaps</p>
                                    )}
                                </div>
                            )}
                        </div>

                        {/* Features */}
                        <div className="px-6 pb-4">
                            <div className="space-y-2">
                                {integration.features.slice(0, 3).map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-2 text-sm text-gray-600">
                                        <Check className="w-4 h-4 text-emerald-500 flex-shrink-0" />
                                        <span>{feature}</span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Action */}
                        <div className="px-6 pb-6">
                            <button
                                onClick={() => integration.status === "connected" ? handleManage(integration.id) : handleConnect(integration.id)}
                                disabled={integration.status === "loading"}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors",
                                    integration.status === "connected"
                                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        : integration.status === "loading"
                                            ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                                            : "bg-gray-900 text-white hover:bg-gray-800"
                                )}
                            >
                                {integration.status === "loading" ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Loading...
                                    </>
                                ) : integration.status === "connected" ? (
                                    <>
                                        <SettingsIcon className="w-4 h-4" />
                                        Manage
                                    </>
                                ) : (
                                    <>
                                        Connect
                                        <ChevronRight className="w-4 h-4" />
                                    </>
                                )}
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* API Section */}
            <div className="bg-white rounded-2xl border border-gray-100 p-6">
                <div className="flex items-start justify-between mb-6">
                    <div>
                        <h3 className="text-lg font-semibold text-gray-900 mb-1">API Access</h3>
                        <p className="text-sm text-gray-500">
                            Use our REST API to build custom integrations
                        </p>
                    </div>
                    <a
                        href="#"
                        className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-900"
                    >
                        View Docs
                        <ExternalLink className="w-4 h-4" />
                    </a>
                </div>

                {/* API Key Section */}
                <div className="bg-gray-50 rounded-xl p-4">
                    <div className="flex items-center justify-between mb-3">
                        <span className="text-sm font-medium text-gray-700">API Key</span>
                        {apiKey && (
                            <button
                                onClick={handleGenerateApiKey}
                                className="flex items-center gap-1.5 text-xs text-gray-500 hover:text-gray-700"
                            >
                                <RefreshCw className="w-3.5 h-3.5" />
                                Regenerate
                            </button>
                        )}
                    </div>

                    {apiKey ? (
                        <div className="flex items-center gap-2">
                            <code className="flex-1 px-4 py-2.5 bg-white border border-gray-200 rounded-lg text-sm font-mono text-gray-700">
                                {apiKey}
                            </code>
                            <button
                                onClick={copyApiKey}
                                className="p-2.5 bg-white border border-gray-200 rounded-lg text-gray-500 hover:text-gray-700 hover:bg-gray-50 transition-colors"
                            >
                                <Copy className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <button
                            onClick={handleGenerateApiKey}
                            className="w-full py-2.5 bg-gray-900 text-white rounded-lg text-sm font-medium hover:bg-gray-800 transition-colors"
                        >
                            Generate API Key
                        </button>
                    )}

                    <p className="mt-3 text-xs text-gray-400 flex items-start gap-1.5">
                        <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                        Keep your API key secret. Do not share it in client-side code.
                    </p>
                </div>
            </div>

            {/* Settings Modal */}
            {selectedIntegration && selectedInt && selectedInt.status === "connected" && (
                selectedIntegration === "slack" ? (
                    <SlackSettingsModal
                        onClose={() => setSelectedIntegration(null)}
                        onDisconnect={() => {
                            queryClient.invalidateQueries({ queryKey: ["slack-integration"] });
                            setSelectedIntegration(null);
                        }}
                        metadata={selectedInt.metadata}
                    />
                ) : (
                    <IntegrationSettingsModal
                        integration={selectedInt}
                        onClose={() => setSelectedIntegration(null)}
                        onDisconnect={() => {
                            queryClient.invalidateQueries({ queryKey: [`${selectedIntegration}-integration`] });
                            setSelectedIntegration(null);
                        }}
                    />
                )
            )}
        </div>
    );
}

// Settings Modal Component
function IntegrationSettingsModal({
    integration,
    onClose,
    onDisconnect,
}: {
    integration: Integration;
    onClose: () => void;
    onDisconnect: () => void;
}) {
    const disconnectMutation = useMutation({
        mutationFn: async () => {
            if (integration.id === "slack") {
                return await disconnectSlack();
            } else if (integration.id === "notion") {
                return await disconnectNotionIntegration();
            } else if (integration.id === "zapier") {
                return await disconnectZapierIntegration();
            }
        },
        onSuccess: (result) => {
            if (result?.success) {
                toast.success(`${integration.name} disconnected successfully`);
                onDisconnect();
            } else {
                toast.error(result?.error || "Failed to disconnect");
            }
        },
        onError: () => {
            toast.error("Failed to disconnect integration");
        },
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in-95 duration-200">
                <div className="p-6 border-b border-gray-100 flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <div className={cn("w-12 h-12 rounded-xl flex items-center justify-center text-white", integration.iconBg)}>
                            {integration.icon}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-gray-900">{integration.name} Settings</h3>
                            <p className="text-sm text-gray-500">Manage your integration</p>
                        </div>
                    </div>
                    <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                        <X className="w-5 h-5 text-gray-500" />
                    </button>
                </div>

                <div className="p-6">
                    <div className="space-y-4">
                        {integration.features.map((feature, idx) => (
                            <div key={idx} className="flex items-center gap-3">
                                <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                    <Check className="w-3.5 h-3.5 text-emerald-600" />
                                </div>
                                <span className="text-sm text-gray-700">{feature}</span>
                            </div>
                        ))}
                    </div>

                    <div className="mt-6 p-4 bg-red-50 rounded-xl border border-red-100">
                        <p className="text-sm text-red-700 mb-3">
                            Disconnecting will remove access to {integration.name} and stop all automated workflows.
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
                                `Disconnect ${integration.name}`
                            )}
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
