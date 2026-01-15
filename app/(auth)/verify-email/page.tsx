"use client";

import { useState, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { Check, AlertCircle, RefreshCw } from "lucide-react";
import { StatusCard } from "@/components/auth/status-card";

export default function VerifyEmailPage() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token");
  const email = searchParams.get("email");
  
  const [verificationStatus, setVerificationStatus] = useState<'loading' | 'success' | 'error' | 'expired'>('loading');
  const [isResending, setIsResending] = useState(false);

  useEffect(() => {
    if (token) {
      // TODO: Implement email verification logic
      console.log("Verifying email with token:", token);
      
      // Simulate API call
      setTimeout(() => {
        // Randomly simulate success or error for demo
        const success = Math.random() > 0.3;
        setVerificationStatus(success ? 'success' : 'expired');
      }, 2000);
    }
  }, [token]);

  const handleResendVerification = async () => {
    setIsResending(true);
    
    // TODO: Implement resend verification logic
    console.log("Resending verification to:", email);
    
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    setIsResending(false);
  };

  // Loading state
  if (verificationStatus === 'loading') {
    return (
      <StatusCard
        icon={RefreshCw}
        iconColor="blue"
        title="Verifying your email"
        description="Please wait while we verify your email address..."
        showLogo
      />
    );
  }

  // Success state
  if (verificationStatus === 'success') {
    return (
      <StatusCard
        icon={Check}
        iconColor="green"
        title="Email verified successfully!"
        description="Your email has been verified. You can now access all features of your Convy account."
        actionButton={{
          text: "Go to Dashboard",
          href: "/dashboard"
        }}
      />
    );
  }

  // Error/Expired state
  return (
    <StatusCard
      icon={AlertCircle}
      iconColor="red"
      title="Verification link expired"
      description={
        email 
          ? `This email verification link has expired or is invalid. We can send a new verification link to ${email}`
          : "This email verification link has expired or is invalid."
      }
      actionButton={email ? {
        text: isResending ? "Sending new link..." : "Send new verification link",
        onClick: handleResendVerification
      } : undefined}
      secondaryAction={{
        text: "Back to sign in",
        href: "/sign-in"
      }}
    />
  );
}