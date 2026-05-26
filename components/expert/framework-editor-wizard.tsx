"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";

import type { ExpertFramework } from "@/lib/learning/types";

const EDITOR_STEPS = [
  {
    id: "overview",
    label: "Overview",
    description: "Give this framework a name and a short summary.",
  },
  {
    id: "instructions",
    label: "Instructions",
    description: "Write the core teaching rules the live tutor should follow.",
  },
  {
    id: "capabilities",
    label: "Capabilities",
    description: "Shape how the tutor uses search, media, quizzes, and grading.",
  },
  {
    id: "examples",
    label: "Examples",
    description: "Add reference moments that illustrate your approach.",
  },
  {
    id: "review",
    label: "Review",
    description: "Confirm everything looks right, then save a draft version.",
  },
] as const;

type EditorStepId = (typeof EDITOR_STEPS)[number]["id"];

function validateStep(stepId: EditorStepId, framework: ExpertFramework): string | null {
  if (stepId === "overview" && !framework.name.trim()) {
    return "Framework name is required before you continue.";
  }
  return null;
}

function countFilledCapabilities(framework: ExpertFramework) {
  return framework.toolUsageGuidance.trim().length > 0 ? 1 : 0;
}

function FrameworkEditorStepper({
  currentIndex,
  onStepSelect,
}: {
  currentIndex: number;
  onStepSelect: (index: number) => void;
}) {
  return (
    <nav aria-label="Framework editor progress">
      <ol className="flex gap-1 overflow-x-auto border-b border-slate-200">
        {EDITOR_STEPS.map((step, index) => {
          const isCurrent = index === currentIndex;
          const isComplete = index < currentIndex;

          return (
            <li key={step.id} className="shrink-0">
              <button
                type="button"
                onClick={() => onStepSelect(index)}
                aria-current={isCurrent ? "step" : undefined}
                className={`border-b-2 px-3 py-2.5 text-sm font-medium transition-colors ${
                  isCurrent
                    ? "border-slate-950 text-slate-950"
                    : isComplete
                      ? "border-transparent text-slate-700"
                      : "border-transparent text-slate-400 hover:text-slate-700"
                }`}
              >
                {step.label}
              </button>
            </li>
          );
        })}
      </ol>
      <p className="mt-2 text-xs text-slate-500">
        Step {currentIndex + 1} of {EDITOR_STEPS.length} · {EDITOR_STEPS[currentIndex]?.label}
      </p>
    </nav>
  );
}

function fieldClassName(multiline = false) {
  return multiline
    ? "w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm outline-none focus:border-slate-950"
    : "w-full border-0 border-b border-slate-200 bg-transparent px-0 py-2 text-sm outline-none focus:border-slate-950";
}

function labelClassName() {
  return "mb-2 block text-xs font-bold uppercase tracking-[0.18em] text-slate-400";
}

function scrollWizardToTop() {
  window.scrollTo({ top: 0, behavior: "smooth" });
}

export function FrameworkEditorWizard({
  draftFramework,
  setDraftFramework,
  notes,
  setNotes,
  onSaveDraft,
  isSavingDraft,
}: {
  draftFramework: ExpertFramework;
  setDraftFramework: Dispatch<SetStateAction<ExpertFramework>>;
  notes: string;
  setNotes: (value: string) => void;
  onSaveDraft: () => void;
  isSavingDraft: boolean;
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const currentStep = EDITOR_STEPS[currentStepIndex]!;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === EDITOR_STEPS.length - 1;
  const capabilityCount = countFilledCapabilities(draftFramework);
  const exampleCount = draftFramework.fewShotExamples.filter((example) => example.trim()).length;

  const goToStep = (index: number) => {
    if (index > currentStepIndex) {
      for (let stepIndex = currentStepIndex; stepIndex < index; stepIndex += 1) {
        const step = EDITOR_STEPS[stepIndex];
        if (!step) continue;
        const error = validateStep(step.id, draftFramework);
        if (error) {
          setStepError(error);
          setCurrentStepIndex(stepIndex);
          scrollWizardToTop();
          return;
        }
      }
    }
    setStepError(null);
    setCurrentStepIndex(index);
    scrollWizardToTop();
  };

  const handleNext = () => {
    const error = validateStep(currentStep.id, draftFramework);
    if (error) {
      setStepError(error);
      return;
    }
    setStepError(null);
    if (!isLastStep) {
      setCurrentStepIndex((index) => index + 1);
      scrollWizardToTop();
    }
  };

  const handleBack = () => {
    setStepError(null);
    if (!isFirstStep) {
      setCurrentStepIndex((index) => index - 1);
      scrollWizardToTop();
    }
  };

  return (
    <div className="max-w-3xl">
      <FrameworkEditorStepper
        currentIndex={currentStepIndex}
        onStepSelect={goToStep}
      />

      <div className="mt-8">
        <h2 className="text-base font-semibold text-slate-950">{currentStep.label}</h2>
        <p className="mt-1 text-sm text-slate-500">{currentStep.description}</p>

        <div className="mt-6">
          {stepError ? (
            <p role="alert" className="mb-4 text-sm text-rose-700">
              {stepError}
            </p>
          ) : null}

          {currentStep.id === "overview" ? (
            <div className="space-y-5">
              <div>
                <label className={labelClassName()}>Name</label>
                <input
                  value={draftFramework.name}
                  onChange={(event) =>
                    setDraftFramework((current) => ({
                      ...current,
                      name: event.target.value,
                    }))
                  }
                  placeholder="e.g. DEEP Mathematics"
                  className={fieldClassName()}
                  aria-invalid={Boolean(stepError)}
                />
              </div>
              <div>
                <label className={labelClassName()}>Description</label>
                <textarea
                  value={draftFramework.description}
                  onChange={(event) =>
                    setDraftFramework((current) => ({
                      ...current,
                      description: event.target.value,
                    }))
                  }
                  rows={5}
                  placeholder="Describe how the teaching flow should feel in practice."
                  className={`${fieldClassName(true)} min-h-[140px]`}
                />
              </div>
            </div>
          ) : null}

          {currentStep.id === "instructions" ? (
            <div>
              <label className={labelClassName()}>
                Framework guidelines & instructions (Markdown)
              </label>
              <p className="mb-3 text-sm text-slate-500">
                This is the main source the live tutor uses for progression, diagnosis, and
                completion rules.
              </p>
              <textarea
                value={draftFramework.markdownContent}
                onChange={(event) =>
                  setDraftFramework((current) => ({
                    ...current,
                    markdownContent: event.target.value,
                  }))
                }
                rows={16}
                placeholder="Outline diagnostic rungs, conceptual progression, and pedagogical rules."
                className={`${fieldClassName(true)} min-h-[320px] font-mono`}
              />
            </div>
          ) : null}

          {currentStep.id === "capabilities" ? (
            <div className="space-y-4">
              <p className="text-sm text-slate-500">
                Keep tool usage separate from the framework body. Describe when the tutor should
                use images, videos, quizzes, grading, or other tools, and when it should avoid
                them.
              </p>
              <div>
                <label className={labelClassName()}>Tool usage guide</label>
                <textarea
                  value={draftFramework.toolUsageGuidance}
                  onChange={(event) =>
                    setDraftFramework((current) => ({
                      ...current,
                      toolUsageGuidance: event.target.value,
                    }))
                  }
                  rows={10}
                  placeholder="Example: Use an image when a concept has a strong visual form. Prefer quizzes only after explanation and one student attempt. Avoid grading unless the student explicitly asks for evaluation or submits work."
                  className={`${fieldClassName(true)} min-h-[220px]`}
                />
              </div>
            </div>
          ) : null}

          {currentStep.id === "examples" ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <p className="text-sm text-slate-500">
                  Free-form reference examples. Empty blocks are skipped when you save.
                </p>
                <button
                  type="button"
                  onClick={() =>
                    setDraftFramework((current) => ({
                      ...current,
                      fewShotExamples: [...current.fewShotExamples, ""],
                    }))
                  }
                  className="text-sm font-medium text-slate-700 underline-offset-2 hover:underline"
                >
                  Add example
                </button>
              </div>

              {draftFramework.fewShotExamples.length === 0 ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraftFramework((current) => ({
                      ...current,
                      fewShotExamples: [""],
                    }))
                  }
                  className="py-8 text-left text-sm text-slate-500 underline-offset-2 hover:text-slate-700 hover:underline"
                >
                  Add your first example
                </button>
              ) : (
                <div className="space-y-6">
                  {draftFramework.fewShotExamples.map((example, index) => (
                    <div key={index} className="group border-b border-slate-100 pb-6">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <span className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">
                          Example {index + 1}
                        </span>
                        <button
                          type="button"
                          onClick={() =>
                            setDraftFramework((current) => ({
                              ...current,
                              fewShotExamples: current.fewShotExamples.filter(
                                (_, currentIndex) => currentIndex !== index,
                              ),
                            }))
                          }
                          className="text-xs font-medium text-slate-400 hover:text-rose-600"
                          aria-label={`Remove example ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={example}
                        onChange={(event) =>
                          setDraftFramework((current) => ({
                            ...current,
                            fewShotExamples: current.fewShotExamples.map(
                              (currentExample, currentIndex) =>
                                currentIndex === index
                                  ? event.target.value
                                  : currentExample,
                            ),
                          }))
                        }
                        rows={6}
                        placeholder="Write the example in any format you prefer."
                        className={`${fieldClassName(true)} min-h-[120px]`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : null}

          {currentStep.id === "review" ? (
            <div className="space-y-5">
              <ul className="divide-y divide-slate-100 border-y border-slate-100">
                {[
                  {
                    label: "Overview",
                    value: draftFramework.name.trim() || "No name yet",
                    sub: draftFramework.description.trim() || "No description",
                    stepIndex: 0,
                  },
                  {
                    label: "Instructions",
                    value: draftFramework.markdownContent.trim()
                      ? `${draftFramework.markdownContent.trim().split("\n").length} lines of Markdown`
                      : "Not added yet",
                    sub: "Core teaching rules for the live tutor",
                    stepIndex: 1,
                  },
                  {
                    label: "Capabilities",
                    value: capabilityCount ? "Tool guide added" : "No tool guide yet",
                    sub: "Separate tutor tool-usage guidance",
                    stepIndex: 2,
                  },
                  {
                    label: "Examples",
                    value: `${exampleCount} ${exampleCount === 1 ? "example" : "examples"}`,
                    sub: "Reference teaching moments",
                    stepIndex: 3,
                  },
                ].map((item) => (
                  <li
                    key={item.label}
                    className="flex flex-wrap items-start justify-between gap-3 py-3"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-bold uppercase tracking-[0.14em] text-slate-400">
                        {item.label}
                      </p>
                      <p className="mt-1 text-sm font-semibold text-slate-950">{item.value}</p>
                      <p className="mt-0.5 text-sm text-slate-500">{item.sub}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => goToStep(item.stepIndex)}
                      className="shrink-0 text-sm font-semibold text-slate-700 underline-offset-2 hover:underline"
                    >
                      Edit
                    </button>
                  </li>
                ))}
              </ul>

              <div>
                <label className={labelClassName()}>Version note (optional)</label>
                <input
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="e.g. Added capability guidance for quizzes"
                  className={fieldClassName()}
                />
              </div>

              <p className="text-sm text-slate-500">
                Saving creates a draft version. Publish it from the Versions tab when you are
                ready for tutoring to use it.
              </p>
            </div>
          ) : null}
        </div>
      </div>

      <div className="mt-10 flex items-center justify-between border-t border-slate-200 pt-4">
        <button
          type="button"
          onClick={handleBack}
          disabled={isFirstStep}
          className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-600 disabled:opacity-30"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>

        {isLastStep ? (
          <button
            type="button"
            onClick={onSaveDraft}
            disabled={isSavingDraft}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-950 disabled:opacity-50"
          >
            {isSavingDraft ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save draft
          </button>
        ) : (
          <button
            type="button"
            onClick={handleNext}
            className="inline-flex items-center gap-1.5 text-sm font-semibold text-slate-950"
          >
            Continue
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
