import { FaRobot, FaBolt, FaSync, FaComments } from "react-icons/fa";
import { useTranslations } from "next-intl";

export default function InsightsSection() {
  const t = useTranslations('Landing.Insights');

  return (
    <section className="p-[12px]">
      <div className="bg-[#292929] text-white rounded-[32px] py-20 sm:py-32 px-4 sm:px-6 lg:px-12 mx-auto max-w-[1920px]">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p className="text-[#8D8D8D] italic text-[24px] md:text-[32px] font-normal leading-[33px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4" style={{ fontFamily: 'var(--font-fasthand)' }}>
              {t('Badge')}
            </p>
            <h2 className="text-[32px] md:text-[40px] font-[500] text-[#FFFFFF] leading-[40px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              {t('Title')}
            </h2>
            <p className="text-[16px] md:text-[20px] font-[600] text-[#E5E5E5] leading-[22px] md:leading-[28px] tracking-normal max-w-3xl mx-auto">
              {t('Description')}
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
                  <h3 className="text-[24px] text-white font-medium leading-[32px] tracking-[-0.24px] mb-[12px]">{t('Cards.AI.Title')}</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    {t('Cards.AI.Description')}
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
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">{t('Cards.Alive.Title')}</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    {t('Cards.Alive.Description')}
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
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">{t('Cards.Flow.Title')}</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    {t('Cards.Flow.Description')}
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
                  <h3 className="text-[24px] font-[500] leading-[32px] tracking-[-0.24px] mb-[12px]">{t('Cards.Data.Title')}</h3>
                  <p className="text-[18px] font-normal text-[#B2B2B2] leading-[27px]">
                    {t('Cards.Data.Description')}
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

