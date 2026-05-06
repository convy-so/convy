import { Suspense } from "react";
import { headers } from "next/headers";
import { getVerifiedSession } from "@/lib/auth/dal";
import { AuthProvider } from "@/components/providers/auth-provider";
import { ProfileContent } from "@/components/dashboard/profile-content";

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
