"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Lock, Check } from "lucide-react";
import { Suspense } from "react";
import { AuthCard } from "@/components/auth/auth-card";

import { StatusCard } from "@/components/auth/status-card";
import { InputField } from "@/components/auth/input-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { sanitizeReturnTo } from "@/lib/auth/redirect";
import { getSafeReturnToHref, getSignInHref } from "@/lib/auth/hrefs";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const returnTo = sanitizeReturnTo(searchParams.get("returnTo")) ?? "/sign-in";
  const returnToHref = getSafeReturnToHref(returnTo) ?? getSignInHref();
  const t = useTranslations('Auth.ResetPassword');

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    password: "",
    confirmPassword: "",
  });

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false,
    specialChar: false,
  });

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, password });
    setPasswordStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      specialChar: /[^A-Za-z0-9]/.test(password),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (formData.password !== formData.confirmPassword) {
      return;
    }

    setIsLoading(true);

    try {
      await authClient.resetPassword({
        newPassword: formData.password,
        token: token || "",
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
      console.error("[ResetPassword] Reset failed:", error);
      toast.error(t('Errors.Failed'));
    } finally {
      setIsLoading(false);
    }
  };

  const isPasswordValid = passwordStrength.length;
  const passwordsMatch = formData.password === formData.confirmPassword;

  if (isSubmitted) {
    return (
      <StatusCard
        icon={Check}
        iconColor="green"
        title={t('Success.Title')}
        description={t('Success.Description')}
        actionButton={{
          text: t('Success.Button'),
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
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <InputField
            id="password"
            type={showPassword ? "text" : "password"}
            label={t('PasswordLabel')}
            icon={Lock}
            value={formData.password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder={t('PasswordPlaceholder')}
            rightElement={
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="text-[#696969] hover:text-[#292929] transition-colors"
              >
                {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
              </button>
            }
            required
          />

          <PasswordStrength
            password={formData.password}
            requirements={{
              length: passwordStrength.length,
              uppercase: passwordStrength.uppercase,
              number: passwordStrength.number,
              special: passwordStrength.special
            }}
            compact
          />
        </div>

        <InputField
          id="confirmPassword"
          type={showConfirmPassword ? "text" : "password"}
          label={t('ConfirmPasswordLabel')}
          icon={Lock}
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder={t('ConfirmPasswordPlaceholder')}
          error={formData.confirmPassword && !passwordsMatch ? t('Errors.Mismatch') : undefined}
          rightElement={
            <button
              type="button"
              onClick={() => setShowConfirmPassword(!showConfirmPassword)}
              className="text-[#696969] hover:text-[#292929] transition-colors"
            >
              {showConfirmPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
            </button>
          }
          required
        />

        {formData.confirmPassword && passwordsMatch && (
          <p className="text-sm text-green-600 flex items-center gap-1">
            <Check className="w-4 h-4" />
            {t('PasswordsMatch')}
          </p>
        )}

        <SubmitButton
          isLoading={isLoading}
          loadingText={t('Loading')}
          disabled={!isPasswordValid || !passwordsMatch}
        >
          {t('Button')}
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <Link
          href={returnToHref}
          className="text-[#696969] text-sm hover:text-[#292929] transition-colors"
        >
          {t('Success.Button')}
        </Link>
      </div>
    </AuthCard>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense>
      <ResetPasswordContent />
    </Suspense>
  );
}
