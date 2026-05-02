import { getVerifiedSession } from "@/lib/auth/session";
import { getDb } from "@/db";
import { classroomStudents, studentInterestProfiles } from "@/db/schema/learning";
import { eq } from "drizzle-orm";
import { UserCircle, Compass, Target, Brain } from "lucide-react";

import type { StudentInterestProfile } from "@/lib/learning/types";

export default async function StudentProfilePage() {
    const session = await getVerifiedSession();
    const userId = session.user.id;

    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
    });

    const studentIds = studentProfiles.map(s => s.id);

    const interests = studentIds.length > 0 ? await getDb().query.studentInterestProfiles.findFirst({
        where: eq(studentInterestProfiles.classroomStudentId, studentIds[0]),
    }) : null;

    const defaultProfile: StudentInterestProfile = {
        primaryInterests: [],
        aspirations: [],
        curiosityAreas: [],
        motivationalStyle: [],
        learningRelationship: "neutral",
        contextTags: [],
        privateNotes: [],
        lastUpdated: new Date().toISOString()
    };

    const profileData = interests?.profile || defaultProfile;

    return (
        <div className="space-y-8 max-w-4xl">
            <div>
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Learning Profile</h1>
                <p className="text-slate-500 text-lg mt-1">Manage your interests, goals, and learning preferences to help your AI tutor personalize your sessions.</p>
            </div>

            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
                        <UserCircle className="w-8 h-8 text-indigo-600" />
                    </div>
                    <div>
                        <h2 className="text-2xl font-bold text-slate-900">{session.user.name}</h2>
                        <p className="text-slate-500">{session.user.email}</p>
                    </div>
                </div>

                <div className="p-8 space-y-8">
                    {/* Interests */}
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                            <Compass className="w-5 h-5 text-sky-500" />
                            Topics of Interest
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {profileData.curiosityAreas && profileData.curiosityAreas.length > 0 ? (
                                profileData.curiosityAreas.map((topic: string) => (
                                    <span key={topic} className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700">
                                        {topic}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-slate-500 italic">No interests recorded yet. Your tutor will learn what you like as you chat!</p>
                            )}
                        </div>
                    </section>

                    {/* Goals */}
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                            <Target className="w-5 h-5 text-emerald-500" />
                            Learning Goals
                        </h3>
                        <div className="flex flex-wrap gap-2">
                            {profileData.aspirations && profileData.aspirations.length > 0 ? (
                                profileData.aspirations.map((goal: string) => (
                                    <span key={goal} className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-800">
                                        {goal}
                                    </span>
                                ))
                            ) : (
                                <p className="text-sm text-slate-500 italic">Share your goals during sessions to see them reflected here.</p>
                            )}
                        </div>
                    </section>

                    {/* Style */}
                    <section>
                        <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
                            <Brain className="w-5 h-5 text-amber-500" />
                            Preferred Style
                        </h3>
                        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
                            <p className="text-slate-700 text-sm">
                                {profileData.learningRelationship || "Your tutor is still analyzing the best way to explain concepts to you."}
                            </p>
                        </div>
                    </section>
                </div>
            </div>
        </div>
    );
}
