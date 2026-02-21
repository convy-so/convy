
import { getDomainManifest, matchSurveyType } from "@/lib/domains/domain-manifest";
import { SkillRegistry } from "./skill-registry";

export interface LoadedDomainSkills {
  domainName: string;
  // Content of all core skills concatenated — always present
  coreContent: string;
  // Content of survey-type skills — present only if type was matched
  surveyTypeContent: string;
  // Which survey type was matched (for logging and prompt context)
  matchedSurveyType: string | null;
}

/**
 * Load all domain skills for a given phase.
 * Called once at agent initialization — results are stored on context.
 *
 * @param domainId - The domain number (1, 2, 3, 5, 6, 7, 9, 10)
 * @param phase - Which agent phase is loading skills
 * @param surveyDescription - Natural language description of the survey
 *        (used to match survey type — include subject, objective, and audience)
 */
export async function loadDomainSkills(
  domainId: number,
  phase: "creation" | "conducting" | "analytics",
  surveyDescription: string
): Promise<LoadedDomainSkills | null> {

  const manifest = getDomainManifest(domainId);
  if (!manifest) {
    console.warn(`[DomainSkillLoader] No manifest for domain ${domainId}`);
    return null;
  }

  // Step 1: Load core skills (always loaded)
  const coreSkillIds = manifest.coreSkills[phase] ?? [];
  const coreSkills = await Promise.all(
    coreSkillIds.map(id => SkillRegistry.getSkill(id))
  );
  const coreContent = coreSkills
    .filter(Boolean)
    .map(s => s!.content)
    .join("\n\n---\n\n");

  // Step 2: Match survey type and load type-specific skills
  const matchedType = matchSurveyType(manifest, surveyDescription);
  let surveyTypeContent = "";
  let matchedSurveyType: string | null = null;

  if (matchedType) {
    const typeSkillIds = matchedType.skills[phase] ?? [];
    const typeSkills = await Promise.all(
      typeSkillIds.map(id => SkillRegistry.getSkill(id))
    );
    surveyTypeContent = typeSkills
      .filter(Boolean)
      .map(s => s!.content)
      .join("\n\n---\n\n");
    matchedSurveyType = matchedType.surveyType;

    console.log(
      `[DomainSkillLoader] Domain ${domainId} (${manifest.name}) — ` +
      `Matched survey type: "${matchedSurveyType}" for phase: ${phase}`
    );
  } else {
    console.log(
      `[DomainSkillLoader] Domain ${domainId} (${manifest.name}) — ` +
      `No survey type matched for phase: ${phase} — loading core only`
    );
  }

  return {
    domainName: manifest.name,
    coreContent,
    surveyTypeContent,
    matchedSurveyType,
  };
}
