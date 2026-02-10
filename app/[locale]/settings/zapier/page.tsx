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
  disconnectZapierIntegration,
} from "@/app/actions/zapier";



export default function ZapierSettingsPage() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Zapier Integration
          </h1>
          <p className="text-gray-600">
            Connect your surveys to thousands of apps through Zapier.
          </p>
        </div>

        {/* Coming Soon Message */}
        <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center">
          <div className="mb-6">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-blue-50 mb-4">
              <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <span className="inline-block px-3 py-1 rounded-full text-sm font-medium bg-blue-50 text-blue-600 border border-blue-200 mb-4">
              Coming Soon
            </span>
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">
            Zapier Integration is Coming Soon
          </h2>
          <p className="text-gray-600 mb-6 max-w-md mx-auto">
            We're working on bringing powerful Zapier integration to Convy. 
            Soon you'll be able to connect your surveys to thousands of apps and automate your workflows.
          </p>
          <div className="space-y-2 text-sm text-gray-500">
            <p>✨ Trigger Zaps on new responses</p>
            <p>🔄 Send survey data to any app</p>
            <p>⚡ Real-time webhook delivery</p>
          </div>
        </div>
      </div>
    </div>
  );
}

