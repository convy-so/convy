import { Link } from "@/i18n/routing";
import Image from "next/image";

export default function CtaSection() {
  return (
    <section id="pricing" className="bg-white px-4 pt-16 pb-12 sm:px-6 sm:pt-24 lg:px-12">
      <div className="relative mx-auto max-w-[1200px] border border-gray-100 rounded-[32px] overflow-hidden bg-white shadow-sm">
        {/* Content */}
        <div className="relative z-10 px-8 pt-10 md:px-16 md:pt-14 max-w-2xl">
          <h2 className="mb-4 text-[32px] font-[500] leading-[40px] tracking-[-1.12px] text-[#080808] md:text-[48px] md:leading-[56px] md:tracking-[-1.5px]">
            Your best learning campaign starts here.
          </h2>

          <p className="mb-6 text-[18px] font-normal leading-[28px] text-[#696969] md:text-[20px] md:leading-[30px]">
            Set up in minutes. See results from day one.
          </p>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="whitespace-nowrap rounded-full bg-[#080808] px-[32px] py-[14px] text-[16px] font-medium tracking-[-0.2px] text-white shadow-sm transition-all hover:bg-[#222]"
            >
              Start for free
            </Link>
            <a
              href="mailto:support@getconvy.pro"
              className="whitespace-nowrap rounded-full border border-gray-200 bg-white px-[32px] py-[14px] text-[16px] font-medium tracking-[-0.2px] text-[#080808] transition-colors hover:bg-gray-50"
            >
              Talk to sales
            </a>
          </div>
        </div>

        {/* Bottom illustration */}
        <div className="relative w-full mt-6 md:mt-[-60px] z-0">
          <Image
            src="/banger3.png"
            alt="Convyy landscape"
            width={1200}
            height={300}
            className="w-full h-[200px] md:h-[300px] object-cover object-bottom"
          />
        </div>
      </div>
    </section>
  );
}
