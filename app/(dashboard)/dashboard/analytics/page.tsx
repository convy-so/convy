import { getVerifiedSession } from "@/lib/auth/session";
import { db } from "@/db";
import { surveys, surveyConversations, surveyAnalytics } from "@/db/schema";
import { eq, desc, count } from "drizzle-orm";
import Link from "next/link";
import {
  BarChart3,
  TrendingUp,
  ExternalLink,
  Calendar,
  ArrowRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const metadata = {
  title: "Analytics | Convy",
  description: "Global analytics overview for all your surveys",
};

export default async function AnalyticsPage() {
  const session = await getVerifiedSession();

  // Fetch all surveys for the user
  const userSurveys = await db
    .select({
       id: surveys.id,
       title: surveys.title,
       createdAt: surveys.createdAt,
       _count: {
           conversations: count(surveyConversations.id)
       }
    })
    .from(surveys)
    .leftJoin(surveyConversations, eq(surveyConversations.surveyId, surveys.id))
    .where(eq(surveys.userId, session.user.id))
    .groupBy(surveys.id, surveys.title, surveys.createdAt)
    .orderBy(desc(surveys.createdAt));

    // Calculate global stats
    const totalSurveys = userSurveys.length;
    const totalResponses = userSurveys.reduce((acc, curr) => acc + (curr._count?.conversations || 0), 0);

  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 tracking-tight">Analytics Overview</h1>
          <p className="text-gray-500 mt-1">
            Performance metrics across all your surveys
          </p>
        </div>
      </div>

       {/* Overview Stats */}
       <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
                 <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-blue-50 text-blue-600">
                        <BarChart3 className="w-5 h-5" />
                    </div>
                 </div>
                 <p className="text-2xl font-bold text-gray-900 mb-1">{totalSurveys}</p>
                 <p className="text-sm text-gray-500">Total Surveys</p>
            </div>
            <div className="bg-white rounded-2xl border border-gray-100 p-5">
                 <div className="flex items-start justify-between mb-3">
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center bg-purple-50 text-purple-600">
                        <TrendingUp className="w-5 h-5" />
                    </div>
                 </div>
                 <p className="text-2xl font-bold text-gray-900 mb-1">{totalResponses}</p>
                 <p className="text-sm text-gray-500">Total Responses</p>
            </div>
       </div>

      {/* Survey List */}
      <div className="bg-white rounded-2xl border border-gray-100 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-100">
            <h3 className="text-base font-semibold text-gray-900">Your Surveys</h3>
            <p className="text-sm text-gray-500">Select a survey to view detailed AI analytics</p>
        </div>
        
        {userSurveys.length > 0 ? (
            <div className="overflow-x-auto">
            <table className="w-full">
                <thead>
                <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Survey Title
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Responses
                    </th>
                    <th className="text-left px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Created
                    </th>
                    <th className="text-right px-6 py-3 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    Action
                    </th>
                </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                {userSurveys.map((survey) => (
                    <tr key={survey.id} className="hover:bg-gray-50/50 transition-colors group">
                    <td className="px-6 py-4">
                        <span className="text-sm font-medium text-gray-900">{survey.title}</span>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-emerald-500" />
                             <span className="text-sm font-semibold text-gray-700">{survey._count?.conversations || 0}</span>
                        </div>
                    </td>
                    <td className="px-6 py-4">
                        <div className="flex items-center gap-2 text-gray-500 text-sm">
                            <Calendar className="w-3.5 h-3.5" />
                            {new Date(survey.createdAt).toLocaleDateString()}
                        </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                        <Link 
                            href={`/dashboard/surveys/${survey.id}/analytics`}
                            className="inline-flex items-center gap-1 text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
                        >
                            View Analysis
                            <ArrowRight className="w-4 h-4" />
                        </Link>
                    </td>
                    </tr>
                ))}
                </tbody>
            </table>
            </div>
        ) : (
            <div className="p-12 text-center text-gray-500">
                <p>No surveys found. Create a survey to see analytics.</p>
                <Link href="/dashboard/create" className="text-blue-600 hover:underline mt-2 inline-block">
                    Create Survey
                </Link>
            </div>
        )}
      </div>
    </div>
  );
}
