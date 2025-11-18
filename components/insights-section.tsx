import { Users, AlertCircle, Lightbulb, Megaphone } from "lucide-react";

export default function InsightsSection() {
  return (
    <section className="p-[12px]">
      <div className="bg-[#292929] text-white rounded-[32px] py-20 sm:py-32 px-4 sm:px-6 lg:px-12 mx-auto max-w-[1920px]">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-16">
            <p className="text-[#8D8D8D] italic text-[32px] font-normal leading-[44px] tracking-[-0.32px] mb-4" style={{ fontFamily: 'var(--font-fasthand)' }}>
              Hear it out
            </p>
            <h2 className="text-[40px] font-[500] text-[#FFFFFF] leading-[50px] tracking-[-0.64px] mb-4">
              Why Collect Insights?
            </h2>
            <p className="text-[24px] font-[500] text-[#E5E5E5] leading-[33.6px] tracking-normal max-w-3xl mx-auto">
              Because understanding your users isn't optional — it's everything.
            </p>
          </div>

          {/* Cards Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-4 justify-center" style={{ maxWidth: '920px', margin: '0 auto' }}>
            {/* Card 1 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-[34px] w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#0BA5EC] flex items-center justify-center">
                    <Users className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] text-white font-medium leading-[32px] tracking-[-0.24px] mb-[12px]">Your Users Are Your North Star</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    They'll tell you what's working, what's not, and what they hope you'll create next. Every piece of feedback is a map to your product's best version.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 2 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-[34px] w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#F04438] flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Mistakes Are Part of the Journey</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    Bugs happen, but what matters is how quickly you fix them. Your users will stick with you if they feel heard and valued.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 3 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-[34px] w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#F79009] flex items-center justify-center">
                    <Lightbulb className="w-8 h-8 text-white" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Big Ideas Don't Come from the Boardroom</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    Some of your most game-changing features will come straight from your users. Give them a voice, and they'll help you innovate.
                  </p>
                </div>
              </div>
            </div>

            {/* Card 4 */}
            <div className="bg-[#3D3D3D] rounded-[32px] p-[34px] w-[456px]">
              <div className="flex flex-col gap-[32px]">
                <div className="flex-shrink-0">
                  <div className="w-[60px] h-[60px] rounded-full bg-[#FFFFFF] flex items-center justify-center">
                    <Megaphone className="w-8 h-8 text-[#080808]" />
                  </div>
                </div>
                <div>
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">Success Feels Better When You Share It</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    When you nail the experience — when your users are happy — that's when your ratings soar, your community grows, and your vision becomes a reality.
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

