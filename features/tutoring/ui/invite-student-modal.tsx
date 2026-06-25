"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import {
  X,
  Loader2,
  Mail,
  MailPlus,
  UploadCloud,
  AlertCircle,
  CheckCircle2,
  ShieldAlert,
} from "lucide-react";
import {
  bulkInviteStudentsToClassroomAction,
  inviteStudentToClassroomAction,
} from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/shared/http/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/features/auth/public-ui";
import { TextareaField } from "@/features/auth/public-ui";
import { cn } from "@/shared/ui/tailwind-class-utils";
import { getFriendlyActionError } from "@/shared/http/friendly-action-error";

type InviteStudentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  classroomId: string;
};

type ValidationResult = {
  valid: string[];
  invalid: {
    email: string;
    reason: "self" | "staff_account" | "already_member" | "already_invited";
  }[];
};

type BulkFailedResult = Array<{ email: string; error: string }>;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function isValidationReason(
  value: unknown,
): value is ValidationResult["invalid"][number]["reason"] {
  return (
    value === "self" ||
    value === "staff_account" ||
    value === "already_member" ||
    value === "already_invited"
  );
}

function parseValidationResult(value: unknown): ValidationResult | null {
  if (!isRecord(value)) {
    return null;
  }

  const valid = Array.isArray(value.valid)
    ? value.valid.filter((item): item is string => typeof item === "string")
    : [];
  const invalid = Array.isArray(value.invalid)
    ? value.invalid.flatMap((item) => {
        if (
          !isRecord(item) ||
          typeof item.email !== "string" ||
          !isValidationReason(item.reason)
        ) {
          return [];
        }

        return [{ email: item.email, reason: item.reason }];
      })
    : [];

  return { valid, invalid };
}

function parseBulkFailedResult(value: unknown): BulkFailedResult {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((item) => {
    if (!isRecord(item) || typeof item.email !== "string" || typeof item.error !== "string") {
      return [];
    }

    return [{ email: item.email, error: item.error }];
  });
}

function parseBulkInviteResultData(value: unknown): {
  invitedCount: number;
  failed: BulkFailedResult;
} {
  if (!isRecord(value)) {
    return { invitedCount: 0, failed: [] };
  }

  const invitedCount = Array.isArray(value.invited) ? value.invited.length : 0;
  const failed = parseBulkFailedResult(value.failed);
  return { invitedCount, failed };
}

function parseBulkInviteInput(raw: string) {
  const students = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const emailPart = line.trim();

      if (!emailPart || !emailPart.includes("@")) {
        throw new Error(`Line ${index + 1} must be a valid email address.`);
      }

      return {
        email: emailPart,
      };
    });

  if (!students.length) {
    throw new Error("Add at least one student to import.");
  }

  return students;
}

export function InviteStudentModal({
  isOpen,
  onClose,
  classroomId,
}: InviteStudentModalProps) {
  const queryClient = useQueryClient();
  const [mode, setMode] = useState<"single" | "bulk">("single");

  // Single mode state
  const [email, setEmail] = useState("");

  // Bulk mode state
  const [bulkInput, setBulkInput] = useState("");

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [validationResult, setValidationResult] =
    useState<ValidationResult | null>(null);
  const [bulkFailedResult, setBulkFailedResult] =
    useState<BulkFailedResult | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const resetForm = () => {
    setEmail("");
    setBulkInput("");
    setError(null);
    setValidationResult(null);
    setBulkFailedResult(null);
  };

  const handleClose = () => {
    if (isSubmitting) return;
    onClose();
    // Delay reset to avoid flicker during closing animation
    setTimeout(resetForm, 300);
  };

  const handleSingleInvite = async () => {
    if (!email.trim()) return;

    setIsSubmitting(true);
    setError(null);
    setValidationResult(null);

    try {
      const result = await inviteStudentToClassroomAction({
        classroomId,
        email: email.trim(),
      });
      if (!result.success) {
        throw new Error(getFriendlyActionError(result.error));
      }

      toast.success("Invitation sent");
      await queryClient.invalidateQueries({
        queryKey: queryKeys.learning.students(classroomId),
      });
      resetForm();
      onClose();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "An unexpected error occurred",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleBulkInvite = async (forceSafe: boolean = false) => {
    const rawInput =
      forceSafe && validationResult
        ? validationResult.valid.join("\n")
        : bulkInput;
    if (!rawInput.trim()) return;

    setIsSubmitting(true);
    setError(null);

    try {
      const students = parseBulkInviteInput(rawInput);
      const result = await bulkInviteStudentsToClassroomAction({
        classroomId,
        students,
      });

      if (!result.success) {
        if (result.error.code === "VALIDATION_FAILED") {
          const nextValidationResult = parseValidationResult(result.error.data);
          if (!nextValidationResult) {
            throw new Error("Invalid classroom validation response.");
          }
          setValidationResult(nextValidationResult);
          setIsSubmitting(false);
          return;
        }
        throw new Error(getFriendlyActionError(result.error));
      }

      const payload = parseBulkInviteResultData(result.data);
      const invitedCount = payload.invitedCount;
      const failedCount = payload.failed.length;

      if (invitedCount > 0 && failedCount === 0) {
        toast.success(`${invitedCount} student${invitedCount === 1 ? "" : "s"} invited successfully`);
        // All good — close immediately
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.learning.students(classroomId),
          }),
          queryClient.invalidateQueries({
            queryKey: queryKeys.learning.assignedSurveys(classroomId),
          }),
        ]);
        resetForm();
        onClose();
        return;
      } else if (invitedCount > 0 && failedCount > 0) {
        toast.success(`${invitedCount} invited`);
        // Show a breakdown of what failed instead of silently dismissing
        setBulkFailedResult(payload.failed);
        setIsSubmitting(false);
        await Promise.all([
          queryClient.invalidateQueries({
            queryKey: queryKeys.learning.students(classroomId),
          }),
        ]);
        return;
      } else {
        toast.error("No students were invited. See details below.");
        setBulkFailedResult(payload.failed);
        setIsSubmitting(false);
        return;
      }

    } catch (err) {
      setError(err instanceof Error ? err.message : "Invalid roster format");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validationResult) return;

    if (mode === "single") {
      await handleSingleInvite();
      return;
    }

    await handleBulkInvite();
  };

  const handleFilterAndProceed = async () => {
    if (!validationResult) return;
    setBulkInput(validationResult.valid.join("\n"));
    await handleBulkInvite(true);
  };

  if (!isOpen || !mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
        onClick={handleClose}
      />

      <div className="relative mx-4 w-full max-w-lg animate-in zoom-in-95 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl duration-300">
        <button
          type="button"
          onClick={handleClose}
          disabled={isSubmitting}
          className="absolute top-4 right-4 p-2 rounded-full text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-all z-20"
        >
          <X className="w-5 h-5" />
        </button>

        <div className="border-b border-gray-100 px-6 py-5">
          <div className="flex items-start gap-3 pr-10">
            <div
              className={cn(
                "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                mode === "single"
                  ? "border-sky-100 bg-sky-50 text-sky-600"
                  : "border-indigo-100 bg-indigo-50 text-indigo-600",
              )}
            >
              {mode === "single" ? (
                <MailPlus className="h-5 w-5" />
              ) : (
                <UploadCloud className="h-5 w-5" />
              )}
            </div>
            <div>
              <h3 className="text-lg font-semibold text-[#080808]">
                Invite students to this classroom
              </h3>
              <p className="mt-1 text-sm text-[#696969]">
                Add learners before they enter a session. Only non-staff accounts
                can be invited as students.
              </p>
            </div>
          </div>

          {!validationResult && (
            <div className="mt-4 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
              <button
                type="button"
                onClick={() => setMode("single")}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "single"
                    ? "bg-white text-[#080808] shadow-sm"
                    : "text-[#696969] hover:text-[#292929]",
                )}
              >
                Single invite
              </button>
              <button
                type="button"
                onClick={() => setMode("bulk")}
                className={cn(
                  "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                  mode === "bulk"
                    ? "bg-white text-[#080808] shadow-sm"
                    : "text-[#696969] hover:text-[#292929]",
                )}
              >
                Bulk roster
              </button>
            </div>
          )}
        </div>

        <form onSubmit={(event) => {
          void handleSubmit(event);
        }} className="flex max-h-[72vh] flex-col">
          <div className="space-y-4 overflow-y-auto px-6 py-5">
            {error && !validationResult && (
              <div className="rounded-2xl border border-rose-100 bg-rose-50 p-4 text-sm font-medium text-rose-600 animate-in slide-in-from-top-2">
                <div className="flex gap-3">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              </div>
            )}

            {validationResult ? (
              <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div className="flex gap-3 items-start">
                    <ShieldAlert className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-amber-900 text-sm">
                        Review Required
                      </h4>
                      <p className="text-amber-700 text-xs mt-1 font-medium">
                        We found {validationResult.invalid.length} emails that
                        cannot be invited. Staff and existing members are
                        blocked for safety.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="space-y-4">
                  {validationResult.invalid.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-rose-500 uppercase tracking-widest px-1">
                        Blocked Emails
                      </span>
                      <div className="bg-rose-50/50 rounded-xl border border-rose-100 overflow-hidden">
                        {validationResult.invalid.map((item, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 border-b border-rose-100 last:border-0"
                          >
                            <div className="flex items-center justify-between gap-4">
                              <span className="font-mono text-xs text-rose-700 truncate">
                                {item.email}
                              </span>
                              <span className="text-[10px] bg-rose-100 text-rose-600 px-2 py-0.5 rounded-full font-bold uppercase shrink-0">
                                {item.reason === "staff_account"
                                  ? "Staff Account"
                                  : item.reason === "self"
                                    ? "Your Email"
                                    : item.reason === "already_invited"
                                      ? "Already Invited"
                                      : "Already Member"}
                              </span>
                            </div>
                            {item.reason === "already_invited" && (
                              <p className="mt-1 text-[10px] text-rose-400 font-medium leading-relaxed italic">
                                Active invitation exists. Use the &lsquo;Pending&rsquo; list in the directory to resend.
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {validationResult.valid.length > 0 && (
                    <div className="space-y-2">
                      <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-widest px-1">
                        Ready to Invite
                      </span>
                      <div className="bg-emerald-50/50 rounded-xl border border-emerald-100 max-h-[120px] overflow-y-auto custom-scrollbar">
                        {validationResult.valid.map((email, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-2 text-xs flex items-center gap-2 border-b border-emerald-100 last:border-0"
                          >
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span className="font-mono text-emerald-700">
                              {email}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : bulkFailedResult ? (
              <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
                <div className="p-4 bg-rose-50 rounded-2xl border border-rose-100">
                  <div className="flex gap-3 items-start">
                    <AlertCircle className="w-5 h-5 text-rose-500 shrink-0 mt-0.5" />
                    <div>
                      <h4 className="font-semibold text-rose-900 text-sm">
                        Some invitations failed
                      </h4>
                      <p className="text-rose-700 text-xs mt-1 font-medium">
                        The following {bulkFailedResult.length} email{bulkFailedResult.length === 1 ? "" : "s"} could not be invited.
                      </p>
                    </div>
                  </div>
                </div>
                <div className="bg-rose-50/50 rounded-xl border border-rose-100 overflow-hidden">
                  {bulkFailedResult.map((item, idx) => (
                    <div
                      key={idx}
                      className="px-3 py-2.5 border-b border-rose-100 last:border-0"
                    >
                      <span className="font-mono text-xs text-rose-700 block">{item.email}</span>
                      <span className="text-[11px] text-rose-500 mt-0.5 block">{item.error}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : mode === "single" ? (
              <div className="space-y-4">
                <InputField
                  label="Email address"
                  id="student-email"
                  type="email"
                  placeholder="jane@school.org"
                  icon={Mail}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
            ) : (
              <TextareaField
                label="Roster list"
                id="student-roster"
                value={bulkInput}
                onChange={(e) => setBulkInput(e.target.value)}
                rows={5}
                placeholder={"jane@school.org\njohn@school.org"}
                helperText="Use one student email per line."
                className="resize-none font-mono text-[13px] leading-5"
                required
              />
            )}
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
            <button
              type="button"
              onClick={
                validationResult
                  ? () => setValidationResult(null)
                  : bulkFailedResult
                    ? handleClose
                    : handleClose
              }
              disabled={isSubmitting}
              className="px-3 py-2 text-sm font-medium text-[#696969] transition-colors hover:text-[#292929]"
            >
              {validationResult ? "Back to Edit" : bulkFailedResult ? "Close" : "Cancel"}
            </button>

            {validationResult ? (
              <button
                type="button"
                onClick={() => {
                  void handleFilterAndProceed();
                }}
                disabled={isSubmitting || validationResult.valid.length === 0}
                className={cn(
                  "flex min-w-[148px] items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-emerald-700 focus:ring-2 focus:ring-emerald-600 focus:ring-offset-2 outline-none disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Inviting...
                  </>
                ) : (
                  <>
                    <UploadCloud className="h-4 w-4" />
                    Filter roster and continue
                  </>
                )}
              </button>
            ) : (
              <button
                type="submit"
                disabled={
                  isSubmitting ||
                  (mode === "single" && !email.trim()) ||
                  (mode === "bulk" && !bulkInput.trim())
                }
                className={cn(
                  "flex min-w-[148px] items-center justify-center gap-2 rounded-xl bg-[#292929] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3a3a3a] focus:ring-2 focus:ring-[#292929] focus:ring-offset-2 outline-none disabled:cursor-not-allowed disabled:opacity-50",
                )}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    {mode === "single" ? (
                      <MailPlus className="h-4 w-4" />
                    ) : (
                      <UploadCloud className="h-4 w-4" />
                    )}
                    {mode === "single" ? "Send invite" : "Import roster"}
                  </>
                )}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
