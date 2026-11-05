'use client';

import { useLanguage } from '@/lib/i18n/language-context';
import { Reveal, SectionIntro } from './motion-primitives';

import { CommunicationDemo } from './communication-demo';

export function CommunicationSection() {
  const { t } = useLanguage();
  return (
    <section id="communication" className="relative overflow-hidden bg-[#08101d] py-24 sm:py-32">
      <div className="mx-auto max-w-[1440px] px-4 sm:px-6 lg:px-10">
        <SectionIntro align="center" eyebrow={t('landing.communication.eyebrow')} title={t('landing.communication.title')} description={t('landing.communication.description')} />
        <Reveal className="mx-auto mt-12 max-w-6xl">
          <CommunicationDemo />
        </Reveal>
      </div>
    </section>
  );
}
