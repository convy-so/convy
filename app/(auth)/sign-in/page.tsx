"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Mail, Lock } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { GoogleButton } from "@/components/auth/google-button";
import { FormDivider } from "@/components/auth/form-divider";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast"; // Assuming sonner is used, if not, I'll check available toast libraries

export default function SignInPage() {
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState({
    email: "",
    password: "",
    rememberMe: false,
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
            toast.success("Signed in successfully");
            router.push("/dashboard");
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

  const handleGoogleSignIn = async () => {
    await authClient.signIn.social({
      provider: "google",
      callbackURL: "/dashboard"
    });
  };

  return (
    <AuthCard
      title="Welcome back"
      subtitle="Sign in to your account to continue"
    >
      <GoogleButton onClick={handleGoogleSignIn} />

      <div className="my-6">
        <FormDivider />
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
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

        <InputField
          id="password"
          type={showPassword ? "text" : "password"}
          label="Password"
          icon={Lock}
          value={formData.password}
          onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          placeholder="Enter your password"
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
            <span className="ml-2 text-sm text-[#696969]">Remember me</span>
          </label>
          <Link
            href="/forgot-password"
            className="text-sm text-[#292929] hover:text-[#292929]/80 font-medium transition-colors"
          >
            Forgot password?
          </Link>
        </div>

        <SubmitButton isLoading={isLoading} loadingText="Signing in...">
          Sign in
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <p className="text-[#696969] text-sm">
          Don't have an account?{" "}
          <Link
            href="/sign-up"
            className="text-[#292929] font-medium hover:text-[#292929]/80 transition-colors"
          >
            Sign up
          </Link>
        </p>
      </div>
    </AuthCard>
  );
}