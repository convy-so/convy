import Image from "next/image";

const testimonials = [
  {
    quote:
      "We switched from a traditional form tool and our completion rates jumped by 40%. People actually enjoy filling in surveys with Convyy.",
    name: "Alyssa Chen",
    role: "Product Manager",
    image: "https://i.pravatar.cc/160?img=47",
    social: null,
  },
  {
    quote:
      "Convyy feels like chatting with a colleague, not filling out a form. The AI follow-ups make every response richer.",
    name: "Marcus Reed",
    role: "UX Researcher",
    image: "https://i.pravatar.cc/160?img=12",
    social: null,
  },
  {
    quote:
      "I'm not even exaggerating — this saved me weeks of work.\nInstead of designing complex logic branches, I just describe what I want and Convyy builds the flow.\nIt's the first time I've felt in control of the entire survey process.",
    name: "Sophia Kim",
    role: "Startup Founder",
    image: "https://i.pravatar.cc/160?img=32",
    social: null,
  },
  {
    quote:
      "I've used other survey tools before but this one feels built by someone who actually cares about the respondent experience.\nThe little details — onboarding, conversation flow, voice mode — make it production-grade out of the box.",
    name: "Jordan Patel",
    role: "Customer Success Lead",
    image: "https://i.pravatar.cc/160?img=19",
    social: null,
  },
  {
    quote:
      "Set it up on a Friday afternoon, had real insights by Monday.\nEverything just clicked — no complicated setup, no headaches.",
    name: "Noah Garcia",
    role: "Growth Lead",
    image: "https://i.pravatar.cc/160?img=67",
    social: null,
  },
  {
    quote:
      "I was burned out from building survey logic in spreadsheets.\nThis made me fall in love with collecting feedback again.\nI opened my laptop, ran one command, and started designing instead of debugging.",
    name: "Mia Johnson",
    role: "Research Analyst",
    image: "https://i.pravatar.cc/160?img=22",
    social: null,
  },
];

export default function TestimonialsSection() {
  return (
    <section className="p-[12px] bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1920px] py-10 sm:py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-5xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p
              className="text-[#8D8D8D] italic text-[20px] md:text-[32px] font-normal leading-[30px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Testimonials
            </p>
            <h2 className="text-[28px] md:text-[40px] font-[500] text-[#080808] leading-[36px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              Trusted by teams who value real feedback
            </h2>
            <p className="text-[18px] md:text-[22px] font-normal text-[#696969] leading-[26px] md:leading-[32px] tracking-normal max-w-3xl mx-auto">
              See what builders are saying about Convyy
            </p>
          </div>

          {/* Testimonial grid — connected cells like the reference */}
          <div className="border border-gray-200 rounded-[16px] overflow-hidden">
            {/* Row 1 */}
            <div className="grid grid-cols-1 md:grid-cols-3">
              {testimonials.slice(0, 3).map((testimonial, i) => (
                <article
                  key={testimonial.name}
                  className={`p-6 md:p-7 flex flex-col justify-between gap-5 min-h-[200px] ${
                    i < 2 ? "border-b md:border-b-0 md:border-r border-gray-200" : "border-b md:border-b-0 border-gray-200"
                  }`}
                >
                  {/* Quote */}
                  <p className="text-[14px] font-normal text-[#080808] leading-[22px] whitespace-pre-line">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-3 mt-auto pt-2">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-[14px] font-[600] text-[#080808] leading-[18px]">
                        {testimonial.name}
                      </h3>
                      <p className="text-[12px] font-normal text-[#696969] leading-[16px]">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            {/* Divider between rows */}
            <div className="border-t border-gray-200" />

            {/* Row 2 */}
            <div className="grid grid-cols-1 md:grid-cols-3">
              {testimonials.slice(3, 6).map((testimonial, i) => (
                <article
                  key={testimonial.name}
                  className={`p-6 md:p-7 flex flex-col justify-between gap-5 min-h-[200px] ${
                    i < 2 ? "border-b md:border-b-0 md:border-r border-gray-200" : ""
                  }`}
                >
                  {/* Quote */}
                  <p className="text-[14px] font-normal text-[#080808] leading-[22px] whitespace-pre-line">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  {/* Author */}
                  <div className="flex items-center gap-3 mt-auto pt-2">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-[14px] font-[600] text-[#080808] leading-[18px]">
                        {testimonial.name}
                      </h3>
                      <p className="text-[12px] font-normal text-[#696969] leading-[16px]">
                        {testimonial.role}
                      </p>
                    </div>
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
