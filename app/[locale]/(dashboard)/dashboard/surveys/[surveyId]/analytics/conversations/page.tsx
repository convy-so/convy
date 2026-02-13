import { ArrowLeft, Search, SlidersHorizontal } from "lucide-react";
import { Link } from "@/i18n/routing";
import { db } from "@/db";
import { surveyConversations, conversationInsights } from "@/db/schema";
import { eq, desc } from "drizzle-orm";
import { ConversationCard } from "@/components/analytics/ConversationCard";

interface PageProps {
  params: Promise<{ surveyId: string }>;
}

export default async function ConversationsPage({ params }: PageProps) {
  const { surveyId } = await params;

  const conversations = await db.query.surveyConversations.findMany({
    where: eq(surveyConversations.surveyId, surveyId),
    orderBy: desc(surveyConversations.createdAt),
    with: {
      insights: true,
    },
  });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 min-h-screen">
      {/* Header */}
      <div className="flex flex-col gap-6 mb-8">
        <div className="flex items-center gap-4">
          <Link
            href={`/dashboard/surveys/${surveyId}/analytics`}
            className="p-2 hover:bg-gray-100 rounded-full transition-colors group"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-gray-700 transition-colors" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-gray-900 tracking-tight">
              Conversations
            </h1>
            <p className="text-gray-500 text-sm">
              Explore individual participant sessions
            </p>
          </div>
        </div>

        {/* Filters & Search Toolbar */}
        <div className="flex flex-col sm:flex-row gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search transcripts..."
              className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-blue-100 focus:border-blue-300 transition-all"
            />
          </div>
          <div className="flex gap-2">
            <button className="flex items-center gap-2 px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 hover:bg-gray-50 transition-colors">
              <SlidersHorizontal className="w-4 h-4 text-gray-500" />
              <span>Filter</span>
            </button>
            <select className="px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-100 cursor-pointer">
              <option>Newest first</option>
              <option>Oldest first</option>
              <option>Highest sentiment</option>
              <option>Lowest sentiment</option>
            </select>
          </div>
        </div>
      </div>

      {/* Conversations Grid */}
      {conversations.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 bg-gray-50/50 rounded-2xl border border-dashed border-gray-200">
          <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Search className="w-6 h-6 text-gray-400" />
          </div>
          <h3 className="text-gray-900 font-medium mb-1">No conversations yet</h3>
          <p className="text-sm text-gray-500">
            Share your survey link to start collecting responses.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {conversations.map((conv: any) => {
             // Type assertion helper for insights json
             const insightsData = conv.insights?.insights as any;
             const sentiment = insightsData?.sentiment?.score ?? 0;
             // Calculate duration if convenient, else mock or use simple diff
             const startTime = new Date(conv.createdAt).getTime();
             const endTime = new Date(conv.updatedAt).getTime();
             const duration = Math.max(1, Math.round((endTime - startTime) / 60000));
             
             // Count messages
             const msgCount = (conv.rawConversation as any[])?.length || 0;

            return (
              <ConversationCard
                key={conv.id}
                id={conv.id}
                surveyId={surveyId}
                summary={conv.summary || insightsData?.summary}
                sentimentScore={sentiment}
                durationMinutes={duration}
                messageCount={msgCount}
                isCompleted={conv.completed}
                createdAt={conv.createdAt.toISOString()}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
