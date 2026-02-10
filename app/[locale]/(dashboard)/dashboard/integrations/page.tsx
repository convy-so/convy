"use strict";
import { Plug } from "lucide-react";

export default function IntegrationsPage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-8">
      <div className="w-20 h-20 bg-gray-100 rounded-3xl flex items-center justify-center mb-6">
        <Plug className="w-10 h-10 text-gray-400" />
      </div>
      <h1 className="text-3xl font-bold text-gray-900 mb-3">Integrations Coming Soon</h1>
      <p className="text-gray-500 max-w-md mx-auto text-lg">
        We're working hard to bring you seamless integrations with your favorite tools like Slack, Notion, and Zapier.
      </p>
    </div>
  );
}
