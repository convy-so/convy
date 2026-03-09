import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import FeaturesSection from "@/components/features-section";
import InsightsSection from "@/components/insights-section";
import CtaSection from "@/components/cta-section";
import FooterSection from "@/components/footer-section";

export default async function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <InsightsSection />
      <FeaturesSection />
      <CtaSection />
      <FooterSection />
    </>
  );
}
