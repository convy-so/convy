import { getVerifiedSession } from "@/features/auth/public-server";
import { UserCircle, Compass, Target, Brain, Sparkles, ArrowRight } from "lucide-react";
import { Link } from "@/i18n/routing";

import { getUniversalStudentInterestProfile, listStudentMemberships } from "@/features/tutoring/server/access";
import type { StudentInterestProfile } from "@/features/tutoring/public-server";

export default async function StudentProfilePage() {
  const session = await getVerifiedSession();
  const userId = session.user.id;

  const [memberships, universalProfileRecord] = await Promise.all([
    listStudentMemberships(userId),
    getUniversalStudentInterestProfile(userId),
  ]);

  const defaultProfile: StudentInterestProfile = {
    primaryInterests: [],
    aspirations: [],
    curiosityAreas: [],
    motivationalStyle: [],
    learningRelationship: "neutral",
    contextTags: [],
    privateNotes: [],
    lastUpdated: new Date().toISOString(),
  };

  const profileData = universalProfileRecord?.profile ?? defaultProfile;
  const needsInterestProfileSetup = !universalProfileRecord;

  return (
    <div className="space-y-8 max-w-4xl">
      <div>
        <h1 className="text-3xl font-bold text-slate-900 tracking-tight">
          Interest Profile
        </h1>
        <p className="text-slate-500 text-lg mt-1">
          This is your universal tutor profile. You set it once, the tutor uses it across every class and session, and you can come back here anytime to refine it.
        </p>
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-8 py-6 border-b border-slate-100 flex items-center gap-4">
          <div className="w-16 h-16 rounded-full bg-indigo-100 flex items-center justify-center">
            <UserCircle className="w-8 h-8 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-2xl font-bold text-slate-900">
              {session.user.name}
            </h2>
            <p className="text-slate-500">{session.user.email}</p>
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-400 mt-2">
              Active across {memberships.length} classroom{memberships.length === 1 ? "" : "s"}
            </p>
          </div>
        </div>

        <div className="p-8 space-y-8">
          <div className="rounded-2xl border border-indigo-200 bg-indigo-50/80 p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-2">
                <div className="inline-flex items-center gap-2 text-xs font-bold uppercase tracking-[0.18em] text-indigo-700">
                  <Sparkles className="h-3.5 w-3.5" />
                  {needsInterestProfileSetup ? "Setup required" : "Profile conversation"}
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  {needsInterestProfileSetup
                    ? "Finish your interest profile before tutoring"
                    : "Update your profile with a guided conversation"}
                </h3>
                <p className="text-sm leading-6 text-slate-600">
                  {needsInterestProfileSetup
                    ? "The tutor reads this profile before teaching, so complete it once here to unlock personalized tutoring everywhere."
                    : "Open the dedicated profile conversation if your interests, goals, or learning preferences have changed."}
                </p>
              </div>
              <Link
                href="/student/profile/edit"
                className="inline-flex shrink-0 items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-slate-800"
              >
                {needsInterestProfileSetup ? "Set up now" : "Update profile"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>

          <section>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Compass className="w-5 h-5 text-sky-500" />
              Topics of Interest
            </h3>
            <div className="flex flex-wrap gap-2">
              {profileData.curiosityAreas.length > 0 ? (
                profileData.curiosityAreas.map((topic) => (
                  <span
                    key={topic}
                    className="px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium text-slate-700"
                  >
                    {topic}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">
                  No interests recorded yet. Start the profile conversation to set them once for all tutoring.
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Target className="w-5 h-5 text-emerald-500" />
              Learning Goals
            </h3>
            <div className="flex flex-wrap gap-2">
              {profileData.aspirations.length > 0 ? (
                profileData.aspirations.map((goal) => (
                  <span
                    key={goal}
                    className="px-4 py-2 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-medium text-emerald-800"
                  >
                    {goal}
                  </span>
                ))
              ) : (
                <p className="text-sm text-slate-500 italic">
                  No goals recorded yet. Add them in the profile conversation and the tutor will use them across classes.
                </p>
              )}
            </div>
          </section>

          <section>
            <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2 mb-4">
              <Brain className="w-5 h-5 text-amber-500" />
              Preferred Learning Relationship
            </h3>
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
              <p className="text-slate-700 text-sm">
                {profileData.learningRelationship ||
                  "Your tutor is still analyzing the best way to explain concepts to you."}
              </p>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
