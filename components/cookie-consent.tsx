"use client";

import { useSyncExternalStore } from "react";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

const COOKIE_CONSENT_KEY = "convy_cookie_consent";
const COOKIE_CONSENT_EVENT = "convy-cookie-consent";

function subscribe(onStoreChange: () => void) {
    window.addEventListener("storage", onStoreChange);
    window.addEventListener(COOKIE_CONSENT_EVENT, onStoreChange);

    return () => {
        window.removeEventListener("storage", onStoreChange);
        window.removeEventListener(COOKIE_CONSENT_EVENT, onStoreChange);
    };
}

function getCookieConsentSnapshot() {
    return localStorage.getItem(COOKIE_CONSENT_KEY);
}

export function CookieConsent() {
    const t = useTranslations("Legal.CookieBanner");
    const consent = useSyncExternalStore(
        subscribe,
        getCookieConsentSnapshot,
        () => "accepted",
    );
    const isVisible = consent === null;

    const handleAcceptAll = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "all");
        window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
    };

    const handleAcceptNecessary = () => {
        localStorage.setItem(COOKIE_CONSENT_KEY, "necessary");
        window.dispatchEvent(new Event(COOKIE_CONSENT_EVENT));
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
                        className="w-full md:w-auto bg-transparent border border-white/20 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-colors shadow-sm"
                    >
                        {t("AcceptNecessary")}
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="w-full md:w-auto bg-white text-[#232323] px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        {t("AcceptAll")}
                    </button>
                </div>
            </div>
        </div>
    );
}
