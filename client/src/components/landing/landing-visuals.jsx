'use client';

import Image from 'next/image';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  Bot,
  Building2,
  CalendarDays,
  Check,
  CheckSquare2,
  CircleUserRound,
  ContactRound,
  FileText,
  FolderKanban,
  LayoutDashboard,
  LoaderCircle,
  LockKeyhole,
  MapPin,
  MessageSquare,
  MoreHorizontal,
  Plus,
  Radar,
  Receipt,
  Search,
  Send,
  Sparkles,
  Users,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { DemoLabel } from './motion-primitives';
import { useLandingAuthGate } from './auth-aware-link';

const previewNavigation = [
  { key: 'dashboard', icon: LayoutDashboard },
  { key: 'leadgen', icon: Radar },
  { key: 'leads', icon: ContactRound },
  { key: 'customers', icon: Users },
  { key: 'projects', icon: FolderKanban },
  { key: 'tasks', icon: CheckSquare2 },
];

function ProductFrame({ children, active = 'dashboard', className, label }) {
  const { t } = useLanguage();
  return (
    <div className={cn('landing-product-frame overflow-hidden rounded-[22px] border border-white/[0.1] bg-[#0a1020] shadow-[0_30px_100px_rgba(0,0,0,.48)]', className)}>
      <div className="flex h-9 items-center gap-1.5 border-b border-white/[0.07] bg-white/[0.025] px-3">
        <span className="size-2 rounded-full bg-rose-400/80" />
        <span className="size-2 rounded-full bg-amber-300/80" />
        <span className="size-2 rounded-full bg-emerald-400/80" />
        <div className="mx-auto flex h-5 min-w-0 max-w-56 flex-1 items-center justify-center rounded-md border border-white/[0.05] bg-black/20 px-3 text-[8px] text-slate-500">
          app.updata.ai/{active === 'dashboard' ? 'dashboard' : active}
        </div>
        <span className="size-4" />
      </div>
      <div className="flex min-h-0">
        <aside className="hidden w-32 shrink-0 border-e border-white/[0.07] bg-[#080d19] p-2.5 sm:block">
          <div className="mb-4 flex items-center gap-2 px-1.5">
            <Image src="/updata-logo-dark.svg" alt="Updata ERP" width={220} height={56} className="h-6 w-auto" />
          </div>
          <div className="space-y-1">
            {previewNavigation.map((item) => {
              const Icon = item.icon;
              return (
                <div key={item.key} className={cn('flex items-center gap-2 rounded-md px-2 py-1.5 text-[8px]', active === item.key ? 'bg-blue-500/15 text-blue-300' : 'text-slate-500')}>
                  <Icon className="size-3" />
                  <span className="truncate">{t(`landing.ecosystem.${item.key}`)}</span>
                </div>
              );
            })}
          </div>
          <div className="mt-4 border-t border-white/[0.06] pt-3">
            <div className="flex items-center gap-2 px-2 text-[8px] text-slate-600"><Receipt className="size-3" />{t('landing.ecosystem.accounting')}</div>
          </div>
        </aside>
        <div className="min-w-0 flex-1">{children}</div>
      </div>
      {label ? <div className="absolute bottom-3 end-3"><DemoLabel>{label}</DemoLabel></div> : null}
    </div>
  );
}

function Metric({ label, value, color = 'blue', icon: Icon, active = false, onSelect }) {
  const colors = {
    blue: 'bg-blue-500/12 text-blue-300 ring-blue-400/20',
    cyan: 'bg-cyan-500/12 text-cyan-300 ring-cyan-400/20',
    emerald: 'bg-emerald-500/12 text-emerald-300 ring-emerald-400/20',
    amber: 'bg-amber-500/12 text-amber-300 ring-amber-400/20',
  };
  const Component = onSelect ? 'button' : 'div';
  return (
    <Component type={onSelect ? 'button' : undefined} onClick={onSelect} aria-pressed={onSelect ? active : undefined} className={cn('w-full rounded-xl border bg-white/[0.025] p-3 text-start transition-[border-color,background-color,transform] duration-200', active ? 'border-cyan-300/25 bg-blue-400/[0.07]' : 'border-white/[0.07]', onSelect && 'hover:-translate-y-0.5 hover:border-blue-300/20 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400')}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-[8px] uppercase tracking-[0.12em] text-slate-500">{label}</p>
          <p className="mt-2 text-lg font-semibold tracking-tight text-white">{value}</p>
        </div>
        {Icon ? <span className={cn('grid size-7 place-items-center rounded-lg ring-1', colors[color])}><Icon className="size-3.5" /></span> : null}
      </div>
    </Component>
  );
}

export function DashboardVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const [activeMetric, setActiveMetric] = useState('customers');
  const metricBars = {
    customers: [30, 48, 38, 68, 52, 78, 60, 88, 72, 93, 68, 82],
    projects: [42, 36, 58, 45, 72, 64, 84, 70, 90, 78, 86, 94],
    tasks: [64, 52, 74, 58, 82, 66, 92, 74, 86, 70, 96, 88],
    quotes: [34, 58, 46, 62, 54, 72, 66, 78, 70, 84, 76, 91],
  };
  const activeLabel = t(`landing.ecosystem.${activeMetric === 'quotes' ? 'quotes' : activeMetric}`);
  const content = (
    <div className="p-3 sm:p-4">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-[8px] font-medium uppercase tracking-[0.16em] text-blue-300">{t('experience.preview.overview')}</p>
          <p className="mt-1 text-sm font-semibold text-white">{t('experience.preview.business')}</p>
        </div>
        <div className="flex items-center gap-1.5"><span className="size-1.5 rounded-full bg-emerald-400" /><span className="text-[8px] text-slate-500">{t('experience.preview.live')}</span></div>
      </div>
      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Metric label={t('landing.ecosystem.customers')} value="2,847" color="cyan" icon={Users} active={activeMetric === 'customers'} onSelect={() => setActiveMetric('customers')} />
        <Metric label={t('landing.ecosystem.projects')} value="18" color="blue" icon={FolderKanban} active={activeMetric === 'projects'} onSelect={() => setActiveMetric('projects')} />
        <Metric label={t('landing.ecosystem.tasks')} value="43" color="emerald" icon={CheckSquare2} active={activeMetric === 'tasks'} onSelect={() => setActiveMetric('tasks')} />
        <Metric label={t('landing.ecosystem.quotes')} value="12" color="amber" icon={FileText} active={activeMetric === 'quotes'} onSelect={() => setActiveMetric('quotes')} />
      </div>
      <div className="mt-2 grid gap-2 lg:grid-cols-[1.35fr_.65fr]">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="flex items-center justify-between"><span className="text-[9px] font-semibold text-slate-300">{activeLabel} · Workflow activity</span><MoreHorizontal className="size-3 text-slate-600" /></div>
          <div className="mt-4 flex h-20 items-end gap-1.5" aria-hidden="true">
            {metricBars[activeMetric].map((height, index) => <div key={index} className="flex-1 rounded-t-sm bg-gradient-to-t from-blue-600/40 to-cyan-400/80 transition-[height] duration-500" style={{ height: `${height}%` }} />)}
          </div>
        </div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <p className="text-[9px] font-semibold text-slate-300">{t('experience.preview.today')}</p>
          <div className="mt-3 space-y-2">
            {[['09:30', 'Customer follow-up'], ['11:00', 'Project review'], ['14:15', 'Site visit']].map(([time, title], index) => (
              <div key={time} className="flex gap-2"><span className={cn('mt-1 size-1.5 shrink-0 rounded-full', index === 0 ? 'bg-blue-400' : index === 1 ? 'bg-cyan-400' : 'bg-sky-300')} /><div><p className="text-[8px] text-slate-300">{title}</p><p className="text-[7px] text-slate-600">{time}</p></div></div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
  return framed ? <ProductFrame active="dashboard" className={cn('relative', className)} label={t('landing.hero.previewLabel')}>{content}</ProductFrame> : content;
}

const businessSets = {
  restaurants: [
    { name: 'Osteria Verde', rating: '4.8', status: 'NEW', tags: 'italian restaurant pasta' },
    { name: 'Casa Milano', rating: '4.6', status: 'NEW', tags: 'italian restaurant pizza' },
    { name: 'Trattoria Roma', rating: '4.7', status: 'CRM', tags: 'italian restaurant trattoria' },
    { name: 'Bottega Centrale', rating: '4.5', status: 'NEW', tags: 'italian restaurant deli' },
  ],
  hotels: [
    { name: 'Hôtel Lumière', rating: '4.8', status: 'NEW', tags: 'hotel boutique suites' },
    { name: 'Maison Marais', rating: '4.6', status: 'NEW', tags: 'hotel design rooms' },
    { name: 'Le Central', rating: '4.4', status: 'CRM', tags: 'hotel business stay' },
    { name: 'Rive Gauche House', rating: '4.7', status: 'NEW', tags: 'hotel premium stay' },
  ],
  retail: [
    { name: 'Atelier Marché', rating: '4.7', status: 'NEW', tags: 'retail shop fashion' },
    { name: 'Maison Locale', rating: '4.5', status: 'NEW', tags: 'retail home goods' },
    { name: 'Galerie Neuve', rating: '4.8', status: 'CRM', tags: 'retail gallery design' },
    { name: 'Comptoir Bleu', rating: '4.6', status: 'NEW', tags: 'retail concept store' },
  ],
  services: [
    { name: 'Nova Services', rating: '4.8', status: 'NEW', tags: 'business services maintenance' },
    { name: 'ProTech Paris', rating: '4.6', status: 'NEW', tags: 'business services technology' },
    { name: 'Atelier Solutions', rating: '4.5', status: 'CRM', tags: 'business services consulting' },
    { name: 'Service Direct', rating: '4.7', status: 'NEW', tags: 'business services field work' },
  ],
};

export function LeadGenerationVisual({ className, framed = true, compact = false }) {
  const { t } = useLanguage();
  const router = useRouter();
  const { isAuthenticated, isLoading: isAuthLoading, requireAuth } = useLandingAuthGate('/lead-generation');
  const timerRef = useRef(null);
  const [location, setLocation] = useState('Paris, France');
  const [radius, setRadius] = useState(5);
  const [category, setCategory] = useState('restaurants');
  const [keyword, setKeyword] = useState('Italian');
  const [mapCenter, setMapCenter] = useState({ x: 70, y: 45 });
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [hasResults, setHasResults] = useState(true);
  const [selected, setSelected] = useState(() => new Set());

  const results = useMemo(() => {
    const query = keyword.trim().toLowerCase();
    const source = businessSets[category] || businessSets.restaurants;
    return source.filter((business) => !query || `${business.name} ${business.tags}`.toLowerCase().includes(query));
  }, [category, keyword]);

  useEffect(() => () => clearTimeout(timerRef.current), []);

  const invalidateResults = () => {
    clearTimeout(timerRef.current);
    setIsAnalyzing(false);
    setHasResults(false);
    setSelected(new Set());
  };

  const analyzeArea = (event) => {
    event?.preventDefault();
    clearTimeout(timerRef.current);
    setSelected(new Set());
    setHasResults(false);
    setIsAnalyzing(true);
    timerRef.current = setTimeout(() => {
      setIsAnalyzing(false);
      setHasResults(true);
    }, 850);
  };

  const selectArea = (nextCenter) => {
    setMapCenter(nextCenter);
    invalidateResults();
  };

  const toggleBusiness = (business) => {
    if (business.status === 'CRM') return;
    requireAuth(() => {
      setSelected((current) => {
        const next = new Set(current);
        if (next.has(business.name)) next.delete(business.name);
        else next.add(business.name);
        return next;
      });
    });
  };

  const selectAll = () => {
    requireAuth(() => {
      setSelected(new Set(results.filter((business) => business.status !== 'CRM').map((business) => business.name)));
    });
  };

  const openLeadGeneration = () => requireAuth(() => router.push('/lead-generation'));
  const shownResults = results.slice(0, compact ? 2 : 4);
  const content = (
    <div className={cn('grid min-h-[360px] bg-[#0b1120]', compact ? 'grid-rows-[auto_300px] md:grid-cols-[.9fr_1.25fr] md:grid-rows-none' : 'grid-rows-[auto_380px] lg:grid-cols-[.82fr_1.18fr] lg:grid-rows-none')}>
      <form onSubmit={analyzeArea} className="border-b border-white/[0.07] p-3 sm:p-4 lg:border-b-0 lg:border-e">
        <div className="flex items-center justify-between gap-3"><div className="flex items-center gap-2"><span className="grid size-7 place-items-center rounded-lg bg-blue-500/12 text-blue-300"><Radar className="size-3.5" /></span><div><p className="text-[10px] font-semibold text-white">{t('landing.ecosystem.leadgen')}</p><p className="text-[7px] text-slate-600">{t('landing.leadgen.interactiveDemo')}</p></div></div><span className="rounded-full border border-cyan-300/15 bg-cyan-400/[0.06] px-2 py-1 text-[6px] font-semibold uppercase tracking-[0.12em] text-cyan-300">{t('landing.leadgen.liveDemo')}</span></div>
        <div className="mt-4 flex gap-1" aria-hidden="true">{[0, 1, 2, 3].map((step) => <span key={step} className={cn('h-1 flex-1 rounded-full transition-colors duration-300', isAnalyzing ? 'animate-pulse bg-cyan-400' : hasResults || step < 2 ? 'bg-blue-500' : 'bg-white/[0.08]')} />)}</div>
        <div className="mt-4 space-y-3">
          <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-600">{t('landing.leadgen.locationLabel')}</span><span className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 focus-within:border-blue-400/40"><MapPin className="size-3 shrink-0 text-slate-500" /><input value={location} onChange={(event) => { setLocation(event.target.value); invalidateResults(); }} className="min-w-0 flex-1 bg-transparent text-[8px] text-slate-200 outline-none placeholder:text-slate-600" aria-label={t('landing.leadgen.locationLabel')} /></span></label>
          <label className="block"><span className="flex items-center justify-between text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-600"><span>{t('landing.leadgen.areaLabel')}</span><span className="text-blue-300">{radius} km</span></span><span className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5"><Radar className="size-3 shrink-0 text-slate-500" /><input type="range" min="1" max="20" value={radius} onChange={(event) => { setRadius(Number(event.target.value)); invalidateResults(); }} className="h-1 min-w-0 flex-1 cursor-pointer accent-blue-500" aria-label={t('landing.leadgen.areaLabel')} /></span></label>
          <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-600">{t('landing.leadgen.typeLabel')}</span><span className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 focus-within:border-blue-400/40"><Building2 className="size-3 shrink-0 text-slate-500" /><select value={category} onChange={(event) => { setCategory(event.target.value); setKeyword(''); invalidateResults(); }} className="min-w-0 flex-1 appearance-none bg-transparent text-[8px] text-slate-200 outline-none" aria-label={t('landing.leadgen.typeLabel')}><option className="bg-[#0b1120]" value="restaurants">{t('landing.leadgen.typeRestaurants')}</option><option className="bg-[#0b1120]" value="hotels">{t('landing.leadgen.typeHotels')}</option><option className="bg-[#0b1120]" value="retail">{t('landing.leadgen.typeRetail')}</option><option className="bg-[#0b1120]" value="services">{t('landing.leadgen.typeServices')}</option></select></span></label>
          <label className="block"><span className="text-[7px] font-semibold uppercase tracking-[0.12em] text-slate-600">{t('landing.leadgen.keywordLabel')}</span><span className="mt-1 flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-white/[0.03] px-2.5 focus-within:border-blue-400/40"><Search className="size-3 shrink-0 text-slate-500" /><input value={keyword} onChange={(event) => { setKeyword(event.target.value); invalidateResults(); }} placeholder={t('landing.leadgen.keywordPlaceholder')} className="min-w-0 flex-1 bg-transparent text-[8px] text-slate-200 outline-none placeholder:text-slate-600" aria-label={t('landing.leadgen.keywordLabel')} /></span></label>
        </div>
        <button type="submit" disabled={isAnalyzing || !location.trim()} className="mt-4 flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-blue-500 text-[8px] font-semibold text-white shadow-[0_8px_30px_rgba(59,130,246,.25)] transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-55">{isAnalyzing ? <LoaderCircle className="size-3 animate-spin" /> : <Sparkles className="size-3" />}{isAnalyzing ? t('landing.leadgen.scanning') : t('landing.leadgen.analyzeAction')}</button>
      </form>
      <div className="relative min-w-0 overflow-hidden bg-[#0d1725]">
        <MapCanvas location={location} radius={radius} center={mapCenter} onSelectArea={selectArea} isAnalyzing={isAnalyzing} t={t} />
        <div className="absolute inset-x-2 bottom-2 z-20 rounded-xl border border-white/[0.1] bg-[#090f1c]/95 p-2 shadow-2xl backdrop-blur sm:inset-x-3 sm:bottom-3">
          <div className="mb-2 flex items-center justify-between gap-2"><div><p className="text-[8px] font-semibold text-white">{t('landing.leadgen.results')}</p><p className="text-[7px] text-slate-600" aria-live="polite">{isAnalyzing ? t('landing.leadgen.scanning') : hasResults ? `${results.length} ${t('landing.leadgen.resultCount')}` : t('landing.leadgen.readyHint')}</p></div><div className="flex items-center gap-1.5">{selected.size > 0 ? <button type="button" onClick={openLeadGeneration} className="rounded-md border border-cyan-300/25 bg-cyan-400/10 px-2 py-1 text-[7px] font-semibold text-cyan-200">{t('landing.leadgen.importSelected')} ({selected.size})</button> : null}<button type="button" disabled={!hasResults || results.length === 0 || isAuthLoading} onClick={selectAll} className="inline-flex items-center gap-1 rounded-md bg-blue-500 px-2 py-1 text-[7px] font-semibold text-white transition-colors hover:bg-blue-400 disabled:cursor-not-allowed disabled:opacity-50">{!isAuthLoading ? null : <LoaderCircle className="size-2.5 animate-spin" />}{t('landing.leadgen.addAll')}</button></div></div>
          {hasResults && shownResults.length ? <div className="grid grid-cols-2 gap-1.5">
            {shownResults.map((business) => {
              const isSelected = selected.has(business.name);
              return (
                <div key={business.name} className={cn('flex min-w-0 items-center gap-2 rounded-lg border p-2 transition-colors', isSelected ? 'border-cyan-300/25 bg-cyan-400/[0.07]' : 'border-white/[0.06] bg-white/[0.03]')}>
                  <span className="grid size-6 shrink-0 place-items-center rounded-md bg-blue-400/10 text-blue-300"><Building2 className="size-3" /></span>
                  <div className="min-w-0 flex-1"><p className="truncate text-[7px] font-medium text-slate-200">{business.name}</p><p className="mt-0.5 text-[6px] text-slate-600">★ {business.rating} · {business.status === 'CRM' ? t('landing.leadgen.inCrm') : isSelected ? t('landing.leadgen.selected') : t('landing.leadgen.newLead')}</p></div>
                  {business.status === 'CRM' ? <Check className="size-3 shrink-0 text-emerald-400" /> : <button type="button" onClick={() => toggleBusiness(business)} disabled={isAuthLoading} className="grid size-6 shrink-0 place-items-center rounded-md text-blue-300 transition-colors hover:bg-blue-400/10 hover:text-white focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-blue-400" aria-label={`${t('landing.leadgen.add')} ${business.name}`}>{isAuthLoading ? <LoaderCircle className="size-3 animate-spin" /> : isSelected ? <Check className="size-3 text-cyan-300" /> : <Plus className="size-3" />}</button>}
                </div>
              );
            })}
          </div> : <div className="grid min-h-16 place-items-center rounded-lg border border-dashed border-white/[0.08] bg-black/10 px-4 text-center"><p className="text-[8px] text-slate-500">{isAnalyzing ? t('landing.leadgen.scanning') : hasResults ? t('landing.leadgen.noResults') : t('landing.leadgen.readyHint')}</p></div>}
          {!isAuthLoading && !isAuthenticated ? <p className="mt-2 flex items-center justify-end gap-1 text-[6px] text-slate-600"><LockKeyhole className="size-2.5" />{t('landing.leadgen.loginToAdd')}</p> : null}
        </div>
      </div>
    </div>
  );
  return framed ? <ProductFrame active="leadgen" className={cn('relative', className)} label={t('landing.leadgen.interactiveDemo')}>{content}</ProductFrame> : content;
}

function MapCanvas({ location, radius, center, onSelectArea, isAnalyzing, t }) {
  const markerOffsets = [[-13, -10], [0, -18], [12, -7], [-10, 9], [10, 12]];
  const diameter = Math.min(230, 100 + radius * 7);
  const moveCenter = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    onSelectArea({
      x: Math.max(18, Math.min(86, ((event.clientX - rect.left) / rect.width) * 100)),
      y: Math.max(18, Math.min(68, ((event.clientY - rect.top) / rect.height) * 100)),
    });
  };

  const moveWithKeyboard = (event) => {
    const movement = { ArrowLeft: [-4, 0], ArrowRight: [4, 0], ArrowUp: [0, -4], ArrowDown: [0, 4] }[event.key];
    if (!movement) return;
    event.preventDefault();
    onSelectArea({ x: Math.max(18, Math.min(86, center.x + movement[0])), y: Math.max(18, Math.min(68, center.y + movement[1])) });
  };

  return (
    <div className="absolute inset-0 overflow-hidden">
      <Image src="/landing/lead-discovery-map-blue.png" alt="" fill sizes="(min-width: 1024px) 42vw, 60vw" className="object-cover object-[62%_center] opacity-80" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(7,13,25,.78),rgba(7,13,25,.08)_48%,rgba(7,13,25,.18))]" />
      <button type="button" onClick={moveCenter} onKeyDown={moveWithKeyboard} aria-label={t('landing.leadgen.mapInstruction')} className="absolute inset-0 z-[1] cursor-crosshair focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-blue-400">
        <span className={cn('absolute -translate-x-1/2 -translate-y-1/2 rounded-full border border-cyan-300/70 bg-blue-500/[0.09] shadow-[0_0_45px_rgba(59,130,246,.18)] transition-[left,top,width,height] duration-300', isAnalyzing && 'animate-pulse')} style={{ left: `${center.x}%`, top: `${center.y}%`, width: diameter, height: diameter }} />
        <span className="absolute size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-blue-500 shadow-[0_0_0_7px_rgba(59,130,246,.2)] transition-[left,top] duration-300" style={{ left: `${center.x}%`, top: `${center.y}%` }} />
      </button>
      {markerOffsets.map(([offsetX, offsetY], index) => (
        <span key={index} className="landing-map-marker pointer-events-none absolute z-[2] grid size-5 -translate-x-1/2 -translate-y-full place-items-center rounded-full border-2 border-[#0d1725] bg-blue-500 shadow-[0_0_0_5px_rgba(59,130,246,.12)]" style={{ left: `${Math.max(8, Math.min(92, center.x + offsetX))}%`, top: `${Math.max(14, Math.min(72, center.y + offsetY))}%`, animationDelay: `${index * 120}ms` }}><MapPin className="size-2.5 fill-white text-white" /></span>
      ))}
      <div className="pointer-events-none absolute start-3 top-3 z-[3] flex h-8 w-[min(240px,70%)] items-center gap-2 rounded-lg border border-white/[0.08] bg-[#09101c]/90 px-3 text-[8px] text-slate-400 shadow-xl"><Search className="size-3" /><span className="truncate">{location || t('landing.leadgen.locationLabel')}</span><span className="ms-auto shrink-0 text-blue-300">{radius} km</span></div>
      <p className="pointer-events-none absolute end-3 top-4 z-[3] hidden rounded-full bg-[#07101f]/75 px-2 py-1 text-[6px] font-semibold uppercase tracking-[0.12em] text-cyan-200 backdrop-blur sm:block">{t('landing.leadgen.mapInstruction')}</p>
    </div>
  );
}

const leadRows = [
  ['Maison Junot', 'qualified', 'maps', 'AM'],
  ['Atelier Breton', 'contacted', 'manual', 'SK'],
  ['Nova Services', 'opportunity', 'maps', 'ML'],
  ['Studio Marais', 'new', 'maps', '—'],
];

export function LeadsVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const content = (
    <div className="p-3 sm:p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><p className="text-sm font-semibold text-white">{t('landing.ecosystem.leads')}</p><p className="mt-1 text-[8px] text-slate-600">{t('experience.preview.relationship')}</p></div>
        <div className="flex gap-1.5"><div className="flex h-7 items-center gap-1.5 rounded-lg border border-white/[0.08] px-2 text-[7px] text-slate-500"><Search className="size-3" />{t('experience.preview.search')}</div><div className="grid size-7 place-items-center rounded-lg bg-blue-500 text-white"><Plus className="size-3" /></div></div>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
        <div className="grid grid-cols-[1.3fr_.85fr_.75fr_.42fr_.7fr] gap-2 border-b border-white/[0.06] bg-white/[0.025] px-3 py-2 text-[7px] uppercase tracking-wider text-slate-600">
          <span>{t('landing.crm.table.lead')}</span><span>{t('landing.crm.table.status')}</span><span>{t('landing.crm.table.source')}</span><span>{t('landing.crm.table.owner')}</span><span>{t('landing.crm.table.contact')}</span>
        </div>
        {leadRows.map(([name, status, source, owner], index) => (
          <div key={name} className="grid grid-cols-[1.3fr_.85fr_.75fr_.42fr_.7fr] items-center gap-2 border-b border-white/[0.05] px-3 py-2.5 text-[7px] last:border-b-0">
            <div className="flex min-w-0 items-center gap-2"><span className="grid size-6 shrink-0 place-items-center rounded-md bg-blue-500/10 text-blue-300"><Building2 className="size-3" /></span><span className="truncate font-medium text-slate-200">{name}</span></div>
            <span className={cn('w-fit rounded-full px-2 py-1 font-medium', status === 'qualified' ? 'bg-cyan-400/10 text-cyan-300' : status === 'contacted' ? 'bg-sky-400/10 text-sky-300' : status === 'opportunity' ? 'bg-blue-400/10 text-blue-200' : 'bg-blue-400/10 text-blue-300')}>{t(`landing.crm.status.${status}`)}</span>
            <span className="truncate text-slate-500">{t(`landing.crm.source.${source}`)}</span>
            <span className="grid size-6 place-items-center rounded-full bg-white/[0.06] text-[6px] font-bold text-slate-400">{owner}</span>
            <span className="text-slate-500">{index < 2 ? t('landing.crm.today') : t('landing.crm.yesterday')}</span>
          </div>
        ))}
      </div>
    </div>
  );
  return framed ? <ProductFrame active="leads" className={cn('relative', className)} label={t('landing.crm.demo')}>{content}</ProductFrame> : content;
}

export function OperationsVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const cards = [
    [FileText, 'landing.operations.quoteLabel', 'landing.operations.quoteDetail', 'text-amber-300 bg-amber-400/10'],
    [Receipt, 'landing.operations.orderLabel', 'landing.operations.orderDetail', 'text-orange-300 bg-orange-400/10'],
    [FolderKanban, 'landing.operations.projectLabel', 'landing.operations.projectDetail', 'text-blue-300 bg-blue-400/10'],
  ];
  const content = (
    <div className="p-3 sm:p-4">
      <div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">{t('landing.operations.projectLabel')}</p><p className="mt-1 text-[8px] text-slate-600">{t('experience.preview.deliveryFlow')}</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[7px] font-semibold text-emerald-300">{t('experience.preview.onTrack')}</span></div>
      <div className="mt-4 grid gap-2 sm:grid-cols-3">
        {cards.map(([Icon, title, desc, color], index) => (
          <div key={title} className="relative rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
            <div className={cn('grid size-7 place-items-center rounded-lg', color)}><Icon className="size-3.5" /></div>
            <p className="mt-3 text-[9px] font-semibold text-slate-200">{t(title)}</p><p className="mt-1 text-[7px] leading-4 text-slate-600">{t(desc)}</p>
            {index < cards.length - 1 ? <span className="absolute -end-[7px] top-1/2 z-10 size-3 rotate-45 border-e border-t border-white/[0.12] bg-[#0c1322]" /> : null}
          </div>
        ))}
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[1.25fr_.75fr]">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><div className="flex justify-between text-[8px]"><span className="font-semibold text-slate-300">{t('landing.operations.progress')}</span><span className="text-blue-300">68%</span></div><div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/[0.06]"><div className="h-full w-[68%] rounded-full bg-gradient-to-r from-blue-500 to-cyan-400" /></div><div className="mt-3 grid grid-cols-3 gap-1 text-[7px] text-slate-600"><span>{t('experience.preview.planning')}</span><span className="text-center">{t('experience.preview.delivery')}</span><span className="text-end">{t('experience.preview.closeout')}</span></div></div>
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[8px] text-slate-600">{t('landing.operations.deadline')}</p><div className="mt-2 flex items-center gap-2"><CalendarDays className="size-4 text-cyan-300" /><div><p className="text-[9px] font-semibold text-slate-200">{t('experience.preview.handoff')}</p><p className="text-[7px] text-slate-600">{t('experience.preview.thursday')}</p></div></div></div>
      </div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[.82fr_1.18fr]">
        <div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3">
          <div className="flex items-center justify-between"><p className="text-[8px] font-semibold text-slate-300">{t('landing.ecosystem.tasks')}</p><span className="text-[7px] text-blue-300">{t('experience.preview.active')}</span></div>
          <div className="mt-2 space-y-1.5">
            {['Confirm site requirements', 'Prepare delivery schedule', 'Assign installation team'].map((item, index) => <div key={item} className="flex items-center gap-2 rounded-lg bg-black/15 px-2 py-1.5"><span className={cn('size-1.5 rounded-full', index === 2 ? 'bg-cyan-300' : 'bg-blue-400')} /><span className="min-w-0 flex-1 truncate text-[7px] text-slate-400">{item}</span><span className="grid size-4 place-items-center rounded-full bg-white/[0.06] text-[5px] font-semibold text-slate-400">{['SK', 'AM', 'ML'][index]}</span></div>)}
          </div>
        </div>
        <div className="relative min-h-28 overflow-hidden rounded-xl border border-blue-300/[0.12] bg-[#071427]">
          <Image src="/landing/operations-workflow-blue.png" alt="" fill sizes="(min-width: 1024px) 35vw, 60vw" className="object-cover object-center opacity-65" />
          <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(5,12,25,.38),transparent_45%,rgba(5,12,25,.18))]" />
          <div className="absolute inset-x-3 bottom-2 flex items-center justify-between text-[6px] font-semibold uppercase tracking-[0.14em] text-blue-100/70"><span>{t('landing.operations.lead')}</span><span>{t('landing.operations.quote')}</span><span>{t('landing.operations.order')}</span><span>{t('landing.operations.project')}</span><span>{t('landing.operations.completion')}</span></div>
        </div>
      </div>
    </div>
  );
  return framed ? <ProductFrame active="projects" className={cn('relative', className)} label={t('landing.operations.demo')}>{content}</ProductFrame> : content;
}

export function CustomerVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const content = (
    <div className="p-3 sm:p-4">
      <div className="flex items-start justify-between"><div className="flex items-center gap-3"><span className="grid size-10 place-items-center rounded-xl bg-cyan-400/10 text-cyan-300"><Building2 className="size-5" /></span><div><p className="text-sm font-semibold text-white">Weber Building Tech AG</p><p className="mt-1 text-[8px] text-slate-600">{t('experience.preview.customerLocation')}</p></div></div><MoreHorizontal className="size-4 text-slate-600" /></div>
      <div className="mt-4 grid grid-cols-3 gap-2"><Metric label="Active projects" value="3" icon={FolderKanban} /><Metric label="Open quotes" value="2" color="amber" icon={FileText} /><Metric label="Sites" value="4" color="emerald" icon={MapPin} /></div>
      <div className="mt-2 grid gap-2 sm:grid-cols-[.8fr_1.2fr]"><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[8px] font-semibold text-slate-300">{t('experience.preview.primaryContact')}</p><div className="mt-3 flex items-center gap-2"><CircleUserRound className="size-6 text-blue-300" /><div><p className="text-[8px] text-slate-200">Lea Weber</p><p className="text-[7px] text-slate-600">{t('experience.preview.director')}</p></div></div></div><div className="rounded-xl border border-white/[0.07] bg-white/[0.025] p-3"><p className="text-[8px] font-semibold text-slate-300">{t('experience.preview.recent')}</p><div className="mt-3 space-y-2">{['Quote prepared', 'Site visit completed', 'Project note added'].map((item, i) => <div key={item} className="flex items-center gap-2 text-[7px] text-slate-500"><span className={cn('size-1.5 rounded-full', i === 0 ? 'bg-emerald-400' : 'bg-blue-400')} />{item}<span className="ms-auto text-slate-700">{i + 1}d</span></div>)}</div></div></div>
    </div>
  );
  return framed ? <ProductFrame active="customers" className={cn('relative', className)} label={t('landing.showcase.demo')}>{content}</ProductFrame> : content;
}

export function AiVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const content = (
    <div className="p-3 sm:p-4">
      <div className="flex items-center gap-2 border-b border-white/[0.07] pb-3"><span className="grid size-8 place-items-center rounded-lg bg-blue-500/12 text-blue-300"><Sparkles className="size-4" /></span><div><p className="text-[10px] font-semibold text-white">{t('landing.ai.assistant')}</p><p className="text-[7px] text-cyan-300">● {t('landing.hero.signal.ai')}</p></div></div>
      <div className="mt-4 space-y-3">
        <div className="ms-auto max-w-[82%] rounded-2xl rounded-ee-md bg-blue-500 px-3 py-2.5 text-[8px] leading-4 text-white">{t('landing.ai.prompt')}</div>
        <div className="max-w-[90%] rounded-2xl rounded-es-md border border-white/[0.07] bg-white/[0.035] p-3">
          <div className="flex items-center gap-2 text-[8px] font-semibold text-cyan-300"><Bot className="size-3.5" />{t('landing.ai.assistant')}</div>
          <p className="mt-2 text-[8px] leading-4 text-slate-400">{t('landing.ai.answer')}</p>
          <div className="mt-3 grid grid-cols-3 gap-1.5">{[['18', 'landing.ai.new', 'text-cyan-300'], ['9', 'landing.ai.existing', 'text-emerald-300'], ['5', 'landing.ai.review', 'text-amber-300']].map(([value, label, color]) => <div key={label} className="rounded-lg bg-black/20 p-2"><p className={cn('text-sm font-semibold', color)}>{value}</p><p className="mt-0.5 text-[6px] text-slate-600">{t(label)}</p></div>)}</div>
          <div className="mt-3 flex flex-wrap gap-1.5">{['landing.ai.open', 'landing.ai.followup', 'landing.ai.assign'].map((action, index) => <span key={action} className={cn('rounded-md border px-2 py-1 text-[7px] font-medium', index === 0 ? 'border-blue-400/30 bg-blue-500/10 text-blue-300' : 'border-white/[0.08] text-slate-400')}>{t(action)}</span>)}</div>
        </div>
      </div>
      <div className="mt-3 flex h-8 items-center gap-2 rounded-lg border border-white/[0.08] bg-black/10 px-3 text-[7px] text-slate-600">{t('experience.preview.ask')}<Send className="ms-auto size-3 text-blue-400" /></div>
    </div>
  );
  return framed ? <ProductFrame active="ai" className={cn('relative', className)} label={t('landing.ai.demo')}>{content}</ProductFrame> : content;
}

export function TasksVisual({ className, framed = true }) {
  const { t } = useLanguage();
  const cols = [['Open', ['Call restaurant leads', 'Review quote']], ['In progress', ['Prepare site plan', 'Update customer']], ['Done', ['Assign project', 'Confirm meeting']]];
  const content = <div className="p-3 sm:p-4"><div className="flex items-center justify-between"><div><p className="text-sm font-semibold text-white">{t('landing.ecosystem.tasks')}</p><p className="mt-1 text-[8px] text-slate-600">{t('experience.preview.views')}</p></div><span className="flex h-7 items-center gap-1 rounded-lg bg-blue-500 px-2 text-[7px] font-semibold text-white"><Plus className="size-3" />{t('experience.preview.task')}</span></div><div className="mt-4 grid grid-cols-3 gap-2">{cols.map(([title, items], index) => <div key={title} className="rounded-xl border border-white/[0.07] bg-white/[0.02] p-2"><div className="flex items-center gap-1.5 text-[8px] font-semibold text-slate-400"><span className={cn('size-1.5 rounded-full', index === 0 ? 'bg-slate-500' : index === 1 ? 'bg-blue-400' : 'bg-cyan-400')} />{title}</div><div className="mt-2 space-y-1.5">{items.map((item, itemIndex) => <div key={item} className="rounded-lg border border-white/[0.06] bg-[#0d1422] p-2"><p className="text-[7px] leading-3 text-slate-300">{item}</p><div className="mt-2 flex items-center"><span className={cn('rounded px-1 py-0.5 text-[5px]', itemIndex ? 'bg-cyan-400/10 text-cyan-300' : 'bg-blue-400/10 text-blue-300')}>{itemIndex ? 'PROJECT' : 'CRM'}</span><CircleUserRound className="ms-auto size-3 text-slate-600" /></div></div>)}</div></div>)}</div></div>;
  return framed ? <ProductFrame active="tasks" className={cn('relative', className)} label={t('landing.showcase.demo')}>{content}</ProductFrame> : content;
}

export { ProductFrame };
