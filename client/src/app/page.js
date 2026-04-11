import { LandingNavbar } from '@/components/landing/landing-navbar';
import { HeroSection } from '@/components/landing/hero-section';
import { FeaturesSection } from '@/components/landing/features-section';
import { ModulesShowcase } from '@/components/landing/modules-showcase';
import { QuickAccessSection } from '@/components/landing/quick-access-section';
import { CtaSection } from '@/components/landing/cta-section';
import { LandingFooter } from '@/components/landing/landing-footer';

export const metadata = {
  title: 'MB Boiler ERP — Internes Mitarbeiterportal',
  description:
    'Das interne ERP-System der MB Boiler & Heizung AG. Projekte, Kunden, Offerten und Buchhaltung in einer Plattform.',
};

export default function HomePage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingNavbar />
      <main>
        <HeroSection />
        <FeaturesSection />
        <ModulesShowcase />
        <QuickAccessSection />
        <CtaSection />
      </main>
      <LandingFooter />
    </div>
  );
}
