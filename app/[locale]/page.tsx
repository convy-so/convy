import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import FeaturesSection from "@/components/features-section";
import InsightsSection from "@/components/insights-section";
import WaitlistSection from "@/components/waitlist-section";
import FooterSection from "@/components/footer-section";

export default function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <InsightsSection />
      <FeaturesSection />
      <WaitlistSection />
      <FooterSection />
    </>
  );
}
