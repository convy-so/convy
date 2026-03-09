import { getSurveyReviewDetails } from "@/app/actions/admin";
import { notFound } from "next/navigation";
import { format } from "date-fns";
import {
    ArrowLeft,
    MessageSquare,
    User as UserIcon,
    Calendar,
    Layers,
    Target,
    Users as UsersIcon,
    BrainCircuit
} from "lucide-react";
import { Link } from "@/i18n/routing";
import { FeedbackForm } from "@/components/admin/feedback-form";
import { Suspense } from "react";
import { headers } from "next/headers";



async function ReviewContent({
    params,
    cookieHeader,
}: {
    params: Promise<{ id: string }>;
    cookieHeader: string | null;
}) {
    const { id } = await params;
    const survey = await getSurveyReviewDetails(id, cookieHeader);

    if (!survey) {
        notFound();
    }

    return (
        <div className="space-y-8">
            <Link
                href="/admin/surveys"
                className="inline-flex items-center gap-2 text-sm font-medium text-gray-500 hover:text-gray-900 transition-colors"
            >
                <ArrowLeft className="w-4 h-4" />
                Back to Survey List
            </Link>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Left Column: Survey Details */}
                <div className="flex-1 space-y-6">
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm space-y-6">
                        <div className="flex items-start justify-between">
                            <div className="space-y-1">
                                <h1 className="text-2xl font-bold text-gray-900">{survey.title || "Untitled Survey"}</h1>
                                <p className="text-gray-500 pr-4">{survey.description || "No description provided."}</p>
                            </div>
                            <div className="px-3 py-1 bg-indigo-50 text-indigo-700 text-xs font-bold uppercase rounded-lg">
                                {survey.status}
                            </div>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-6 pt-6 border-t border-gray-50">
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-gray-400 uppercase">Creator</p>
                                <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                    <UserIcon className="w-4 h-4 text-gray-400" />
                                    {(survey as any).user?.name}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-gray-400 uppercase">Created On</p>
                                <div className="flex items-center gap-2 text-sm text-gray-900 font-medium">
                                    <Calendar className="w-4 h-4 text-gray-400" />
                                    {format(new Date(survey.createdAt), "PPP")}
                                </div>
                            </div>
                            <div className="space-y-1">
                                <p className="text-xs font-semibold text-gray-400 uppercase">Language</p>
                                <div className="flex items-center gap-2 text-sm text-gray-900 font-medium capitalize">
                                    {survey.language}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Survey Configuration Details */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-indigo-600">
                                <Target className="w-5 h-5" />
                                <h3 className="font-semibold text-gray-900">Objective</h3>
                            </div>
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <span className="font-semibold text-gray-900">Goal:</span> {survey.expertState?.objective?.goal || "Not defined"}
                                </p>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <span className="font-semibold text-gray-900">Decision to be made:</span> {survey.expertState?.objective?.decision || "Not defined"}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-emerald-600">
                                <UsersIcon className="w-5 h-5" />
                                <h3 className="font-semibold text-gray-900">Target Audience</h3>
                            </div>
                            <div className="space-y-3">
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <span className="font-semibold text-gray-900">Description:</span> {survey.expertState?.targetAudience?.description || "Not defined"}
                                </p>
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <span className="font-semibold text-gray-900">Relationship:</span> {survey.expertState?.targetAudience?.relationship || "Not defined"}
                                </p>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-amber-600">
                                <Layers className="w-5 h-5" />
                                <h3 className="font-semibold text-gray-900">Scope & Topics</h3>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-gray-600 leading-relaxed capitalize">
                                    <span className="font-semibold text-gray-900">Breadth vs Depth:</span> {survey.expertState?.scope?.breadthVsDepth || "Not defined"}
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {survey.expertState?.scope?.mainTopics?.map((topic: string) => (
                                        <span key={topic} className="px-2 py-1 bg-amber-50 text-amber-700 text-[10px] font-bold uppercase rounded-md">
                                            {topic}
                                        </span>
                                    ))}
                                    {!survey.expertState?.scope?.mainTopics?.length && <span className="text-sm text-gray-400">No topics defined</span>}
                                </div>
                            </div>
                        </div>

                        <div className="bg-white p-6 rounded-2xl border border-gray-100 shadow-sm space-y-4">
                            <div className="flex items-center gap-3 text-purple-600">
                                <BrainCircuit className="w-5 h-5" />
                                <h3 className="font-semibold text-gray-900">Success Criteria</h3>
                            </div>
                            <div className="space-y-2">
                                <p className="text-sm text-gray-600 leading-relaxed">
                                    <span className="font-semibold text-gray-900">Detail Level:</span> {survey.expertState?.successCriteria?.detailLevel || "Not defined"}
                                </p>
                                <div className="flex flex-wrap gap-2 pt-1">
                                    {survey.expertState?.successCriteria?.insightTypes?.map((type: string) => (
                                        <span key={type} className="px-2 py-1 bg-purple-50 text-purple-700 text-[10px] font-bold uppercase rounded-md">
                                            {type}
                                        </span>
                                    ))}
                                    {!survey.expertState?.successCriteria?.insightTypes?.length && <span className="text-sm text-gray-400">No insight types defined</span>}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Creation Conversation Transcript */}
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="font-semibold text-gray-900 flex items-center gap-2">
                                <MessageSquare className="w-5 h-5 text-gray-400" />
                                Creation Conversation
                            </h3>
                            <span className="text-xs text-gray-400">
                                {(survey as any).creationConversation?.messages?.length || 0} messages
                            </span>
                        </div>

                        <div className="space-y-6 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                            {(survey as any).creationConversation?.messages?.map((msg: any, idx: number) => (
                                <div key={idx} className={`space-y-1 ${msg.role === 'user' ? 'text-right' : 'text-left'}`}>
                                    <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest px-1">
                                        {msg.role}
                                    </p>
                                    <div className={`inline-block p-4 rounded-2xl text-sm leading-relaxed max-w-[90%] ${msg.role === 'user'
                                        ? 'bg-indigo-600 text-white rounded-tr-none'
                                        : 'bg-gray-50 text-gray-900 rounded-tl-none border border-gray-100'
                                        }`}>
                                        {msg.content}
                                    </div>
                                </div>
                            ))}
                            {!(survey as any).creationConversation && (
                                <div className="py-12 text-center text-gray-400 italic">
                                    No creation conversation transcript found.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column: Expert Feedback Form */}
                <div className="w-full lg:w-96">
                    <div className="bg-white p-8 rounded-2xl border border-gray-100 shadow-sm sticky top-32 space-y-6">
                        <div className="space-y-1">
                            <h2 className="text-xl font-bold text-gray-900 font-aspekta">Expert Feedback</h2>
                            <p className="text-sm text-gray-500">Provide analysis on the survey quality and suggested improvements.</p>
                        </div>

                        <FeedbackForm surveyId={id} initialFeedback={survey.improvementFeedback || ""} />
                    </div>
                </div>
            </div>
        </div>
    );
}

export default function SurveyReviewPage(props: { params: Promise<{ id: string }> }) {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center p-12">
                <div className="w-8 h-8 border-4 border-gray-200 border-t-indigo-600 rounded-full animate-spin" />
            </div>
        }>
            <ReviewContentWrapper {...props} />
        </Suspense>
    );
}

async function ReviewContentWrapper(props: { params: Promise<{ id: string }> }) {
    const cookieHeader = (await headers()).get("cookie");
    return <ReviewContent {...props} cookieHeader={cookieHeader} />;
}

