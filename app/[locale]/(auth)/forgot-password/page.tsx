"use client";

import { useState } from "react";
import Link from "next/link";
import { Mail, ArrowLeft, Check } from "lucide-react";
import { AuthCard } from "@/components/auth/auth-card";
import { StatusCard } from "@/components/auth/status-card";
import { InputField } from "@/components/auth/input-field";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isSubmitted, setIsSubmitted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      await authClient.forgetPassword({
        email,
        redirectTo: "/reset-password",
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
        title="Check your email"
        description={`We've sent a password reset link to ${email}`}
        actionButton={{
          text: "Try again",
          onClick: () => setIsSubmitted(false)
        }}
        secondaryAction={{
          text: "Back to sign in",
          href: "/sign-in"
        }}
      />
    );
  }

  return (
    <AuthCard
      title="Forgot your password?"
      subtitle="No worries! Enter your email and we'll send you a reset link."
    >
      <form onSubmit={handleSubmit} className="space-y-6">
        <InputField
          id="email"
          type="email"
          label="Email address"
          icon={Mail}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email address"
          required
        />

        <SubmitButton isLoading={isLoading} loadingText="Sending reset link...">
          Send reset link
        </SubmitButton>
      </form>

      <div className="text-center mt-6">
        <Link
          href="/sign-in"
          className="inline-flex items-center gap-2 text-[#696969] text-sm hover:text-[#292929] transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to sign in
        </Link>
      </div>
    </AuthCard>
  );
}