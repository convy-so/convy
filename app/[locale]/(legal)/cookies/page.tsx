export default function CookiesPage() {
    return (
        <div className="max-w-none">
            <h1 className="text-4xl font-bold mb-8 text-[#232323]">Cookie Policy</h1>
            <p className="text-[#666] mb-8">Last updated: March 10, 2026</p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">Why We Use Cookies</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We use cookies to ensure you get the best possible experience when using our application. Cookies are simply small pieces of data saved on your device that help our website remember important information about your visit.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">Necessary Cookies</h2>
            <div className="mb-6 bg-[#F0F4F8] p-6 rounded-2xl border border-[#D9E2EC] shadow-sm">
                <p className="text-[#232323] leading-relaxed text-lg">
                    Some cookies are essential for our app to work. For example, when you take a survey, we use a necessary cookie to ensure you only answer it once. This helps keep our survey results accurate and fair for everyone. Without these cookies, the core features of our website simply wouldn't be able to function properly.
                </p>
            </div>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">Cookies to Improve Your Experience</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                We also use cookies to make your visits smoother. These cookies help us remember your language preferences and understand how people are using our platform. This information allows us to continually improve our design and figure out which features you find most helpful.
            </p>

            <h2 className="text-2xl font-semibold mt-10 mb-4 text-[#232323]">Your Choices</h2>
            <p className="mb-6 text-[#444] leading-relaxed text-lg">
                You are in control of your data. When you first visit, our cookie banner allows you to choose to accept all cookies or only the necessary ones. You can also clear or manage your cookies anytime directly from your browser settings.
            </p>
        </div>
    );
}
