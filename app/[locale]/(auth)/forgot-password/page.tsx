"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Mail, ArrowLeft, Check } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { StatusCard } from "@/components/auth/status-card";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const params = useParams();
  const locale = params.locale as string;
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
        redirectTo: `/${locale}/reset-password`,
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
      console.error(error);
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
          href: "/sign-in"
        }}
      />
    );
  }

  return (
    <AuthCard
      title={t('Title')}
      subtitle={t('Subtitle')}
    >
      <form onSubmit={handleSubmit} className="space-y-6">
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
          href="/sign-in"
          className="inline-flex items-center gap-2 text-[#696969] text-sm hover:text-[#292929] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          {t('BackToSignIn')}
        </Link>
      </div>
    </AuthCard>
  );
}
