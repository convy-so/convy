"use client";

import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { CheckCircle2, Loader2, Lock, User2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import toast from "react-hot-toast";

import { activateStudentAccount, validateStudentActivationToken } from "@/lib/api/learning";
import { useRouter } from "@/i18n/routing";
import { GlassPanel } from "@/components/learning/glass-panel";

export function StudentActivationPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [fullNameOverride, setFullNameOverride] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [completed, setCompleted] = useState(false);

  const activationQuery = useQuery({
    queryKey: ["studentActivation", token],
    queryFn: () => validateStudentActivationToken(token),
    enabled: Boolean(token),
    retry: false,
  });
  const fullName = useMemo(
    () => fullNameOverride ?? activationQuery.data?.student?.fullName ?? "",
    [activationQuery.data?.student?.fullName, fullNameOverride],
  );

  const activateMutation = useMutation({
    mutationFn: activateStudentAccount,
    onSuccess: () => {
      setCompleted(true);
      toast.success("Account activated");
    },
    onError: (error) => {
      toast.error(error instanceof Error ? error.message : "Failed to activate account");
    },
  });

  const isInvalid =
    Boolean(token) &&
    (activationQuery.isError || activationQuery.data?.valid === false);

  return (
    <div className="mx-auto flex min-h-screen max-w-[1200px] items-center justify-center px-6 py-12">
      <div className="grid w-full max-w-5xl gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[32px] border border-white/50 bg-[radial-gradient(circle_at_top_left,_rgba(14,165,233,0.14),_transparent_28%),radial-gradient(circle_at_bottom_right,_rgba(99,102,241,0.12),_transparent_24%),linear-gradient(180deg,rgba(255,255,255,0.88),rgba(255,255,255,0.7))] p-8 shadow-[0_24px_90px_-60px_rgba(15,23,42,0.3)] backdrop-blur-xl md:p-10">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-200/70 bg-white/70 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-sky-700">
            <CheckCircle2 className="h-3.5 w-3.5" />
            Student Access
          </div>
          <h1 className="mt-6 text-4xl font-semibold tracking-tight text-slate-950 md:text-5xl">
            Activate your learning account.
          </h1>
          <p className="mt-4 max-w-xl text-sm leading-7 text-slate-600 md:text-base">
            Your teacher has prepared a learning space for you. Set your password, confirm your name, and then you can sign in and start the onboarding conversation.
          </p>

          <div className="mt-8 grid gap-4 md:grid-cols-2">
            <GlassPanel className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                Teacher-managed
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                This account is attached to a classroom. You do not create it from scratch; your teacher invites you in.
              </p>
            </GlassPanel>
            <GlassPanel className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                What happens next
              </div>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                After activation, the tutor first gets to know how you think and learn before any academic session begins.
              </p>
            </GlassPanel>
          </div>
        </div>

        <GlassPanel className="p-6 md:p-8">
          {!token ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                Missing activation link
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Open this page from the email your teacher sent you so the secure activation token is included.
              </p>
            </div>
          ) : activationQuery.isLoading ? (
            <div className="flex min-h-[360px] items-center justify-center gap-3 text-sm text-slate-500">
              <Loader2 className="h-5 w-5 animate-spin" />
              Validating your invitation...
            </div>
          ) : isInvalid ? (
            <div className="space-y-3">
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                This invite is no longer valid
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                The token may have expired or already been used. Ask your teacher to resend the invitation.
              </p>
            </div>
          ) : completed ? (
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">
                <CheckCircle2 className="h-4 w-4" />
                Account ready
              </div>
              <h2 className="text-2xl font-semibold tracking-tight text-slate-950">
                You can sign in now
              </h2>
              <p className="text-sm leading-6 text-slate-600">
                Your account has been activated. Sign in and the platform will take you into the student onboarding flow.
              </p>
              <button
                type="button"
                onClick={() => router.push("/sign-in")}
                className="inline-flex w-full items-center justify-center rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800"
              >
                Go to sign in
              </button>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={(event) => {
                event.preventDefault();
                if (!fullName.trim()) {
                  toast.error("Please add the name you want to use.");
                  return;
                }
                if (password.length < 8) {
                  toast.error("Password must be at least 8 characters.");
                  return;
                }
                if (password !== confirmPassword) {
                  toast.error("Passwords do not match.");
                  return;
                }

                activateMutation.mutate({
                  token,
                  fullName: fullName.trim(),
                  password,
                });
              }}
            >
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-[0.24em] text-slate-500">
                  Classroom
                </div>
                <div className="mt-2 text-lg font-semibold tracking-tight text-slate-950">
                  {activationQuery.data?.classroom?.title}
                </div>
                <div className="mt-1 text-sm text-slate-500">
                  Invite for {activationQuery.data?.student?.email}
                </div>
              </div>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">Your name</span>
                <div className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/80 px-4 py-3">
                  <User2 className="h-4 w-4 text-slate-400" />
                  <input
                    value={fullName}
                    onChange={(event) => setFullNameOverride(event.target.value)}
                    placeholder="Your full name"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">Create password</span>
                <div className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/80 px-4 py-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    placeholder="At least 8 characters"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </div>
              </label>

              <label className="block">
                <span className="mb-2 block text-sm font-medium text-slate-800">Confirm password</span>
                <div className="flex items-center gap-3 rounded-[18px] border border-white/70 bg-white/80 px-4 py-3">
                  <Lock className="h-4 w-4 text-slate-400" />
                  <input
                    type="password"
                    value={confirmPassword}
                    onChange={(event) => setConfirmPassword(event.target.value)}
                    placeholder="Repeat your password"
                    className="w-full bg-transparent text-sm text-slate-900 outline-none"
                  />
                </div>
              </label>

              <button
                type="submit"
                disabled={activateMutation.isPending}
                className="inline-flex w-full items-center justify-center gap-2 rounded-[18px] bg-slate-950 px-4 py-3 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-60"
              >
                {activateMutation.isPending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Activate account
              </button>
            </form>
          )}
        </GlassPanel>
      </div>
    </div>
  );
}
