'use client';

import { useState } from 'react';
import {
  Building2, FolderKanban, Receipt, Users, BarChart3,
  ArrowRight, Check,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useIntersection } from '@/shared/hooks/use-intersection';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import Link from 'next/link';

const moduleConfigs = [
  { key: 'crm', icon: Building2, mockup: CrmMockup },
  { key: 'pm', icon: FolderKanban, mockup: ProjectMockup },
  { key: 'accounting', icon: Receipt, mockup: AccountingMockup },
];

function CrmMockup({ t }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-xl shadow-black/5 overflow-hidden">
      <div className="border-b bg-muted/30 px-5 py-3.5 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-[#7B61FF] to-[#5B3FD4] flex items-center justify-center">
          <Building2 className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold">{t('mockup.crm.name')}</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center gap-3">
          <div className="h-12 w-12 rounded-xl bg-gradient-to-br from-primary/10 to-[#9F7AEA]/10 flex items-center justify-center">
            <Users className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm font-semibold">{t('mockup.crm.name')}</p>
            <p className="text-xs text-muted-foreground">{t('mockup.crm.location')}</p>
          </div>
        </div>
        <div className="grid grid-cols-3 gap-2">
          {[
            { label: t('mockup.crm.projects'), value: '12' },
            { label: t('mockup.crm.offers'), value: 'CHF 245k' },
            { label: t('mockup.crm.lastContact'), value: t('mockup.crm.today') },
          ].map((item) => (
            <div key={item.label} className="rounded-xl bg-muted/50 p-2.5 text-center">
              <p className="text-[0.65rem] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-bold mt-0.5">{item.value}</p>
            </div>
          ))}
        </div>
        <div className="space-y-2.5 pt-1">
          {[t('mockup.crm.activity1'), t('mockup.crm.activity2'), t('mockup.crm.activity3')].map((activity, i) => (
            <div key={activity} className="flex items-center gap-2.5 text-xs">
              <div className={cn('h-2 w-2 rounded-full', i === 0 ? 'bg-success' : i === 1 ? 'bg-primary/40' : 'bg-muted-foreground/20')} />
              <span className="text-muted-foreground">{activity}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ProjectMockup({ t }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-xl shadow-black/5 overflow-hidden">
      <div className="border-b bg-muted/30 px-5 py-3.5 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center">
          <FolderKanban className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold">{t('mockup.pm.title')}</span>
      </div>
      <div className="p-5">
        <div className="grid grid-cols-3 gap-2.5">
          {[
            { title: t('mockup.pm.open'), items: [t('mockup.pm.task1'), t('mockup.pm.task2')], color: 'bg-muted-foreground/25' },
            { title: t('mockup.pm.inProgress'), items: [t('mockup.pm.task3'), t('mockup.pm.task4')], color: 'bg-primary' },
            { title: t('mockup.pm.done'), items: [t('mockup.pm.task5'), t('mockup.pm.task6')], color: 'bg-success' },
          ].map((col) => (
            <div key={col.title} className="space-y-2">
              <div className="flex items-center gap-1.5 mb-2.5">
                <div className={cn('h-2 w-2 rounded-full', col.color)} />
                <span className="text-[0.7rem] font-semibold">{col.title}</span>
              </div>
              {col.items.map((item) => (
                <div key={item} className="rounded-lg border border-border/30 bg-background/80 p-2.5 text-[0.75rem] font-medium hover:shadow-sm transition-shadow">
                  {item}
                </div>
              ))}
            </div>
          ))}
        </div>
        <div className="mt-4 flex items-center gap-2.5">
          <div className="flex-1 rounded-full bg-muted h-2 overflow-hidden">
            <div className="h-full rounded-full bg-gradient-to-r bg-primary-gradient w-3/5 transition-all" />
          </div>
          <span className="text-xs font-bold text-primary">60%</span>
        </div>
      </div>
    </div>
  );
}

function AccountingMockup({ t }) {
  return (
    <div className="rounded-2xl border border-border/40 bg-card shadow-xl shadow-black/5 overflow-hidden">
      <div className="border-b bg-muted/30 px-5 py-3.5 flex items-center gap-2.5">
        <div className="h-7 w-7 rounded-lg bg-gradient-to-br from-emerald-500 to-green-600 flex items-center justify-center">
          <Receipt className="h-3.5 w-3.5 text-white" />
        </div>
        <span className="text-sm font-semibold">{t('mockup.accounting.title')}</span>
      </div>
      <div className="p-5 space-y-4">
        <div className="grid grid-cols-2 gap-2.5">
          {[
            { label: t('mockup.accounting.revenue'), value: 'CHF 87,400', change: '+12%', positive: true },
            { label: t('mockup.accounting.openInvoices'), value: 'CHF 23,100', change: t('mockup.accounting.invoiceCount'), positive: false },
          ].map((item) => (
            <div key={item.label} className="rounded-xl border border-border/30 p-3">
              <p className="text-[0.65rem] text-muted-foreground">{item.label}</p>
              <p className="text-sm font-bold mt-1">{item.value}</p>
              <p className={cn('text-[0.7rem] mt-0.5 font-medium', item.positive ? 'text-success' : 'text-warning')}>
                {item.change}
              </p>
            </div>
          ))}
        </div>
        <div className="flex items-end gap-1 h-16 px-1">
          {[35, 60, 40, 75, 50, 65, 85, 55, 70, 80, 45, 90].map((h, i) => (
            <div key={i} className="flex-1 rounded-sm overflow-hidden bg-primary/10" style={{ height: `${h}%` }}>
              <div className="w-full h-full rounded-sm bg-gradient-to-t from-primary to-[#9F7AEA]" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function ModuleBlock({ config, index }) {
  const [ref, isInView] = useIntersection({ threshold: 0.1 });
  const { t } = useLanguage();
  const isReversed = index % 2 === 1;
  const Mockup = config.mockup;
  const featureKeys = [`modules.${config.key}.f1`, `modules.${config.key}.f2`, `modules.${config.key}.f3`, `modules.${config.key}.f4`];

  return (
    <div
      ref={ref}
      className={cn(
        'grid gap-12 lg:grid-cols-2 lg:gap-20 items-center transition-all duration-700',
        isInView ? 'animate-in fade-in slide-in-from-bottom-8' : 'opacity-0',
      )}
    >
      <div className={cn(isReversed && 'lg:order-2')}>
        <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/10 px-3.5 py-1.5 text-[0.75rem] font-semibold text-primary mb-5">
          <config.icon className="h-3.5 w-3.5" />
          {t(`modules.${config.key}.tag`)}
        </div>
        <h3 className="text-2xl font-extrabold tracking-tight sm:text-3xl lg:text-[2rem]">
          {t(`modules.${config.key}.title`)}
        </h3>
        <p className="mt-4 text-muted-foreground leading-relaxed text-[0.95rem]">
          {t(`modules.${config.key}.desc`)}
        </p>
        <ul className="mt-7 space-y-3.5">
          {featureKeys.map((key) => (
            <li key={key} className="flex items-start gap-3 text-[0.9rem]">
              <div className="mt-0.5 h-5 w-5 rounded-full bg-success/10 flex items-center justify-center flex-shrink-0">
                <Check className="h-3 w-3 text-success" />
              </div>
              <span>{t(key)}</span>
            </li>
          ))}
        </ul>
        <div className="mt-8">
          <Button variant="outline" className="gap-2 rounded-xl border-border/60 hover:border-primary/30 hover:bg-primary/5 transition-all" asChild>
            <Link href="/login">
              {t('modules.learnMore')}
              <ArrowRight className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </div>
      <div className={cn(isReversed && 'lg:order-1')}>
        <Mockup t={t} />
      </div>
    </div>
  );
}

export function ModulesShowcase() {
  const [ref, isInView] = useIntersection({ threshold: 0.05 });
  const { t } = useLanguage();

  return (
    <section id="modules" className="py-28 sm:py-36 bg-muted/30 relative" ref={ref}>
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-2/3 h-px bg-gradient-to-r from-transparent via-border to-transparent" />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div
          className={cn(
            'text-center max-w-2xl mx-auto mb-20 transition-all duration-700',
            isInView ? 'animate-in fade-in slide-in-from-bottom-6' : 'opacity-0'
          )}
        >
          <div className="inline-flex items-center gap-2 rounded-full bg-primary/8 border border-primary/10 px-4 py-1.5 text-xs font-semibold uppercase tracking-widest text-primary mb-6">
            {t('modules.label')}
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-[2.75rem]">
            {t('modules.title')}
          </h2>
          <p className="mt-5 text-lg text-muted-foreground leading-relaxed">
            {t('modules.subtitle')}
          </p>
        </div>

        <div className="space-y-28 lg:space-y-36">
          {moduleConfigs.map((config, i) => (
            <ModuleBlock key={config.key} config={config} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}
