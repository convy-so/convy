import { buildStudentTurnPromptRuntime } from "@/lib/learning/prompts/student-turn";
import type { LearningTeachingPlaybook } from "@/lib/learning/pattern-types";
import type { PatternMemoryState } from "@/lib/learning/pattern-memory-service";
import type {
  ActiveExpertFramework,
  ContentScopeSnapshot,
  LearningSessionState,
  StudentInterestProfile,
} from "@/lib/learning/types";

export class TutoringPromptService {
  buildStudentTurnPrompt(params: {
    contentScope: ContentScopeSnapshot;
    activeFramework: ActiveExpertFramework;
    interestProfile: StudentInterestProfile | null;
    teachingPlaybook: LearningTeachingPlaybook | null;
    memoryState: PatternMemoryState;
    state: LearningSessionState;
    recentMessages: Array<{ role: "user" | "assistant"; content: string }>;
    latestUserText: string;
    studyLanguage: string;
  }) {
    return buildStudentTurnPromptRuntime(params);
  }
}

export const tutoringPromptService = new TutoringPromptService();
