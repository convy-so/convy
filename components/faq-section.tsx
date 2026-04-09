const faqs = [
  {
    q: "What's included in the free plan?",
    a: "The free plan is designed for getting started with classroom support. You can launch one classroom workspace, create a learning topic, run core AI tutoring flows, and review basic student insights without a credit card.",
  },
  {
    q: "How is Convyy different from a regular LMS tool?",
    a: "Convyy is designed around adaptive conversation. Instead of fixed modules, it responds to each student in real time, making support feel more personal while still giving teachers structure and visibility.",
  },
  {
    q: "Do I lose access to the free version if I don't upgrade?",
    a: "Not at all. The free plan stays available with no time limit. You only upgrade when you need more classrooms, collaboration, voice features, or deeper analytics.",
  },
  {
    q: "Can I use Convyy across different educational use cases?",
    a: "Absolutely. Teams use Convyy for personalized tutoring, student check-ins, topic revision, intervention support, classroom follow-up, and reflective learning conversations.",
  },
  {
    q: "Can I switch between voice and text modes?",
    a: "Yes. Convyy supports both voice and text experiences, so you can choose the interaction style that best fits your learners and teaching context.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing cycle.",
  },
  {
    q: "How does team collaboration work?",
    a: "On Pro and Enterprise plans, you can create shared teacher workspaces, invite teammates, organize classrooms and topics, and collaborate on delivery, analysis, and reporting.",
  },
  {
    q: "What kind of support does Pro include?",
    a: "Pro includes priority email support, richer learning analytics, AI-generated reporting, and broader workflow coverage for teams running multiple classes or programs.",
  },
];

export default function FAQSection() {
  return (
    <section className="bg-[#FAFAFA] p-[12px]">
      <div className="mx-auto max-w-[1920px] px-4 py-10 sm:px-6 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-8 md:flex-row md:gap-16">
            <div className="shrink-0 md:w-[340px]">
              <p
                className="mb-4 text-[20px] font-normal italic leading-[30px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
                style={{ fontFamily: "var(--font-fasthand)" }}
              >
                FAQ
              </p>
              <h2 className="mb-4 text-[28px] font-[500] leading-[34px] tracking-[-0.48px] text-[#080808] md:text-[36px] md:leading-[44px] md:tracking-[-0.64px]">
                Frequently Asked Questions
              </h2>
              <p className="text-[15px] font-normal leading-[22px] text-[#696969]">
                Have another question?{" "}
                <a
                  href="mailto:support@convyy.com"
                  className="text-[#080808] underline underline-offset-2 transition-colors hover:text-[#696969]"
                >
                  Contact us by email
                </a>
                .
              </p>
            </div>

            <div className="flex-1 border-t border-gray-200">
              {faqs.map((faq) => (
                <details key={faq.q} className="group border-b border-gray-200 py-4 md:py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6">
                    <h3 className="text-[16px] font-[500] leading-[24px] tracking-[-0.12px] text-[#080808] md:text-[17px]">
                      {faq.q}
                    </h3>
                    <span className="relative h-5 w-5 shrink-0 text-[#080808]">
                      <span className="absolute top-1/2 left-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-current transition-transform duration-200 group-open:rotate-90" />
                      <span className="absolute top-1/2 left-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-current" />
                    </span>
                  </summary>
                  <p className="max-w-xl pt-3 text-[15px] font-normal leading-[22px] text-[#696969]">
                    {faq.a}
                  </p>
                </details>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
