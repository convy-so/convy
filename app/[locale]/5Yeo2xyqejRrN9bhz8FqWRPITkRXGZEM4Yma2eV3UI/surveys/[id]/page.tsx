import { Suspense } from "react";
import { format } from "date-fns";
import {
  ArrowLeft,
  BrainCircuit,
  Calendar,
  Layers,
  MessageSquare,
  Target,
  User as UserIcon,
  Users as UsersIcon,
} from "lucide-react";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { getSurveyReviewDetails } from "@/app/actions/admin";
import { Link } from "@/i18n/routing";
import { getAdminAppPath } from "@/lib/auth/admin-path";
import { type ChatMessage } from "@/lib/chat-types";

async function ReviewContent({
  params,
  cookieHeader,
}: {
  params: Promise<{ id: string }>;
  cookieHeader: string | null;
}) {
  const { id } = await params;
  const result = await getSurveyReviewDetails(id, cookieHeader);

  if (!result.success || !result.data) {
    notFound();
  }

  const survey = result.data;
  const brief = survey.brief?.brief;

  return (
    <div className="space-y-8">
      <Link
        href={getAdminAppPath("/surveys")}
        className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 transition-colors hover:text-gray-900"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Survey List
      </Link>

      <div className="flex flex-col gap-8 lg:flex-row">
        <div className="flex-1 space-y-6">
          <div className="space-y-6 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="flex items-start justify-between">
              <div className="space-y-1">
                <h1 className="text-2xl font-bold text-gray-900">
                  {survey.title || "Untitled Survey"}
                </h1>
                <p className="pr-4 text-gray-500">
                  {survey.description || "No description provided."}
                </p>
              </div>
              <div className="rounded-lg bg-indigo-50 px-3 py-1 text-xs font-bold uppercase text-indigo-700">
                {survey.status}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 border-t border-gray-50 pt-6 md:grid-cols-3">
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Creator
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <UserIcon className="h-4 w-4 text-gray-400" />
                  {survey.user?.name}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Created On
                </p>
                <div className="flex items-center gap-2 text-sm font-medium text-gray-900">
                  <Calendar className="h-4 w-4 text-gray-400" />
                  {format(new Date(survey.createdAt), "PPP")}
                </div>
              </div>
              <div className="space-y-1">
                <p className="text-xs font-semibold uppercase text-gray-400">
                  Language
                </p>
                <div className="flex items-center gap-2 text-sm font-medium capitalize text-gray-900">
                  {survey.language}
                </div>
              </div>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-indigo-600">
                <Target className="h-5 w-5" />
                <h3 className="font-semibold text-gray-900">Objective</h3>
              </div>
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">Goal:</span>{" "}
                  {brief?.researchGoal || "Not defined"}
                </p>
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">
                    Decision to be made:
                  </span>{" "}
                  {brief?.decisionToInform || "Not defined"}
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-emerald-600">
                <UsersIcon className="h-5 w-5" />
                <h3 className="font-semibold text-gray-900">Target Audience</h3>
              </div>
              <div className="space-y-3">
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">
                    Description:
                  </span>{" "}
                  {brief?.audienceDefinition || "Not defined"}
                </p>
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">
                    Relationship:
                  </span>{" "}
                  {brief?.audienceRelationship || "Not defined"}
                </p>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-amber-600">
                <Layers className="h-5 w-5" />
                <h3 className="font-semibold text-gray-900">Scope & Topics</h3>
              </div>
              <div className="space-y-2">
                <p className="text-sm capitalize leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">
                    Program Context:
                  </span>{" "}
                  {brief?.learningContext || "Not defined"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {brief?.requiredTopics?.map((topic: string) => (
                    <span
                      key={topic}
                      className="rounded-md bg-amber-50 px-2 py-1 text-[10px] font-bold uppercase text-amber-700"
                    >
                      {topic}
                    </span>
                  ))}
                  {!brief?.requiredTopics?.length && (
                    <span className="text-sm text-gray-400">
                      No topics defined
                    </span>
                  )}
                </div>
              </div>
            </div>

            <div className="space-y-4 rounded-2xl border border-gray-100 bg-white p-6 shadow-sm">
              <div className="flex items-center gap-3 text-purple-600">
                <BrainCircuit className="h-5 w-5" />
                <h3 className="font-semibold text-gray-900">Success Criteria</h3>
              </div>
              <div className="space-y-2">
                <p className="text-sm leading-relaxed text-gray-600">
                  <span className="font-semibold text-gray-900">Program:</span>{" "}
                  {brief?.programId || "Not defined"}
                </p>
                <div className="flex flex-wrap gap-2 pt-1">
                  {brief?.successCriteria?.map((type: string) => (
                    <span
                      key={type}
                      className="rounded-md bg-purple-50 px-2 py-1 text-[10px] font-bold uppercase text-purple-700"
                    >
                      {type}
                    </span>
                  ))}
                  {!brief?.successCriteria?.length && (
                    <span className="text-sm text-gray-400">
                      No success criteria defined
                    </span>
                  )}
                </div>
              </div>
            </div>
          </div>

          <div className="rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="mb-6 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-semibold text-gray-900">
                <MessageSquare className="h-5 w-5 text-gray-400" />
                Creation Conversation
              </h3>
              <span className="text-xs text-gray-400">
                {survey.creationConversation?.messages?.length || 0} messages
              </span>
            </div>

            <div className="custom-scrollbar max-h-[500px] space-y-6 overflow-y-auto pr-4">
              {survey.creationConversation?.messages?.map(
                (msg: ChatMessage, idx: number) => (
                  <div
                    key={idx}
                    className={`space-y-1 ${msg.role === "user" ? "text-right" : "text-left"}`}
                  >
                    <p className="px-1 text-[10px] font-bold uppercase tracking-widest text-gray-400">
                      {msg.role}
                    </p>
                    <div
                      className={`inline-block max-w-[90%] rounded-2xl p-4 text-sm leading-relaxed ${
                        msg.role === "user"
                          ? "rounded-tr-none bg-indigo-600 text-white"
                          : "rounded-tl-none border border-gray-100 bg-gray-50 text-gray-900"
                      }`}
                    >
                      {msg.content}
                    </div>
                  </div>
                ),
              )}
              {!survey.creationConversation && (
                <div className="py-12 text-center italic text-gray-400">
                  No creation conversation transcript found.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="w-full lg:w-96">
          <div className="sticky top-32 space-y-6 rounded-2xl border border-gray-100 bg-white p-8 shadow-sm">
            <div className="space-y-1">
              <h2 className="font-aspekta text-xl font-bold text-gray-900">
                Review Notes
              </h2>
              <p className="text-sm text-gray-500">
                The legacy admin feedback textbox has been removed. This page now
                serves as a clean read-only review of the survey brief and
                creation transcript.
              </p>
            </div>
            <div className="rounded-2xl border border-gray-100 bg-gray-50 p-4 text-sm leading-relaxed text-gray-600">
              Use the survey brief, required topics, and creation conversation
              above to assess quality. Any actual interviewer tuning now belongs
              in the sample-review optimization workflow, not in a detached
              admin feedback field.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function SurveyReviewPage(props: {
  params: Promise<{ id: string }>;
}) {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center p-12">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-gray-200 border-t-indigo-600" />
        </div>
      }
    >
      <ReviewContentWrapper {...props} />
    </Suspense>
  );
}

async function ReviewContentWrapper(props: { params: Promise<{ id: string }> }) {
  const cookieHeader = (await headers()).get("cookie");
  return <ReviewContent {...props} cookieHeader={cookieHeader} />;
}
