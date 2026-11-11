'use client';

import { UploadCloud, Sparkles, Files, ShieldCheck, Archive, CalendarPlus, HardDrive } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { intlLocaleFor } from '@/lib/i18n/locale-config';
import { HeroArt, HeroVeil, HeroStat } from '@/shared/components/hero-art';
import { formatBytes } from '../utils/document-visuals';

export function DocumentsHero({ stats, loading, canWrite, onUpload, onAskAi, onSection }) {
  const { t, locale } = useLanguage();
  const nf = new Intl.NumberFormat(intlLocaleFor(locale));
  const n = (v) => nf.format(v ?? 0);
  const sourceCount = Object.values(stats?.bySource || {}).filter(Boolean).length;

  return (
    <section
      aria-labelledby="documents-hero-title"
      className="relative isolate overflow-hidden rounded-[28px] border border-white/10 bg-[#060c18] text-white shadow-[0_30px_80px_-40px_rgba(14,165,233,0.45)]"
    >
      <HeroArt base="/documents/documents-hero" />
      <HeroVeil />

      <div className="relative flex flex-col gap-8 px-5 pb-5 pt-7 sm:px-8 sm:pb-7 sm:pt-10 lg:px-10">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-xl">
            <span className="inline-flex items-center gap-2 rounded-full border border-sky-300/20 bg-sky-400/10 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.18em] text-sky-200">
              <span className="size-1.5 rounded-full bg-cyan-300 shadow-[0_0_10px_2px_rgba(103,232,249,0.6)]" aria-hidden="true" />
              {t('documents.hub.eyebrow', 'Document hub')}
            </span>
            <h1 id="documents-hero-title" className="mt-4 text-3xl font-semibold tracking-tight text-white sm:text-4xl lg:text-[44px] lg:leading-[1.08]">
              {t('documents.hub.title', 'Every document. One trusted place.')}
            </h1>
            <p className="mt-3 max-w-lg text-sm leading-6 text-slate-300 sm:text-[15px]">
              {t('documents.hub.subtitle', 'Generated, uploaded and received paperwork from projects, customers, jobs and accounting — searchable, signed off and archived in one place.')}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={onAskAi}
              className="inline-flex h-11 items-center gap-2 rounded-full border border-white/15 bg-white/[0.07] px-5 text-sm font-medium text-white backdrop-blur-md transition hover:border-sky-300/40 hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300/60"
            >
              <Sparkles className="size-4 text-cyan-300" aria-hidden="true" />
              {t('documents.hub.askAi', 'Ask AI')}
            </button>
            {canWrite ? (
              <button
                type="button"
                onClick={onUpload}
                className="inline-flex h-11 items-center gap-2 rounded-full bg-gradient-to-r from-sky-400 to-cyan-300 px-5 text-sm font-semibold text-slate-950 shadow-[0_10px_30px_-8px_rgba(56,189,248,0.7)] transition hover:brightness-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-200"
              >
                <UploadCloud className="size-4" aria-hidden="true" />
                {t('documents.repository.upload')}
              </button>
            ) : null}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-5">
          <HeroStat icon={Files} label={t('documents.hub.kpi.total', 'All documents')} value={n(stats?.total)} hint={t('documents.hub.kpi.sources', 'From {count} sources', { count: sourceCount })} loading={loading} />
          <button type="button" onClick={() => onSection?.('visum')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300/50">
            <HeroStat icon={ShieldCheck} tone="text-emerald-300" label={t('documents.hub.kpi.signedOff', 'Signed off')} value={n(stats?.sections?.visum)} hint={t('documents.hub.kpi.signedOffHint', 'Reviewed and approved')} loading={loading} />
          </button>
          <button type="button" onClick={() => onSection?.('archiv')} className="rounded-2xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-300/50">
            <HeroStat icon={Archive} tone="text-amber-300" label={t('documents.hub.kpi.archived', 'Archived')} value={n(stats?.sections?.archiv)} hint={t('documents.hub.kpi.archivedHint', 'Kept, out of the way')} loading={loading} />
          </button>
          <HeroStat icon={CalendarPlus} label={t('documents.hub.kpi.thisMonth', 'Added this month')} value={n(stats?.thisMonth)} hint={t('documents.hub.kpi.released', '{count} released to the field', { count: n(stats?.released) })} loading={loading} />
          <div className="col-span-2 lg:col-span-1">
            <HeroStat icon={HardDrive} tone="text-cyan-300" label={t('documents.hub.kpi.storage', 'Storage')} value={formatBytes(stats?.storageBytes, intlLocaleFor(locale))} hint={t('documents.hub.kpi.storageHint', 'Across all document sources')} loading={loading} />
          </div>
        </div>
      </div>
    </section>
  );
}
