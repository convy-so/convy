export default function MacWindow() {
  return (
    <div className="w-full max-w-4xl mx-auto mt-12">
      <div className="bg-[#FAFAFA] rounded-lg overflow-hidden border border-gray-200">
        {/* macOS Title Bar */}
        <div className="bg-[#FAFAFA] px-6 py-4 flex items-center gap-2 border-b border-gray-200">
          {/* Traffic Light Buttons */}
          <div className="flex gap-2">
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
            <div className="w-3 h-3 rounded-full bg-gray-300"></div>
          </div>
        </div>
        
        {/* Window Content */}
        <div className="bg-[#FAFAFA] p-4 min-h-[600px] flex flex-col gap-2">
          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Hi! Ready to register? What's your name?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">Sarah Johnson</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Nice to meet you Sarah! What's your email?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">sarah.johnson@email.com</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Got it! Are you bringing a guest?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">Yes, my partner Alex</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Perfect! Any dietary restrictions we should know about?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">Vegetarian options please</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Nice! Which sessions are you most interested in?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">AI and machine learning track</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">Perfect! Last question - how did you hear about us?</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">Through a friend's recommendation</p>
            </div>
          </div>

          {/* System Message */}
          <div className="flex justify-start">
            <div className="bg-gray-200 rounded-[18px] rounded-tl-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-gray-900 leading-[1.4]">All set! We'll send a confirmation email shortly. See you there! 🎉</p>
            </div>
          </div>

          {/* User Message */}
          <div className="flex justify-end">
            <div className="bg-[#007AFF] rounded-[18px] rounded-tr-[4px] px-3 py-2 max-w-[75%] ">
              <p className="text-[15px] text-white leading-[1.4]">Perfect, thanks!</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

