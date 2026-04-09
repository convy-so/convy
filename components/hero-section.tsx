import { Link } from "@/i18n/routing";
import { ArrowUpRight } from "lucide-react";
import MacWindow from "./mac-window";

export default function HeroSection() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <section className="mx-auto max-w-[1920px] px-4 pt-[30px] pb-20 sm:px-6 sm:pb-32 lg:px-12">
        <div className="mx-auto flex max-w-6xl flex-col items-center space-y-6 text-center sm:space-y-8">
          <p
            className="mb-3 text-xl font-normal leading-normal tracking-[-0.32px] text-[#8D8D8D] sm:mb-5 sm:text-[32px] sm:leading-[44px]"
            style={{ fontFamily: "var(--font-fasthand)" }}
          >
            Convyy
          </p>

          <h1 className="max-w-4xl text-4xl font-bold leading-tight tracking-[-1.68px] text-[#080808] sm:text-[56px] sm:leading-[64px]">
            Personalized learning
            <br />
            powered by conversation.
          </h1>

          <p className="max-w-3xl text-lg font-[500] leading-normal text-[#696969] sm:text-[24px] sm:leading-[33.6px]">
            Convyy helps schools and educators create adaptive tutoring,
            classroom check-ins, and student support experiences that respond
            to each learner in real time.
          </p>

          <div className="mt-6 flex flex-col items-center">
            <Link
              href="/sign-up"
              className="flex items-center gap-2 whitespace-nowrap rounded-full bg-[#292929] px-[32px] py-[14px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a]"
            >
              Get Started
              <ArrowUpRight size={18} />
            </Link>
          </div>

          <MacWindow />
        </div>
      </section>
    </div>
  );
}
