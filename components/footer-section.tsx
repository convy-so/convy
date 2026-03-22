import Image from "next/image";
import { FaXTwitter } from "react-icons/fa6";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export default function FooterSection() {
  const t = useTranslations('Landing.Footer');

  return (
    <section className="py-20 sm:py-24 px-4 sm:px-6 lg:px-12 bg-[#FAFAFA]">
      <div className="bg-[#232323] text-white rounded-[32px] px-6 sm:px-10 lg:px-16 py-12 sm:py-20 mx-auto max-w-[1920px]">
        <div className="max-w-5xl mx-auto flex flex-col items-center text-center gap-10">
          {/* Logo mark */}
          <div className="w-14 h-14 rounded-[18px] border border-white/20 flex items-center justify-center">
            <Image
              src="/logo.svg"
              alt="Convyy logo"
              width={40}
              height={40}
              className="h-8 w-8"
            />
          </div>

          {/* Main message */}
          <div>
            <p className="text-[16px] md:text-[22px] font-[500] text-[#E5E5E5] leading-[24px] md:leading-[32px]">
              Ready to replace rigid forms with human conversations? <br className="hidden md:block" />
              Join the future of feedback with <strong>Convyy</strong>.
            </p>
          </div>

          {/* Contact on X */}
          <div className="space-y-2">
            <p className="text-sm text-[#B2B2B2]">{t('Contact')}</p>
            <a
              href="https://x.com/getConvyy"
              target="_blank"
              rel="noreferrer"
              className="text-[18px] font-medium text-white underline underline-offset-4"
            >
              @getConvyy
            </a>
          </div>
        </div>

        {/* Divider */}
        <div className="mt-14 border-t border-white/10 pt-6 sm:pt-8">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-[#B2B2B2]">
            {/* Left */}
            <p className="order-2 sm:order-1">
              © {new Date().getFullYear()} Convyy. All rights reserved.
            </p>

            {/* Right links */}
            <div className="order-1 sm:order-2 flex flex-wrap items-center gap-x-6 gap-y-2">
              <Link href="/terms" className="hover:text-white transition-colors">
                Terms
              </Link>
              <Link href="/privacy" className="hover:text-white transition-colors">
                Privacy
              </Link>
              <Link href="/cookies" className="hover:text-white transition-colors">
                Cookies
              </Link>
              <Link href="/blog" className="hover:text-white transition-colors">
                Blog
              </Link>
              <div className="h-5 w-px bg-white/20 hidden sm:block" />
              <div className="flex items-center gap-3">
                <a
                  href="https://x.com/getConvyy"
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 hover:border-white transition-colors"
                >
                  <FaXTwitter className="h-4 w-4" />
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
