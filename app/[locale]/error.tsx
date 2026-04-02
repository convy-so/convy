"use client";

import { useEffect } from "react";
import { Link } from "@/i18n/routing";
import { RefreshCw, LogIn, AlertCircle } from "lucide-react";
import { useTranslations } from "next-intl";

export default function Error({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    const t = useTranslations();
    const tt = (key: string, fallback: string) => (t.has(key) ? t(key) : fallback);

    useEffect(() => {
        // Log the error to an error reporting service
        console.error("Runtime Error:", error);
    }, [error]);

    const isUnauthorized =
        error.message?.includes("UNAUTHORIZED") ||
        error.message?.includes("401") ||
        error.digest === "DIGEST_AUTH_FAILED";

    return (
        <div className="min-h-screen bg-[#FAFAFA] flex items-center justify-center p-6">
            <div className="max-w-md w-full text-center space-y-8">
                <div className="space-y-3">
                    <div className="inline-flex items-center gap-2 px-3 py-1 bg-red-50 text-red-600 rounded-full text-xs font-semibold mb-2">
                        <AlertCircle className="w-3 h-3" />
                        {isUnauthorized ? tt("AppError.UnauthorizedBadge", "Access Denied") : tt("AppError.GenericBadge", "System Error")}
                    </div>

                    <h1 className="text-3xl font-bold text-gray-900 tracking-tight">
                        {isUnauthorized ? (
                            tt("AppError.UnauthorizedTitle", "Unauthorized Access")
                        ) : (
                            tt("AppError.GenericTitle", "Something went wrong")
                        )}
                    </h1>

                    <p className="text-gray-500 text-lg">
                        {isUnauthorized ? (
                            tt("AppError.UnauthorizedDescription", "Please sign in to access this page.")
                        ) : (
                            tt("AppError.GenericDescription", "An unexpected error occurred. Please try again or contact support if the issue persists.")
                        )}
                    </p>
                </div>


                <div className="flex flex-col sm:flex-row items-center justify-center gap-4 pt-4">
                    {isUnauthorized ? (
                        <Link
                            href="/sign-in"
                            className="flex items-center gap-2 px-8 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                        >
                            <LogIn className="w-4 h-4" />
                            {tt("AppError.SignIn", "Sign In")}
                        </Link>
                    ) : (
                        <>
                            <button
                                onClick={() => reset()}
                                className="flex items-center gap-2 px-6 py-3 bg-gray-900 text-white rounded-xl font-medium hover:bg-gray-800 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                                <RefreshCw className="w-4 h-4" />
                                {tt("AppError.TryAgain", "Try Again")}
                            </button>
                        </>
                    )}
                </div>


            </div>
        </div>
    );
}
