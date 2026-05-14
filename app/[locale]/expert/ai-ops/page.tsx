import { desc, eq } from "drizzle-orm";

import { ExpertAiOpsConsole } from "@/components/expert/expert-ai-ops-console";
import { getAiOpsOverview } from "@/app/actions/ai-ops";
import { getDb } from "@/db";
import { expertGuidancePacks, expertGuidanceVersions } from "@/db/schema";

export default async function ExpertAiOpsPage() {
  const [overviewResult, packs] = await Promise.all([
    getAiOpsOverview(),
    getDb().query.expertGuidancePacks.findMany({
      orderBy: [desc(expertGuidancePacks.updatedAt)],
    }),
  ]);

  const versionsEntries = await Promise.all(
    packs.map(async (pack) => {
      const versions = await getDb().query.expertGuidanceVersions.findMany({
        where: eq(expertGuidanceVersions.packId, pack.id),
        orderBy: [desc(expertGuidanceVersions.version)],
      });
      return [pack.id, versions] as const;
    }),
  );

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-500">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          AI Ops
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage expert guidance packs and versioned instruction artifacts that shape platform behavior.
        </p>
      </div>

      <ExpertAiOpsConsole
        overview={overviewResult.success ? overviewResult.data : {
          viewerRole: "expert",
          totalRuns: 0,
          weeklyRuns: 0,
          failedRuns: 0,
          evalDatasetCount: 0,
          guidancePackCount: packs.length,
          failureModeCount: 0,
          featureBreakdown: [],
        }}
        packs={packs}
        versionsByPackId={Object.fromEntries(versionsEntries)}
      />
    </div>
  );
}
