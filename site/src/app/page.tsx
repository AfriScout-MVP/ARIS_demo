import { MarketingNav } from "@/components/layout/MarketingNav";
import { Hero } from "@/components/landing/Hero";
import { VisionSection } from "@/components/landing/VisionSection";
import { PlatformSection } from "@/components/landing/PlatformSection";
import { IntegrationSection } from "@/components/landing/IntegrationSection";
import { CompetitionSection } from "@/components/landing/CompetitionSection";
import { LeverageSection } from "@/components/landing/LeverageSection";
import { MarketSection } from "@/components/landing/MarketSection";
import { RoadmapSection } from "@/components/landing/RoadmapSection";
import { FutureSection } from "@/components/landing/FutureSection";
import { CtaFooter } from "@/components/landing/CtaFooter";

export default function Home() {
  return (
    <div className="bg-aris-bg">
      <MarketingNav />
      <Hero />
      <VisionSection />
      <PlatformSection />
      <IntegrationSection />
      <CompetitionSection />
      <LeverageSection />
      <MarketSection />
      <RoadmapSection />
      <FutureSection />
      <CtaFooter />
    </div>
  );
}
