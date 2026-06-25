import { Link } from "@/i18n/routing";
import { ArrowUpRight } from "lucide-react";
import Image from "next/image";
import MacWindow from "./mac-window";

export default function HeroSection() {
  return (
    <div className="relative overflow-hidden bg-[#FAFAFA] py-16">
      <Image
        src="/nexura-hero-bg.png"
        alt="Hero background"
        fill
        unoptimized
        priority
        className="object-cover"
      />
      <div className="absolute inset-0 bg-gradient-to-b from-[#FAFAFA]/95 via-[#FAFAFA]/75 to-transparent" />

      <section className="relative mx-auto max-w-[1920px] px-4 pt-[30px] pb-16 sm:px-6 sm:pb-24 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center text-center">
          <p
            className="mb-3 text-[18px] font-normal leading-normal tracking-[-0.2px] text-[#8D8D8D] sm:mb-4 sm:text-[22px] sm:leading-[30px]"
            style={{ fontFamily: "var(--font-fasthand)" }}
          >
            Smarter Learning
          </p>

          <h1 className="max-w-3xl text-[32px] font-bold leading-tight tracking-[-1px] text-[#080808] sm:text-[44px] sm:leading-[52px]">
            AI tutoring for every student.
          </h1>

          <p className="max-w-2xl mt-4 text-[16px] font-[500] leading-normal text-[#696969] sm:text-[18px] sm:leading-[28px]">
            Guide learners through complex topics and get real-time insights to intervene effectively.
          </p>

          <div className="mt-6 flex flex-col items-center gap-3 sm:flex-row">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[#292929] px-[32px] py-[14px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a]"
            >
              Get started
              <ArrowUpRight size={18} />
            </Link>

            <a
              href="mailto:support@convyy.com"
              className="whitespace-nowrap rounded-full border border-[#292929] bg-transparent px-[32px] py-[14px] text-[18px] font-medium tracking-[-0.28px] text-[#292929] transition-colors hover:bg-[#292929] hover:text-[#FAFAFA]"
            >
              Talk to us
            </a>
          </div>

          <div className="mt-10 w-full">
            <MacWindow />
          </div>

        </div>
      </section>
    </div>
  );
}
