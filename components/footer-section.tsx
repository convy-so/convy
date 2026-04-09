import Image from "next/image";
import { FaXTwitter } from "react-icons/fa6";
import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export default function FooterSection() {
  const t = useTranslations("Landing.Footer");

  return (
    <section className="bg-[#FAFAFA] px-4 py-20 sm:px-6 sm:py-24 lg:px-12">
      <div className="mx-auto max-w-[1920px] rounded-[32px] bg-[#232323] px-6 py-12 text-white sm:px-10 sm:py-20 lg:px-16">
        <div className="mx-auto flex max-w-5xl flex-col items-center gap-10 text-center">
          <div className="flex h-14 w-14 items-center justify-center rounded-[18px] border border-white/20">
            <Image
              src="/logo.svg"
              alt="Convyy logo"
              width={40}
              height={40}
              className="h-8 w-8"
            />
          </div>

          <div>
            <p className="text-[16px] font-[500] leading-[24px] text-[#E5E5E5] md:text-[22px] md:leading-[32px]">
              Ready to give students more personal support with less teacher
              overhead? <br className="hidden md:block" />
              Build the future of adaptive learning with <strong>Convyy</strong>.
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm text-[#B2B2B2]">{t("Contact")}</p>
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

        <div className="mt-14 border-t border-white/10 pt-6 sm:pt-8">
          <div className="flex flex-col items-center justify-between gap-4 text-sm text-[#B2B2B2] sm:flex-row">
            <p className="order-2 sm:order-1">
              (c) {new Date().getFullYear()} Convyy. All rights reserved.
            </p>

            <div className="order-1 flex flex-wrap items-center gap-x-6 gap-y-2 sm:order-2">
              <Link href="/terms" className="transition-colors hover:text-white">
                Terms
              </Link>
              <Link
                href="/privacy"
                className="transition-colors hover:text-white"
              >
                Privacy
              </Link>
              <Link
                href="/cookies"
                className="transition-colors hover:text-white"
              >
                Cookies
              </Link>
              <Link href="/blog" className="transition-colors hover:text-white">
                Blog
              </Link>
              <div className="hidden h-5 w-px bg-white/20 sm:block" />
              <div className="flex items-center gap-3">
                <a
                  href="https://x.com/getConvyy"
                  target="_blank"
                  rel="noreferrer"
                  className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 transition-colors hover:border-white"
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
