"use client";

import { useEffect, useState } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";
import {
    CONSENT_COOKIE_NAME,
    parseConsentState,
} from "@/lib/privacy/shared";

function readConsentCookie() {
    const cookie = document.cookie
        .split(";")
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${CONSENT_COOKIE_NAME}=`))
        ?.slice(`${CONSENT_COOKIE_NAME}=`.length);

    return parseConsentState(cookie);
}

export function CookieConsent() {
    const t = useTranslations("Legal.CookieBanner");
    const [isVisible, setIsVisible] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        setIsVisible(readConsentCookie() === null);
    }, []);

    const persistConsent = async (input: { analytics: boolean; marketing: boolean }) => {
        setIsSaving(true);

        try {
            const response = await fetch("/api/privacy/consent", {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify(input),
            });

            if (!response.ok) {
                throw new Error("Failed to save consent");
            }

            setIsVisible(false);
        } finally {
            setIsSaving(false);
        }
    };

    const handleAcceptAll = () => {
        void persistConsent({ analytics: true, marketing: true });
    };

    const handleAcceptNecessary = () => {
        void persistConsent({ analytics: false, marketing: false });
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 pb-6 md:pb-6 pointer-events-none">
            <div className="max-w-4xl mx-auto pointer-events-auto bg-[#232323] text-white p-6 rounded-[24px] shadow-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 transition-all">
                <div className="flex-1 text-sm text-[#B2B2B2] leading-relaxed">
                    <p className="font-semibold text-white mb-1 text-base">
                        {t("Title")}
                    </p>
                    <p>
                        {t("Description")} <Link href="/cookies" className="text-white underline hover:text-gray-300 transition-colors">{t("LearnMore")}</Link>
                    </p>
                </div>
                <div className="flex shrink-0 w-full md:w-auto mt-2 md:mt-0 gap-3">
                    <button
                        onClick={handleAcceptNecessary}
                        disabled={isSaving}
                        className="w-full md:w-auto bg-transparent border border-white/20 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-colors shadow-sm"
                    >
                        {t("AcceptNecessary")}
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        disabled={isSaving}
                        className="w-full md:w-auto bg-white text-[#232323] px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        {t("AcceptAll")}
                    </button>
                </div>
            </div>
        </div>
    );
}
