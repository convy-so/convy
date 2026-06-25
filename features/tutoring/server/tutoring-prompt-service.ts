import { buildStudentTurnPromptRuntime } from "@/features/tutoring/server/prompts/student-turn";
import type { LearningTeachingPlaybook } from "@/features/tutoring/server/pattern-types";
import type { PatternMemoryState } from "@/features/tutoring/server/pattern-memory-service";
import type {
  ActiveExpertFramework,
  ContentScopeSnapshot,
  LearningSessionState,
  StudentInterestProfile,
} from "@/features/tutoring/public-server";

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
