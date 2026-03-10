import Navbar from "@/components/navbar";
import FooterSection from "@/components/footer-section";

export default function LegalLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen flex flex-col bg-[#FAFAFA]">
            <Navbar />
            <main className="flex-grow w-full max-w-4xl mx-auto px-6 py-24 md:py-32">
                {children}
            </main>
            <FooterSection />
        </div>
    );
}
