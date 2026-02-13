import { Link } from "@/i18n/routing";
import Image from "next/image";
import { useTranslations } from "next-intl";

export default function Navbar() {
  const t = useTranslations('Landing.Navbar');

  return (
    <nav className="w-full bg-[#FAFAFA] pt-4 sm:pt-6">
      <div className="mx-auto max-w-[1824px] grid h-14 sm:h-16 grid-cols-3 items-center px-[30px]">
        <Link href="/" className="flex items-center">
          <span className="text-lg sm:text-xl font-bold text-foreground">convy</span>
        </Link>

        <div className="flex items-center justify-center">
          <Image
            src="/logo.svg"
            alt="Convy Logo"
            width={32}
            height={32}
            className="max-h-6 sm:max-h-8 w-auto object-contain"
          />
        </div>

        {/* Navigation Items - Right aligned */}
        <div className="flex items-center justify-end gap-3 sm:gap-4 md:gap-6">
          <Link
            href="/pricing"
            className="text-sm sm:text-base md:text-[18px] font-medium text-[#292929] tracking-[-0.28px] transition-colors hover:text-[#292929]/80"
          >
            {t('Pricing')}
          </Link>
          <Link
            href="/sign-in"
            className="text-sm sm:text-base md:text-[18px] font-medium text-[#292929] tracking-[-0.28px] transition-colors hover:text-[#292929]/80"
          >
            {t('SignIn')}
          </Link>
          <Link
            href="/sign-up"
            className="rounded-full bg-[#292929] px-3 py-1.5 sm:px-4 sm:py-2 md:px-[16px] md:py-[10px] text-sm sm:text-base md:text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
          >
            {t('GetStarted')}
          </Link>
        </div>
      </div>
    </nav>
  );
}

