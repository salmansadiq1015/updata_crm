import { LandingNavbar } from '@/components/landing/landing-navbar';
import { HeroSection } from '@/components/landing/hero-section';
import { CapabilityStrip } from '@/components/landing/capability-strip';
import { LeadGenerationSection } from '@/components/landing/lead-generation-section';
import { CrmSection } from '@/components/landing/crm-section';
import { OperationsSection } from '@/components/landing/operations-section';
import { TeamWorkspaceSection } from '@/components/landing/team-workspace-section';
import { AIAssistantSection } from '@/components/landing/ai-assistant-section';
import { CommunicationSection } from '@/components/landing/communication-section';
import { FeatureEcosystem } from '@/components/landing/feature-ecosystem';
import { WorkflowTimeline } from '@/components/landing/workflow-timeline';
import { ProductShowcase } from '@/components/landing/product-showcase';
import { CtaSection } from '@/components/landing/cta-section';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingMotionProvider } from '@/components/landing/landing-motion-provider';
import { AICallingSection } from '@/components/landing/ai-calling-section';
import { PlatformIntelligence, PlatformAssurance } from '@/components/landing/platform-assurance';

export const metadata = {
  title: 'Updata ERP — One Intelligent Workspace for Your Business',
  description: 'Discover leads, manage customers, coordinate teams, run projects and streamline business operations with Updata ERP.',
  keywords: ['ERP', 'CRM', 'lead generation', 'project management', 'business operations', 'AI assistant'],
  openGraph: {
    title: 'Updata ERP — One Intelligent Workspace for Your Business',
    description: 'Discover leads, manage customers, coordinate teams, run projects and streamline business operations with Updata ERP.',
    type: 'website',
    siteName: 'Updata ERP',
  },
  twitter: {
    card: 'summary',
    title: 'Updata ERP — One Intelligent Workspace for Your Business',
    description: 'Lead discovery, CRM, teams, projects, operations, accounting, and AI in one connected platform.',
  },
};

export default function HomePage() {
  const structuredData = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Updata ERP',
    applicationCategory: 'BusinessApplication',
    operatingSystem: 'Web',
    description: 'A connected business platform for lead generation, CRM, communication, projects, tasks, operations, accounting, and AI-assisted work.',
  };

  return (
    <div className="landing-page min-h-screen bg-[#060b16] text-white">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(structuredData).replace(/</g, '\\u003c') }} />
      <LandingMotionProvider>
        <LandingNavbar />
        <main>
          <HeroSection />
          <CapabilityStrip />
          <LeadGenerationSection />
          <CrmSection />
          <AICallingSection />
          <PlatformIntelligence />
          <OperationsSection />
          <TeamWorkspaceSection />
          <AIAssistantSection />
          <CommunicationSection />
          <FeatureEcosystem />
          <WorkflowTimeline />
          <ProductShowcase />
          <PlatformAssurance />
          <CtaSection />
        </main>
        <LandingFooter />
      </LandingMotionProvider>
    </div>
  );
}
