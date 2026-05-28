import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import WhyWeWinSection from "@/components/why-we-win-section";
import VideoSection from "@/components/video-section";
import VisualShowcaseSection from "@/components/visual-showcase-section";
import FeaturesSection from "@/components/features-section";
import TestimonialsSection from "@/components/testimonials-section";
import FAQSection from "@/components/faq-section";
import CtaSection from "@/components/cta-section";
import FooterSection from "@/components/footer-section";

export default async function Home() {
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
