"use client";

import { useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Mail, ArrowLeft, Check, Loader2 } from "lucide-react";
import { Suspense } from "react";
import { AuthCard } from "@/features/auth/ui/auth-card";

import { StatusCard } from "@/features/auth/ui/status-card";
import { InputField } from "@/features/auth/public-ui";
import { SubmitButton } from "@/features/auth/ui/submit-button";
import { authClient } from "@/features/auth/public-client";
import toast from "react-hot-toast";
import { sanitizeReturnTo } from "@/features/auth/public-server";
import { getSafeReturnToHref, getSignInHref } from "@/features/auth/public-server";

function ForgotPasswordContent() {
  const params = useParams<{ locale?: string | string[] }>();
  const searchParams = useSearchParams();
  const locale = Array.isArray(params.locale)
    ? (params.locale[0] ?? "en")
    : (params.locale ?? "en");
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const returnToHref = getSafeReturnToHref(returnTo) ?? getSignInHref();
  const t = useTranslations('Auth.ForgotPassword');
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authClient.requestPasswordReset({
        email,
        redirectTo: returnTo
          ? `/${locale}/reset-password?returnTo=${encodeURIComponent(returnTo)}`
          : `/${locale}/reset-password`,
        fetchOptions: {
          onSuccess: () => {
            setIsSubmitted(true);
          },
          onError: (ctx) => {
            toast.error(ctx.error.message);
          }
        }
      });
    } catch (error) {
      console.error("[ForgotPassword] Request failed:", error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isSubmitted) {
    return (
      <StatusCard
        icon={Check}
        iconColor="green"
        title={t('Success.Title')}
        description={t('Success.Description', { email })}
        actionButton={{
          text: t('Success.Button'),
          onClick: () => setIsSubmitted(false)
        }}
        secondaryAction={{
          text: t('BackToSignIn'),
          href: returnToHref
        }}
      />
    );
  }

  return (
    <AuthCard
      title={t('Title')}
      subtitle={t('Subtitle')}
    >
      <form
        onSubmit={(event) => {
          void handleSubmit(event);
        }}
        className="space-y-6"
      >
        <InputField
          id="email"
          type="email"
          label={t('EmailLabel')}
          icon={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder={t('EmailPlaceholder')}
          required
        />

        <SubmitButton isLoading={isLoading} loadingText={t('Loading')}>
          {t('Button')}
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <Link
          href={returnToHref}
          className="inline-flex items-center gap-2 text-[#696969] text-sm hover:text-[#292929] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('BackToSignIn')}
        </Link>
      </div>
    </AuthCard>
  );
}

export default function ForgotPasswordPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center p-12">
        <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
      </div>
    }>
      <ForgotPasswordContent />
    </Suspense>
  );
}
