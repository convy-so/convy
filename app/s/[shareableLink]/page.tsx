"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { MessageSquare, Loader2, AlertCircle, ArrowRight, Clock, Users } from "lucide-react";
import Link from "next/link";

interface Survey {
  id: string;
  title: string;
  additionalContext?: string;
  objective?: {
    description?: string;
  };
  targetAudience?: {
    description?: string;
  };
  status: string;
  currentParticipants: number;
  participantLimit: number;
}

export default function ShareableSurveyPage() {
  const params = useParams();
  const router = useRouter();
  const shareableLink = params.shareableLink as string;
  
  const [survey, setSurvey] = useState<Survey | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSurvey = async () => {
      try {
        const response = await fetch(`/api/surveys/shared/${shareableLink}`);
        
        if (!response.ok) {
          if (response.status === 404) {
            setError("Survey not found");
          } else {
            setError("Failed to load survey");
          }
          return;
        }
        
        const data = await response.json();
        setSurvey(data.survey);
      } catch (err) {
        setError("Failed to load survey");
      } finally {
        setIsLoading(false);
      }
    };

    if (shareableLink) {
      fetchSurvey();
    }
  }, [shareableLink]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400 mx-auto mb-4" />
          <p className="text-gray-500">Loading survey...</p>
        </div>
      </div>
    );
  }

  if (error || !survey) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <AlertCircle className="w-8 h-8 text-red-500" />
          </div>
          <h1 className="text-xl font-bold text-gray-900 mb-2">
            {error || "Survey not found"}
          </h1>
          <p className="text-gray-500 mb-6">
            This survey may have been removed or the link is invalid.
          </p>
          <Link
            href="/"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-colors"
          >
            Go to Homepage
          </Link>
        </div>
      </div>
    );
  }

  const isFull = survey.currentParticipants >= survey.participantLimit;

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden">
        {/* Header */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 p-6 text-white">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-12 h-12 bg-white/10 backdrop-blur rounded-xl flex items-center justify-center">
              <MessageSquare className="w-6 h-6" />
            </div>
            <div>
              <p className="text-sm text-gray-300">Conversational Survey</p>
              <h1 className="text-xl font-bold">{survey.title}</h1>
            </div>
          </div>
          
          {survey.additionalContext && (
            <p className="text-gray-300 text-sm leading-relaxed">
              {survey.additionalContext}
            </p>
          )}
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Survey Info */}
          {survey.objective?.description && (
            <div>
              <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wide mb-2">
                About this survey
              </h3>
              <p className="text-gray-700">{survey.objective.description}</p>
            </div>
          )}

          {/* Stats */}
          <div className="flex items-center gap-6 text-sm text-gray-500">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              <span>~5 min</span>
            </div>
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4" />
              <span>{survey.currentParticipants} / {survey.participantLimit} responses</span>
            </div>
          </div>

          {/* CTA */}
          {isFull ? (
            <div className="p-4 bg-amber-50 border border-amber-200 rounded-xl">
              <p className="text-amber-800 font-medium">
                This survey has reached its participant limit.
              </p>
            </div>
          ) : (
            <Link
              href={`/s/${shareableLink}/respond`}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 bg-gray-900 text-white rounded-xl font-bold hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
            >
              Start Survey
              <ArrowRight className="w-5 h-5" />
            </Link>
          )}

          {/* Footer note */}
          <p className="text-center text-xs text-gray-400">
            Your responses are anonymous and will help improve our services.
          </p>
        </div>
      </div>
    </div>
  );
}
