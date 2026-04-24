"use client";

import { useState } from "react";
import toast from "react-hot-toast";

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
    <div className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
      <div className="mb-6 space-y-2">
        <h1 className="text-2xl font-bold tracking-tight text-slate-950">
          {heading}
        </h1>
        <p className="text-sm text-slate-600">{description}</p>
      </div>

      <form className="space-y-5" onSubmit={handleSubmit}>
        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Type</span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              value={kind}
              onChange={(event) => setKind(event.target.value as FeedbackKind)}
            >
              <option value="suggestion">Suggestion</option>
              <option value="complaint">Complaint</option>
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Area</span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              value={sourceArea}
              onChange={(event) =>
                setSourceArea(event.target.value as FeedbackSourceArea)
              }
            >
              {(Object.keys(sourceAreaLabels) as FeedbackSourceArea[]).map((item) => (
                <option key={item} value={item}>
                  {sourceAreaLabels[item]}
                </option>
              ))}
            </select>
          </label>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Submitting as</span>
            <select
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              value={submitterRole}
              onChange={(event) =>
                setSubmitterRole(event.target.value as FeedbackRole)
              }
            >
              {allowedRoles.map((role) => (
                <option key={role} value={role}>
                  {roleLabels[role]}
                </option>
              ))}
            </select>
          </label>

          <label className="space-y-2 text-sm font-medium text-slate-700">
            <span>Contact email</span>
            <input
              className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="name@example.com"
            />
          </label>
        </div>

        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Subject</span>
          <input
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            value={subject}
            onChange={(event) => setSubject(event.target.value)}
            maxLength={140}
            placeholder="Short summary of the issue or idea"
          />
        </label>

        <label className="space-y-2 text-sm font-medium text-slate-700">
          <span>Details</span>
          <textarea
            className="min-h-40 w-full rounded-[1.5rem] border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none transition focus:border-sky-500"
            value={message}
            onChange={(event) => setMessage(event.target.value)}
            maxLength={4000}
            placeholder="Tell us what happened, what you expected, and what would improve the experience."
          />
        </label>

        <div className="flex items-center justify-between gap-4 rounded-[1.5rem] bg-slate-50 px-4 py-3 text-xs text-slate-500">
          <p>
            Submissions go to the admin review queue so we can track complaints
            and product suggestions in one place.
          </p>
          <button
            className="rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
            disabled={isSubmitting}
            type="submit"
          >
            {isSubmitting ? "Submitting..." : "Submit"}
          </button>
        </div>
      </form>
    </div>
  );
}
