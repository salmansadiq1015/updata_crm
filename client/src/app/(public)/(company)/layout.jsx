import { LandingNavbar } from '@/components/landing/landing-navbar';
import { LandingFooter } from '@/components/landing/landing-footer';
import { LandingMotionProvider } from '@/components/landing/landing-motion-provider';

export default function CompanyLayout({ children }) {
  return <div className="landing-page min-h-dvh bg-[#060b16] text-white"><LandingMotionProvider><LandingNavbar /><main>{children}</main><LandingFooter /></LandingMotionProvider></div>;
}
