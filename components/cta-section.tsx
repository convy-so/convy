import { Link } from "@/i18n/routing";

export default function CtaSection() {
  return (
    <section className="bg-[#FAFAFA] px-4 py-12 sm:px-6 sm:py-24 lg:px-12">
      <div className="mx-auto flex max-w-[1920px] justify-center">
        <div className="max-w-4xl text-center">
          <p
            className="mb-6 text-[24px] font-normal italic leading-[33px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
            style={{ fontFamily: "var(--font-fasthand)" }}
          >
            Convyy
          </p>

          <h2 className="mb-6 text-[36px] font-bold leading-[44px] tracking-[-1.12px] text-[#080808] md:text-[56px] md:leading-[64px] md:tracking-[-1.68px]">
            Build better learning support.
          </h2>

          <p className="mx-auto mb-10 max-w-2xl text-[20px] font-[500] leading-[30px] tracking-normal text-[#696969] md:text-[24px] md:leading-[33.6px]">
            Use Convyy to give every student a more personal, adaptive, and
            measurable learning experience.
          </p>

          <div className="flex justify-center">
            <Link
              href="/sign-up"
              className="whitespace-nowrap rounded-full bg-[#292929] px-[32px] py-[14px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] shadow-sm transition-all hover:scale-105 hover:bg-[#3a3a3a] hover:shadow-md"
            >
              Get Started for Free
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}
