"use client";

import { Link } from "@/i18n/routing";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";

export default function Navbar() {
    const t = useTranslations('Landing.Navbar');
    const { data: session } = authClient.useSession();

    return (
        <nav className="w-full bg-[#FAFAFA] pt-4 sm:pt-6">
            <div className="mx-auto flex h-14 max-w-[1824px] items-center justify-between px-4 sm:h-16 sm:px-[30px]">
                <Link href="/" className="flex items-center gap-2">
                    <Image
                        src="/logo.svg"
                        alt="Convyy Logo"
                        width={32}
                        height={32}
                        className="h-8 w-8 shrink-0 rounded-full bg-white p-1 shadow-sm ring-1 ring-black/10"
                    />
                    <span className="text-lg sm:text-xl font-semibold tracking-[-0.04em] text-foreground">
                        Convyy
                    </span>
                </Link>

                {/* Navigation Items - Right aligned */}
                <div className="flex items-center justify-end gap-2 sm:gap-4 md:gap-6">
                    {session ? (
                        // Authenticated: show Dashboard button
                        <Link
                            href="/dashboard"
                            className="rounded-full bg-[#292929] px-3 py-1.5 sm:px-4 sm:py-2 md:px-[16px] md:py-[10px] text-xs sm:text-base md:text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
                        >
                            {t('Dashboard')}
                        </Link>
                    ) : (
                        // Unauthenticated: show Sign In + Get Started
                        <>
                            <Link
                                href="/sign-in"
                                className="text-xs sm:text-base md:text-[18px] font-medium text-[#292929] tracking-[-0.28px] transition-colors hover:text-[#292929]/80 whitespace-nowrap"
                            >
                                {t('SignIn')}
                            </Link>
                            <Link
                                href="/sign-up"
                                className="rounded-full bg-[#292929] px-3 py-1.5 sm:px-4 sm:py-2 md:px-[16px] md:py-[10px] text-xs sm:text-base md:text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
                            >
                                {t('GetStarted')}
                            </Link>
                        </>
                    )}
                </div>
            </div>
        </nav>
    );
}
