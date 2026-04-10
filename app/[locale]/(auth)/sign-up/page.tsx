"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { Link, useRouter } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { FormDivider } from "@/components/auth/form-divider";
import { InputField } from "@/components/auth/input-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { SubmitButton } from "@/components/auth/submit-button";
import { LoadingOverlay } from "@/components/auth/loading-overlay";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast"; 

export default function SignUpPage() {
  const params = useParams<{ locale?: string | string[] }>();
  const locale = Array.isArray(params.locale)
    ? (params.locale[0] ?? "en")
    : (params.locale ?? "en");
  const router = useRouter();
  const t = useTranslations('Auth.SignUp');
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    agreeToTerms: false,
    accountMode: "personal" as "personal" | "workspace",
    workspaceType: "collaborative" as "collaborative" | "institutional",
  });

  const [passwordStrength, setPasswordStrength] = useState({
    length: false,
    uppercase: false,
    number: false,
    special: false,
  });

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, password });
    setPasswordStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
    });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const result = await authClient.signUp.email({
        email: formData.email,
        password: formData.password,
        name: formData.name,
        callbackURL:
          formData.accountMode === "workspace"
            ? `/${locale}/dashboard/workspaces/new?type=${formData.workspaceType}`
            : `/${locale}/dashboard`,
        fetchOptions: {
          onError: (ctx) => {
            toast.error(ctx.error.message);
          }
        }
      });

      // Handle the response - token will be null due to email verification requirement
      if (result.data?.user && result.data?.token === null) {
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('verification_email', formData.email);
          sessionStorage.setItem('signup_account_mode', formData.accountMode);
          sessionStorage.setItem('signup_workspace_type', formData.workspaceType);
        }
        toast.success(t('Success'));
        setIsRedirecting(true);
        router.push("/verify-email");
      } else if (result.data?.token) {
        // This shouldn't happen with requireEmailVerification: true, but handle it
        toast.success(t('SuccessVerified'));
        setIsRedirecting(true);
        router.push(
          formData.accountMode === "workspace"
            ? `/dashboard/workspaces/new?type=${formData.workspaceType}`
            : "/dashboard",
        );
      }
    } catch (error) {
      console.error("[SignUp] Failed:", error);
      toast.error(t('Error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: `/${locale}/dashboard`
    });
  };

  const isPasswordValid = Object.values(passwordStrength).every(Boolean);

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
      <GoogleButton onClick={handleGoogleSignUp} />

      <div className="my-6">
        <FormDivider />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          id="name"
          type="text"
          label={t('NameLabel')}
          icon={User}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder={t('NamePlaceholder')}
          required
        />

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

        <div className="space-y-3 rounded-2xl border border-gray-200 p-4">
          <div>
            <p className="text-sm font-semibold text-[#292929]">Start In</p>
            <p className="text-xs text-[#696969] mt-1">
              Personal space is for one teacher. Workspaces are for shared teacher teams or institutions.
            </p>
          </div>

          <div className="grid gap-3">
            <button
              type="button"
              onClick={() => setFormData({ ...formData, accountMode: "personal" })}
              className={`rounded-xl border px-4 py-3 text-left transition ${
                formData.accountMode === "personal"
                  ? "border-[#292929] bg-[#292929] text-white"
                  : "border-gray-200 bg-white text-[#292929]"
              }`}
            >
              <div className="font-medium">Personal Space</div>
              <div className="text-xs mt-1 opacity-80">
                Full solo-teacher access to classes, surveys, materials, and folders.
              </div>
            </button>
            <button
              type="button"
              onClick={() =>
                setFormData({ ...formData, accountMode: "workspace" })
              }
              className={`rounded-xl border px-4 py-3 text-left transition ${
                formData.accountMode === "workspace"
                  ? "border-[#292929] bg-[#292929] text-white"
                  : "border-gray-200 bg-white text-[#292929]"
              }`}
            >
              <div className="font-medium">Workspace</div>
              <div className="text-xs mt-1 opacity-80">
                Shared teacher collaboration, with optional institutional controls.
              </div>
            </button>
          </div>

          {formData.accountMode === "workspace" && (
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, workspaceType: "collaborative" })
                }
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  formData.workspaceType === "collaborative"
                    ? "border-[#292929] bg-gray-100 text-[#292929]"
                    : "border-gray-200 bg-white text-[#696969]"
                }`}
              >
                <div className="font-medium">Collaborative</div>
                <div className="text-xs mt-1">Teacher team</div>
              </button>
              <button
                type="button"
                onClick={() =>
                  setFormData({ ...formData, workspaceType: "institutional" })
                }
                className={`rounded-xl border px-3 py-3 text-left text-sm transition ${
                  formData.workspaceType === "institutional"
                    ? "border-[#292929] bg-gray-100 text-[#292929]"
                    : "border-gray-200 bg-white text-[#696969]"
                }`}
              >
                <div className="font-medium">Institutional</div>
                <div className="text-xs mt-1">School governance</div>
              </button>
            </div>
          )}
        </div>

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
            requirements={passwordStrength}
            compact
          />
        </div>

        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            id="terms"
            checked={formData.agreeToTerms}
            onChange={(e) => setFormData({ ...formData, agreeToTerms: e.target.checked })}
            className="w-4 h-4 text-[#292929] border-gray-300 rounded focus:ring-[#292929] focus:ring-2 mt-0.5"
            required
          />
          <label htmlFor="terms" className="text-sm text-[#696969]">
            {t('AgreeTo')}{" "}
            <Link href="/terms" className="text-[#292929] hover:text-[#292929]/80 font-medium transition-colors">
              {t('Terms')}
            </Link>{" "}
            {t('And')}{" "}
            <Link href="/privacy" className="text-[#292929] hover:text-[#292929]/80 font-medium transition-colors">
              {t('Privacy')}
            </Link>
          </label>
        </div>

        <SubmitButton
          isLoading={isLoading}
          loadingText={t('Loading')}
          disabled={!isPasswordValid || !formData.agreeToTerms}
        >
          {t('Button')}
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <p className="text-[#696969] text-sm">
          {t('HasAccount')}{" "}
          <Link
            href="/sign-in"
            className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors"
          >
            {t('SignInLink')}
          </Link>
        </p>
      </div>
    </AuthCard>
    </>
  );
}
