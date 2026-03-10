"use client";

import { useState } from "react";
import { Link } from "@/i18n/routing";

export function CookieConsent() {
    const [isVisible, setIsVisible] = useState(() => {
        if (typeof window === "undefined") {
            return false;
        }
        const consent = localStorage.getItem("convy_cookie_consent");
        return !consent;
    });

    const handleAcceptAll = () => {
        localStorage.setItem("convy_cookie_consent", "all");
        setIsVisible(false);
    };

    const handleAcceptNecessary = () => {
        localStorage.setItem("convy_cookie_consent", "necessary");
        setIsVisible(false);
    };

    if (!isVisible) return null;

    return (
        <div className="fixed bottom-0 left-0 right-0 z-[100] p-4 md:p-6 pb-6 md:pb-6 pointer-events-none">
            <div className="max-w-4xl mx-auto pointer-events-auto bg-[#232323] text-white p-6 rounded-[24px] shadow-2xl border border-white/10 flex flex-col md:flex-row items-center justify-between gap-6 md:gap-8 transition-all">
                <div className="flex-1 text-sm text-[#B2B2B2] leading-relaxed">
                    <p className="font-semibold text-white mb-1 text-base">We Value Your Experience</p>
                    <p>
                        We use cookies to improve your experience on our app. <Link href="/cookies" className="text-white underline hover:text-gray-300 transition-colors">Learn more</Link>
                    </p>
                </div>
                <div className="flex shrink-0 w-full md:w-auto mt-2 md:mt-0 gap-3">
                    <button
                        onClick={handleAcceptNecessary}
                        className="w-full md:w-auto bg-transparent border border-white/20 text-white px-6 py-3 rounded-full font-semibold hover:bg-white/10 transition-colors shadow-sm"
                    >
                        Accept Necessary Only
                    </button>
                    <button
                        onClick={handleAcceptAll}
                        className="w-full md:w-auto bg-white text-[#232323] px-6 py-3 rounded-full font-semibold hover:bg-gray-100 transition-colors shadow-sm"
                    >
                        Accept All
                    </button>
                </div>
            </div>
        </div>
    );
}
