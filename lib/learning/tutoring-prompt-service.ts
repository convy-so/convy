import { buildStudentTurnSystemPrompt } from "@/lib/learning/prompting";
import type {
  ContentScopeSnapshot,
  ExpertTutorRuntimeModel,
  FrameworkState,
  StudentModelSnapshot,
} from "@/lib/learning/types";

export class TutoringPromptService {
  buildStudentTurnPrompt(params: {
    contentScope: ContentScopeSnapshot;
    runtimeModel: ExpertTutorRuntimeModel;
    studentModel: StudentModelSnapshot;
    frameworkState: FrameworkState;
    studyLanguage: string;
  }) {
    return buildStudentTurnSystemPrompt(params);
  }
}

export const tutoringPromptService = new TutoringPromptService();
