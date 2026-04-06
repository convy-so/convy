"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { AuthCard } from "@/components/auth/auth-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/components/providers/auth-provider";
import toast from "react-hot-toast";
import { Suspense } from "react";
import { CheckCircle2, XCircle, Users, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

function AcceptInvitationContent() {
  const t = useTranslations("Auth.Invitation");
  const params = useParams<{ id?: string | string[] }>();
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitationId = Array.isArray(params.id)
    ? (params.id[0] ?? "")
    : (params.id ?? "");
  const queryClient = useQueryClient();
  const hasAttemptedAccept = useRef(false);

  const finalizeSuccess = useCallback(() => {
    setIsSuccess(true);
    toast.success(t("ToastSuccess"));
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.all });
    queryClient.invalidateQueries({ queryKey: queryKeys.workspaces.active });
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey?.[0] === "workspaceMembers",
    });
    queryClient.invalidateQueries({
      predicate: (query) => query.queryKey?.[0] === "workspaceInvitations",
    });
    setTimeout(() => {
      router.push("/dashboard");
    }, 2000);
  }, [queryClient, router, t]);

  const handleAccept = useCallback(async () => {
    if (!invitationId) return;
    setIsLoading(true);
    setError(null);

    try {
      await authClient.organization.acceptInvitation({
        invitationId,
        fetchOptions: {
          onSuccess: () => {
            finalizeSuccess();
          },
          onError: (ctx) => {
            const message = ctx.error.message || t("GenericError");
            if (/already|accepted|member/i.test(message)) {
              finalizeSuccess();
              return;
            }
            setError(message);
            toast.error(message);
          },
        },
      });
    } catch (err) {
      console.error("[AcceptInvitation] Failed:", err);
      setError(t("GenericError"));
    } finally {
      setIsLoading(false);
    }
  }, [finalizeSuccess, invitationId, t]);

  useEffect(() => {
    if (authLoading || !session || !invitationId || isSuccess) return;
    if (hasAttemptedAccept.current) return;
    hasAttemptedAccept.current = true;
    handleAccept();
  }, [authLoading, handleAccept, invitationId, isSuccess, session]);

  if (authLoading) {
    return (
      <AuthCard
        title={t("Verifying")}
        subtitle={t("VerifyingSubtitle")}
      >
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AuthCard>
    );
  }

  // If not logged in, show message
  if (!session) {
    return (
      <AuthCard
        title={t("AuthRequired")}
        subtitle={t("SignInRequired")}
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
            <Users className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-600 font-medium">
              {t("InviteMessage")}
            </p>
          </div>
          <Link href={`/sign-in?callbackUrl=/workspace/accept-invitation/${invitationId}`} className="block">
            <SubmitButton>
              {t("SignInToAccept")}
            </SubmitButton>
          </Link>
          <div className="text-center">
            <Link
              href={`/sign-up?callbackUrl=/workspace/accept-invitation/${invitationId}`}
              className="text-sm text-gray-500 hover:text-gray-900 transition-colors"
            >
              {t("NoAccount")} {t("SignUp")}
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title={t("AuthRequired")}
      subtitle={isSuccess ? t("Welcome") : t("Invited")}
    >
      <div className="space-y-6">
        {isSuccess ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <p className="text-gray-600 font-medium text-lg">{t("JoinedSuccess")}</p>
              <p className="text-gray-500">{t("JoinedDesc")}</p>
              <p className="text-sm text-gray-400">{t("Redirecting")}</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <p className="text-red-900 font-semibold text-lg">{t("ErrorTitle")}</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
            <Link href="/dashboard" className="block w-full">
              <button className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">
                {t("BackToDashboard")}
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200 shadow-sm">
                <Users className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <p className="text-gray-900 font-semibold">{t("JoinWorkspace")}</p>
                <p className="text-sm text-gray-500 leading-tight">{t("JoinDesc")}</p>
              </div>
            </div>

            <SubmitButton
              onClick={handleAccept}
              isLoading={isLoading}
              loadingText={t("Accepting")}
            >
              {t("AcceptButton")}
            </SubmitButton>
          </div>
        )}
      </div>
    </AuthCard>
  );
}

export default function AcceptInvitationPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <AcceptInvitationContent />
    </Suspense>
  );
}
