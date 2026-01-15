import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import MacWindow from "./mac-window";

export default function HeroSection() {
  return (
    <div className="min-h-screen bg-[#FAFAFA]">
      <section className="mx-auto max-w-[1920px] px-4 sm:px-6 lg:px-12 pt-[30px] pb-20 sm:pb-32">
        <div className="flex flex-col items-center text-center space-y-6 sm:space-y-8 max-w-6xl mx-auto">
          {/* Listen! heading */}
          <p className="text-[#8D8D8D]  text-[32px] font-normal leading-[44px] tracking-[-0.32px] mb-5" style={{ fontFamily: 'var(--font-fasthand)' }}>
            Forms 2.0
          </p>

          {/* Main heading */}
          <h1 className="text-[56px] font-bold text-[#080808] leading-[64px] tracking-[-1.68px] max-w-4xl">
          The chat layer 
            <br />
            your forms always needed.
          </h1>

          {/* Descriptive paragraph */}
          <p className="text-[#696969] text-[24px] font-[500] leading-[33.6px] max-w-3xl">
          Convy replaces rigid forms with dynamic chat flows that move like a real convo and feel built just for you.
          </p>

          {/* Create form button */}
          <div className="flex flex-col items-center mt-6">
            <Link
              href="/sign-up"
              className="rounded-full bg-[#292929] px-[16px] py-[10px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap flex items-center gap-2"
            >
              Get started free
              <ArrowUpRight size={18} />
            </Link>
            <p className="text-sm text-[#696969] mt-2">no credit card required</p>
          </div>

          {/* Mac Window Demo */}
          <MacWindow />
        </div>
      </section>
    </div>
  );
}

