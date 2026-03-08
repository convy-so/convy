import Navbar from "@/components/navbar";
import HeroSection from "@/components/hero-section";
import FeaturesSection from "@/components/features-section";
import InsightsSection from "@/components/insights-section";
import CtaSection from "@/components/cta-section";
import FooterSection from "@/components/footer-section";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { redirect } from "@/i18n/routing";

export default async function Home() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (session?.user) {
    redirect({ href: "/dashboard", locale: session.user.preferredLanguage as string || "en" });
  }

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
