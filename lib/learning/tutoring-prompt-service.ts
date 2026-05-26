import { buildStudentTurnSystemPrompt } from "@/lib/learning/prompting";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import type { PatternMemoryState } from "@/lib/learning/pattern-memory-service";
import type {
  ActiveExpertFramework,
  ContentScopeSnapshot,
  StudentInterestProfile,
} from "@/lib/learning/types";

export class TutoringPromptService {
  buildStudentTurnPrompt(params: {
    contentScope: ContentScopeSnapshot;
    activeFramework: ActiveExpertFramework;
    interestProfile: StudentInterestProfile | null;
    teachingPlaybook: LearningTeachingPlaybook | null;
    memoryState: PatternMemoryState;
    studyLanguage: string;
  }) {
    return buildStudentTurnSystemPrompt(params);
  }
}

export const tutoringPromptService = new TutoringPromptService();
