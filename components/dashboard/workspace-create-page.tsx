"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Building2, Loader2, Sparkles } from "lucide-react";
import toast from "react-hot-toast";

import { createWorkspace, setActiveWorkspace } from "@/app/actions/workspace";
import { queryKeys } from "@/lib/query-keys";
import { useRouter, Link } from "@/i18n/routing";

import { AuthCard } from "@/components/auth/auth-card";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { useSearchParams } from "next/navigation";

export function WorkspaceCreatePage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [workspaceType, setWorkspaceType] = useState<"collaborative" | "institutional">(
    searchParams.get("type") === "institutional" ? "institutional" : "collaborative",
  );
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <AuthCard
          title="Create a workspace"
          subtitle="Choose a collaborative teacher workspace or an institutional workspace with governance controls."
        >
          <form
            className="space-y-4"
            onSubmit={async (event) => {
              event.preventDefault();
              setError(null);
              setIsSubmitting(true);

              const slug =
                form.slug.trim() ||
                form.name
                  .trim()
                  .toLowerCase()
                  .replace(/[^a-z0-9]+/g, "-")
                  .replace(/^-+|-+$/g, "");

              try {
                const created = await createWorkspace({
                  name: form.name.trim(),
                  slug,
                  type: workspaceType,
                });

                if (!created.success) {
                  setError(created.error);
                  return;
                }

                const activated = await setActiveWorkspace(created.data.id);
                if (!activated.success) {
                  setError(activated.error);
                  return;
                }

                await Promise.all([
                  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all }),
                  queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active }),
                ]);

                toast.success("Workspace established");
                router.push("/dashboard/team");
                router.refresh();
              } catch (submissionError) {
                setError(
                  submissionError instanceof Error
                    ? submissionError.message
                    : "Failed to build workspace",
                );
              } finally {
                setIsSubmitting(false);
              }
            }}
          >
            <InputField
              label="Workspace Name"
              id="name"
              placeholder="e.g. Greenfield Teaching Team"
              icon={Building2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setWorkspaceType("collaborative")}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  workspaceType === "collaborative"
                    ? "border-[#292929] bg-[#292929] text-white"
                    : "border-gray-200 bg-white text-[#292929]"
                }`}
              >
                <div className="font-medium">Collaborative</div>
                <div className="mt-1 text-xs opacity-80">Teacher team workspace</div>
              </button>
              <button
                type="button"
                onClick={() => setWorkspaceType("institutional")}
                className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                  workspaceType === "institutional"
                    ? "border-[#292929] bg-[#292929] text-white"
                    : "border-gray-200 bg-white text-[#292929]"
                }`}
              >
                <div className="font-medium">Institutional</div>
                <div className="mt-1 text-xs opacity-80">Departments and staff roles</div>
              </button>
            </div>

            <InputField
              label="Short Code (Optional)"
              id="slug"
              placeholder="e.g. greenfield"
              value={form.slug}
              onChange={(e) => setForm({ ...form, slug: e.target.value })}
            />

            <div className="space-y-2">
              <label className="block text-sm font-medium text-[#292929]">
                Description (Optional)
              </label>
              <textarea
                value={form.description}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                rows={3}
                placeholder="What is this workspace for?"
                className="w-full resize-none rounded-xl border border-gray-200 px-4 py-3 text-sm focus:ring-2 focus:ring-[#292929] focus:border-transparent outline-none transition-all"
              />
            </div>

            {error && (
              <div className="rounded-xl border border-red-100 bg-red-50 p-4 text-sm font-medium text-red-600">
                {error}
              </div>
            )}

            <div className="pt-2">
              <SubmitButton isLoading={isSubmitting} loadingText="Building...">
                Create workspace
              </SubmitButton>
            </div>

            <div className="text-center mt-4">
              <Link
                href="/dashboard"
                className="text-sm font-medium text-[#696969] hover:text-[#292929] transition-colors"
              >
                Skip and stay in personal space
              </Link>
            </div>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
 
