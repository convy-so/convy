import { FaMagic, FaDatabase, FaBrain, FaFileAlt } from "react-icons/fa";

const featureCards = [
  {
    icon: FaMagic,
    iconBg: "bg-[#0BA5EC]",
    title: "Design learning flows with AI",
    description:
      "Describe the topic, goal, or teaching outcome you want and Convyy helps shape the tutoring flow for you.",
  },
  {
    icon: FaDatabase,
    iconBg: "bg-[#22C55E]",
    title: "Personalized learning spaces",
    description:
      "Create teacher-owned classrooms, invite students, define topics, and support learners with adaptive AI tutoring.",
  },
  {
    icon: FaBrain,
    iconBg: "bg-[#6366F1]",
    title: "Expert-guided teaching systems",
    description:
      "Combine classroom teaching, expert review, and adaptive tutoring so the system keeps improving with use.",
  },
  {
    icon: FaFileAlt,
    iconBg: "bg-[#0EA5E9]",
    title: "Reports that guide intervention",
    description:
      "Get summaries, patterns, readiness signals, and next actions from each student conversation without manual review.",
  },
];

export default function FeaturesSection() {
  return (
    <section className="bg-[#FAFAFA] p-[12px]">
      <div className="mx-auto max-w-[1920px] px-4 py-10 sm:px-6 sm:py-12 lg:px-12">
        <div className="mx-auto max-w-4xl">
          <div className="mb-12 text-center md:mb-16">
            <p
              className="mb-4 text-[20px] font-normal italic leading-[30px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              What you get
            </p>
            <h2 className="mb-4 text-[28px] font-[500] leading-[36px] tracking-[-0.48px] text-[#080808] md:text-[40px] md:leading-[50px] md:tracking-[-0.64px]">
              Everything you need to deliver adaptive learning.
            </h2>
            <p className="mx-auto max-w-3xl text-[18px] font-normal leading-[26px] tracking-normal text-[#696969] md:text-[22px] md:leading-[32px]">
              Build classroom experiences that help students learn in a more
              personal, responsive, and measurable way.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-4 md:grid-cols-12 md:gap-6">
            {featureCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="flex flex-col gap-4 rounded-[24px] border border-gray-200 bg-[#FAFAFA] p-6 md:col-span-6"
                >
                  <div
                    className={`flex h-[44px] w-[44px] items-center justify-center rounded-full ${card.iconBg}`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <div>
                    <h3 className="mb-1 text-[20px] font-[500] leading-[26px] tracking-[-0.24px] text-[#080808]">
                      {card.title}
                    </h3>
                    <p className="text-[16px] font-normal leading-[22px] text-[#696969]">
                      {card.description}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
}
