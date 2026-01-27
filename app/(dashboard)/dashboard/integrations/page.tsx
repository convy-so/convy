"use client";

import { useState } from "react";
import {
    Plug,
    Zap,
    FileText,
    Check,
    ExternalLink,
    Copy,
    RefreshCw,
    Settings,
    ChevronRight,
    AlertCircle,
} from "lucide-react";
import { SiSlack } from "react-icons/si";
import { cn } from "@/lib/utils";

type IntegrationStatus = "connected" | "disconnected" | "coming_soon";

interface Integration {
    id: string;
    name: string;
    description: string;
    icon: React.ReactNode;
    iconBg: string;
    status: IntegrationStatus;
    features: string[];
    setupUrl?: string;
}

const integrations: Integration[] = [
    {
        id: "zapier",
        name: "Zapier",
        description: "Connect Convy to 5,000+ apps. Automate workflows and sync data in real-time.",
        icon: <Zap className="w-6 h-6" />,
        iconBg: "bg-gradient-to-br from-orange-500 to-orange-600",
        status: "disconnected",
        features: [
            "Trigger Zaps on new responses",
            "Send survey data to any app",
            "Create surveys from other tools",
            "Real-time webhook delivery",
        ],
    },
    {
        id: "notion",
        name: "Notion",
        description: "Automatically sync survey responses and insights to your Notion workspace.",
        icon: <FileText className="w-6 h-6" />,
        iconBg: "bg-gradient-to-br from-gray-800 to-gray-900",
        status: "disconnected",
        features: [
            "Auto-sync responses to databases",
            "Export analytics as pages",
            "Organize insights in workspaces",
            "Real-time synchronization",
        ],
    },
    {
        id: "slack",
        name: "Slack",
        description: "Get instant notifications and share insights with your team in Slack.",
        icon: <SiSlack className="w-6 h-6" />,
        iconBg: "bg-gradient-to-br from-purple-600 to-purple-700",
        status: "disconnected",
        features: [
            "New response notifications",
            "Weekly analytics summaries",
            "Share surveys to channels",
            "Team collaboration alerts",
        ],
    },
];

export default function IntegrationsPage() {
    const [selectedIntegration, setSelectedIntegration] = useState<string | null>(null);
    const [apiKey, setApiKey] = useState<string | null>(null);

    const handleConnect = (integrationId: string) => {
        setSelectedIntegration(integrationId);
        // In real implementation, this would open OAuth flow or show setup modal
    };

    const handleGenerateApiKey = () => {
        // Mock API key generation
        setApiKey("ck_live_" + Math.random().toString(36).substring(2, 15));
    };

    const copyApiKey = () => {
        if (apiKey) {
            navigator.clipboard.writeText(apiKey);
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

            {/* Pro Badge Notice */}
            <div className="bg-gradient-to-r from-purple-50 to-blue-50 rounded-2xl border border-purple-100 p-5 flex items-start gap-4">
                <div className="w-10 h-10 rounded-xl bg-purple-100 flex items-center justify-center flex-shrink-0">
                    <Plug className="w-5 h-5 text-purple-600" />
                </div>
                <div className="flex-1">
                    <h3 className="font-semibold text-gray-900 mb-1">Integrations are a Pro feature</h3>
                    <p className="text-sm text-gray-600">
                        Upgrade to Pro to connect your surveys with Zapier, Notion, Slack, and more.
                    </p>
                </div>
                <button className="px-4 py-2 bg-purple-600 text-white rounded-lg text-sm font-medium hover:bg-purple-700 transition-colors">
                    Upgrade to Pro
                </button>
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
                                <span
                                    className={cn(
                                        "px-2.5 py-1 rounded-full text-xs font-medium",
                                        integration.status === "connected"
                                            ? "bg-emerald-50 text-emerald-600 border border-emerald-200"
                                            : integration.status === "coming_soon"
                                                ? "bg-gray-50 text-gray-500 border border-gray-200"
                                                : "bg-gray-50 text-gray-500 border border-gray-200"
                                    )}
                                >
                                    {integration.status === "connected"
                                        ? "Connected"
                                        : integration.status === "coming_soon"
                                            ? "Coming Soon"
                                            : "Not Connected"}
                                </span>
                            </div>

                            <h3 className="text-lg font-semibold text-gray-900 mb-2">
                                {integration.name}
                            </h3>
                            <p className="text-sm text-gray-500 leading-relaxed">
                                {integration.description}
                            </p>
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
                                onClick={() => handleConnect(integration.id)}
                                disabled={integration.status === "coming_soon"}
                                className={cn(
                                    "w-full flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-medium transition-colors",
                                    integration.status === "connected"
                                        ? "bg-gray-100 text-gray-700 hover:bg-gray-200"
                                        : integration.status === "coming_soon"
                                            ? "bg-gray-50 text-gray-400 cursor-not-allowed"
                                            : "bg-gray-900 text-white hover:bg-gray-800"
                                )}
                            >
                                {integration.status === "connected" ? (
                                    <>
                                        <Settings className="w-4 h-4" />
                                        Manage
                                    </>
                                ) : integration.status === "coming_soon" ? (
                                    "Coming Soon"
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

            {/* Setup Modal */}
            {selectedIntegration && selectedInt && (
                <div className="fixed inset-0 z-50 flex items-center justify-center">
                    <div
                        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
                        onClick={() => setSelectedIntegration(null)}
                    />

                    <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg mx-4 animate-in fade-in zoom-in-95 duration-200">
                        <div className="p-6 border-b border-gray-100">
                            <div className="flex items-center gap-4">
                                <div
                                    className={cn(
                                        "w-12 h-12 rounded-xl flex items-center justify-center text-white",
                                        selectedInt.iconBg
                                    )}
                                >
                                    {selectedInt.icon}
                                </div>
                                <div>
                                    <h3 className="text-lg font-semibold text-gray-900">
                                        Connect {selectedInt.name}
                                    </h3>
                                    <p className="text-sm text-gray-500">
                                        Set up your integration in a few steps
                                    </p>
                                </div>
                            </div>
                        </div>

                        <div className="p-6">
                            <div className="space-y-4">
                                {selectedInt.features.map((feature, idx) => (
                                    <div key={idx} className="flex items-center gap-3">
                                        <div className="w-6 h-6 rounded-full bg-emerald-100 flex items-center justify-center">
                                            <Check className="w-3.5 h-3.5 text-emerald-600" />
                                        </div>
                                        <span className="text-sm text-gray-700">{feature}</span>
                                    </div>
                                ))}
                            </div>

                            <div className="mt-6 p-4 bg-amber-50 rounded-xl border border-amber-100">
                                <p className="text-sm text-amber-700">
                                    <strong>Pro feature:</strong> Upgrade to Pro to enable this integration.
                                </p>
                            </div>
                        </div>

                        <div className="p-6 border-t border-gray-100 flex items-center justify-end gap-3">
                            <button
                                onClick={() => setSelectedIntegration(null)}
                                className="px-4 py-2.5 text-sm font-medium text-gray-700 hover:bg-gray-100 rounded-lg transition-colors"
                            >
                                Cancel
                            </button>
                            <button className="px-4 py-2.5 bg-purple-600 text-white rounded-lg font-medium text-sm hover:bg-purple-700 transition-colors">
                                Upgrade to Pro
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
