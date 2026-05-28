"use client";

import { Link } from "@/i18n/routing";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { authClient } from "@/lib/auth-client";
import { ChevronDown } from "lucide-react";

export default function Navbar() {
  const t = useTranslations("Landing.Navbar");
  const { data: session } = authClient.useSession();

  return (
    <nav className="w-full bg-[#FAFAFA]">
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

        <div className="hidden flex-1 items-center justify-center gap-10 text-[15px] font-medium text-[#292929] md:flex">
          <a href="" className="hover:text-[#292929]/70">
            Home
          </a>
          <a href="#features" className="hover:text-[#292929]/70">
            Features
          </a>
          <a href="#faq" className="hover:text-[#292929]/70">
            FAQ
          </a>
          
        </div>

        <div className="flex items-center justify-end">
          {session ? (
            <Link
              href="/dashboard"
              className="rounded-full bg-[#292929] px-3 py-1.5 sm:px-4 sm:py-2 md:px-[16px] md:py-[10px] text-xs sm:text-base md:text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
            >
              {t("Dashboard")}
            </Link>
          ) : (
            <Link
              href="/sign-up"
              className="rounded-full bg-[#292929] px-3 py-1.5 sm:px-4 sm:py-2 md:px-[16px] md:py-[10px] text-xs sm:text-base md:text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
            >
              {t("GetStarted")}
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
