import { Link } from "@/i18n/routing";
import { useTranslations } from "next-intl";

export default function CtaSection() {
  const t = useTranslations('Landing.CTA');

  return (
    <section className="py-12 sm:py-24 bg-[#FAFAFA] px-4 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-[1920px] flex justify-center">
        <div className="max-w-4xl text-center">
          {/* Badge */}
          <p
            className="text-[#8D8D8D] italic text-[24px] md:text-[32px] font-normal leading-[33px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-6"
            style={{ fontFamily: "var(--font-fasthand)" }}
          >
            Convyy
          </p>

          {/* Heading */}
          <h2 className="text-[36px] md:text-[56px] font-bold text-[#080808] leading-[44px] md:leading-[64px] tracking-[-1.12px] md:tracking-[-1.68px] mb-6">
            Elevate your data collection.
          </h2>

          {/* Description */}
          <p className="text-[20px] md:text-[24px] font-[500] text-[#696969] leading-[30px] md:leading-[33.6px] tracking-normal mb-10 max-w-2xl mx-auto">
            Replace rigid, static forms with intelligent conversational flows. Enhance respondent engagement and derive deeper insights from every interaction.
          </p>

          {/* CTA Button */}
          <div className="flex justify-center">
            <Link
              href="/sign-up"
              className="rounded-full bg-[#292929] px-[32px] py-[14px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-all hover:bg-[#3a3a3a] hover:scale-105 whitespace-nowrap shadow-sm hover:shadow-md"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
