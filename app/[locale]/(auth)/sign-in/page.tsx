"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { FormDivider } from "@/components/auth/form-divider";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { LoadingOverlay } from "@/components/auth/loading-overlay";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";

export default function SignInPage() {
  const params = useParams();
  const locale = params.locale as string;
  const router = useRouter();
  const t = useTranslations('Auth.SignIn');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: true,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authClient.signIn.email({
        email: formData.email,
        password: formData.password,
        rememberMe: formData.rememberMe,
        fetchOptions: {
          onSuccess: (ctx) => {
            toast.success(t('Success'));
            setIsRedirecting(true);
            router.push("/dashboard");
          },
          onError: (ctx) => {
            const msg = ctx.error.message || "";
            const isUnverified =
              ctx.error.status === 403 ||
              msg.toLowerCase().includes("not verified") ||
              msg.toLowerCase().includes("verify");

            if (isUnverified) {
              // Save the email so the verify-email page can show the resend button
              if (typeof window !== 'undefined') {
                sessionStorage.setItem('verification_email', formData.email);
              }
              toast.error(msg || "Please verify your email first.");
              router.push("/verify-email");
            } else {
              toast.error(msg);
            }
          }
        }
      });
    } catch (error) {
      console.error(error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `/${locale}/dashboard`
    });
  };

  return (
    <>
      {isRedirecting && (
        <LoadingOverlay 
          message={t('LoadingOverlay')}
          subtitle={t('Redirecting')}
        />
      )}
    <AuthCard
      title={t('Title')}
      subtitle={t('Subtitle')}
    >
      <GoogleButton onClick={handleGoogleSignIn} />

      <div className="my-6">
        <FormDivider />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          id="email"
          type="email"
          label={t('EmailLabel')}
          icon={Mail}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder={t('EmailPlaceholder')}
          required
        />

        <InputField
          id="password"
          type={showPassword ? "text" : "password"}
          label={t('PasswordLabel')}
          icon={Lock}
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
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

        <div className="flex items-center justify-between">
          <label className="flex items-center">
            <input
              type="checkbox"
              checked={formData.rememberMe}
              onChange={(e) => setFormData({ ...formData, rememberMe: e.target.checked })}
              className="w-4 h-4 text-[#292929] border-gray-300 rounded focus:ring-[#292929] focus:ring-2"
            />
            <span className="ml-2 text-sm text-[#696969]">{t('RememberMe')}</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-[#292929] hover:text-[#292929]/80 font-medium transition-colors"
          >
            {t('ForgotPassword')}
          </Link>
        </div>

        <SubmitButton isLoading={isLoading} loadingText={t('Loading')}>
          {t('Button')}
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <p className="text-[#696969] text-sm">
          {t('NoAccount')}{" "}
          <Link
            href="/sign-up"
            className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors"
          >
           {t('SignUpLink')}
          </Link>
        </p>
      </div>
    </AuthCard>
    </>
  );
}