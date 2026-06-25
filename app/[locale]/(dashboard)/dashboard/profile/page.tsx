import { Suspense } from "react";
import { headers } from "next/headers";
import { getVerifiedSession } from "@/features/auth/public-server";
import { AuthProvider } from "@/features/auth/public-ui";
import { ProfileContent } from "@/features/auth/ui/account-profile-page-client";

import { Loader2 } from "lucide-react";

export default function ProfilePage() {
    return (
        <Suspense fallback={
            <div className="flex items-center justify-center min-h-[50vh]">
                <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
            </div>
        }>
            <ProfileWrapper />
        </Suspense>
    );
}

async function ProfileWrapper() {
    const authHeaders = await headers();
    const session = await getVerifiedSession(authHeaders).catch(() => null);

    return (
        <AuthProvider initialSession={session}>
            <ProfileContent />
        </AuthProvider>
    );
}
