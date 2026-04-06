"use client";

import { useQuery } from "@tanstack/react-query";
import { getVoiceAnalyticsData } from "@/app/actions/voice-analytics";
import { motion } from "framer-motion";
import { Activity, Clock, AlertTriangle, Disc, Loader2, Mic2 } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { format } from "date-fns";

export default function VoiceAnalyticsDashboard() {
  const { session } = useAuth();
  
  const { data: response, isLoading } = useQuery({
    queryKey: ["voiceAnalytics", session?.activeOrganizationId],
    queryFn: getVoiceAnalyticsData,
    enabled: !!session?.activeOrganizationId,
  });

  const data = response?.success ? response.data : { sessions: [], metricsOverview: { avgLatency: 0, totalDuration: 0, fallbackCount: 0, sessionCount: 0 } };

  if (isLoading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
      </div>
    );
  }

  if (response && !response.success) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="rounded-2xl bg-red-50 p-8 text-center text-red-900 shadow-md">
          <AlertTriangle className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="mt-2 text-sm text-red-700">{response.error}</p>
        </div>
      </div>
    );
  }

  const { metricsOverview } = data;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 relative">
      
      {/* Header */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight flex items-center gap-3">
          Voice Quality Analytics
        </h1>
        <p className="mt-3 text-base text-gray-500 max-w-2xl">
          Monitor your workspace's AI voice engine health, latency distributions, and respondent connection stability.
        </p>
      </motion.div>

      {/* KPI Tiles */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid gap-6 md:grid-cols-4 mb-10"
      >
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-gray-500">Average Latency</h3>
            <div className="bg-amber-50 p-2 rounded-xl text-amber-600">
              <Activity className="w-5 h-5"/>
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{metricsOverview.avgLatency}<span className="text-lg font-medium text-gray-400 ml-1">ms</span></p>
        </div>

        <div className="col-span-2 rounded-2xl bg-indigo-600 border border-indigo-700 p-6 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300 flex items-center justify-between text-white">
          <div>
            <h3 className="text-sm font-medium text-indigo-100 mb-2">Total Voice Interview Time</h3>
            <p className="text-4xl font-bold">{Math.round(metricsOverview.totalDuration / 60000)}<span className="text-lg font-medium text-indigo-200 ml-1">minutes</span></p>
            <p className="text-indigo-200 text-sm mt-2">Across {metricsOverview.sessionCount} unique sessions</p>
          </div>
          <div className="hidden sm:flex bg-indigo-500 p-4 rounded-2xl">
            <Clock className="w-10 h-10 text-white opacity-80"/>
          </div>
        </div>

        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-gray-500">STT Fallbacks</h3>
            <div className="bg-red-50 p-2 rounded-xl text-red-600">
              <AlertTriangle className="w-5 h-5"/>
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{metricsOverview.fallbackCount}</p>
        </div>
      </motion.div>

      {/* Main Content Grids */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid gap-8 lg:grid-cols-3"
      >
        {/* Simple Graph Representation Box */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-900">Recent Health Trend</h2>
          
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[400px]">
             {/* Mock chart representation since recharts implementation depends on specific payloads, leveraging CSS for framer-feel instead */}
             <div className="flex-1 p-6 flex flex-col">
                <div className="flex justify-between items-center mb-10 border-b border-gray-100 pb-4">
                    <div className="flex space-x-4">
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-indigo-500"></span><span className="text-sm text-gray-500">Latency</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3 h-3 rounded-full bg-red-400"></span><span className="text-sm text-gray-500">Errors</span>
                        </div>
                    </div>
                </div>
                
                {/* CSS Graph Mockup */}
                <div className="flex-1 flex items-end justify-between gap-2 px-2 relative h-40">
                    <div className="absolute left-0 top-0 w-full border-t border-dashed border-gray-200"></div>
                    <div className="absolute left-0 top-1/2 w-full border-t border-dashed border-gray-100"></div>
                    
                    {[40, 60, 45, 80, 50, 70, 40, 50, 30, 90, 60, 50].map((h, idx) => (
                        <motion.div 
                            key={idx}
                            initial={{ height: 0 }}
                            animate={{ height: `${h}%` }}
                            transition={{ duration: 0.8, delay: idx * 0.05 }}
                            className="w-full bg-indigo-100 rounded-t-md relative group hover:bg-indigo-200 cursor-pointer"
                        >
                            <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 bg-indigo-500 rounded-full opacity-0 group-hover:opacity-100 transition-opacity"></div>
                        </motion.div>
                    ))}
                </div>
             </div>
          </div>
        </div>

        {/* Sessions List */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-900">Recent Sessions</h2>
          
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[400px]">
             <div className="overflow-y-auto p-3">
              {data.sessions.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-gray-500 text-sm">
                  <Mic2 className="h-8 w-8 mb-2 opacity-20" />
                  No voice sessions found
                </div>
              ) : (
                <div className="space-y-3">
                  {data.sessions.map((s, i) => (
                    <motion.div 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      key={s.id} 
                      className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 flex flex-col gap-2 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex items-center gap-2">
                           <Disc className={`w-4 h-4 ${s.status === 'active' ? 'text-emerald-500 animate-pulse' : 'text-gray-400'}`} />
                           <span className="font-semibold text-sm text-gray-900 max-w-[120px] truncate">{s.id}</span>
                        </div>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.status === 'active' ? 'bg-emerald-100 text-emerald-700' : 'bg-gray-200 text-gray-600'}`}>
                          {s.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-1">
                        <span className="text-xs text-gray-500 font-medium">
                          {Math.round(s.durationMs / 1000)}s total
                        </span>
                        <span className="text-xs text-gray-400">
                          {s.startedAt ? format(new Date(s.startedAt), 'MMM d, HH:mm') : ''}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
