import { AlertTriangle } from "lucide-react";

import { StatusCard } from "@/components/auth/status-card";
import { getSignInHref } from "@/lib/auth/hrefs";

export default async function AccountIssuePage({
  searchParams,
}: {
  searchParams: Promise<{ reason?: string }>;
}) {
  const { reason } = await searchParams;
  const description =
    reason === "invalid-role"
      ? "Your account is missing a valid role. Sign in again. If the problem continues, contact support."
      : "We could not verify your account state. Sign in again. If the problem continues, contact support.";

  return (
    <div className="flex min-h-screen items-center justify-center bg-[#FAFAFA] px-4">
      <StatusCard
        icon={AlertTriangle}
        iconColor="red"
        title="Account issue"
        description={description}
        actionButton={{
          text: "Back to sign in",
          href: getSignInHref(),
        }}
      />
    </div>
  );
}
