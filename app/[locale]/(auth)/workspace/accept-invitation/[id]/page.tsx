"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { AuthCard } from "@/components/auth/auth-card";
import { SubmitButton } from "@/components/auth/submit-button";
import { authClient } from "@/lib/auth-client";
import { useAuth } from "@/components/providers/auth-provider";
import toast from "react-hot-toast";
import { CheckCircle2, XCircle, Users, ArrowRight, Loader2 } from "lucide-react";
import Link from "next/link";

export default function AcceptInvitationPage() {
  const params = useParams();
  const router = useRouter();
  const { session, isLoading: authLoading } = useAuth();
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const invitationId = params.id as string;

  const handleAccept = async () => {
    if (!invitationId) return;
    setIsLoading(true);
    setError(null);

    try {
      await authClient.organization.acceptInvitation({
        invitationId,
        fetchOptions: {
          onSuccess: () => {
            setIsSuccess(true);
            toast.success("Joined workspace successfully!");
            setTimeout(() => {
              router.push("/dashboard");
            }, 2000);
          },
          onError: (ctx) => {
            setError(ctx.error.message);
            toast.error(ctx.error.message);
          }
        }
      });
    } catch (err) {
      setError("Failed to accept invitation");
      console.error(err);
    } finally {
      setIsLoading(false);
    }
  };

  if (authLoading) {
    return (
      <AuthCard
        title="Verifying Invitation"
        subtitle="Please wait a moment..."
      >
        <div className="flex items-center justify-center p-8">
          <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
        </div>
      </AuthCard>
    );
  }

  // If not logged in, show message
  if (!session) {
    return (
      <AuthCard
        title="Workspace Invitation"
        subtitle="Please sign in to accept this invitation"
      >
        <div className="space-y-4">
          <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
            <Users className="w-8 h-8 text-gray-400" />
            <p className="text-sm text-gray-600 font-medium">
              You've been invited to join a workspace on Convy.
            </p>
          </div>
          <Link href={`/sign-in?callbackUrl=/workspace/accept-invitation/${invitationId}`} className="block">
            <SubmitButton>
              Sign in to Accept
            </SubmitButton>
          </Link>
          <div className="text-center">
            <Link href="/sign-up" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
              Don't have an account? Sign up
            </Link>
          </div>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard
      title="Workspace Invitation"
      subtitle={isSuccess ? "Welcome to the team!" : "You've been invited to join a workspace"}
    >
      <div className="space-y-6">
        {isSuccess ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-emerald-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-8 h-8 text-emerald-600" />
            </div>
            <div className="space-y-2">
              <p className="text-gray-600 font-medium text-lg">Joined successfully!</p>
              <p className="text-gray-500">You are now a member of the workspace.</p>
              <p className="text-sm text-gray-400">Redirecting to dashboard...</p>
            </div>
          </div>
        ) : error ? (
          <div className="text-center py-4 space-y-4">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <div className="space-y-2">
              <p className="text-red-900 font-semibold text-lg">Invitation error</p>
              <p className="text-sm text-gray-500">{error}</p>
            </div>
            <Link href="/dashboard" className="block w-full">
              <button className="w-full py-3 px-4 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition-colors">
                Back to Dashboard
              </button>
            </Link>
          </div>
        ) : (
          <div className="space-y-6">
            <div className="p-4 bg-gray-50 rounded-xl border border-gray-100 flex items-center gap-3">
              <div className="w-12 h-12 bg-white rounded-xl flex items-center justify-center border border-gray-200 shadow-sm">
                <Users className="w-6 h-6 text-gray-600" />
              </div>
              <div>
                <p className="text-gray-900 font-semibold">Join Workspace</p>
                <p className="text-sm text-gray-500 leading-tight">Click the button below to accept the invitation and start collaborating.</p>
              </div>
            </div>
            
            <SubmitButton 
              onClick={handleAccept} 
              isLoading={isLoading}
              loadingText="Accepting..."
            >
              Accept Invitation
            </SubmitButton>
          </div>
        )}
      </div>
    </AuthCard>
  );
}
