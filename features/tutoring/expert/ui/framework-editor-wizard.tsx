"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { ArrowLeft, ArrowRight, Loader2, Save } from "lucide-react";

import type {
  ExpertFramework,
  ExpertFrameworkCapabilityGuidance,
} from "@/features/tutoring/public-server";
import {
  IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  VIDEO_SEARCH_MAX_CALLS_PER_TURN,
} from "@/features/tutoring/server/tutor-capabilities";

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
    description: "Confirm everything looks right, then save the editable draft.",
  },
] as const;

type EditorStepId = (typeof EDITOR_STEPS)[number]["id"];

const CAPABILITY_EDITOR_FIELDS = [
  {
    id: "search_image",
    label: "Educational images",
    summary:
      "Choose whether image search is available, define the policy for using it, and set the per-response limit.",
    placeholder:
      "State exactly when image search is allowed, what it should help with, and when the tutor should avoid it.",
    maxUsesCap: IMAGE_SEARCH_MAX_CALLS_PER_TURN,
  },
  {
    id: "search_video",
    label: "Educational videos",
    summary:
      "Choose whether video search is available, define the policy for using it, and set the per-response limit.",
    placeholder:
      "State when video search is allowed, what kind of explainer it should find, and when the tutor should stay with text or images.",
    maxUsesCap: VIDEO_SEARCH_MAX_CALLS_PER_TURN,
  },
  {
    id: "administer_quiz",
    label: "Quizzes",
    summary:
      "Choose whether the tutor can issue a formal quiz card and define the policy for when to use it.",
    placeholder:
      "State when the tutor should use a quiz instead of a conversational check and what a valid quiz moment looks like.",
  },
  {
    id: "grade_student_work",
    label: "Grading and feedback",
    summary:
      "Choose whether the tutor can grade submitted quiz work and define the policy for scoring and feedback.",
    placeholder:
      "State when grading is allowed, what evidence it must rely on, and what standard the tutor should apply.",
  },
  {
    id: "finish_session",
    label: "Finish session",
    summary:
      "Define the completion policy for the always-available finish-session tool.",
    placeholder:
      "State what completion evidence is required before ending the session and what the closing note must accomplish.",
  },
] as const;

function validateStep(stepId: EditorStepId, framework: ExpertFramework): string | null {
  if (stepId === "overview" && !framework.name.trim()) {
    return "Framework name is required before you continue.";
  }
  return null;
}

function countFilledCapabilities(framework: ExpertFramework) {
  return CAPABILITY_EDITOR_FIELDS.filter((capability) => {
    if (capability.id === "finish_session") {
      return framework.capabilityGuidance.finish_session.policy.trim().length > 0;
    }

    const config = framework.capabilityGuidance[capability.id];
    return config.enabled && config.policy.trim().length > 0;
  }).length;
}

function countEnabledCapabilities(guidance: ExpertFrameworkCapabilityGuidance) {
  return CAPABILITY_EDITOR_FIELDS.filter((capability) => {
    if (capability.id === "finish_session") {
      return false;
    }

    return guidance[capability.id].enabled;
  }).length;
}

function clampMaxUsesPerTurn(value: string, max: number, fallback: number) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.min(max, Math.max(1, parsed));
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
        Step {currentIndex + 1} of {EDITOR_STEPS.length} Â· {EDITOR_STEPS[currentIndex]?.label}
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
  onSaveDraft,
  isSavingDraft,
  isReadOnly = false,
}: {
  draftFramework: ExpertFramework;
  setDraftFramework: Dispatch<SetStateAction<ExpertFramework>>;
  onSaveDraft: () => void;
  isSavingDraft: boolean;
  isReadOnly?: boolean;
}) {
  const [currentStepIndex, setCurrentStepIndex] = useState(0);
  const [stepError, setStepError] = useState<string | null>(null);

  const currentStep = EDITOR_STEPS[currentStepIndex] ?? EDITOR_STEPS[0];
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === EDITOR_STEPS.length - 1;
  const capabilityCount = countFilledCapabilities(draftFramework);
  const enabledCapabilityCount = countEnabledCapabilities(
    draftFramework.capabilityGuidance,
  );
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
                  readOnly={isReadOnly}
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
                  readOnly={isReadOnly}
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
                Use Markdown for pedagogy, progression, diagnosis, and teaching moves. Tool policy
                belongs in Capabilities, and capability policy wins if it conflicts with Markdown.
              </p>
              <textarea
                value={draftFramework.markdownContent}
                readOnly={isReadOnly}
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
                Configure all tutor tool policy here. Capabilities are the authoritative source for
                tool use, even if the Markdown instructions mention tools differently.
              </p>
              {CAPABILITY_EDITOR_FIELDS.map((capability) => {
                const capabilityId = capability.id;
                const policy =
                  capabilityId === "finish_session"
                    ? draftFramework.capabilityGuidance.finish_session.policy
                    : draftFramework.capabilityGuidance[capabilityId].policy;
                const isMediaCapability =
                  capabilityId === "search_image" || capabilityId === "search_video";
                const mediaMaxUses =
                  capabilityId === "search_image"
                    ? draftFramework.capabilityGuidance.search_image.maxUsesPerTurn
                    : capabilityId === "search_video"
                      ? draftFramework.capabilityGuidance.search_video.maxUsesPerTurn
                      : null;

                return (
                  <div key={capabilityId} className="space-y-3 border-b border-slate-100 pb-5">
                    <label className={labelClassName()}>{capability.label}</label>
                    <p className="mb-2 text-sm text-slate-500">{capability.summary}</p>
                    {capabilityId !== "finish_session" ? (
                      <label className="flex items-center gap-3 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={draftFramework.capabilityGuidance[capabilityId].enabled}
                          disabled={isReadOnly}
                          onChange={(event) =>
                            setDraftFramework((current) => ({
                              ...current,
                              capabilityGuidance: {
                                ...current.capabilityGuidance,
                                [capabilityId]: {
                                  ...current.capabilityGuidance[capabilityId],
                                  enabled: event.target.checked,
                                },
                              },
                            }))
                          }
                          className="h-4 w-4 rounded border-slate-300 text-slate-950 focus:ring-slate-400"
                        />
                        Enable this tool for tutoring
                      </label>
                    ) : (
                      <p className="text-sm font-medium text-slate-700">
                        Always available when the framework is valid
                      </p>
                    )}
                    {isMediaCapability ? (
                      <div className="max-w-xs">
                        <label className={labelClassName()}>Max Uses Per Response</label>
                        <input
                          type="number"
                          min={1}
                          max={capability.maxUsesCap}
                          value={mediaMaxUses ?? 1}
                          readOnly={isReadOnly}
                          onChange={(event) =>
                            setDraftFramework((current) => ({
                              ...current,
                              capabilityGuidance: {
                                ...current.capabilityGuidance,
                                [capabilityId]: {
                                  ...current.capabilityGuidance[capabilityId],
                                  maxUsesPerTurn: clampMaxUsesPerTurn(
                                    event.target.value,
                                    capability.maxUsesCap ?? 1,
                                    capabilityId === "search_image"
                                      ? current.capabilityGuidance.search_image.maxUsesPerTurn
                                      : current.capabilityGuidance.search_video.maxUsesPerTurn,
                                  ),
                                },
                              },
                            }))
                          }
                          className={fieldClassName()}
                        />
                        <p className="mt-1 text-xs text-slate-500">
                          System cap: {capability.maxUsesCap} per tutoring response.
                        </p>
                      </div>
                    ) : null}
                    <textarea
                      value={policy}
                      readOnly={isReadOnly}
                      onChange={(event) =>
                        setDraftFramework((current) => ({
                          ...current,
                          capabilityGuidance: {
                            ...current.capabilityGuidance,
                            [capabilityId]: {
                              ...current.capabilityGuidance[capabilityId],
                              policy: event.target.value,
                            },
                          },
                        }))
                      }
                      rows={5}
                      placeholder={capability.placeholder}
                      className={`${fieldClassName(true)} min-h-[120px]`}
                    />
                    <p className="text-xs text-slate-500">
                      {capabilityId === "finish_session"
                        ? "Required before activation."
                        : "Required before activation if this tool is enabled."}
                    </p>
                  </div>
                );
              })}
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
                  disabled={isReadOnly}
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
                  disabled={isReadOnly}
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
                          disabled={isReadOnly}
                          className="text-xs font-medium text-slate-400 hover:text-rose-600"
                          aria-label={`Remove example ${index + 1}`}
                        >
                          Remove
                        </button>
                      </div>
                      <textarea
                        value={example}
                        readOnly={isReadOnly}
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
                    value: `${enabledCapabilityCount} enabled tool ${enabledCapabilityCount === 1 ? "toggle" : "toggles"}, ${capabilityCount} policy ${capabilityCount === 1 ? "section" : "sections"} filled`,
                    sub: "Capability policy overrides Markdown on tool decisions",
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

              <p className="text-sm text-slate-500">
                Saving updates the draft only. Activate the framework separately when you want
                tutoring to start using the latest draft.
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
            disabled={isSavingDraft || isReadOnly}
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
