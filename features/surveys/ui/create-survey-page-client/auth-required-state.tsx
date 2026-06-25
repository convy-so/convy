"use client";

import { User } from "lucide-react";
import { useTranslations } from "next-intl";

import { Link } from "@/i18n/routing";

type Translate = ReturnType<typeof useTranslations>;

export function AuthRequiredState({
  authError,
  translations,
}: {
  authError: string;
  translations: Translate;
}) {
  return (
    <div className="flex h-screen items-center justify-center">
      <div className="space-y-4 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
          <User className="h-8 w-8 text-red-600" />
        </div>
        <h2 className="text-xl font-semibold text-gray-900">
          {translations("Authentication.Required")}
        </h2>
        <p className="max-w-md text-gray-600">{authError}</p>
        <div className="flex justify-center gap-3">
          {authError.includes("verify") ? (
            <>
              <Link
                href="/verify-email"
                className="rounded-lg bg-gray-900 px-4 py-2 text-white transition-colors hover:bg-gray-800"
              >
                {translations("Authentication.VerifyEmail")}
              </Link>
              <Link
                href="/dashboard"
                className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
              >
                {translations("Authentication.GoBack")}
              </Link>
            </>
          ) : (
            <>
              <Link
                href="/sign-in"
                className="rounded-lg bg-gray-900 px-4 py-2 text-white transition-colors hover:bg-gray-800"
              >
                {translations("Authentication.SignIn")}
              </Link>
              <Link
                href="/"
                className="rounded-lg border border-gray-200 px-4 py-2 text-gray-600 transition-colors hover:bg-gray-50"
              >
                {translations("Authentication.GoHome")}
              </Link>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
