import Image from "next/image";

const testimonials = [
  {
    quote:
      "We started with one support program, then quickly expanded into classroom tutoring and student check-ins. It felt like the platform had been designed for school reality.",
    name: "Alyssa Chen",
    role: "Academic Director",
    image: "https://i.pravatar.cc/160?img=47",
  },
  {
    quote:
      "Convyy feels less like software and more like an extra teaching layer. The follow-ups are natural, and the summaries save our team hours every week.",
    name: "Marcus Reed",
    role: "Learning Lead",
    image: "https://i.pravatar.cc/160?img=12",
  },
  {
    quote:
      "The learning side is what sold us.\nWe can define topics, invite students, and let the AI adapt to each learner without rebuilding the experience from scratch.\nIt finally feels like personalized support at scale.",
    name: "Sophia Kim",
    role: "School Founder",
    image: "https://i.pravatar.cc/160?img=32",
  },
  {
    quote:
      "I've used LMS tools, survey tools, and student support tools before, but this is the first product that makes those workflows feel connected.\nVoice mode and the conversation design make it feel ready for real students.",
    name: "Jordan Patel",
    role: "Student Success Lead",
    image: "https://i.pravatar.cc/160?img=19",
  },
  {
    quote:
      "Set it up on a Friday afternoon, had usable learning signals by Monday.\nWe could see what students needed, where they struggled, and which follow-ups actually mattered.",
    name: "Noah Garcia",
    role: "School Operations Lead",
    image: "https://i.pravatar.cc/160?img=67",
  },
  {
    quote:
      "I was burned out from stitching together forms, reports, and separate learning tools.\nConvyy brought the flow back together.\nWe spend less time managing systems and more time improving the actual experience.",
    name: "Mia Johnson",
    role: "Learning Experience Manager",
    image: "https://i.pravatar.cc/160?img=22",
  },
];

export default function TestimonialsSection() {
  return (
    <section className="bg-[#FAFAFA] p-[12px]">
      <div className="mx-auto max-w-[1920px] px-4 py-10 sm:px-6 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-5xl">
          <div className="mb-12 text-center md:mb-16">
            <p
              className="mb-4 text-[20px] font-normal italic leading-[30px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Testimonials
            </p>
            <h2 className="mb-4 text-[28px] font-[500] leading-[36px] tracking-[-0.48px] text-[#080808] md:text-[40px] md:leading-[50px] md:tracking-[-0.64px]">
              Trusted by educators building more personal learning experiences
            </h2>
            <p className="mx-auto max-w-3xl text-[18px] font-normal leading-[26px] tracking-normal text-[#696969] md:text-[22px] md:leading-[32px]">
              See how school teams use Convyy to support learners more
              intentionally
            </p>
          </div>

          <div className="overflow-hidden rounded-[16px] border border-gray-200">
            <div className="grid grid-cols-1 md:grid-cols-3">
              {testimonials.slice(0, 3).map((testimonial, i) => (
                <article
                  key={testimonial.name}
                  className={`flex min-h-[200px] flex-col justify-between gap-5 p-6 md:p-7 ${
                    i < 2
                      ? "border-b border-gray-200 md:border-r md:border-b-0"
                      : "border-b border-gray-200 md:border-b-0"
                  }`}
                >
                  <p className="whitespace-pre-line text-[14px] font-normal leading-[22px] text-[#080808]">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-[14px] font-[600] leading-[18px] text-[#080808]">
                        {testimonial.name}
                      </h3>
                      <p className="text-[12px] font-normal leading-[16px] text-[#696969]">
                        {testimonial.role}
                      </p>
                    </div>
                  </div>
                </article>
              ))}
            </div>

            <div className="border-t border-gray-200" />

            <div className="grid grid-cols-1 md:grid-cols-3">
              {testimonials.slice(3, 6).map((testimonial, i) => (
                <article
                  key={testimonial.name}
                  className={`flex min-h-[200px] flex-col justify-between gap-5 p-6 md:p-7 ${
                    i < 2 ? "border-b border-gray-200 md:border-r md:border-b-0" : ""
                  }`}
                >
                  <p className="whitespace-pre-line text-[14px] font-normal leading-[22px] text-[#080808]">
                    &ldquo;{testimonial.quote}&rdquo;
                  </p>

                  <div className="mt-auto flex items-center gap-3 pt-2">
                    <Image
                      src={testimonial.image}
                      alt={testimonial.name}
                      width={36}
                      height={36}
                      unoptimized
                      className="h-9 w-9 rounded-full object-cover"
                    />
                    <div>
                      <h3 className="text-[14px] font-[600] leading-[18px] text-[#080808]">
                        {testimonial.name}
                      </h3>
                      <p className="text-[12px] font-normal leading-[16px] text-[#696969]">
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
