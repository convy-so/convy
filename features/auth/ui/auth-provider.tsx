
"use client";

import { authClient } from "@/features/auth/client/auth-client";
import { createContext, useContext } from "react";

type BaseSessionData = typeof authClient.$Infer.Session;
type SessionData = {
    session: BaseSessionData["session"];
    user: BaseSessionData["user"] & { preferredLanguage?: string; uiLocale?: string };
};

type AuthContextType = {
    session: SessionData["session"] | null;
    user: SessionData["user"] | null;
    isLoading: boolean;
};

const AuthContext = createContext<AuthContextType>({
    session: null,
    user: null,
    isLoading: true,
});

export function AuthProvider({
    children,
    initialSession,
}: {
    children: React.ReactNode;
    initialSession?: SessionData | null;
}) {
    // Sync with better-auth hook
    const { data, isPending } = authClient.useSession();
    const session = isPending ? initialSession?.session ?? null : data?.session ?? null;
    const user = isPending ? initialSession?.user ?? null : data?.user ?? null;
    const isLoading = isPending && !initialSession;

    return (
        <AuthContext.Provider value={{ session, user, isLoading }}>
            {children}
        </AuthContext.Provider>
    );
}

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (context === undefined) {
        throw new Error("useAuth must be used within an AuthProvider");
    }
    return context;
};
