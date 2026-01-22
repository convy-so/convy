"use client";

import { useState, useEffect } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { authClient } from "@/lib/auth-client";
import toast from "react-hot-toast";
import { StatusCard } from "@/components/auth/status-card";

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  
  const [email, setEmail] = useState<string | null>(null);
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    // Try to get email from URL if present (legacy support) or sessionStorage
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    } else if (typeof window !== 'undefined') {
      const storedEmail = sessionStorage.getItem('verification_email');
      if (storedEmail) setEmail(storedEmail);
    }

    if (token) {
      const verify = async () => {
        try {
          await authClient.verifyEmail({
            query: {
              token: token
            },
            fetchOptions: {
              onSuccess: () => {
                toast.success("Email verified successfully!");
                router.push("/dashboard");
              },
              onError: (ctx) => {
                toast.error(ctx.error.message || "Verification failed");
              }
            }
          });
        } catch (error) {
          toast.error("An error occurred during verification");
        }
      };
      
      verify();
    }
  }, [token, router]);

  const handleResendVerification = async () => {
    if (!email) return;
    setIsResending(true);
    
    try {
        await authClient.sendVerificationEmail({
            email,
            callbackURL: "/dashboard"
        });
        toast.success("Verification email sent!");
    } catch(err) {
        toast.error("Failed to send verification email");
    } finally {
        setIsResending(false);   
    }
  };

  return (
    <StatusCard
      imageSrc="/check-email.png"
      title="Check your email"
      description={
        <>
          We've sent a verification link to <span className="font-semibold text-[#292929]">{email || "your email"}</span>. Please check your inbox and follow the instructions to verify your account.
        </>
      }
      showLogo
      actionButton={email ? {
        text: isResending ? "Sending..." : "Resend verification email",
        onClick: handleResendVerification,
        disabled: isResending
      } : undefined}
      secondaryAction={{
        text: "Back to sign in",
        href: "/sign-in"
      }}
    />
  );
}