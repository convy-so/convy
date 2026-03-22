import { FaRobot, FaBolt, FaSync, FaComments } from "react-icons/fa";
import { useTranslations } from "next-intl";

export default function InsightsSection() {
  const t = useTranslations('Landing.Insights');

  return (
    <section className="p-[12px]">
      <div className="bg-[#292929] text-white rounded-[32px] py-12 sm:py-32 px-4 sm:px-6 lg:px-12 mx-auto max-w-[1920px]">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p className="text-[#8D8D8D] italic text-[20px] md:text-[32px] font-normal leading-[33px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4" style={{ fontFamily: 'var(--font-fasthand)' }}>
              Why Convyy wins
            </p>
            <h2 className="text-[28px] md:text-[40px] font-[500] text-[#FFFFFF] leading-[36px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              Forms that feel clear, quick, and human.
            </h2>
            <p className="text-[16px] md:text-[20px] font-[500] sm:font-[600] text-[#E5E5E5] leading-[22px] md:leading-[28px] tracking-normal max-w-3xl mx-auto">
              Convyy replaces boring forms with smart conversations that keep people engaged.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 justify-center px-4 md:px-0" style={{ maxWidth: '920px', margin: '0 auto' }}>
            {/* Card 1 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-6 md:p-[34px] w-full md:w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#0BA5EC] flex items-center justify-center">
                    <FaRobot className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] text-white font-medium leading-[32px] tracking-[-0.24px] mb-[12px]">Feels like a real chat</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    AI-powered prompts make your form feel like a natural conversation, not a checklist.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-6 md:p-[34px] w-full md:w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#F04438] flex items-center justify-center">
                    <FaBolt className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Adapts to every answer</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    Follow-up questions change based on what the user just said. No more rigid branching.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-6 md:p-[34px] w-full md:w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#F79009] flex items-center justify-center">
                    <FaSync className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Works everywhere</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    Your conversational form looks great on desktop, tablet, and mobile.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-6 md:p-[34px] w-full md:w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#FFFFFF] flex items-center justify-center">
                    <FaComments className="w-8 h-8 text-[#080808]" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Structured insights</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    AI summarizes your form responses so you can act on real patterns, not raw noise.
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

