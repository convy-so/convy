const plans = [
  {
    name: "Free",
    price: "$0",
    originalPrice: null,
    description:
      "For individual educators exploring adaptive tutoring and student support.",
    items: [
      "1 classroom workspace",
      "1 active learning topic",
      "Text-based AI tutoring",
      "Basic student insights",
      "Community support",
      "Foundational personalization",
    ],
    cta: "Get started free",
    ctaStyle: "outline" as const,
    featured: false,
    comingSoon: false,
  },
  {
    name: "Starter",
    price: "$19",
    originalPrice: null,
    period: "/month",
    description:
      "For schools or learning teams piloting personalized classroom support.",
    items: [
      "Everything in Free",
      "5 active topics or classrooms",
      "Voice and text learning experiences",
      "Custom branding and themes",
      "Shared teacher workspace",
      "Learning analytics dashboard",
      "Email support",
    ],
    cta: "Get Starter",
    ctaStyle: "outline" as const,
    featured: false,
    comingSoon: true,
  },
  {
    name: "Pro",
    price: "$49",
    originalPrice: "$79",
    period: "/month",
    description:
      "For growing education teams running personalized learning at scale.",
    items: [
      "Everything in Starter",
      "Unlimited active classrooms and topics",
      "Classroom and tutoring workflows",
      "AI-generated summaries and reports",
      "Advanced learning analytics and export",
      "Teacher workspaces and collaboration",
      "Priority support",
    ],
    cta: "Get Pro",
    ctaStyle: "dark" as const,
    featured: true,
    comingSoon: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    originalPrice: null,
    description:
      "For institutions with compliance, scale, governance, and integration needs.",
    items: [
      "Everything in Pro",
      "Institution-wide deployment",
      "SSO and role-based access",
      "Custom AI workflows and policies",
      "Dedicated account manager",
      "SLA and uptime guarantees",
      "Private deployment options",
      "Custom integrations and API",
    ],
    cta: "Contact sales",
    ctaStyle: "outline" as const,
    featured: false,
    comingSoon: true,
  },
];

export default function PricingSection() {
  return (
    <section className="bg-[#FAFAFA] p-[12px]">
      <div className="mx-auto max-w-[1920px] px-4 py-10 sm:px-6 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-7xl">
          <div className="mb-12 text-center md:mb-16">
            <p
              className="mb-4 text-[20px] font-normal italic leading-[30px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Pricing
            </p>
            <h2 className="mb-4 text-[28px] font-[500] leading-[36px] tracking-[-0.48px] text-[#080808] md:text-[40px] md:leading-[50px] md:tracking-[-0.64px]">
              Pricing for modern learning teams
            </h2>
            <p className="mx-auto max-w-3xl text-[18px] font-normal leading-[26px] tracking-normal text-[#696969] md:text-[22px] md:leading-[32px]">
              Start with one classroom or topic, then scale toward a more
              connected and personalized learning experience.
            </p>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-gray-200">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, i) => (
                <article
                  key={plan.name}
                  className={`relative flex flex-col gap-3 p-6 md:p-7 ${
                    i < plans.length - 1
                      ? "border-b border-gray-200 sm:border-b xl:border-r xl:border-b-0"
                      : ""
                  } ${
                    i === 1 ? "sm:border-r-0 xl:border-r xl:border-gray-200" : ""
                  } ${i < 2 ? "sm:border-b xl:border-b-0" : ""}`}
                >
                  {plan.comingSoon ? (
                    <div className="absolute top-4 right-4 rounded-full bg-green-500 px-3 py-1">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-white">
                        Coming soon
                      </span>
                    </div>
                  ) : null}

                  {plan.featured && !plan.comingSoon ? (
                    <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-0.5">
                      <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-[#080808]">
                        Most popular
                      </span>
                    </div>
                  ) : null}

                  <h3 className="text-[20px] font-[600] leading-[26px] tracking-[-0.24px] text-[#080808]">
                    {plan.name}
                  </h3>

                  <div className="mb-1 flex items-end gap-1.5">
                    {plan.originalPrice ? (
                      <span className="text-[14px] text-[#8D8D8D] line-through">
                        {plan.originalPrice}
                      </span>
                    ) : null}
                    <span className="text-[36px] font-[600] leading-[1] tracking-[-0.04em] text-[#080808]">
                      {plan.price}
                    </span>
                    {plan.period ? (
                      <span className="mb-1 text-[14px] text-[#696969]">
                        {plan.period}
                      </span>
                    ) : null}
                  </div>

                  <p className="text-[14px] font-normal leading-[20px] text-[#696969]">
                    {plan.description}
                  </p>

                  <p className="mt-1 text-[10px] font-bold uppercase tracking-[0.16em] text-[#080808]">
                    Including
                  </p>

                  <div className="flex-1">
                    <ul className="space-y-2">
                      {plan.items.map((item) => (
                        <li
                          key={item}
                          className="flex items-start gap-2 text-[13px] leading-[18px]"
                        >
                          <svg
                            className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#696969]"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <circle cx="8" cy="8" r="6.5" />
                            <path
                              d="M5.5 8l2 2 3.5-3.5"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                          <span className="text-[#696969]">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="mt-auto pt-3">
                    <button
                      type="button"
                      disabled={plan.comingSoon}
                      className={`inline-flex w-full items-center justify-center rounded-[12px] px-4 py-3 text-[14px] font-medium transition-colors ${
                        plan.ctaStyle === "dark"
                          ? "bg-[#080808] text-white hover:bg-[#2a2a2a]"
                          : "border border-gray-300 bg-white text-[#080808] hover:bg-gray-50"
                      }`}
                    >
                      {plan.cta}
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
