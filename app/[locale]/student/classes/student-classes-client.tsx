"use client";

import { useStudentLearningWorkspace } from "@/components/learning/hooks/use-student-learning-workspace";
import { 
  Sparkles, 
  BookOpen, 
  GraduationCap, 
  ArrowRight, 
  Clock, 
  CheckCircle2, 
  FileText,
  XCircle,
  AlertCircle,
  Loader2
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Link } from "@/i18n/routing";
import { motion, AnimatePresence } from "framer-motion";
import type { LearningMeData } from "@/lib/api/learning";

type StudentLearningMeData = Extract<LearningMeData, { role: "student" }>;

export function StudentClassesClient({ 
  initialLearningMe,
  initialPatterns 
}: { 
  initialLearningMe: StudentLearningMeData;
  initialPatterns: any;
}) {
  const {
    memberships,
    invitations,
    acceptInvitationMutation,
    rejectInvitationMutation,
  } = useStudentLearningWorkspace({ 
    learningMe: initialLearningMe,
    initialPatterns 
  });

  return (
    <div className="space-y-12 pb-20">
      
      {/* 1. Pending Invitations Section */}
      <AnimatePresence mode="popLayout">
        {invitations.length > 0 && (
          <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="space-y-4"
          >
            <div className="flex items-center gap-2 px-1">
              <Sparkles className="w-4 h-4 text-amber-500 fill-amber-500" />
              <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Pending Invitations</h2>
              <span className="ml-auto px-2 py-0.5 rounded-md bg-amber-50 text-[10px] font-black text-amber-600 border border-amber-100">
                {invitations.length} NEW
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="bg-white rounded-[2rem] border border-amber-100 p-8 shadow-sm hover:shadow-md transition-all relative overflow-hidden group">
                  <div className="absolute top-0 right-0 p-4 opacity-5 group-hover:opacity-10 transition-opacity">
                     <GraduationCap className="w-24 h-24 -mr-8 -mt-8" />
                  </div>
                  <div className="flex flex-col h-full gap-6 relative z-10">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 rounded-2xl bg-amber-50 flex items-center justify-center border border-amber-100 text-amber-600">
                        <GraduationCap className="w-6 h-6" />
                      </div>
                    </div>
                    <div>
                      <h3 className="font-bold text-slate-900 text-xl leading-tight">{invitation.classroomTitle}</h3>
                      <p className="text-[10px] text-amber-600 font-black mt-1.5 uppercase tracking-[0.15em]">Action Required</p>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={() => acceptInvitationMutation.mutate(invitation.id)}
                        disabled={acceptInvitationMutation.isPending}
                        className="flex-1 bg-slate-900 text-white rounded-xl py-3.5 text-[11px] font-bold hover:bg-slate-800 transition-all flex items-center justify-center gap-2 shadow-lg shadow-slate-200"
                      >
                        {acceptInvitationMutation.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
                        Join Class
                      </button>
                      <button
                        onClick={() => rejectInvitationMutation.mutate(invitation.id)}
                        disabled={rejectInvitationMutation.isPending}
                        className="flex-1 bg-white border border-slate-200 text-slate-500 rounded-xl py-3.5 text-[11px] font-bold hover:bg-slate-50 transition-all flex items-center justify-center gap-2"
                      >
                        Decline
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* 2. Active Classrooms Section */}
      <div className="space-y-6">
        <div className="flex items-center gap-2 px-1">
          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
          <h2 className="text-sm font-black text-slate-900 uppercase tracking-widest">Active Classrooms</h2>
        </div>

        {memberships.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {memberships.map((membership) => (
              <div 
                key={membership.classroomStudentId} 
                className="bg-white rounded-[2.5rem] border border-slate-200 p-10 hover:shadow-2xl hover:border-indigo-200 transition-all duration-300 group flex flex-col"
              >
                <div className="flex flex-col h-full gap-8">
                  <div className="flex items-start justify-between">
                    <div className="w-16 h-16 rounded-3xl bg-indigo-50 flex items-center justify-center text-indigo-600 border border-indigo-100 group-hover:bg-indigo-600 group-hover:text-white transition-all transform group-hover:scale-110">
                      <BookOpen className="w-8 h-8" />
                    </div>
                    <div className="flex flex-col items-end">
                      <span className="text-[10px] font-black text-slate-300 uppercase tracking-[0.25em]">{membership.classroom.gradeLabel}</span>
                      {membership.needsOnboarding && (
                        <div className="mt-2 flex items-center gap-1.5 text-[9px] font-black text-amber-600 bg-amber-50 px-3 py-1 rounded-full border border-amber-100 uppercase tracking-wider">
                          <AlertCircle className="w-3 h-3" />
                          Needs Setup
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex-1">
                    <h3 className="font-bold text-slate-900 text-2xl leading-tight group-hover:text-indigo-600 transition-colors">
                      {membership.classroom.title}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 mt-4">
                       <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-50 border border-slate-100 text-[10px] font-bold text-slate-500 uppercase tracking-widest">
                          <Clock className="w-3.5 h-3.5" />
                          {membership.topics.length} Topics
                       </div>
                       <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-100 text-[10px] font-bold text-emerald-600 uppercase tracking-widest">
                          <Sparkles className="w-3.5 h-3.5" />
                          Active
                       </div>
                    </div>
                  </div>

                  <div className="mt-auto grid grid-cols-2 gap-4 pt-8 border-t border-slate-50">
                    <Link 
                      href={`/student/dashboard?classroomId=${membership.classroom.id}`}
                      className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-slate-900 text-white text-[12px] font-bold hover:bg-slate-800 transition-all shadow-lg shadow-slate-200"
                    >
                      Enter Class
                      <ArrowRight className="w-4 h-4" />
                    </Link>
                    <Link 
                      href={`/student/progress?classroomId=${membership.classroom.id}`}
                      className="flex items-center justify-center gap-2.5 py-4 rounded-2xl bg-white border border-slate-200 text-slate-700 text-[12px] font-bold hover:bg-slate-50 transition-all"
                    >
                      <FileText className="w-4 h-4 text-indigo-500" />
                      Reports
                    </Link>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="py-24 bg-white rounded-[3rem] border border-dashed border-slate-200 flex flex-col items-center justify-center text-center shadow-sm">
             <div className="w-24 h-24 rounded-[2rem] bg-slate-50 flex items-center justify-center mb-6">
                <GraduationCap className="w-12 h-12 text-slate-200" />
             </div>
             <h3 className="text-2xl font-bold text-slate-900">No active classes yet</h3>
             <p className="text-slate-500 font-medium max-w-sm mt-3 text-lg">Your teacher will invite you to classrooms when they are ready.</p>
          </div>
        )}
      </div>
    </div>
  );
}
