import {
  FaMagic,
  FaDatabase,
  FaBrain,
  FaFileAlt,
} from "react-icons/fa";
import { useTranslations } from "next-intl";

export default function FeaturesSection() {
  const t = useTranslations('Landing.Features');

  return (
    <section className="p-[12px] bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1920px] py-10 sm:py-12 px-4 sm:px-6 lg:px-12">
        <div className="max-w-4xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p
              className="text-[#8D8D8D] italic text-[20px] md:text-[32px] font-normal leading-[30px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4"
              style={{ fontFamily: "var(--font-fasthand)" }}
            >
              {t('Badge')}
            </p>
            <h2 className="text-[28px] md:text-[40px] font-[500] text-[#080808] leading-[36px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              {t('Title')}
            </h2>
            <p className="text-[18px] md:text-[22px] font-normal text-[#696969] leading-[26px] md:leading-[32px] tracking-normal max-w-3xl mx-auto">
              {t('Description')}
            </p>
          </div>

          {/* Feature cards - bento-style grid */}
          <div className="grid grid-cols-1 md:grid-cols-12 gap-4 md:gap-6">
            {/* Card 1 */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-[24px] p-6 flex flex-col gap-4 md:col-span-6">
              <div className="w-[44px] h-[44px] rounded-full bg-[#0BA5EC] flex items-center justify-center">
                <FaMagic className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-[20px] font-[500] text-[#080808] leading-[26px] tracking-[-0.24px] mb-1">
                  {t('Cards.Builder.Title')}
                </h3>
                <p className="text-[16px] font-normal text-[#696969] leading-[22px]">
                  {t('Cards.Builder.Description')}
                </p>
              </div>
            </div>

            {/* Card 2 (was 3) */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-[24px] p-6 flex flex-col gap-4 md:col-span-6">
              <div className="w-[44px] h-[44px] rounded-full bg-[#22C55E] flex items-center justify-center">
                <FaDatabase className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-[20px] font-[500] text-[#080808] leading-[26px] tracking-[-0.24px] mb-1">
                  {t('Cards.ChatData.Title')}
                </h3>
                <p className="text-[16px] font-normal text-[#696969] leading-[22px]">
                  {t('Cards.ChatData.Description')}
                </p>
              </div>
            </div>

            {/* Card 3 (was 4) */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-[24px] p-6 flex flex-col gap-4 md:col-span-6">
              <div className="w-[44px] h-[44px] rounded-full bg-[#6366F1] flex items-center justify-center">
                <FaBrain className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-[20px] font-[500] text-[#080808] leading-[26px] tracking-[-0.24px] mb-1">
                  {t('Cards.Logic.Title')}
                </h3>
                <p className="text-[16px] font-normal text-[#696969] leading-[22px]">
                  {t('Cards.Logic.Description')}
                </p>
              </div>
            </div>

            {/* Card 4 (was 5) */}
            <div className="bg-[#FAFAFA] border border-gray-200 rounded-[24px] p-6 flex flex-col gap-4 md:col-span-6">
              <div className="w-[44px] h-[44px] rounded-full bg-[#0EA5E9] flex items-center justify-center">
                <FaFileAlt className="w-5 h-5 text-white" />
              </div>
              <div>
                <h3 className="text-[20px] font-[500] text-[#080808] leading-[26px] tracking-[-0.24px] mb-1">
                  {t('Cards.Summaries.Title')}
                </h3>
                <p className="text-[16px] font-normal text-[#696969] leading-[22px]">
                  {t('Cards.Summaries.Description')}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}


