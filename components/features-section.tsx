import Image from "next/image";

export default function FeaturesSection() {
  return (
    <section id="features" className="bg-white px-4 py-16 sm:px-6 lg:px-12">
      <div className="mx-auto max-w-[1200px]">
        <div className="flex flex-col items-center gap-12 lg:flex-row lg:gap-20">
          {/* Left side: Text */}
          <div className="w-full lg:w-[45%]">
            <h2 className="mb-4 text-[32px] font-[500] leading-[40px] tracking-[-1px] text-[#080808] md:text-[44px] md:leading-[52px]">
              Everything you need to deliver adaptive learning.
            </h2>
            <p className="mb-10 text-[18px] font-normal leading-[28px] text-[#696969] md:text-[20px] md:leading-[30px]">
              Build classroom experiences that help students learn in a more personal, responsive, and measurable way.
            </p>

            <div className="space-y-6">
              <div className="flex items-start gap-4">
                <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#EFF3F7] text-[14px] font-[500] text-[#5A6B7D]">
                  1
                </span>
                <p className="mt-0.5 text-[16px] leading-[24px] text-[#4E5661]">
                  Design learning flows with AI
                </p>
              </div>
              <div className="flex items-start gap-4">
                <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#EFF3F7] text-[14px] font-[500] text-[#5A6B7D]">
                  2
                </span>
                <p className="mt-0.5 text-[16px] leading-[24px] text-[#4E5661]">
                  Personalize learning spaces
                </p>
              </div>
              <div className="flex items-start gap-4">
                <span className="flex h-[28px] w-[28px] shrink-0 items-center justify-center rounded-full bg-[#EFF3F7] text-[14px] font-[500] text-[#5A6B7D]">
                  3
                </span>
                <p className="mt-0.5 text-[16px] leading-[24px] text-[#4E5661]">
                  Gain actionable learning insights
                </p>
              </div>
            </div>
          </div>

          {/* Right side: Image */}
          <div className="w-full lg:w-[55%]">
            <div className="rounded-[24px] bg-[#F7F7F7] p-8 flex items-center justify-center border border-gray-100 shadow-sm overflow-hidden h-[400px]">
              <Image
                src="/nexura-integrations-ref.png"
                alt="Convyy Integrations"
                width={800}
                height={600}
                className="h-full w-full object-contain mix-blend-multiply scale-[1.2]"
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
