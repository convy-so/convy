"use client";

import { Link } from "@/i18n/routing";
import { 
  Check, 
  ChevronRight, 
  ExternalLink,
  ShieldAlert,
  Zap 
} from "lucide-react";
import { SiSlack, SiNotion } from "react-icons/si";
import { cn } from "@/lib/utils";

interface IntegrationStatus {
  id: string;
  name: string;
  icon: React.ReactNode;
  connected: boolean;
  color: string;
}

interface IntegrationsWidgetProps {
  slackConnected: boolean;
  notionConnected: boolean;
  zapierConnected: boolean;
}

export function IntegrationsWidget({ 
  slackConnected, 
  notionConnected, 
  zapierConnected 
}: IntegrationsWidgetProps) {
  
  const integrations: IntegrationStatus[] = [
    {
      id: "slack",
      name: "Slack",
      icon: <SiSlack className="w-4 h-4" />,
      connected: slackConnected,
      color: "text-[#4A154B] bg-[#4A154B]/10",
    },
    {
      id: "notion",
      name: "Notion",
      icon: <SiNotion className="w-4 h-4" />,
      connected: notionConnected,
      color: "text-gray-900 bg-gray-100",
    },
    {
      id: "zapier",
      name: "Zapier",
      icon: <Zap className="w-4 h-4" />,
      connected: zapierConnected,
      color: "text-[#FF4F00] bg-[#FF4F00]/10",
    },
  ];

  const connectedCount = integrations.filter(i => i.connected).length;
  const totalCount = integrations.length;

  return (
    <div className="bg-white rounded-2xl border border-gray-100 p-6 flex flex-col h-[400px]">
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="font-semibold text-gray-900">Integrations</h3>
          <p className="text-sm text-gray-500">
            {connectedCount} of {totalCount} connected
          </p>
        </div>
        <div className={cn(
          "w-8 h-8 rounded-full flex items-center justify-center",
          connectedCount === totalCount ? "bg-emerald-50 text-emerald-600" : "bg-gray-50 text-gray-400"
        )}>
          {connectedCount === totalCount ? (
            <Check className="w-4 h-4" />
          ) : (
            <ShieldAlert className="w-4 h-4" />
          )}
        </div>
      </div>

      <div className="space-y-3 flex-1">
        {integrations.map((integration) => (
          <div 
            key={integration.id}
            className="flex items-center justify-between p-3 rounded-xl bg-gray-50 border border-gray-100"
          >
            <div className="flex items-center gap-3">
              <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center", integration.color)}>
                {integration.icon}
              </div>
              <span className="font-medium text-gray-900 text-sm">{integration.name}</span>
            </div>
            
            <div className="flex items-center">
              {integration.connected ? (
                <div className="w-2 h-2 rounded-full bg-emerald-500 ring-4 ring-emerald-50" />
              ) : (
                <div className="w-2 h-2 rounded-full bg-gray-300" />
              )}
            </div>
          </div>
        ))}
      </div>

      <Link
        href="/dashboard/integrations"
        className="mt-6 flex items-center justify-between text-sm font-medium text-gray-900 hover:text-gray-700 group pt-4 border-t border-gray-100"
      >
        Manage Integrations
        <ChevronRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
      </Link>
    </div>
  );
}
