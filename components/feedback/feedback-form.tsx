"use client";

import { useState, useRef, useEffect } from "react";
import toast from "react-hot-toast";
import { ChevronDown, Check } from "lucide-react";

import { usePathname } from "@/i18n/routing";
import type {
  FeedbackRole,
  FeedbackKind,
  FeedbackSourceArea,
} from "@/lib/feedback/service";

type FeedbackFormProps = {
  allowedRoles: FeedbackRole[];
  defaultRole: FeedbackRole;
  contactEmail: string;
  heading: string;
  description: string;
};

const sourceAreaLabels: Record<FeedbackSourceArea, string> = {
  platform: "Platform",
  survey: "Survey",
  tutoring: "Tutoring",
  classroom: "Classroom",
  expert_ops: "Expert Ops",
  other: "Other",
};

const roleLabels: Record<FeedbackRole, string> = {
  teacher: "Teacher",
  student: "Student",
  expert: "Expert",
};

function CustomSelect<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { label: string; value: T }[];
  onChange: (val: T) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const selectedOption = options.find((opt) => opt.value === value);

  return (
    <div className="relative space-y-2" ref={dropdownRef}>
      <div className="text-sm font-medium text-slate-700">{label}</div>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex w-full items-center justify-between gap-3 rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm font-medium text-slate-700 hover:bg-slate-50 hover:border-slate-200 transition-all"
      >
        <span className="truncate">{selectedOption?.label ?? "Select..."}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${isOpen ? "rotate-180" : ""}`} />
      </button>
      
      {isOpen && (
        <div className="absolute top-full left-0 mt-2 w-full z-50 bg-white border border-slate-100 rounded-xl overflow-hidden py-1">
          {options.map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className="flex items-center justify-between w-full px-4 py-3 text-sm font-medium text-slate-500 hover:bg-slate-50 transition-colors text-left"
            >
              <div className={value === opt.value ? "text-sky-600" : "text-slate-700"}>
                {opt.label}
              </div>
              {value === opt.value && <Check className="h-4 w-4 text-sky-500 flex-shrink-0" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function FeedbackForm({
  allowedRoles,
  defaultRole,
  contactEmail,
  heading,
  description,
}: FeedbackFormProps) {
  const pathname = usePathname();
  const [submitterRole, setSubmitterRole] = useState<FeedbackRole>(defaultRole);
  const [kind, setKind] = useState<FeedbackKind>("suggestion");
  const [sourceArea, setSourceArea] = useState<FeedbackSourceArea>("platform");
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState(contactEmail);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const response = await fetch("/api/feedback", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          submitterRole,
          kind,
          sourceArea,
          subject,
          message,
          contactEmail: email,
          page: pathname,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Failed to submit feedback");
      }

      toast.success("Your feedback has been submitted.");
      setKind("suggestion");
      setSourceArea("platform");
      setSubject("");
      setMessage("");
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "Failed to submit feedback",
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-100 bg-white p-6 sm:p-8">
      <div className="mb-8 space-y-3">
        <h1 className="text-3xl font-medium tracking-tight text-slate-900">
          {heading}
        </h1>
        <p className="text-base font-medium leading-relaxed text-slate-500">{description}</p>
      </div>

      <form className="space-y-6" onSubmit={handleSubmit}>
        <div className="grid gap-6 sm:grid-cols-2">
          <CustomSelect
            label="Type"
            value={kind}
            options={[
              { label: "Suggestion", value: "suggestion" },
              { label: "Complaint", value: "complaint" },
            ]}
            onChange={(val) => setKind(val)}
          />

          <CustomSelect
            label="Area"
            value={sourceArea}
            options={(Object.keys(sourceAreaLabels) as FeedbackSourceArea[]).map((key) => ({
              label: sourceAreaLabels[key],
              value: key,
            }))}
            onChange={(val) => setSourceArea(val)}
          />
        </div>

        <div className="grid gap-6 sm:grid-cols-2">
          <CustomSelect
            label="Submitting as"
            value={submitterRole}
            options={allowedRoles.map((role) => ({
              label: roleLabels[role],
              value: role,
            }))}
            onChange={(val) => setSubmitterRole(val)}
          />

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Contact email</span>
            <input
              className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-200 focus:bg-white"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
        </div>

        <label className="space-y-2 text-sm font-medium text-slate-700 flex flex-col">
          <span>Subject</span>
          <input
            className="w-full rounded-2xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-200 focus:bg-white"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={140}
            placeholder="Short summary of the issue or idea"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-slate-700 flex flex-col">
          <span>Details</span>
          <textarea
            className="min-h-[160px] w-full rounded-3xl border border-slate-100 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-slate-200 focus:bg-white"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            placeholder="Tell us what happened, what you expected, and what would improve the experience."
          />
        </label>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-3xl bg-slate-50 px-6 py-4">
          <p className="text-xs font-medium text-slate-500 leading-relaxed text-center sm:text-left">
            Submissions go to the admin review queue so we can track complaints
            and product suggestions in one place.
          </p>
          <button
            className="rounded-xl bg-slate-900 px-6 py-3 text-sm font-medium text-white transition hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      </form>
    </div>
  );
}
