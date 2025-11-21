import Link from "next/link";

export default function WaitlistSection() {
  return (
    <section className="py-12 sm:py-16 bg-[#FAFAFA] px-4 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-[1920px] flex justify-center">
        <div className="max-w-3xl text-center">
          {/* Fasthand badge */}
          <p
            className="text-[#8D8D8D] italic text-[24px] md:text-[32px] font-normal leading-[33px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4"
            style={{ fontFamily: "var(--font-fasthand)" }}
          >
            Waitlist
          </p>

          {/* Heading */}
          <h2 className="text-[32px] md:text-[40px] font-[500] text-[#080808] leading-[40px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
            Sign up with Waitlist
          </h2>

          {/* Copy */}
          <p className="text-[20px] md:text-[22px] font-normal text-[#696969] leading-[30px] md:leading-[32px] tracking-normal mb-8">
            Your users are talking — are you listening?
            <br className="hidden sm:block" />
            Sign up for Convy today, and let&apos;s create something extraordinary,
            together.
          </p>

          {/* CTA */}
          <div className="flex justify-center">
            <Link
              href="/waitlist"
              className="rounded-full bg-[#292929] px-[24px] py-[12px] text-[18px] font-medium tracking-[-0.28px] text-[#FAFAFA] transition-colors hover:bg-[#3a3a3a] whitespace-nowrap"
            >
              Sign up to Waitlist
            </Link>
          </div>
        </div>
      </div>
    </section>
  );
}


