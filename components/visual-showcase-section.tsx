"use client";

import Image from "next/image";

const productViews = [
  {
    tab: "For teachers",
    title: "Connects with your teaching workflow.",
    description:
      "Convyy fits the tools your classroom already uses and keeps everything in one simple flow.",
    image: "/nexura-hero-bg.png",
    steps: [
      "Create AI tutoring activities in minutes",
      "Link student check-ins to class goals",
      "Share quick progress summaries with your team",
    ],
  },
  {
    tab: "For tutors",
    title: "Connects with your tutoring workflow.",
    description:
      "Manage prep, live sessions, and post-lesson follow-up from one focused workspace.",
    image: "/nexura-product-ref.png",
    steps: [
      "Generate guided prompts before each session",
      "Track weak areas while students respond",
      "Send recap notes and next tasks in one click",
    ],
  },
  {
    tab: "For schools",
    title: "Connects with your school systems.",
    description:
      "Give teams a shared place to monitor learning progress without changing existing processes.",
    image: "/nexura-integrations-ref.png",
    steps: [
      "Add programs and classrooms without migration",
      "Securely connect staff and learner accounts",
      "Sync reports for leaders, teachers, and support teams",
    ],
  },
];

export default function VisualShowcaseSection() {
  return (
    <section id="product-showcase" className="scroll-mt-24 bg-[#FAFAFA] p-[12px]">
      <div className="mx-auto max-w-[1920px] rounded-[32px] bg-white px-4 py-10 sm:px-6 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-8 text-center md:mb-10">
            <h2 className="mx-auto max-w-4xl text-[26px] font-[500] leading-[34px] tracking-[-0.3px] text-[#080808] md:text-[34px] md:leading-[42px]">
              Built for every learning team.
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-[14px] font-normal leading-[22px] text-[#696969] md:text-[16px] md:leading-[24px]">
              Pick a role and see how Convyy adapts to your workflow.
            </p>
          </div>

          <div className="space-y-16">
            {productViews.map((view, index) => (
              <div
                key={view.tab}
                className="grid items-start gap-8 md:grid-cols-[1fr_1.05fr] md:gap-12"
              >
                <div className={index % 2 === 1 ? "md:order-2" : "md:order-1"}>
                  <p className="mb-4 inline-flex rounded-full bg-[#F3F4F6] px-3 py-1.5 text-[13px] text-[#080808] md:text-[14px]">
                    {view.tab}
                  </p>
                  <div className="space-y-4">
                    <h3 className="text-[30px] font-[500] leading-[38px] tracking-[-0.5px] text-[#080808] md:text-[44px] md:leading-[50px]">
                      {view.title}
                    </h3>
                    <p className="max-w-xl text-[17px] leading-[27px] text-[#696969] md:text-[18px] md:leading-[28px]">
                      {view.description}
                    </p>

                    <div className="mt-6 h-px w-full bg-[#ECECEC]" />

                    <ul className="space-y-4 pt-2">
                      {view.steps.map((step, idx) => (
                        <li key={step} className="flex items-start gap-3">
                          <span className="mt-0.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#EFF3F7] text-[12px] font-[500] text-[#5A6B7D]">
                            {idx + 1}
                          </span>
                          <p className="text-[16px] leading-[24px] text-[#4E5661]">
                            {step}
                          </p>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div
                  className={`relative overflow-hidden rounded-[24px] bg-[#F7F7F7] p-3 ${
                    index % 2 === 1 ? "md:order-1" : "md:order-2"
                  }`}
                >
                  <Image
                    src={view.image}
                    alt={`${view.tab} workflow preview`}
                    width={1200}
                    height={900}
                    className="h-auto w-full rounded-[18px] object-cover"
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
