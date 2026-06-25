import Navbar from "@/features/marketing/ui/navbar";
import HeroSection from "@/features/marketing/ui/hero-section";
import VideoSection from "@/features/marketing/ui/video-section";
import VisualShowcaseSection from "@/features/marketing/ui/visual-showcase-section";
import FeaturesSection from "@/features/marketing/ui/features-section";
import FAQSection from "@/features/marketing/ui/faq-section";
import CtaSection from "@/features/marketing/ui/cta-section";
import FooterSection from "@/features/marketing/ui/footer-section";

export default function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      {/* <WhyWeWinSection /> */}
      <VisualShowcaseSection />
      <VideoSection />

      <FeaturesSection />
      {/* <TestimonialsSection /> */}
      <FAQSection />
      <CtaSection />
      <FooterSection />
    </>
  );
}
