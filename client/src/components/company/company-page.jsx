'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import dynamic from 'next/dynamic';
import { ArrowDown, ArrowRight, ArrowUpRight, AudioLines, BookOpen, Check, ChevronDown, Contact, Copy, FileCheck2, Fingerprint, FolderKanban, LifeBuoy, LockKeyhole, Mail, Network, Radar, Search, ShieldCheck, Users } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { SUPPORT_EMAIL } from '@/shared/constants/application';
import { useCreateTicketMutation } from '@/modules/support/hooks/use-create-ticket-mutation';
import { AuthAwareLink } from '@/components/landing/auth-aware-link';
import { Reveal } from '@/components/landing/motion-primitives';
import { cn } from '@/lib/utils';

const SupportFormSheet = dynamic(() => import('@/modules/support/components/support-form-sheet'));
const companyPages = ['about', 'contact', 'support', 'privacy', 'terms', 'security'];
const linkClass = 'inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-white/15 px-4 text-sm font-medium text-slate-200 transition-colors hover:bg-white/[.06]';
const primaryClass = 'inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[#dce6ff] px-5 text-sm font-semibold text-[#142858] transition-colors hover:bg-white disabled:opacity-50';
const fieldClass = 'min-h-12 w-full rounded-xl border border-white/15 bg-[#0a1221] px-3.5 py-3 text-base text-slate-100 outline-none transition-colors placeholder:text-slate-500 focus:border-blue-300 focus:ring-2 focus:ring-blue-300/15';

function CompanyNavigation({ current }) {
  const { t } = useLanguage();
  return <nav aria-label={t('company.common.company')} className="scrollbar-thin flex gap-1 overflow-x-auto border-b border-white/10 pb-3">
    {companyPages.map(page => <Link key={page} href={`/${page}`} aria-current={current === page ? 'page' : undefined} className={cn('min-h-10 shrink-0 rounded-lg px-3 py-2.5 text-xs font-medium transition-colors', current === page ? 'bg-blue-200/10 text-blue-200' : 'text-slate-400 hover:bg-white/5 hover:text-white')}>{t(`company.${page}.name`)}</Link>)}
  </nav>;
}

function EmailLink({ subject, children, primary = false, className }) {
  return <a href={`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`} className={cn(primary ? primaryClass : linkClass, className)}>{children}<ArrowUpRight aria-hidden="true" className="size-4 shrink-0" /></a>;
}

function CopyEmail() {
  const { t } = useLanguage();
  const [status, setStatus] = useState('');
  const copy = async () => {
    try { await navigator.clipboard.writeText(SUPPORT_EMAIL); setStatus('copied'); }
    catch { setStatus('copyFailed'); }
  };
  return <div className="flex flex-wrap items-center gap-3"><a href={`mailto:${SUPPORT_EMAIL}`} className="text-sm text-blue-200 underline-offset-4 hover:underline">{SUPPORT_EMAIL}</a><button type="button" onClick={copy} aria-label={t('company.common.copy')} className="grid size-10 place-items-center rounded-lg border border-white/10 text-slate-400 hover:bg-white/5 hover:text-white">{status === 'copied' ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}</button><span role="status" className="text-xs text-slate-400">{status && t(`company.common.${status}`)}</span></div>;
}

function AboutContent() {
  const { t } = useLanguage();
  const steps = [[Radar, 'discover', '/lead-generation'], [Contact, 'connect', '/leads'], [FolderKanban, 'deliver', '/projects'], [ShieldCheck, 'control', '/admin/settings']];
  return <>
    <Reveal className="grid overflow-hidden rounded-3xl border border-white/10 bg-[#0b1425] lg:grid-cols-[1.1fr_.9fr]">
      <div className="p-6 sm:p-10 lg:p-12"><p className="text-xs font-medium uppercase tracking-[.14em] text-blue-200">{t('experience.connected.eyebrow')}</p><h2 className="mt-8 max-w-lg text-3xl font-medium leading-tight tracking-tight text-white">{t('company.about.storyTitle')}</h2><p className="mt-5 max-w-xl text-sm leading-7 text-slate-400">{t('company.about.story')}</p><a href="#product-principles" className={cn(linkClass, 'mt-7')}>{t('company.about.principles')}<ArrowDown aria-hidden="true" className="size-4" /></a></div>
      <div className="relative min-h-[310px] border-t border-white/10 lg:border-s lg:border-t-0"><Image src="/landing/ai-voice-sculpture-1280.webp" alt="" fill sizes="(min-width: 1024px) 40vw, 90vw" className="object-cover" /><div className="absolute inset-0 bg-gradient-to-t from-[#080f1c] via-transparent to-transparent" /><div className="absolute inset-x-5 bottom-5 grid grid-cols-2 gap-2">{[[Radar, 'landing.ecosystem.leadgen'], [Contact, 'landing.ecosystem.leads'], [AudioLines, 'experience.calling.nav'], [FolderKanban, 'landing.ecosystem.projects']].map(([Icon, key]) => <span key={key} className="flex items-center gap-2 rounded-xl border border-white/10 bg-[#0a1324]/90 p-3 text-xs text-slate-200"><Icon aria-hidden="true" className="size-4 shrink-0 text-blue-200" />{t(key)}</span>)}</div></div>
    </Reveal>
    <div className="mt-8 grid gap-4 sm:grid-cols-2">{steps.map(([Icon, key, href], index) => <Reveal key={key} delay={index * .04} className="rounded-2xl border border-white/10 bg-white/[.02] p-6 sm:p-8"><Icon aria-hidden="true" className="size-6 text-blue-200" /><h2 className="mt-6 text-xl font-medium text-white">{t(`company.about.${key}`)}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{t(`company.about.${key}Body`)}</p><AuthAwareLink href={href} className="mt-5 inline-flex min-h-10 items-center gap-2 text-sm text-blue-200">{t('company.common.explore')}<ArrowUpRight aria-hidden="true" className="size-4" /></AuthAwareLink></Reveal>)}</div>
    <section id="product-principles" className="mt-20 scroll-mt-28"><h2 className="text-2xl font-medium tracking-tight text-white">{t('company.about.principles')}</h2><div className="mt-8 grid gap-8 sm:grid-cols-3">{[1, 2, 3].map(index => <div key={index} className="border-t border-white/10 pt-6"><span className="text-xs font-mono text-blue-300">0{index}</span><h3 className="mt-5 text-base font-medium text-white">{t(`company.about.principle${index}`)}</h3><p className="mt-3 text-sm leading-7 text-slate-400">{t(`company.about.principle${index}Body`)}</p></div>)}</div></section>
  </>;
}

function ContactContent() {
  const { t } = useLanguage();
  const id = useId();
  const [topic, setTopic] = useState('general');
  const submit = event => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const subject = `Updata · ${t(`company.contact.${topic}`)}`;
    const body = `${t('company.contact.nameLabel')}: ${data.get('name')}\n${t('company.contact.emailLabel')}: ${data.get('email')}\n\n${data.get('message')}`;
    window.location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };
  return <div className="grid items-start gap-8 lg:grid-cols-[.85fr_1.15fr] lg:gap-14">
    <div className="order-2 lg:order-1"><div className="space-y-4">{[[Network, 'general'], [LifeBuoy, 'technical'], [ShieldCheck, 'security']].map(([Icon, key]) => <div key={key} className="rounded-2xl border border-white/10 bg-white/[.02] p-6"><Icon aria-hidden="true" className="size-5 text-blue-200" /><h2 className="mt-5 text-base font-medium text-white">{t(`company.contact.${key}`)}</h2><p className="mt-2 text-sm leading-7 text-slate-400">{t(`company.contact.${key}Body`)}</p><EmailLink subject={`Updata · ${t(`company.contact.${key}`)}`} className="mt-4 min-h-10 border-0 px-0 text-blue-200">{t('company.common.email')}</EmailLink></div>)}</div><div className="mt-6 px-1"><CopyEmail /></div></div>
    <form onSubmit={submit} className="order-1 rounded-3xl lg:order-2 border border-white/10 bg-[#0b1425] p-6 sm:p-9"><Mail aria-hidden="true" className="size-6 text-blue-200" /><h2 className="mt-6 text-2xl font-medium tracking-tight text-white">{t('company.contact.formTitle')}</h2><div className="mt-8 grid gap-5 sm:grid-cols-2">
      <label htmlFor={`${id}-name`} className="space-y-2 text-sm text-slate-300"><span className="block">{t('company.contact.nameLabel')}</span><input id={`${id}-name`} name="name" autoComplete="name" required maxLength={100} className={fieldClass} /></label>
      <label htmlFor={`${id}-email`} className="space-y-2 text-sm text-slate-300"><span className="block">{t('company.contact.emailLabel')}</span><input id={`${id}-email`} name="email" type="email" autoComplete="email" required maxLength={254} className={fieldClass} dir="ltr" /></label>
      <label htmlFor={`${id}-topic`} className="space-y-2 text-sm text-slate-300 sm:col-span-2"><span className="block">{t('company.contact.topic')}</span><select id={`${id}-topic`} value={topic} onChange={event => setTopic(event.target.value)} className={fieldClass}>{['general', 'technical', 'security'].map(key => <option key={key} value={key}>{t(`company.contact.${key}`)}</option>)}</select></label>
      <label htmlFor={`${id}-message`} className="space-y-2 text-sm text-slate-300 sm:col-span-2"><span className="block">{t('company.contact.message')}</span><textarea id={`${id}-message`} name="message" required maxLength={4000} rows={6} className={cn(fieldClass, 'resize-y')} /></label>
    </div><button type="submit" className={cn(primaryClass, 'mt-6 w-full')}>{t('company.contact.prepare')}<ArrowUpRight aria-hidden="true" className="size-4" /></button><p className="mt-4 text-xs leading-6 text-slate-400">{t('company.contact.formNote')}</p></form>
  </div>;
}

function SupportContent() {
  const { t } = useLanguage();
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('all');
  const [open, setOpen] = useState(false);
  const mutation = useCreateTicketMutation({ onSuccess: () => setOpen(false) });
  const topics = [{ id: 1, category: 'access' }, { id: 2, category: 'leads' }, { id: 3, category: 'calls' }, { id: 4, category: 'access' }];
  const matches = topics.filter(topic => (category === 'all' || category === topic.category) && `${t(`experience.faq.q${topic.id}`)} ${t(`experience.faq.a${topic.id}`)}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase()));
  return <div className="grid items-start gap-8 lg:grid-cols-[1.3fr_.7fr] lg:gap-12">
    <section><div className="relative"><Search aria-hidden="true" className="pointer-events-none absolute start-4 top-4 size-5 text-slate-400" /><input type="search" aria-label={t('company.support.search')} placeholder={t('company.support.search')} value={query} onChange={event => setQuery(event.target.value)} className={cn(fieldClass, 'ps-12')} /></div>
      <div role="group" aria-label={t('company.support.all')} className="my-5 flex flex-wrap gap-2">{['all', 'access', 'leads', 'calls'].map(key => <button key={key} type="button" aria-pressed={category === key} onClick={() => setCategory(key)} className={cn('min-h-10 rounded-lg border px-3 text-xs font-medium transition-colors', category === key ? 'border-blue-200/25 bg-blue-200/10 text-blue-200' : 'border-white/10 text-slate-400 hover:bg-white/5 hover:text-white')}>{t(`company.support.${key}`)}</button>)}</div>
      <div aria-live="polite">{matches.length ? matches.map(topic => <details key={topic.id} className="group border-b border-white/10"><summary className="flex min-h-20 list-none items-center justify-between gap-4 py-5 text-sm font-medium text-slate-200 [&::-webkit-details-marker]:hidden">{t(`experience.faq.q${topic.id}`)}<ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform group-open:rotate-180" /></summary><p className="pb-6 pe-6 text-sm leading-7 text-slate-400">{t(`experience.faq.a${topic.id}`)}</p></details>) : <div className="rounded-2xl border border-dashed border-white/15 p-10 text-center"><BookOpen aria-hidden="true" className="mx-auto size-7 text-blue-200" /><h2 className="mt-4 text-base font-medium text-white">{t('company.support.noResults')}</h2><p className="mt-3 text-sm text-slate-400">{t('company.support.noResultsBody')}</p></div>}</div>
    </section>
    <aside className="space-y-4"><div className="rounded-2xl border border-blue-200/15 bg-[#0b1425] p-6"><LifeBuoy aria-hidden="true" className="size-6 text-blue-200" /><h2 className="mt-6 text-xl font-medium text-white">{t('company.support.ticket')}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{t('company.support.ticketBody')}</p>{isAuthenticated ? <button type="button" onClick={() => setOpen(true)} className={cn(primaryClass, 'mt-6 w-full')}>{t('company.support.ticket')}<ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" /></button> : <AuthAwareLink href="/support" className={cn(primaryClass, 'mt-6 w-full')}>{t('company.support.signIn')}<ArrowRight aria-hidden="true" className="size-4 rtl:rotate-180" /></AuthAwareLink>}<div className="mt-6"><CopyEmail /></div></div><div className="rounded-2xl border border-white/10 p-6"><h2 className="text-sm font-medium text-white">{t('company.support.include')}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{t('company.support.includeBody')}</p></div></aside>
    {open && <SupportFormSheet open={open} onOpenChange={setOpen} isSubmitting={mutation.isPending} onSubmit={payload => mutation.mutate(payload)} origin={{ originPlatform: 'web', originUrl: typeof window !== 'undefined' ? window.location.href : undefined }} />}
  </div>;
}

function SecurityContent() {
  const { t } = useLanguage();
  return <><div className="grid gap-4 sm:grid-cols-2">{[[LockKeyhole, 'access'], [Fingerprint, 'sessions'], [FileCheck2, 'records'], [Network, 'scope']].map(([Icon, key]) => <Reveal key={key} className="rounded-2xl border border-white/10 bg-white/[.02] p-6 sm:p-8"><span className="grid size-12 place-items-center rounded-xl border border-blue-200/15 bg-blue-200/5 text-blue-200"><Icon aria-hidden="true" className="size-5" /></span><h2 className="mt-6 text-xl font-medium text-white">{t(`company.security.${key}`)}</h2><p className="mt-3 text-sm leading-7 text-slate-400">{t(`company.security.${key}Body`)}</p></Reveal>)}</div><section className="mt-8 grid gap-8 rounded-3xl border border-blue-200/15 bg-[#0b1425] p-6 sm:p-10 lg:grid-cols-[1.25fr_.75fr]"><div><ShieldCheck aria-hidden="true" className="size-7 text-blue-200" /><h2 className="mt-6 text-2xl font-medium tracking-tight text-white">{t('company.security.reportTitle')}</h2><p className="mt-4 max-w-xl text-sm leading-7 text-slate-400">{t('company.security.reportBody')}</p><EmailLink primary subject="Updata security report" className="mt-6">{t('company.security.report')}</EmailLink></div><div className="border-t border-white/10 pt-6 lg:border-s lg:border-t-0 lg:ps-8 lg:pt-0"><h3 className="text-base font-medium text-white">{t('company.security.documents')}</h3><p className="mt-4 text-sm leading-7 text-slate-400">{t('company.security.documentsBody')}</p><Link href="/privacy" className={cn(linkClass, 'mt-6')}>{t('company.privacy.name')}<ArrowUpRight aria-hidden="true" className="size-4" /></Link></div></section></>;
}

function PolicyContent({ page }) {
  const { t } = useLanguage();
  const sections = page === 'privacy' ? ['data', 'use', 'providers', 'preferences', 'retention', 'requests'] : ['accounts', 'availability', 'ai', 'services', 'commercial', 'questions'];
  return <div className="grid items-start gap-10 lg:grid-cols-[.65fr_1.35fr] lg:gap-16"><aside className="lg:sticky lg:top-28"><p className="text-xs font-medium uppercase tracking-[.12em] text-slate-400">{t('company.common.onPage')}</p><nav aria-label={t('company.common.onPage')} className="mt-4 space-y-1 border-s border-white/10">{sections.map((key, index) => <a key={key} href={`#${key}`} className="flex min-h-11 items-center gap-3 rounded-e-lg px-4 py-2 text-sm text-slate-400 transition-colors hover:bg-white/5 hover:text-white"><span className="text-xs font-mono text-slate-500">0{index + 1}</span>{t(`company.${page}.${key}`)}</a>)}</nav><EmailLink subject={`Updata ${page} document request`} className="mt-6">{t('company.common.request')}</EmailLink></aside><div><div className="rounded-2xl border border-amber-200/15 bg-amber-200/[.035] p-5 sm:p-6"><p className="flex items-start gap-2 text-sm font-medium leading-6 text-amber-100"><FileCheck2 aria-hidden="true" className="mt-1 size-4 shrink-0" />{t(`company.${page}.notice`)}</p><p className="mt-3 text-sm leading-7 text-slate-400">{t(`company.${page}.noticeBody`)}</p></div><div className="mt-8 space-y-10">{sections.map((key, index) => <section id={key} key={key} className="scroll-mt-28 border-t border-white/10 pt-7"><p className="text-xs font-mono text-blue-300">0{index + 1}</p><h2 className="mt-3 text-xl font-medium tracking-tight text-white">{t(`company.${page}.${key}`)}</h2><p className="mt-4 text-sm leading-8 text-slate-400">{t(`company.${page}.${key}Body`)}</p></section>)}</div><div className="mt-10 border-t border-white/10 pt-6"><CopyEmail /></div></div></div>;
}

export function CompanyPage({ page }) {
  const { t } = useLanguage();
  return <div className="mx-auto max-w-[1280px] px-4 pb-20 pt-24 sm:px-6 sm:pb-28 sm:pt-28 lg:px-10">
    <CompanyNavigation current={page} />
    <header className="relative py-12 sm:py-16 lg:py-20"><p className="flex items-center gap-2 text-xs font-medium text-blue-200"><span aria-hidden="true" className="size-1.5 rounded-full bg-blue-300" />{t(`company.${page}.eyebrow`)}</p><h1 className="mt-6 max-w-4xl text-[clamp(2.2rem,4.5vw,3.8rem)] font-medium leading-[1.12] tracking-[-.04em] text-white rtl:tracking-normal">{t(`company.${page}.title`)}</h1><p className="mt-6 max-w-2xl text-base leading-8 text-slate-400">{t(`company.${page}.description`)}</p></header>
    {page === 'about' && <AboutContent />}{page === 'contact' && <ContactContent />}{page === 'support' && <SupportContent />}{page === 'security' && <SecurityContent />}{['privacy', 'terms'].includes(page) && <PolicyContent page={page} />}
    <section className="mt-20 border-t border-white/10 pt-8"><h2 className="text-xs font-medium uppercase tracking-[.12em] text-slate-400">{t('company.common.related')}</h2><div className="mt-5 grid gap-3 sm:grid-cols-3">{companyPages.filter(item => item !== page).slice(0, 3).map(item => <Link key={item} href={`/${item}`} className="group flex min-h-16 items-center justify-between gap-4 rounded-xl border border-white/10 bg-white/[.02] px-5 text-sm font-medium text-slate-200 transition-colors hover:border-blue-200/25 hover:bg-blue-200/5">{t(`company.${item}.name`)}<ArrowUpRight aria-hidden="true" className="size-4 text-blue-200 transition-transform group-hover:-translate-y-0.5" /></Link>)}</div></section>
  </div>;
}
