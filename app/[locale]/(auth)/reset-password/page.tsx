"use client";

import { useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Eye, EyeOff, Lock, Check, AlertCircle } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { StatusCard } from "@/components/auth/status-card";
import { InputField } from "@/components/auth/input-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";

export default function ResetPasswordPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token"); // Better-auth might handle this automatically or pass it via props/query
  const router = useRouter();


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
    specialChar: false, // Added to match type if needed, but original code used 'special'
  });

  // Correction: Match the original state structure exactly to avoid type errors
  // If original had 'special', keep 'special'.

  const handlePasswordChange = (password: string) => {
    setFormData({ ...formData, password });
    setPasswordStrength({
      length: password.length >= 8,
      uppercase: /[A-Z]/.test(password),
      number: /[0-9]/.test(password),
      special: /[^A-Za-z0-9]/.test(password),
      specialChar: /[^A-Za-z0-9]/.test(password), // Just in case
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
      console.error(error);
      toast.error("Failed to reset password");
    } finally {
      setIsLoading(false);
    }
  };

  const isPasswordValid = passwordStrength.length; // Simplified check for now or use full check
  const passwordsMatch = formData.password === formData.confirmPassword;

  // If no token, show error state - actually better-auth might verify token on load.
  // For now we keep the check if we rely on it being in URL param 'token'
  // Note: better-auth usually uses 'token' or 'code' query param.

  if (!token && !isSubmitted) {
    // Sometimes the token is hidden or handled differently. 
    // But for a typical reset link it's visible. 
  }


  if (isSubmitted) {
    return (
      <StatusCard
        icon={Check}
        iconColor="green"
        title="Password reset successful"
        description="Your password has been successfully reset. You can now sign in with your new password."
        actionButton={{
          text: "Sign in to your account",
          href: "/sign-in"
        }}
      />
    );
  }

  return (
    <AuthCard
      title="Reset your password"
      subtitle="Enter your new password below"
    >
      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <InputField
            id="password"
            type={showPassword ? "text" : "password"}
            label="New password"
            icon={Lock}
            value={formData.password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="Enter your new password"
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
          label="Confirm new password"
          icon={Lock}
          value={formData.confirmPassword}
          onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
          placeholder="Confirm your new password"
          error={formData.confirmPassword && !passwordsMatch ? "Passwords don't match" : undefined}
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
            Passwords match
          </p>
        )}

        <SubmitButton
          isLoading={isLoading}
          loadingText="Resetting password..."
          disabled={!isPasswordValid || !passwordsMatch}
        >
          Reset password
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <Link
          href="/sign-in"
          className="text-[#696969] text-sm hover:text-[#292929] transition-colors"
        >
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}