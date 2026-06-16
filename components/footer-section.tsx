import Image from "next/image";
import { FaXTwitter } from "react-icons/fa6";
import { Link } from "@/i18n/routing";

export default function FooterSection() {
  return (
    <section className="bg-white px-4 py-12 sm:px-6 lg:px-12 border-t border-gray-100">
      <div className="mx-auto max-w-[1200px] bg-white px-0 py-8 text-[#080808]">
        <div className="flex flex-col md:flex-row items-center justify-between gap-8 text-center md:text-left">
          <div className="flex items-center gap-4">
            <Image
              src="/logo.svg"
              alt="Convyy logo"
              width={32}
              height={32}
              className="h-8 w-8"
            />
            <span className="text-[20px] font-bold text-[#080808]">Convyy</span>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-4 text-sm font-medium text-[#696969]">
            <Link href="/terms" className="transition-colors hover:text-[#080808]">
              Terms
            </Link>
            <Link href="/privacy" className="transition-colors hover:text-[#080808]">
              Privacy
            </Link>
            <Link href="/cookies" className="transition-colors hover:text-[#080808]">
              Cookies
            </Link>
            <Link href="/blog" className="transition-colors hover:text-[#080808]">
              Blog
            </Link>
            <a
              href="https://x.com/getConvyy"
              target="_blank"
              rel="noreferrer"
              className="flex items-center gap-2 transition-colors hover:text-[#080808]"
            >
              <FaXTwitter className="h-4 w-4" />
              <span>@getConvyy</span>
            </a>
          </div>
        </div>

        <div className="mt-8 border-t border-gray-100 pt-8 text-center text-sm text-[#A0A0A0]">
          &copy; {new Date().getFullYear()} Convyy. All rights reserved.
        </div>
      </div>
    </section>
  );
}
