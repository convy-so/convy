"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Loader2, Users, Mail, MailPlus, UploadCloud, AlertCircle } from "lucide-react";
import {
    bulkInviteStudentsToClassroomAction,
    inviteStudentToClassroomAction,
} from "@/app/actions/classroom";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import toast from "react-hot-toast";
import { InputField } from "@/components/auth/input-field";
import { TextareaField } from "@/components/auth/textarea-field";
import { cn } from "@/lib/utils";
import { getFriendlyActionError } from "@/lib/action-ux";

type InviteStudentModalProps = {
    isOpen: boolean;
    onClose: () => void;
    classroomId: string;
};

function parseBulkInviteInput(raw: string) {
  const students = raw
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [fullNamePart, emailPart] = line.split(",").map((part) => part.trim());

      if (!fullNamePart || !emailPart) {
        throw new Error(`Line ${index + 1} must use "Full Name, email@example.com".`);
      }

      return {
        fullName: fullNamePart,
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
    classroomId 
}: InviteStudentModalProps) {
    const queryClient = useQueryClient();
    const [mode, setMode] = useState<"single" | "bulk">("single");
    
    // Single mode state
    const [fullName, setFullName] = useState("");
    const [email, setEmail] = useState("");
    
    // Bulk mode state
    const [bulkInput, setBulkInput] = useState("");
    
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    const resetForm = () => {
        setFullName("");
        setEmail("");
        setBulkInput("");
        setError(null);
    };

    const handleClose = () => {
        if (isSubmitting) return;
        onClose();
    };

    const handleSingleInvite = async () => {
        if (!fullName.trim() || !email.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const result = await inviteStudentToClassroomAction({
                classroomId,
                fullName: fullName.trim(),
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
            setError(err instanceof Error ? err.message : "An unexpected error occurred");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleBulkInvite = async () => {
        if (!bulkInput.trim()) return;

        setIsSubmitting(true);
        setError(null);

        try {
            const students = parseBulkInviteInput(bulkInput);
            const result = await bulkInviteStudentsToClassroomAction({
                classroomId,
                students,
            });
            if (!result.success) {
                throw new Error(getFriendlyActionError(result.error));
            }

            const payload = result.data as {
                invited: Array<unknown>;
                failed: Array<unknown>;
            };
            const invitedCount = payload.invited.length;
            const failedCount = payload.failed.length;

            if (invitedCount > 0 && failedCount === 0) {
                toast.success(`${invitedCount} students invited`);
            } else if (invitedCount > 0) {
                toast.success(`${invitedCount} invited, ${failedCount} failed`);
            } else {
                toast.error("No students were imported");
            }

            await Promise.all([
                queryClient.invalidateQueries({ queryKey: queryKeys.learning.students(classroomId) }),
                queryClient.invalidateQueries({ queryKey: queryKeys.learning.assignedSurveys(classroomId) }),
            ]);
            resetForm();
            onClose();
        } catch (err) {
            setError(err instanceof Error ? err.message : "Invalid roster format");
        } finally {
            setIsSubmitting(false);
        }
    };

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();

        if (mode === "single") {
            await handleSingleInvite();
            return;
        }

        await handleBulkInvite();
    };

    if (!isOpen || !mounted) return null;

    return createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center">
            <div
                className="absolute inset-0 bg-black/60 backdrop-blur-md animate-in fade-in duration-300"
                onClick={handleClose}
            />

            <div className="relative mx-4 w-full max-w-md animate-in zoom-in-95 overflow-hidden rounded-3xl border border-gray-100 bg-white shadow-2xl duration-300">
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
                        <div className={cn(
                            "flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border",
                            mode === "single" ? "border-sky-100 bg-sky-50 text-sky-600" : "border-indigo-100 bg-indigo-50 text-indigo-600"
                        )}>
                            {mode === "single" ? (
                                <MailPlus className="h-5 w-5" />
                            ) : (
                                <UploadCloud className="h-5 w-5" />
                            )}
                        </div>
                        <div>
                            <h3 className="text-lg font-semibold text-[#080808]">Invite students</h3>
                            <p className="mt-1 text-sm text-[#696969]">
                                Use the same clean flow as the auth forms, either one invite at a time or a quick roster paste.
                            </p>
                        </div>
                    </div>

                    <div className="mt-4 grid grid-cols-2 rounded-xl bg-gray-100 p-1">
                        <button
                            type="button"
                            onClick={() => setMode("single")}
                            className={cn(
                                "rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                                mode === "single"
                                    ? "bg-white text-[#080808] shadow-sm"
                                    : "text-[#696969] hover:text-[#292929]"
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
                                    : "text-[#696969] hover:text-[#292929]"
                            )}
                        >
                            Bulk roster
                        </button>
                    </div>
                </div>

                <form onSubmit={handleSubmit} className="flex max-h-[72vh] flex-col">
                    <div className="space-y-4 overflow-y-auto px-6 py-5">
                        {error && (
                            <div className="rounded-2xl border border-rose-100 bg-rose-50 p-3 text-sm font-medium text-rose-600 animate-in slide-in-from-top-2">
                                <div className="flex gap-2">
                                    <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                                    <span>{error}</span>
                                </div>
                            </div>
                        )}

                        {mode === "single" ? (
                            <div className="space-y-4">
                                <InputField
                                    label="Full name"
                                    id="student-name"
                                    placeholder="e.g. Jane Doe"
                                    icon={Users}
                                    value={fullName}
                                    onChange={(e) => setFullName(e.target.value)}
                                    required
                                />

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
                                placeholder={"Jane Doe, jane@school.org\nJohn Smith, john@school.org"}
                                helperText="Use one student per line in the format: Full Name, email@example.com."
                                className="resize-none font-mono text-[13px] leading-5"
                                required
                            />
                        )}
                    </div>

                    <div className="flex items-center justify-end gap-3 border-t border-gray-100 bg-gray-50/60 px-6 py-4">
                    <button
                        type="button"
                        onClick={handleClose}
                        disabled={isSubmitting}
                        className="px-3 py-2 text-sm font-medium text-[#696969] transition-colors hover:text-[#292929]"
                    >
                        Cancel
                    </button>
                    <button
                        type="submit"
                        disabled={isSubmitting || (mode === "single" && (!fullName.trim() || !email.trim())) || (mode === "bulk" && !bulkInput.trim())}
                        className={cn(
                            "flex min-w-[148px] items-center justify-center gap-2 rounded-xl bg-[#292929] px-4 py-3 text-sm font-medium text-white transition-colors hover:bg-[#3a3a3a] focus:ring-2 focus:ring-[#292929] focus:ring-offset-2 outline-none disabled:cursor-not-allowed disabled:opacity-50"
                        )}
                    >
                        {isSubmitting ? (
                            <>
                                <Loader2 className="h-4 w-4 animate-spin" />
                                Processing...
                            </>
                        ) : (
                            <>
                                {mode === "single" ? <MailPlus className="h-4 w-4" /> : <UploadCloud className="h-4 w-4" />}
                                {mode === "single" ? "Send invite" : "Import roster"}
                            </>
                        )}
                    </button>
                    </div>
                </form>
            </div>
        </div>,
        document.body
    );
}
