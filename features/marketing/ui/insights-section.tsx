import { FaRobot, FaBolt, FaSync, FaComments } from "react-icons/fa";

const insightCards = [
  {
    icon: FaRobot,
    iconBg: "bg-[#0BA5EC]",
    title: "Adapts to each learner",
    description:
      "Every learning conversation shifts based on the student's response, pace, and level of understanding.",
  },
  {
    icon: FaBolt,
    iconBg: "bg-[#F04438]",
    title: "Built for teachers and tutors",
    description:
      "Create topic-based learning experiences, student check-ins, and guided support without stitching together separate systems.",
  },
  {
    icon: FaSync,
    iconBg: "bg-[#F79009]",
    title: "Voice and text ready",
    description:
      "Support students through typed or spoken interaction across desktop and mobile with the same clean experience.",
  },
  {
    icon: FaComments,
    iconBg: "bg-[#FFFFFF]",
    iconColor: "text-[#080808]",
    title: "Actionable learning insight",
    description:
      "Turn tutoring sessions into summaries, readiness signals, and teacher-friendly reports instead of raw transcripts.",
  },
];

export default function InsightsSection() {
  return (
    <section className="p-[12px]">
      <div className="mx-auto max-w-[1920px] rounded-[32px] bg-[#292929] px-4 py-12 text-white sm:px-6 sm:py-32 lg:px-12">
        <div className="mx-auto max-w-6xl">
          <div className="mb-12 text-center md:mb-16">
            <p
              className="mb-4 text-[20px] font-normal italic leading-[33px] tracking-[-0.24px] text-[#8D8D8D] md:text-[32px] md:leading-[44px] md:tracking-[-0.32px]"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              Why Convyy wins
            </p>
            <h2 className="mb-4 text-[28px] font-[500] leading-[36px] tracking-[-0.48px] text-[#FFFFFF] md:text-[40px] md:leading-[50px] md:tracking-[-0.64px]">
              AI learning support built for real classrooms.
            </h2>
            <p className="mx-auto max-w-3xl text-[16px] font-[500] leading-[22px] tracking-normal text-[#E5E5E5] sm:font-[600] md:text-[20px] md:leading-[28px]">
              Convyy helps teachers, tutors, and school teams guide students
              with conversations that adapt, stay contextual, and surface
              meaningful progress signals.
            </p>
          </div>

          <div
            className="grid grid-cols-1 justify-center gap-x-4 gap-y-4 px-4 md:grid-cols-2 md:px-0"
            style={{ maxWidth: "920px", margin: "0 auto" }}
          >
            {insightCards.map((card) => {
              const Icon = card.icon;

              return (
                <div
                  key={card.title}
                  className="w-full rounded-[32px] bg-[#3D3D3D] p-6 md:w-[456px] md:p-[34px]"
                >
                  <div className="flex flex-col gap-[32px]">
                    <div className="flex-shrink-0">
                      <div
                        className={`flex h-[60px] w-[60px] items-center justify-center rounded-full ${card.iconBg}`}
                      >
                        <Icon
                          className={`h-8 w-8 ${card.iconColor ?? "text-white"}`}
                        />
                      </div>
                    </div>
                    <div>
                      <h3 className="mb-[12px] text-[24px] font-medium leading-[32px] tracking-[-0.24px] text-white">
                        {card.title}
                      </h3>
                      <p className="text-[18px] font-normal leading-[27px] text-[#B2B2B2]">
                        {card.description}
                      </p>
                    </div>
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
