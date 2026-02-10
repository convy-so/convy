"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock, User } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { FormDivider } from "@/components/auth/form-divider";
import { InputField } from "@/components/auth/input-field";
import { PasswordStrength } from "@/components/auth/password-strength";
import { SubmitButton } from "@/components/auth/submit-button";
import { LoadingOverlay } from "@/components/auth/loading-overlay";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast"; // Assuming sonner

export default function SignUpPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "",
    agreeToTerms: false,
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
        callbackURL: "/dashboard",
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
        }
        toast.success("Account created! Please check your email to verify your account.");
        setIsRedirecting(true);
        router.push("/verify-email");
      } else if (result.data?.token) {
        // This shouldn't happen with requireEmailVerification: true, but handle it
        toast.success("Account created and verified!");
        setIsRedirecting(true);
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Sign-up error:", error);
      toast.error("Something went wrong. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleSignUp = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard"
    });
  };

  const isPasswordValid = Object.values(passwordStrength).every(Boolean);

  return (
    <>
      {isRedirecting && (
        <LoadingOverlay 
          message="Loading ..." 
          subtitle="Redirecting you shortly"
        />
      )}
      <AuthCard
        title="Create your account"
        subtitle="Start creating conversational surveys today"
      >
      <GoogleButton onClick={handleGoogleSignUp} />

      <div className="my-6">
        <FormDivider />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        <InputField
          id="name"
          type="text"
          label="Full name"
          icon={User}
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="Enter your full name"
          required
        />

        <InputField
          id="email"
          type="email"
          label="Email address"
          icon={Mail}
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          placeholder="Enter your email"
          required
        />

        <div>
          <InputField
            id="password"
            type={showPassword ? "text" : "password"}
            label="Password"
            icon={Lock}
            value={formData.password}
            onChange={(e) => handlePasswordChange(e.target.value)}
            placeholder="Create a strong password"
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
            I agree to the{" "}
            <Link href="/terms" className="text-[#292929] hover:text-[#292929]/80 font-medium transition-colors">
              Terms of Service
            </Link>{" "}
            and{" "}
            <Link href="/privacy" className="text-[#292929] hover:text-[#292929]/80 font-medium transition-colors">
              Privacy Policy
            </Link>
          </label>
        </div>

        <SubmitButton
          isLoading={isLoading}
          loadingText="Creating account..."
          disabled={!isPasswordValid || !formData.agreeToTerms}
        >
          Create account
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <p className="text-[#696969] text-sm">
          Already have an account?{" "}
          <Link
            href="/sign-in"
            className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors"
          >
            Sign in
          </Link>
        </p>
      </div>
    </AuthCard>
    </>
  );
}