import { FaCheck } from "react-icons/fa";

export default function PricingSection() {
  return (
    <section className="p-[12px] bg-[#FAFAFA]">
      <div className="mx-auto max-w-[1920px] bg-[#FAFAFA] rounded-[32px] py-20 sm:py-32 px-4 sm:px-6 lg:px-12">
        <div className="max-w-6xl mx-auto">
          {/* Header */}
          <div className="text-center mb-12 md:mb-16">
            <p className="text-[#8D8D8D] italic text-[24px] md:text-[32px] font-normal leading-[33px] md:leading-[44px] tracking-[-0.24px] md:tracking-[-0.32px] mb-4" style={{ fontFamily: 'var(--font-fasthand)' }}>
              Pricing
            </p>
            <h2 className="text-[32px] md:text-[40px] font-[500] text-[#080808] leading-[40px] md:leading-[50px] tracking-[-0.48px] md:tracking-[-0.64px] mb-4">
              Plans to Fit Up to Your Needs
            </h2>
            <p className="text-[24px] font-normal text-[#696969] leading-[33.6px] tracking-normal max-w-3xl mx-auto">
              From startups to enterprises, QP Widget has a plan that brings you closer to your customers.
            </p>
          </div>

          {/* Pricing Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 max-w-4xl mx-auto">
            {/* Free Plan Card */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-200">
              <h3 className="text-2xl font-bold text-[#080808] mb-2">Free Plan</h3>
              <p className="text-sm text-gray-600 mb-4">
                Try Convy’s AI magic and see how chat-native forms change your flow.
              </p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#292929]">$0</span>
                <span className="text-lg text-gray-600 ml-2">/ mo</span>
              </div>
              <button className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium mb-8 hover:bg-gray-300 transition-colors">
                Get started
              </button>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">Limited conversations</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Unlimited responses
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">AI Form Builder</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">Chat with Data</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">Convy branding</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 opacity-60 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-gray-400">No integrations</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 opacity-60 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-gray-400">
                    No community support
                  </span>
                </li>
              </ul>
            </div>

            {/* Pro Plan Card */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-200">
              <h3 className="text-2xl font-bold text-[#080808] mb-2">Pro Plan</h3>
              <p className="text-sm text-gray-600 mb-4">
                Go pro to own your chat experience — fully branded, unlimited, and powered by AI.
              </p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#292929]">$25</span>
                <span className="text-lg text-gray-600 ml-2">/ mo</span>
              </div>
              <button className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium mb-8 hover:bg-gray-300 transition-colors">
                Coming soon
              </button>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Unlimited conversations
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Custom domain &amp; email
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Unique branding
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Unlimited file uploads
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">Voice mode</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Full integrations (Zapier, Notion, Slack, etc.)
                  </span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-blue-500 mt-0.5 flex-shrink-0" />
                  <span className="text-[16px] font-medium text-[#26272B]">
                    Priority support
                  </span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

