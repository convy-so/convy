"use client";

import { authClient } from "@/lib/auth-client";
import { Session, User } from "better-auth/types";
import { createContext, useContext, useEffect, useState } from "react";

type AuthContextType = {
    session: Session | null;
    user: User | null;
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
    initialSession?: {
        session: Session | null;
        user: User | null;
    } | null;
}) {
    const [session, setSession] = useState<Session | null>(
        initialSession?.session ?? null
    );
    const [user, setUser] = useState<User | null>(
        initialSession?.user ?? null
    );
    const [isLoading, setIsLoading] = useState(!initialSession);

    useEffect(() => {
        // If we have initial session, we might still want to verify/update it or listen to changes
        // better-auth's useSession hook handles subscription, but here we want to provide context
        // Let's use authClient.useSession which is a hook
    }, []);

    // Sync with better-auth hook
    const { data, isPending } = authClient.useSession();

    useEffect(() => {
        if (!isPending) {
            if (data) {
                setSession(data.session);
                setUser(data.user);
            } else {
                setSession(null);
                setUser(null);
            }
            setIsLoading(false);
        }
    }, [data, isPending]);

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
