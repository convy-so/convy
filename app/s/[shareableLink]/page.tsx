"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Loader2, AlertCircle, ArrowRight} from "lucide-react";
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
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4 font-sans selection:bg-gray-900 selection:text-white">
      {/* Background decoration */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[500px] h-[500px] bg-gradient-to-br from-indigo-500/20 to-purple-500/20 rounded-full blur-3xl opacity-50" />
      </div>

      <div className="relative w-full max-w-lg">
        <div className="bg-white/80 backdrop-blur-xl rounded-3xl shadow-[0_20px_40px_-12px_rgba(0,0,0,0.1)] border border-white/50 p-8 md:p-12 text-center">
          
          {/* Logo */}
          <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-8 shadow-lg shadow-gray-900/20">
            <img
              src="/logo.svg"
              alt="Convy Logo"
              width={32}
              height={32}
              className="w-8 h-8 object-contain invert"
            />
          </div>

          {/* Title */}
          <h1 className="text-3xl font-bold text-gray-900 tracking-tight mb-4 text-balance">
            {survey.title}
          </h1>

          {/* Description */}
          {survey.objective?.description ? (
             <p className="text-gray-500 text-lg leading-relaxed mb-10 text-balance">
              {survey.objective.description}
            </p>
          ) : survey.additionalContext ? (
            <p className="text-gray-500 text-lg leading-relaxed mb-10 text-balance">
              {survey.additionalContext}
            </p>
          ) : (
             <div className="mb-10" />
          )}

          {/* Action */}
          {isFull ? (
            <div className="p-4 bg-gray-100 rounded-2xl border border-gray-200">
              <p className="text-gray-600 font-medium">
                Partipation limit reached.
              </p>
            </div>
          ) : (
            <Link
              href={`/s/${shareableLink}/respond`}
              className="group relative w-full flex items-center justify-center gap-2 px-8 py-4 bg-gray-900 text-white rounded-2xl font-semibold text-lg hover:bg-black transition-all duration-300 shadow-xl shadow-gray-900/10 hover:shadow-gray-900/20 hover:-translate-y-0.5 active:translate-y-0"
            >
              Start Conversation
              <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}
