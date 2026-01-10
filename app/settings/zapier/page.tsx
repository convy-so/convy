"use client";

/**
 * Zapier Integration Settings Page
 * 
 * This page allows users to set up and manage Zapier integrations
 * using Zapier Embed, so they don't have to leave the app.
 */

import { useEffect, useState, useRef } from "react";
import {
  getZapierIntegrationStatus,
  getZapierSubscriptions,
  updateZapierIntegrationSettings,
  disconnectZapierIntegration,
} from "@/app/actions/zapier";



export default function ZapierSettingsPage() {
  const [status, setStatus] = useState<{
    connected: boolean;
    integrationId?: string;
    enabled?: boolean;
    embedId?: string | null;
    lastUsedAt?: Date | null;
    totalSubscriptions?: number;
    activeSubscriptions?: number;
  } | null>(null);
  const [subscriptions, setSubscriptions] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const embedRef = useRef<HTMLElement>(null);

  useEffect(() => {
    loadData();
    loadZapierScript();
  }, []);

  const loadZapierScript = () => {
    // Load Zapier Embed script if not already loaded
    if (document.querySelector('script[src*="zapier.com/embed"]')) {
      return;
    }

    const script = document.createElement("script");
    script.src = "https://mcp.zapier.com/embed/v1/mcp.js";
    script.async = true;
    document.head.appendChild(script);
  };

  const loadData = async () => {
    try {
      setLoading(true);
      const [statusResult, subscriptionsResult] = await Promise.all([
        getZapierIntegrationStatus(),
        getZapierSubscriptions(),
      ]);

      if (statusResult.success && statusResult.data) {
        setStatus(statusResult.data);
      }

      if (subscriptionsResult.success && subscriptionsResult.data) {
        setSubscriptions(subscriptionsResult.data);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("Are you sure you want to disconnect Zapier integration?")) {
      return;
    }

    try {
      const result = await disconnectZapierIntegration();
      if (result.success) {
        await loadData();
      } else {
        setError(result.error || "Failed to disconnect");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to disconnect");
    }
  };

  const handleEmbedEvents = () => {
    if (!embedRef.current) return;

    // Handle MCP server URL event
    embedRef.current.addEventListener("mcp-server-url", (event: any) => {
      console.log("MCP Server URL:", event.detail?.serverUrl);
    });

    // Handle tools changed event
    embedRef.current.addEventListener("tools-changed", () => {
      console.log("Tools changed");
      loadData(); // Reload subscriptions
    });

    // Handle close requested event
    embedRef.current.addEventListener("close-requested", () => {
      console.log("Embed closed");
    });
  };

  useEffect(() => {
    if (embedRef.current) {
      handleEmbedEvents();
    }
  }, [status?.connected]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-4xl mx-auto">
          <div className="bg-white rounded-lg shadow p-6">
            <p className="text-gray-600">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Zapier Integration
          </h1>
          <p className="text-gray-600">
            Connect your surveys to thousands of apps through Zapier. Set up
            automations to send survey data to your favorite tools.
          </p>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-800 px-4 py-3 rounded mb-6">
            {error}
          </div>
        )}

        {/* Integration Status */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Integration Status</h2>
          {status?.connected ? (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-green-500 rounded-full"></span>
                <span className="text-gray-700">Connected</span>
              </div>
              <div className="text-sm text-gray-600 space-y-1">
                <p>
                  Active Subscriptions: {status.activeSubscriptions || 0} /{" "}
                  {status.totalSubscriptions || 0}
                </p>
                {status.integrationId && (
                  <p className="font-mono text-xs text-gray-500">
                    Integration ID: {status.integrationId.substring(0, 8)}...
                  </p>
                )}
              </div>
              <button
                onClick={handleDisconnect}
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
              >
                Disconnect Zapier
              </button>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 bg-gray-400 rounded-full"></span>
                <span className="text-gray-700">Not Connected</span>
              </div>
              <p className="text-sm text-gray-600">
                Set up your first Zap below to get started.
              </p>
            </div>
          )}
        </div>

        {/* Zapier Embed */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-xl font-semibold mb-4">Create New Integration</h2>
          <p className="text-sm text-gray-600 mb-4">
            Use the Zapier interface below to create automations that send your
            survey data to other apps. You can create Zaps for:
          </p>
          <ul className="list-disc list-inside text-sm text-gray-600 mb-4 space-y-1">
            <li>
              <strong>Survey Created:</strong> Trigger when a new survey is
              created
            </li>
            <li>
              <strong>New Conversation:</strong> Trigger when a new survey
              response is received
            </li>
            <li>
              <strong>Analytics Updated:</strong> Trigger when survey analytics
              are updated
            </li>
          </ul>

          <div className="border border-gray-200 rounded-lg overflow-hidden">
            {typeof window !== "undefined" && (
              <zapier-mcp
                ref={embedRef}
                embed-id={process.env.NEXT_PUBLIC_ZAPIER_EMBED_ID || ""}
                width="100%"
                height="600px"
                style={{ display: "block" }}
              /> 
            )}
          </div>
        </div>

        {/* Active Subscriptions */}
        {subscriptions.length > 0 && (
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Active Subscriptions</h2>
            <div className="space-y-3">
              {subscriptions.map((sub) => (
                <div
                  key={sub.id}
                  className="border border-gray-200 rounded p-4"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h3 className="font-medium text-gray-900 capitalize">
                        {sub.eventType.replace("_", " ")}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {sub.targetUrl}
                      </p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-500">
                        <span>
                          Triggers: {sub.triggerCount || 0}
                        </span>
                        {sub.errorCount > 0 && (
                          <span className="text-red-600">
                            Errors: {sub.errorCount}
                          </span>
                        )}
                        {sub.lastTriggeredAt && (
                          <span>
                            Last:{" "}
                            {new Date(sub.lastTriggeredAt).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {sub.active ? (
                        <span className="px-2 py-1 bg-green-100 text-green-800 text-xs rounded">
                          Active
                        </span>
                      ) : (
                        <span className="px-2 py-1 bg-gray-100 text-gray-800 text-xs rounded">
                          Inactive
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

