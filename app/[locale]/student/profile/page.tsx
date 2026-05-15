import { getVerifiedSession } from "@/lib/auth/dal";
import { getDb } from "@/db";
import { classroomStudents, studentInterestProfiles } from "@/db/schema/learning";
import { eq } from "drizzle-orm";
import { UserCircle, Compass, Target, Brain, ChevronLeft } from "lucide-react";
import { Link } from "@/i18n/routing";

import type { StudentInterestProfile } from "@/lib/learning/types";

export default async function StudentProfilePage(props: {
    searchParams: Promise<{ classroomId?: string }>;
}) {
    const { classroomId } = await props.searchParams;
    const session = await getVerifiedSession();
    const userId = session.user.id;

    const studentProfiles = await getDb().query.classroomStudents.findMany({
        where: eq(classroomStudents.userId, userId),
        with: {
            classroom: true,
        },
    });

    const selectedProfile = classroomId
        ? studentProfiles.find((profile) => profile.classroomId === classroomId) ?? null
        : studentProfiles.length === 1
            ? studentProfiles[0]
            : null;
    const shouldChooseClass = !selectedProfile && studentProfiles.length > 1;

    const interests = selectedProfile ? await getDb().query.studentInterestProfiles.findFirst({
        where: eq(studentInterestProfiles.classroomStudentId, selectedProfile.id),
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
                {selectedProfile && (
                    <Link href="/student/classes" className="mb-3 inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wide text-[#43c000] hover:text-[#3c7f0a] transition-colors">
                        <ChevronLeft className="h-3.5 w-3.5" />
                        All courses
                    </Link>
                )}
                <h1 className="text-3xl font-bold text-slate-900 tracking-tight">Learning Profile</h1>
                <p className="text-slate-500 text-lg mt-1">Manage your interests, goals, and learning preferences to help your AI tutor personalize your sessions.</p>
            </div>

            {shouldChooseClass ? (
                <div className="grid gap-4 md:grid-cols-2">
                    {studentProfiles.map((profile) => (
                        <Link
                            key={profile.id}
                            href={`/student/profile?classroomId=${profile.classroomId}`}
                            className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm transition-colors hover:border-gray-300"
                        >
                            <h2 className="text-lg font-semibold text-gray-900">{profile.classroom.title}</h2>
                            <p className="mt-1 text-sm text-gray-600">{profile.classroom.gradeLabel}</p>
                        </Link>
                    ))}
                </div>
            ) : (
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
            )}
        </div>
    );
}
