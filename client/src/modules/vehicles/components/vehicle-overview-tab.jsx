'use client';

import {
  Hash, Fuel, Calendar, Gauge, Palette, Cog, Users, Weight, Zap, Building2, MapPin, Tag, Landmark,
  Wallet, FileText, ShieldCheck, CalendarClock, Wrench, Leaf, BadgeCheck, KeyRound,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useFleetFormat } from '../lib/fleet-meta';

function Panel({ title, icon: Icon, children, className }) {
  return (
    <section className={cn('rounded-2xl border border-border bg-card p-5', className)}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold tracking-tight text-foreground">
        <span className="grid size-7 place-items-center rounded-lg bg-sky-500/10"><Icon className="size-3.5 text-sky-600 dark:text-sky-300" aria-hidden="true" /></span>
        {title}
      </h3>
      {children}
    </section>
  );
}

function Rows({ rows }) {
  const visible = rows.filter(Boolean);
  return (
    <dl className="divide-y divide-border/70">
      {visible.map(({ icon: Icon, label, value, mono }) => (
        <div key={label} className="flex items-center justify-between gap-4 py-2.5">
          <dt className="inline-flex min-w-0 items-center gap-2 text-sm text-muted-foreground"><Icon className="size-3.5 shrink-0" aria-hidden="true" />{label}</dt>
          <dd className={cn('min-w-0 truncate text-end text-sm font-medium text-foreground', mono && 'font-mono text-[13px] tracking-wide')}>{value || value === 0 ? value : '—'}</dd>
        </div>
      ))}
    </dl>
  );
}

const COMPLIANCE = [
  { field: 'nextServiceDate', icon: Wrench, key: 'fleet.alert.service' },
  { field: 'inspectionDue', icon: BadgeCheck, key: 'fleet.alert.inspectionDue' },
  { field: 'insuranceExpiry', icon: ShieldCheck, key: 'fleet.alert.insuranceExpiry' },
  { field: 'registrationExpiry', icon: FileText, key: 'fleet.alert.registrationExpiry' },
  { field: 'emissionTestDue', icon: Leaf, key: 'fleet.alert.emissionTestDue' },
  { field: 'contractEnd', icon: KeyRound, key: 'fleet.alert.contractEnd' },
];

function ComplianceTimeline({ vehicle }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const now = Date.now();
  const items = COMPLIANCE
    .map((c) => ({ ...c, date: vehicle[c.field] ? new Date(vehicle[c.field]) : null }))
    .sort((a, b) => (a.date ? a.date.getTime() : Infinity) - (b.date ? b.date.getTime() : Infinity));

  return (
    <ol className="relative space-y-1">
      {items.map(({ field, icon: Icon, key, date }) => {
        const days = date ? Math.ceil((date.getTime() - now) / 86_400_000) : null;
        const level = days == null ? 'none' : days < 0 ? 'overdue' : days <= 30 ? 'soon' : 'ok';
        return (
          <li key={field} className="flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-muted/40">
            <span className={cn(
              'grid size-8 shrink-0 place-items-center rounded-lg',
              level === 'overdue' ? 'bg-rose-500/10 text-rose-600 dark:text-rose-300'
                : level === 'soon' ? 'bg-amber-500/10 text-amber-600 dark:text-amber-300'
                  : level === 'ok' ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-300' : 'bg-muted text-muted-foreground',
            )}>
              <Icon className="size-4" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-foreground">{t(key, field)}</p>
              <p className="text-xs text-muted-foreground">{date ? f.date(date) : t('fleet.compliance.notSet', 'Not set')}</p>
            </div>
            {days != null ? (
              <span className={cn(
                'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium tabular-nums',
                level === 'overdue' ? 'bg-rose-500/10 text-rose-700 dark:text-rose-300' : level === 'soon' ? 'bg-amber-500/10 text-amber-700 dark:text-amber-300' : 'bg-muted text-muted-foreground',
              )}>
                {f.relativeDays(days)}
              </span>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

export function VehicleOverviewTab({ vehicle: v }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const unit = v.meterUnit || 'km';

  return (
    <div className="grid gap-4 lg:grid-cols-3">
      <Panel title={t('fleet.overview.specs', 'Specifications')} icon={Cog}>
        <Rows rows={[
          { icon: Hash, label: t('fleet.field.vin', 'VIN / serial no.'), value: v.vin, mono: true },
          { icon: Fuel, label: t('fleet.field.fuel', 'Energy'), value: t(`fleet.fuel.${v.fuelType}`, v.fuelType) },
          v.transmission ? { icon: Cog, label: t('fleet.field.transmission', 'Transmission'), value: t(`fleet.transmission.${v.transmission}`, v.transmission) } : null,
          { icon: Calendar, label: t('fleet.field.year', 'Year'), value: v.year },
          { icon: Gauge, label: unit === 'h' ? t('fleet.field.hours', 'Operating hours') : t('fleet.field.mileage', 'Mileage'), value: f.meter(v.mileageKm, unit) },
          v.color ? { icon: Palette, label: t('fleet.field.color', 'Color'), value: v.color } : null,
          v.seats != null ? { icon: Users, label: t('fleet.field.seats', 'Seats'), value: v.seats } : null,
          v.payloadKg != null ? { icon: Weight, label: t('fleet.field.payload', 'Payload (kg)'), value: f.number(v.payloadKg) } : null,
          v.powerKw != null ? { icon: Zap, label: t('fleet.field.power', 'Power (kW)'), value: f.number(v.powerKw) } : null,
        ]} />
      </Panel>

      <Panel title={t('fleet.overview.compliance', 'Deadlines & compliance')} icon={CalendarClock}>
        <ComplianceTimeline vehicle={v} />
      </Panel>

      <div className="space-y-4">
        <Panel title={t('fleet.overview.organisation', 'Organisation')} icon={Building2}>
          <Rows rows={[
            { icon: Hash, label: t('fleet.field.fleetNumber', 'Fleet / asset no.'), value: v.fleetNumber, mono: true },
            { icon: Building2, label: t('fleet.field.department', 'Department / team'), value: v.department },
            { icon: MapPin, label: t('fleet.field.location', 'Home base / location'), value: v.location },
            { icon: Landmark, label: t('fleet.field.costCenter', 'Cost center'), value: v.costCenter },
          ]} />
          {v.tags?.length ? (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {v.tags.map((tag) => (
                <span key={tag} className="inline-flex items-center gap-1 rounded-full border border-sky-500/20 bg-sky-500/5 px-2 py-0.5 text-xs text-sky-700 dark:text-sky-200"><Tag className="size-3" aria-hidden="true" />{tag}</span>
              ))}
            </div>
          ) : null}
        </Panel>
        <Panel title={t('fleet.overview.ownership', 'Ownership & contract')} icon={Wallet}>
          <Rows rows={[
            { icon: KeyRound, label: t('fleet.field.ownership', 'Ownership'), value: t(`fleet.ownership.${v.ownershipType || 'owned'}`, v.ownershipType) },
            v.purchaseDate ? { icon: Calendar, label: t('fleet.field.purchaseDate', 'Acquired on'), value: f.date(v.purchaseDate) } : null,
            v.purchasePrice != null ? { icon: Wallet, label: t('fleet.field.purchasePrice', 'Purchase price'), value: f.money(v.purchasePrice, v.currency || 'CHF') } : null,
            v.provider ? { icon: Building2, label: t('fleet.field.provider', 'Leasing / rental provider'), value: v.provider } : null,
            v.monthlyCost != null ? { icon: Wallet, label: t('fleet.field.monthlyCost', 'Monthly rate'), value: f.money(v.monthlyCost, v.currency || 'CHF', 2) } : null,
            v.insuranceProvider ? { icon: ShieldCheck, label: t('fleet.field.insuranceProvider', 'Insurer'), value: [v.insuranceProvider, v.insurancePolicyNumber].filter(Boolean).join(' · ') } : null,
          ]} />
        </Panel>
      </div>
    </div>
  );
}
