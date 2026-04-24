"use client";

import {
  Users,
  CheckCircle2,
  Sparkles,
  Loader2,
  Keyboard,
  Play,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { MediaUploadFlow } from "@/components/surveys/media-upload-flow";

interface CreatorSidebarSectionProps {
  surveyId: string | null;
  collectedInfo: any;
  extractedData: any;
  mediaDecision: any;
  mediaDecisionResolved: boolean;
  resolveLocalMediaToolResult: (id: string, output: any) => void;
  isReadyForSample: boolean;
  isFinalizing: boolean;
  handleGoToSampleConversations: () => void;
  t: (key: string) => string;
}

export function CreatorSidebarSection({
  surveyId,
  collectedInfo,
  extractedData,
  mediaDecision,
  mediaDecisionResolved,
  resolveLocalMediaToolResult,
  isReadyForSample,
  isFinalizing,
  handleGoToSampleConversations,
  t,
}: CreatorSidebarSectionProps) {
  return (
    <div className="w-full lg:w-80 border-t lg:border-t-0 lg:border-l border-gray-100 bg-gray-50/30 flex flex-col min-h-0">
      <div className="p-6 flex-1 overflow-y-auto space-y-8">
        {/* Progress Checklist */}
        <div className="space-y-4">
          <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
            <CheckCircle2 className="w-3 h-3" />
            Requirement Check
          </h3>
          <div className="space-y-2">
            {[
              { label: "Core Objective", done: collectedInfo?.objective },
              { label: "Target Audience", done: collectedInfo?.targetAudience },
              { label: "Subject Definition", done: collectedInfo?.subjectDefined },
              { label: "Success Criteria", done: collectedInfo?.successCriteria },
              { label: "Media Strategy", done: mediaDecisionResolved },
            ].map((item) => (
              <div
                key={item.label}
                className={cn(
                  "flex items-center justify-between p-3 rounded-xl border transition-all duration-300",
                  item.done
                    ? "bg-white border-emerald-100 text-emerald-900 shadow-sm"
                    : "bg-white/50 border-gray-100 text-gray-400 opacity-60",
                )}
              >
                <span className="text-sm font-medium">{item.label}</span>
                {item.done ? (
                  <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                ) : (
                  <div className="w-4 h-4 rounded-full border-2 border-gray-100" />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Media Management */}
        {surveyId && mediaDecision.recommendation === "add_media" && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Sparkles className="w-3 h-3" />
              Resource Assets
            </h3>
            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm">
              <MediaUploadFlow
                surveyId={surveyId}
                allowedTypes={mediaDecision.allowedTypes}
                recommendation={mediaDecision.recommendation || "add_media"}
                rationale={mediaDecision.rationale}
                aiDescription={mediaDecision.suggestedDescription}
                aiLearningGoal={mediaDecision.suggestedFeedbackFocus}
                preferVoiceInput={false}
                dictationLanguage="en"
                onAllUploaded={(media) => {
                  if (media.length > 0) {
                    resolveLocalMediaToolResult("media-upload-manual", {
                      success: true,
                      mediaId: media[0].id,
                    });
                  }
                }}
                onSkip={() => {
                  resolveLocalMediaToolResult("media-upload-manual", {
                    success: false,
                    error: "Skipped",
                  });
                }}
              />
            </div>
          </div>
        )}

        {/* Data summary */}
        {extractedData && (
          <div className="space-y-4">
            <h3 className="text-xs font-bold text-gray-400 uppercase tracking-widest flex items-center gap-2">
              <Keyboard className="w-3 h-3" />
              Brief Summary
            </h3>
            <div className="p-4 bg-white rounded-2xl border border-gray-100 shadow-sm space-y-4">
              {extractedData.objective?.goal && (
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Goal</p>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{extractedData.objective.goal}</p>
                </div>
              )}
              {extractedData.targetAudience?.description && (
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-tight">Audience</p>
                  <p className="text-xs text-gray-600 line-clamp-2 mt-0.5">{extractedData.targetAudience.description}</p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action Footer */}
      <div className="p-6 bg-white border-t border-gray-100">
        <button
          onClick={handleGoToSampleConversations}
          disabled={!isReadyForSample || isFinalizing}
          className={cn(
            "w-full py-4 rounded-xl font-bold text-sm transition-all duration-300 flex items-center justify-center gap-2",
            isReadyForSample
              ? "bg-black text-white hover:bg-gray-800 shadow-xl shadow-black/10 scale-[1.02]"
              : "bg-gray-100 text-gray-400 cursor-not-allowed",
          )}
        >
          {isFinalizing ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Generate Sample Conversations
        </button>
        {!isReadyForSample && (
          <p className="text-[10px] text-gray-400 mt-3 text-center leading-relaxed px-2">
            Complete the core objective and target audience to proceed to simulation.
          </p>
        )}
      </div>
    </div>
  );
}
