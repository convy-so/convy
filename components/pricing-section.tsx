const plans = [
  {
    name: "Free",
    price: "$0",
    originalPrice: null,
    description: "For individuals exploring conversational surveys for the first time.",
    items: [
      "1 active survey",
      "50 responses per survey",
      "AI-powered conversation flow",
      "Basic branding controls",
      "Community support",
      "Response export (CSV)",
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
    description: "For small teams launching their first conversational surveys.",
    items: [
      "Everything in Free",
      "5 active surveys",
      "500 responses per survey",
      "Custom branding & themes",
      "Voice conversation mode",
      "Survey analytics dashboard",
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
    description: "For growing teams that need advanced features and deeper insights.",
      items: [
        "Everything in Starter",
        "Unlimited active surveys",
        "Unlimited responses per survey",
        "AI-generated summaries & insights",
        "Team workspaces & collaboration",
        "Advanced analytics & export",
        "Priority support",
      ],
    cta: "✦ Get Pro",
    ctaStyle: "dark" as const,
    featured: true,
    comingSoon: true,
  },
  {
    name: "Enterprise",
    price: "Custom",
    originalPrice: null,
    description: "For organizations with compliance, scale, and integration needs.",
    items: [
      "Everything in Pro",
      "Unlimited responses",
      "SSO & role-based access",
      "Custom AI model tuning",
      "Dedicated account manager",
      "SLA & uptime guarantees",
      "On-premise deployment option",
      "Custom integrations & API",
    ],
    cta: "Contact sales",
    ctaStyle: "outline" as const,
    featured: false,
    comingSoon: true,
  },
];

export default function PricingSection() {
  return (
    <section className="p-[12px] bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1920px] py-10 sm:py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-7xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p
              className="text-[#8D8D8D] italic text-[20px] md:text-[32px] font-normal leading-[30px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Pricing
            </p>
            <h2 className="text-[28px] md:text-[40px] font-[500] text-[#080808] leading-[36px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              Built for teams who value real conversations
            </h2>
            <p className="text-[18px] md:text-[22px] font-normal text-[#696969] leading-[26px] md:leading-[32px] tracking-normal max-w-3xl mx-auto">
              Replace static forms with conversational flows that adapt, engage, and deliver cleaner insights.
            </p>
          </div>

          {/* Pricing cards — flush 4-column container */}
          <div className="border border-gray-200 rounded-[16px] overflow-hidden">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4">
              {plans.map((plan, i) => (
                <article
                  key={plan.name}
                  className={`relative p-6 md:p-7 flex flex-col gap-3 ${
                    i < plans.length - 1
                      ? "border-b sm:border-b xl:border-b-0 xl:border-r border-gray-200"
                      : ""
                  } ${
                    i === 1
                      ? "sm:border-r-0 xl:border-r border-gray-200"
                      : ""
                  } ${
                    i < 2
                      ? "sm:border-b xl:border-b-0"
                      : ""
                  }`}
                >
                  {/* Coming soon badge — top right corner */}
                  {plan.comingSoon && (
                    <div className="absolute top-4 right-4 rounded-full bg-green-500 px-3 py-1">
                      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-white">
                        Coming soon
                      </span>
                    </div>
                  )}

                  {/* Most popular badge */}
                  {plan.featured && !plan.comingSoon && (
                    <div className="absolute top-4 right-4 flex items-center gap-1 rounded-full border border-gray-300 bg-white px-2.5 py-0.5">
                      <span className="text-[10px] font-semibold tracking-[0.08em] uppercase text-[#080808]">
                        ✦ Most popular
                      </span>
                    </div>
                  )}

                  {/* Plan name */}
                  <h3 className="text-[20px] font-[600] text-[#080808] leading-[26px] tracking-[-0.24px]">
                    {plan.name}
                  </h3>

                  {/* Price */}
                  <div className="flex items-end gap-1.5 mb-1">
                    {plan.originalPrice && (
                      <span className="text-[14px] text-[#8D8D8D] line-through">
                        {plan.originalPrice}
                      </span>
                    )}
                    <span className="text-[36px] font-[600] tracking-[-0.04em] text-[#080808] leading-[1]">
                      {plan.price}
                    </span>
                    {plan.period && (
                      <span className="text-[14px] text-[#696969] mb-1">{plan.period}</span>
                    )}
                  </div>

                  {/* Description */}
                  <p className="text-[14px] font-normal text-[#696969] leading-[20px]">
                    {plan.description}
                  </p>

                  {/* Includes label */}
                  <p className="text-[10px] font-bold tracking-[0.16em] uppercase text-[#080808] mt-1">
                    Including
                  </p>

                  {/* Feature list */}
                  <div className="flex-1">
                    <ul className="space-y-2">
                      {plan.items.map((item) => (
                        <li key={item} className="flex items-start gap-2 text-[13px] leading-[18px]">
                          <svg
                            className="mt-[2px] h-3.5 w-3.5 shrink-0 text-[#696969]"
                            viewBox="0 0 16 16"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="1.5"
                          >
                            <circle cx="8" cy="8" r="6.5" />
                            <path d="M5.5 8l2 2 3.5-3.5" strokeLinecap="round" strokeLinejoin="round" />
                          </svg>
                          <span className="text-[#696969]">{item}</span>
                        </li>
                      ))}
                    </ul>
                  </div>

                  {/* CTA button */}
                  <div className="pt-3 mt-auto">
                    <button
                      type="button"
                      disabled={plan.comingSoon}
                      className={`w-full inline-flex items-center justify-center rounded-[12px] px-4 py-3 text-[14px] font-medium transition-colors ${
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
