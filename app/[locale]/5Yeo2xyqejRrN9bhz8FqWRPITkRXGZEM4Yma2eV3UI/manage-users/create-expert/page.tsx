"use client";

import { useState } from "react";
import { ArrowLeft, Loader2, Mail, UserPlus } from "lucide-react";

import { Link, useRouter } from "@/i18n/routing";
import { getAdminAppPath } from "@/lib/auth/admin-path";
import toast from "react-hot-toast";

export default function CreateExpertPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/admin/experts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(
          data?.error?.message ?? data?.error ?? "Failed to send expert invitation",
        );
      }

      toast.success("Expert invitation sent.");
      router.push(getAdminAppPath("/manage-users"));
      router.refresh();
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : "An error occurred",
      );
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div className="flex items-center gap-4">
        <Link
          href={getAdminAppPath("/manage-users")}
          className="flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition-colors hover:text-slate-900"
        >
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Provision Expert
          </h1>
          <p className="mt-1 text-slate-500">
            Create the expert account from email only, then let the expert set their own name during onboarding.
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm md:p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="space-y-4">
            <div>
              <label
                htmlFor="email"
                className="mb-1 block text-sm font-medium text-slate-700"
              >
                Email Address
              </label>
              <div className="relative">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
                  <Mail className="h-5 w-5 text-slate-400" />
                </div>
                <input
                  id="email"
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-10 pr-4 outline-none transition-all focus:border-indigo-600 focus:ring-2 focus:ring-indigo-600"
                  placeholder="jane.doe@convy.com"
                />
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-4">
            <Link
              href={getAdminAppPath("/manage-users")}
              className="rounded-xl px-5 py-2.5 text-sm font-medium text-slate-600 transition-colors hover:bg-slate-50"
            >
              Cancel
            </Link>
            <button
              type="submit"
              disabled={isLoading}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-6 py-2.5 text-sm font-semibold text-white transition-all hover:bg-indigo-700 focus:ring-2 focus:ring-indigo-600 focus:ring-offset-2 disabled:opacity-70"
            >
              {isLoading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <UserPlus className="h-4 w-4" />
              )}
              Send Invitation
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
