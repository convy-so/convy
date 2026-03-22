import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import InsightsSection from "@/components/insights-section";
import FeaturesSection from "@/components/features-section";
import PricingSection from "@/components/pricing-section";
import TestimonialsSection from "@/components/testimonials-section";
import FAQSection from "@/components/faq-section";
import CtaSection from "@/components/cta-section";
import FooterSection from "@/components/footer-section";

export default async function Home() {
  return (
    <>
      <Navbar />
      <HeroSection />
      <InsightsSection />
      <FeaturesSection />
      <PricingSection />
      <TestimonialsSection />
      <FAQSection />
      <CtaSection />
      <FooterSection />
    </>
  );
}
