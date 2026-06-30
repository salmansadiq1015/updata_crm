'use client';

import { useMemo, useState } from 'react';
import {
  Building2,
  GitBranch,
  Landmark,
  Plus,
  Power,
  PowerOff,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAccountingEntities } from '@/modules/accounting/hooks/use-accounting-queries';
import { useAccountingEntityMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import {
  ACCOUNTING_CURRENCIES,
  ACCOUNTING_ENTITY_TYPES,
} from '@/modules/accounting/constants/accounting-constants';
import {
  buildAccountingEntityPayload,
  defaultAccountingEntityForm,
  isAccountingEntityFormValid,
  splitAccountingEntities,
} from '@/modules/accounting/utils/accounting-entities';

const ENTITY_TYPE_ICON = {
  COMPANY: Building2,
  BRANCH: GitBranch,
};

function statusClass(status) {
  return status === 'ACTIVE'
    ? 'bg-emerald-400/10 text-emerald-200 ring-1 ring-emerald-300/20'
    : 'bg-slate-400/10 text-slate-300 ring-1 ring-slate-300/15';
}

function entityLabel(entity) {
  return [entity.entityCode, entity.name].filter(Boolean).join(' - ');
}

function MetricTile({
  label, value, icon: Icon, tone = 'cyan',
}) {
  const color = tone === 'emerald'
    ? 'bg-emerald-400/10 text-emerald-200 ring-emerald-300/20'
    : tone === 'violet'
      ? 'bg-violet-400/10 text-violet-200 ring-violet-300/20'
      : 'bg-cyan-400/10 text-cyan-200 ring-cyan-300/20';

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.045] p-4 shadow-[0_18px_50px_rgb(0_0_0/0.18)] backdrop-blur">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-[0.18em] text-slate-500">{label}</span>
        <span className={`flex size-9 items-center justify-center rounded-lg ring-1 ${color}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <p className="mt-4 text-3xl font-bold tabular-nums text-slate-100">{value}</p>
    </div>
  );
}

function EntityRow({
  entity, de, onActivate, onDeactivate, pending,
}) {
  const Icon = ENTITY_TYPE_ICON[entity.type] || Landmark;
  const parent = entity.parentId && typeof entity.parentId === 'object' ? entity.parentId : null;
  const isActive = entity.status === 'ACTIVE';

  return (
    <div className="grid gap-3 border-t border-white/10 px-4 py-4 md:grid-cols-[minmax(0,1fr)_12rem_8rem_auto] md:items-center">
      <div className="flex min-w-0 items-center gap-3">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/20">
          <Icon className="size-4" />
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-slate-100">{entity.name}</p>
          <p className="mt-0.5 truncate text-xs text-slate-500">
            <span className="font-mono text-slate-400">{entity.entityCode}</span>
            {entity.legalName ? ` · ${entity.legalName}` : ''}
          </p>
        </div>
      </div>
      <div className="text-xs text-slate-400">
        <p className="font-semibold text-slate-300">{entity.baseCurrency || 'CHF'}</p>
        <p>{parent ? entityLabel(parent) : (de ? 'Konzern / Firma' : 'Root company')}</p>
      </div>
      <div>
        <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${statusClass(entity.status)}`}>
          {entity.status}
        </span>
      </div>
      <div className="flex justify-start md:justify-end">
        {isActive ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onDeactivate(entity._id)}
            disabled={pending}
            className="border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
          >
            <PowerOff className="mr-1.5 size-4" />
            {de ? 'Deaktivieren' : 'Deactivate'}
          </Button>
        ) : (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => onActivate(entity._id)}
            disabled={pending}
            className="border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08]"
          >
            <Power className="mr-1.5 size-4" />
            {de ? 'Aktivieren' : 'Activate'}
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AccountingEntitiesPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [form, setForm] = useState(defaultAccountingEntityForm());
  const { data: entities = [], isLoading, isError } = useAccountingEntities();
  const {
    createAccountingEntity,
    activateAccountingEntity,
    deactivateAccountingEntity,
  } = useAccountingEntityMutations();

  const { companies, branches } = useMemo(() => splitAccountingEntities(entities), [entities]);
  const pending = createAccountingEntity.isPending || activateAccountingEntity.isPending || deactivateAccountingEntity.isPending;
  const valid = isAccountingEntityFormValid(form);

  const set = (key, value) => {
    setForm((current) => ({
      ...current,
      [key]: value,
      ...(key === 'type' && value === 'COMPANY' ? { parentId: '' } : {}),
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!valid) return;
    await createAccountingEntity.mutateAsync(buildAccountingEntityPayload(form));
    setForm(defaultAccountingEntityForm());
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5 text-slate-100">
      <div className="grid gap-4 md:grid-cols-3">
        <MetricTile label={de ? 'Firmen' : 'Companies'} value={companies.length} icon={Building2} />
        <MetricTile label={de ? 'Niederlassungen' : 'Branches'} value={branches.length} icon={GitBranch} tone="violet" />
        <MetricTile label={de ? 'Aktive Einheiten' : 'Active Entities'} value={entities.filter((entity) => entity.status === 'ACTIVE').length} icon={Landmark} tone="emerald" />
      </div>

      <section className="grid gap-5 xl:grid-cols-[25rem_minmax(0,1fr)]">
        <form onSubmit={handleSubmit} className="rounded-xl border border-white/10 bg-white/[0.05] p-4 shadow-[0_20px_70px_rgb(0_0_0/0.22)] backdrop-blur-xl">
          <div className="mb-4">
            <h1 className="text-xl font-bold">{de ? 'Accounting-Struktur' : 'Accounting Structure'}</h1>
            <p className="mt-1 text-sm text-slate-400">
              {de ? 'Firmen und Niederlassungen fuer mehrdimensionale Finanzberichte.' : 'Companies and branches used by scoped ledgers and financial reports.'}
            </p>
          </div>

          <div className="grid gap-4">
            <div className="grid grid-cols-2 gap-2">
              {ACCOUNTING_ENTITY_TYPES.map((type) => {
                const Icon = ENTITY_TYPE_ICON[type];
                const active = form.type === type;
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() => set('type', type)}
                    className={`flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-semibold transition-colors ${
                      active
                        ? 'border-cyan-300/35 bg-cyan-400/10 text-cyan-100'
                        : 'border-white/10 bg-white/[0.03] text-slate-300 hover:bg-white/[0.07]'
                    }`}
                  >
                    <Icon className="size-4" />
                    {type === 'COMPANY' ? (de ? 'Firma' : 'Company') : (de ? 'Filiale' : 'Branch')}
                  </button>
                );
              })}
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-slate-400">{de ? 'Code' : 'Code'}</Label>
              <Input className="h-9 border-white/10 bg-white/[0.04] text-slate-100" value={form.entityCode} onChange={(event) => set('entityCode', event.target.value)} placeholder="MB-CH" required />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-slate-400">{de ? 'Name' : 'Name'}</Label>
              <Input className="h-9 border-white/10 bg-white/[0.04] text-slate-100" value={form.name} onChange={(event) => set('name', event.target.value)} placeholder="MB Boiler Switzerland" required />
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-slate-400">{de ? 'Juristischer Name' : 'Legal Name'}</Label>
              <Input className="h-9 border-white/10 bg-white/[0.04] text-slate-100" value={form.legalName} onChange={(event) => set('legalName', event.target.value)} />
            </div>

            {form.type === 'BRANCH' && (
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-400">{de ? 'Firma' : 'Company'}</Label>
                <Select value={form.parentId} onValueChange={(value) => set('parentId', value)} disabled={companies.length === 0}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-slate-100">
                    <SelectValue placeholder={de ? 'Firma waehlen' : 'Select company'} />
                  </SelectTrigger>
                  <SelectContent>
                    {companies.map((company) => (
                      <SelectItem key={company._id} value={company._id}>{entityLabel(company)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-400">{de ? 'Basiswaehrung' : 'Base Currency'}</Label>
                <Select value={form.baseCurrency} onValueChange={(value) => set('baseCurrency', value)}>
                  <SelectTrigger className="h-9 border-white/10 bg-white/[0.04] text-slate-100">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ACCOUNTING_CURRENCIES.slice(0, 2).map((currency) => (
                      <SelectItem key={currency} value={currency}>{currency}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid gap-1.5">
                <Label className="text-xs text-slate-400">{de ? 'Startmonat' : 'FY Start'}</Label>
                <Input type="number" min="1" max="12" className="h-9 border-white/10 bg-white/[0.04] text-slate-100" value={form.fiscalYearStartMonth} onChange={(event) => set('fiscalYearStartMonth', event.target.value)} />
              </div>
            </div>

            <div className="grid gap-1.5">
              <Label className="text-xs text-slate-400">{de ? 'Steuer-ID' : 'Tax ID'}</Label>
              <Input className="h-9 border-white/10 bg-white/[0.04] text-slate-100" value={form.taxIdentifier} onChange={(event) => set('taxIdentifier', event.target.value)} />
            </div>

            <Button type="submit" className="h-10 bg-cyan-500 text-slate-950 hover:bg-cyan-400" disabled={!valid || pending}>
              <Plus className="mr-1.5 size-4" />
              {createAccountingEntity.isPending ? '...' : (de ? 'Einheit erstellen' : 'Create Entity')}
            </Button>
          </div>
        </form>

        <div className="overflow-hidden rounded-xl border border-white/10 bg-white/[0.04] shadow-[0_20px_70px_rgb(0_0_0/0.22)] backdrop-blur-xl">
          <div className="flex flex-col gap-1 border-b border-white/10 px-4 py-4 md:flex-row md:items-end md:justify-between">
            <div>
              <h2 className="text-lg font-bold">{de ? 'Ledger Scope Master Data' : 'Ledger Scope Master Data'}</h2>
              <p className="mt-1 text-sm text-slate-400">
                {de ? 'Diese IDs koennen fuer Journal-, Report- und Dashboard-Scope genutzt werden.' : 'These IDs can scope journal, report, and dashboard data.'}
              </p>
            </div>
          </div>

          {isLoading && Array.from({ length: 5 }).map((_, index) => (
            <div key={index} className="border-t border-white/10 px-4 py-4">
              <Skeleton className="h-10 w-full bg-white/10" />
            </div>
          ))}

          {!isLoading && entities.map((entity) => (
            <EntityRow
              key={entity._id}
              entity={entity}
              de={de}
              pending={pending}
              onActivate={(id) => activateAccountingEntity.mutate(id)}
              onDeactivate={(id) => deactivateAccountingEntity.mutate(id)}
            />
          ))}

          {!isLoading && entities.length === 0 && (
            <div className="px-4 py-12 text-center text-sm text-slate-400">
              {isError ? (de ? 'Accounting-Struktur konnte nicht geladen werden.' : 'Could not load accounting structure.') : (de ? 'Noch keine Accounting-Einheiten erstellt.' : 'No accounting entities created yet.')}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
