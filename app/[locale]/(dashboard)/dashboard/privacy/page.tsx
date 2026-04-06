"use client";

import { useQuery } from "@tanstack/react-query";
import {
  getPrivacyDashboardData,
  type PrivacyDashboardConsentRow,
} from "@/app/actions/privacy-dashboard";
import { motion } from "framer-motion";
import { ShieldCheck, UserCheck, AlertOctagon, FileText, Loader2, Info } from "lucide-react";
import { useAuth } from "@/components/providers/auth-provider";
import { format } from "date-fns";

function getEvidenceSource(evidence: PrivacyDashboardConsentRow["evidence"]) {
  return evidence?.source ?? "api";
}

export default function PrivacyDashboard() {
  const { session } = useAuth();
  
  const { data: response, isLoading } = useQuery({
    queryKey: ["privacyDashboard", session?.activeOrganizationId],
    queryFn: getPrivacyDashboardData,
    enabled: !!session?.activeOrganizationId,
  });

  const data = response?.success ? response.data : { requests: [], consents: [] };

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
          <AlertOctagon className="mx-auto mb-4 h-12 w-12 text-red-500" />
          <h2 className="text-xl font-bold">Access Denied</h2>
          <p className="mt-2 text-sm text-red-700">{response.error}</p>
        </div>
      </div>
    );
  }

  const pendingRequests = data.requests.filter(r => r.status === "pending").length;

  return (
    <div className="mx-auto max-w-6xl px-4 py-8 relative">
      
      {/* Header section with Framer Motion */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5 }}
        className="mb-12"
      >
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight">Privacy Hub</h1>
        <p className="mt-3 text-base text-gray-500 max-w-2xl">
          Manage data subject access requests, analyze consent events, and maintain total compliance across your workspace.
        </p>
      </motion.div>

      {/* KPI Tiles */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.1 }}
        className="grid gap-6 md:grid-cols-3 mb-10"
      >
        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-gray-500">Pending Requests</h3>
            <div className="bg-indigo-50 p-2 rounded-xl text-indigo-600">
              <FileText className="w-5 h-5"/>
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{pendingRequests}</p>
        </div>

        <div className="rounded-2xl bg-white/70 backdrop-blur-xl border border-gray-200 p-6 shadow-sm hover:shadow-md hover:scale-[1.02] transition-all duration-300">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-gray-500">Active Consents</h3>
            <div className="bg-emerald-50 p-2 rounded-xl text-emerald-600">
              <UserCheck className="w-5 h-5"/>
            </div>
          </div>
          <p className="text-4xl font-bold text-gray-900">{data.consents.filter(c => c.decision === "accept").length}</p>
        </div>

        <div className="rounded-2xl bg-indigo-600 border border-indigo-700 p-6 shadow-md hover:shadow-lg hover:scale-[1.02] transition-all duration-300 text-white">
          <div className="flex justify-between items-start mb-4">
            <h3 className="text-sm font-medium text-indigo-100">Compliance Health</h3>
            <div className="bg-indigo-500 p-2 rounded-xl text-white">
              <ShieldCheck className="w-5 h-5"/>
            </div>
          </div>
          <p className="text-4xl font-bold">Good</p>
        </div>
      </motion.div>

      {/* Data Grids */}
      <motion.div 
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ duration: 0.5, delay: 0.2 }}
        className="grid gap-8 lg:grid-cols-2"
      >
        {/* Privacy Requests Col */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Data Subject Requests
            <div className="group relative cursor-help">
              <Info className="w-4 h-4 text-gray-400 hover:text-indigo-500 transition-colors" />
            </div>
          </h2>
          
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[500px]">
            <div className="overflow-y-auto p-2">
              {data.requests.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-gray-500 text-sm">
                  <FileText className="h-8 w-8 mb-2 opacity-20" />
                  No privacy requests found
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {data.requests.map((r, i) => (
                    <motion.div 
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      transition={{ delay: i * 0.05 }}
                      key={r.id} 
                      className="p-4 rounded-xl border border-gray-100 bg-gray-50/50 hover:bg-gray-50 flex flex-col gap-2 transition-colors cursor-pointer"
                    >
                      <div className="flex justify-between items-start">
                        <span className="font-semibold text-sm text-gray-900">{r.user?.name || r.user?.email || "Anonymous Request"}</span>
                        <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${r.status === 'pending' ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                          {r.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center mt-2">
                        <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-1 rounded-lg uppercase tracking-wide">
                          {r.requestType?.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400 font-medium">
                          {r.createdAt ? format(new Date(r.createdAt), 'MMM d, yyyy') : 'Unknown'}
                        </span>
                      </div>
                    </motion.div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Consent Events Col */}
        <div className="flex flex-col gap-4">
          <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
            Consent Audit Log
          </h2>
          
          <div className="rounded-2xl border border-gray-200 bg-white shadow-sm overflow-hidden flex flex-col h-[500px]">
             <div className="overflow-y-auto p-2">
              {data.consents.length === 0 ? (
                <div className="flex h-40 flex-col items-center justify-center text-gray-500 text-sm">
                  <UserCheck className="h-8 w-8 mb-2 opacity-20" />
                  No consent events recorded
                </div>
              ) : (
                <div className="space-y-2 p-2">
                  {data.consents.map((c, i) => (
                    <motion.div 
                      key={c.id} 
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: i * 0.05 }}
                      className="p-4 rounded-xl border border-gray-100 bg-white shadow-sm hover:shadow-md hover:scale-[1.01] transition-all"
                    >
                      <div className="flex justify-between mb-2">
                        <div className="flex gap-2 items-center">
                          <span className={`w-2 h-2 rounded-full ${c.decision === 'accept' ? 'bg-emerald-500' : 'bg-red-500'}`} />
                          <span className="text-sm font-semibold text-gray-900 uppercase">
                            {c.consentKey}
                          </span>
                        </div>
                        <span className="text-xs text-gray-400">
                          {c.createdAt ? format(new Date(c.createdAt), 'HH:mm - MMM d') : ''}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 flex justify-between bg-gray-50 p-2 rounded-lg">
                        <span>Subject: <strong className="text-gray-700">{c.subjectType}</strong></span>
                        <span>Evidence: <strong className="text-gray-700">{getEvidenceSource(c.evidence)}</strong></span>
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
