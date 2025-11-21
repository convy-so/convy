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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
            {/* Free Plan Card */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-200">
              <h3 className="text-2xl font-bold text-[#080808] mb-2">Free Plan</h3>
              <p className="text-sm text-gray-600 mb-4">Get started for free</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#292929]">$0</span>
                <span className="text-lg text-gray-600 ml-2">/ per month</span>
              </div>
              <button className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium mb-8 hover:bg-gray-300 transition-colors">
                Get started
              </button>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Up to 50 responses per month</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Basic form customization</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Email notifications</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Basic analytics</span>
                </li>
              </ul>
            </div>

            {/* Pro Plan Card */}
            <div className="bg-white rounded-[32px] p-8 border-2 border-t-4 border-t-gray-800 border-gray-200">
              <h3 className="text-2xl font-bold text-[#080808] mb-2">Pro Plan</h3>
              <p className="text-sm text-gray-600 mb-4">Free trial for 7 days</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#292929]">$29</span>
                <span className="text-lg text-gray-600 ml-2">/ per month</span>
              </div>
              <button className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium mb-8 hover:bg-gray-300 transition-colors">
                Coming soon
              </button>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">All included from Free Plan</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Unlimited responses</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Advanced customization</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">AI-powered insights</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Slack integration</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Priority support</span>
                </li>
              </ul>
            </div>

            {/* Business Plan Card */}
            <div className="bg-white rounded-[32px] p-8 border border-gray-200">
              <h3 className="text-2xl font-bold text-[#080808] mb-2">Business Plan</h3>
              <p className="text-sm text-gray-600 mb-4">Free trial for 7 days</p>
              <div className="mb-6">
                <span className="text-5xl font-bold text-[#292929]">$99</span>
                <span className="text-lg text-gray-600 ml-2">/ per month</span>
              </div>
              <button className="w-full bg-gray-200 text-gray-700 py-3 px-6 rounded-lg font-medium mb-8 hover:bg-gray-300 transition-colors">
                Coming soon
              </button>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">All included from Pro Plan</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Custom integrations</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Advanced analytics & reporting</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">White-label options</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">Dedicated account manager</span>
                </li>
                <li className="flex items-start gap-3">
                  <FaCheck className="w-5 h-5 text-gray-500 mt-0.5 flex-shrink-0" />
                  <span className="text-gray-700">24/7 priority support</span>
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

