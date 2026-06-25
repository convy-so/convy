"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { authClient } from "@/features/auth/public-client";
import toast from "react-hot-toast";
import { StatusCard } from "@/features/auth/ui/status-card";
import { LoadingOverlay } from "@/features/auth/ui/loading-overlay";
import { getAuthContinueHref, getSafeReturnToHref, getSignInHref } from "@/features/auth/public-server";
import { sanitizeReturnTo } from "@/features/auth/public-server";

import { Suspense } from "react";

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={
      <LoadingOverlay
        message="Loading..."
        subtitle="Please wait while we prepare the verification page."
      />
    }>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const router = useRouter();
  const params = useParams<{ locale?: string | string[] }>();
  const locale = Array.isArray(params.locale)
    ? (params.locale[0] ?? "en")
    : (params.locale ?? "en");
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const callbackURL = searchParams.get("callbackURL");
  const invitationId = searchParams.get("invitationId");
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo"));
  const returnToHref = getSafeReturnToHref(returnTo);
  const t = useTranslations('Auth.VerifyEmail');

  const [email, setEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    } else if (typeof window !== 'undefined') {
      const storedEmail = sessionStorage.getItem('verification_email');
      if (storedEmail) setEmail(storedEmail);
    }

    if (token) {
      setIsVerifying(true);
      const verify = async () => {
        try {
          await authClient.verifyEmail({
            query: {
              token,
              callbackURL: callbackURL ?? `/${locale}/auth/continue`,
            },
            fetchOptions: {
              onSuccess: () => {
                toast.success(t('SuccessToast'));
                router.push(getAuthContinueHref());
              },
              onError: (ctx) => {
                setIsVerifying(false);
                toast.error(ctx.error.message || t('ErrorToast'));
              }
            }
          });
        } catch (error) {
          console.error("[verifyEmail] Failed:", error);
          setIsVerifying(false);
          toast.error(t('GenericError'));
        }
      };

      void verify();
    }
  }, [callbackURL, locale, router, searchParams, t, token]);

  const handleResendVerification = async () => {
    if (!email) return;
    setIsResending(true);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: callbackURL ?? `/${locale}/auth/continue`
      });
      toast.success(t('ResendSuccess'));
    } catch (error) {
      console.error("[handleResendVerification] Failed:", error);
      toast.error(t('ResendError'));
    } finally {
      setIsResending(false);
    }
  };

  if (isVerifying) {
    return (
      <LoadingOverlay
        message={t('Verifying')}
        subtitle={t('VerifyingSubtitle')}
      />
    );
  }

  return (
    <StatusCard
      imageSrc="/check-email.png"
      title={t('Title')}
      description={
        <>
          {t('Description', { email: email || t('DefaultEmail') })}
        </>
      }
      showLogo
      actionButton={email ? {
        text: isResending ? t('ResendingButton') : t('ResendButton'),
        onClick: () => {
          void handleResendVerification();
        },
        disabled: isResending
      } : undefined}
      secondaryAction={{
        text: t('BackToSignIn'),
        href: returnToHref ?? getSignInHref(invitationId)
      }}
    />
  );
}
