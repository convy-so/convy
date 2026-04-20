export type OrchestrationMode = "workflow" | "agent" | "hybrid";

export const ANTHROPIC_ORCHESTRATION_POLICY = {
  workflow:
    "Use workflows when the next step should be deterministic: validation, routing, state transitions, retries, stop conditions, and canonical state updates.",
  agent:
    "Use agents only when the next best move cannot be hardcoded in advance and the model needs bounded flexibility to choose dialogue or tool use inside a narrow sandbox.",
  hybrid:
    "Use hybrid orchestration when a workflow owns the shell and a bounded agent owns only the open-ended turn surface inside the current state.",
} as const;

export function chooseOrchestrationMode(input: {
  needsDeterministicStateMachine: boolean;
  needsOpenEndedDialogue: boolean;
  needsAutonomousToolChoice?: boolean;
}): OrchestrationMode {
  if (input.needsDeterministicStateMachine && input.needsOpenEndedDialogue) {
    return "hybrid";
  }
  if (input.needsOpenEndedDialogue || input.needsAutonomousToolChoice) {
    return "agent";
  }
  return "workflow";
}
