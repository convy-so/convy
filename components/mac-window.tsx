export default function MacWindow() {
  return (
    <div className="mx-auto mt-12 w-full max-w-4xl">
      <div className="overflow-hidden rounded-lg border border-gray-200 bg-[#FAFAFA]">
        <div className="flex items-center gap-2 border-b border-gray-200 bg-[#FAFAFA] px-6 py-4">
          <div className="flex gap-2">
            <div className="h-3 w-3 rounded-full bg-gray-300" />
            <div className="h-3 w-3 rounded-full bg-gray-300" />
            <div className="h-3 w-3 rounded-full bg-gray-300" />
          </div>
        </div>

        <div className="flex min-h-[600px] flex-col gap-2 bg-[#FAFAFA] p-4">
          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-[18px] rounded-tl-[4px] bg-gray-200 px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-gray-900">
                Hi Amina, what would you like help with today?
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-[18px] rounded-tl-[4px] bg-gray-200 px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-gray-900">
                I can help you revise Newton&apos;s Laws, run a quick check-in,
                or prepare practice questions.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-[18px] rounded-tr-[4px] bg-[#007AFF] px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-white">
                I&apos;m revising forces, but I keep confusing mass and weight.
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-[18px] rounded-tl-[4px] bg-gray-200 px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-gray-900">
                Got it. Do you want a quick explanation first, or a worked
                example?
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-[18px] rounded-tr-[4px] bg-[#007AFF] px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-white">
                Start with a worked example.
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-[18px] rounded-tl-[4px] bg-gray-200 px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-gray-900">
                Perfect. Imagine you&apos;re holding a 2kg textbook. Its mass
                stays the same, but its weight changes with gravity.
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-[18px] rounded-tr-[4px] bg-[#007AFF] px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-white">
                So weight is the force, and mass is the amount of matter?
              </p>
            </div>
          </div>

          <div className="flex justify-start">
            <div className="max-w-[75%] rounded-[18px] rounded-tl-[4px] bg-gray-200 px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-gray-900">
                Exactly. Nice catch. Want me to turn that into two practice
                questions and a short recap for later?
              </p>
            </div>
          </div>

          <div className="flex justify-end">
            <div className="max-w-[75%] rounded-[18px] rounded-tr-[4px] bg-[#007AFF] px-3 py-2">
              <p className="text-[18px] font-normal leading-[1.4] text-white">
                Yes please, and keep it simple.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
