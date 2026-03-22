const faqs = [
  {
    q: "What's included in the free plan?",
    a: "The free plan includes 1 active survey, 50 responses per month, AI-powered conversation flow, basic branding, and CSV export. It's free forever with no credit card required.",
  },
  {
    q: "How is Convyy different from a regular form?",
    a: "Convyy turns static forms into adaptive conversations. Each follow-up reacts to the previous answer, making the experience feel human and increasing completion rates.",
  },
  {
    q: "Do I lose access to the free version if I don't upgrade?",
    a: "Not at all. The free plan is yours to keep with no time limit. Upgrade only when you need more surveys, responses, or advanced features.",
  },
  {
    q: "Can I use Convyy for different use cases?",
    a: "Absolutely. Convyy works for product feedback, user research, employee engagement, customer satisfaction, and any scenario where real conversation drives better answers.",
  },
  {
    q: "Can I switch between voice and text modes?",
    a: "Yes. You can design surveys in text or voice mode, and respondents can choose their preferred format when taking the survey.",
  },
  {
    q: "Can I upgrade or downgrade later?",
    a: "Yes, you can change your plan at any time. Upgrades take effect immediately, and downgrades apply at the end of your current billing cycle.",
  },
  {
    q: "How does team collaboration work?",
    a: "On Pro and Enterprise plans, you can create shared workspaces, invite team members, and collaborate on survey design, analysis, and reporting.",
  },
  {
    q: "What kind of support does Pro include?",
    a: "Pro includes priority email support with faster response times, plus access to advanced analytics and AI-generated insights across all your surveys.",
  },
];

export default function FAQSection() {
  return (
    <section className="p-[12px] bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1920px] py-10 sm:py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          {/* Split layout: heading left, accordion right */}
          <div className="flex flex-col md:flex-row gap-8 md:gap-16">
            {/* Left side — heading */}
            <div className="md:w-[340px] shrink-0">
              <p
                className="text-[#8D8D8D] italic text-[20px] md:text-[32px] font-normal leading-[30px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4"
                style={{ fontFamily: "var(--font-fasthand)" }}
              >
                FAQ
              </p>
              <h2 className="text-[28px] md:text-[36px] font-[500] text-[#080808] leading-[34px] md:leading-[44px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
                Frequently Asked Questions
              </h2>
              <p className="text-[15px] font-normal text-[#696969] leading-[22px]">
                Have another question?{" "}
                <a
                  href="mailto:support@convyy.com"
                  className="text-[#080808] underline underline-offset-2 hover:text-[#696969] transition-colors"
                >
                  Contact us by email
                </a>
                .
              </p>
            </div>

            {/* Right side — accordion */}
            <div className="flex-1 border-t border-gray-200">
              {faqs.map((faq) => (
                <details key={faq.q} className="group border-b border-gray-200 py-4 md:py-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-6">
                    <h3 className="text-[16px] md:text-[17px] font-[500] text-[#080808] leading-[24px] tracking-[-0.12px]">
                      {faq.q}
                    </h3>
                    <span className="relative h-5 w-5 shrink-0 text-[#080808]">
                      <span className="absolute left-1/2 top-1/2 h-3 w-px -translate-x-1/2 -translate-y-1/2 bg-current transition-transform duration-200 group-open:rotate-90" />
                      <span className="absolute left-1/2 top-1/2 h-px w-3 -translate-x-1/2 -translate-y-1/2 bg-current" />
                    </span>
                  </summary>
                  <p className="pt-3 max-w-xl text-[15px] font-normal text-[#696969] leading-[22px]">
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
