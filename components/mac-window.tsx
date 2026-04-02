export default function MacWindow() {
  return (
    <div className="w-full max-w-4xl mx-auto mt-12">
      <div className="bg-[#FAFAFA] rounded-lg overflow-hidden border border-gray-200">
        <div className="bg-[#FAFAFA] px-6 py-4 flex items-center gap-2 border-b border-gray-200">
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          </div>
        </div>

        <div className="bg-[#FAFAFA] p-4 min-h-[600px] flex flex-col gap-2">
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-gray-900 leading-[1.4]">
                Hi! Thanks for your recent order. How was the experience?
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-gray-900 leading-[1.4]">
                That is the Convyy experience.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-white leading-[1.4]">
                It was mostly great, but the shipping felt a bit long.
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-gray-900 leading-[1.4]">
                I&apos;m sorry to hear that. Was the estimate inaccurate?
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-white leading-[1.4]">
                Yes, it took 3 days longer than the checkout date.
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-gray-900 leading-[1.4]">
                Got it. I&apos;ll flag that for our logistics team. What did you
                like most?
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-white leading-[1.4]">
                The product quality is incredible.
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-gray-900 leading-[1.4]">
                That&apos;s wonderful! Anything else you&apos;d like to share?
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%]">
              <p className="text-[18px] font-normal text-white leading-[1.4]">
                No, that&apos;s it. Keep it up!
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
