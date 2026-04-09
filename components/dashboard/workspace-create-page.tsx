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

export function WorkspaceCreatePage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [form, setForm] = useState({ name: "", slug: "", description: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="flex min-h-[80vh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md">
        <AuthCard
          title="Create a workspace"
          subtitle="Set up your shared educational hub to manage departments and classrooms."
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
              label="Institution Name"
              id="name"
              placeholder="e.g. Greenfield Academy"
              icon={Building2}
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
              required
            />

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
                Skip and stay on personal account
              </Link>
            </div>
          </form>
        </AuthCard>
      </div>
    </div>
  );
}
 
