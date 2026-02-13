"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useParams } from "next/navigation";
import { useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { StatusCard } from "@/components/auth/status-card";
import { LoadingOverlay } from "@/components/auth/loading-overlay";

export default function VerifyEmailPage() {
  const router = useRouter();
  const params = useParams();
  const locale = params.locale as string;
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
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
              token: token
            },
            fetchOptions: {
              onSuccess: () => {
                toast.success(t('SuccessToast'));
                router.push("/dashboard");
              },
              onError: (ctx) => {
                setIsVerifying(false);
                toast.error(ctx.error.message || t('ErrorToast'));
              }
            }
          });
        } catch (error) {
          setIsVerifying(false);
          toast.error(t('GenericError'));
        }
      };

      verify();
    }
  }, [token, router, searchParams, t]);

  const handleResendVerification = async () => {
    if (!email) return;
    setIsResending(true);

    try {
      await authClient.sendVerificationEmail({
        email,
        callbackURL: `/${locale}/dashboard`
      });
      toast.success(t('ResendSuccess'));
    } catch (err) {
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
        onClick: handleResendVerification,
        disabled: isResending
      } : undefined}
      secondaryAction={{
        text: t('BackToSignIn'),
        href: "/sign-in"
      }}
    />
  );
}
