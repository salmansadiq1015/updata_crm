'use client';

import { useMemo, useState } from 'react';
import {
  Activity,
  Banknote,
  Calculator,
  Package,
  Plus,
  Save,
  Trash2,
} from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/lib/i18n/language-context';
import {
  ACCOUNTING_CURRENCIES,
  FIXED_ASSET_METHODS,
  FIXED_ASSET_STATUSES,
} from '@/modules/accounting/constants/accounting-constants';
import {
  useFixedAssetSummary,
  useFixedAssets,
} from '@/modules/accounting/hooks/use-accounting-queries';
import { useFixedAssetMutations } from '@/modules/accounting/hooks/use-accounting-mutations';
import { formatDate, formatMoney } from '@/modules/accounting/utils/accounting-ui';
import {
  buildDepreciationPayload,
  buildDisposalPayload,
  buildFixedAssetFilters,
  buildFixedAssetPayload,
  defaultDepreciationForm,
  defaultDisposalForm,
  defaultFixedAssetFilters,
  defaultFixedAssetForm,
  isFixedAssetFormValid,
  statusBadgeClass,
} from '@/modules/accounting/utils/fixed-assets';

function SelectField({ value, onValueChange, options, includeAll = false }) {
  return (
    <Select value={value} onValueChange={onValueChange}>
      <SelectTrigger className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {includeAll && <SelectItem value="ALL">All</SelectItem>}
        {options.map((option) => (
          <SelectItem key={option} value={option}>{option}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function MetricTile({ label, value, icon: Icon, tone = 'cyan' }) {
  const toneClass = {
    cyan: 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100',
    emerald: 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100',
    amber: 'border-amber-300/20 bg-amber-400/10 text-amber-100',
    lime: 'border-lime-300/20 bg-lime-400/10 text-lime-100',
  }[tone] || 'border-cyan-300/20 bg-cyan-400/10 text-cyan-100';

  return (
    <div className={`rounded-xl border p-4 ${toneClass}`}>
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold uppercase opacity-75">{label}</span>
        <Icon className="h-4 w-4 opacity-80" />
      </div>
      <div className="mt-4 text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function AssetDialog({ open, form, pending, de, onChange, onClose, onSubmit }) {
  const valid = isFixedAssetFormValid(form);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-3xl">
        <DialogHeader>
          <DialogTitle>{de ? 'Anlage erfassen' : 'Create fixed asset'}</DialogTitle>
        </DialogHeader>
        <form id="fixed-asset-form" onSubmit={onSubmit} className="grid gap-4 md:grid-cols-2">
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">{de ? 'Name' : 'Name'}</Label>
            <Input className="h-9" value={form.name} onChange={(event) => onChange('name', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Kategorie' : 'Category'}</Label>
            <Input className="h-9" value={form.category} onChange={(event) => onChange('category', event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Waehrung' : 'Currency'}</Label>
            <SelectField value={form.currency} onValueChange={(value) => onChange('currency', value)} options={ACCOUNTING_CURRENCIES} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Anschaffungsdatum' : 'Acquisition date'}</Label>
            <Input className="h-9" type="date" value={form.acquisitionDate} onChange={(event) => onChange('acquisitionDate', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Nutzungsbeginn' : 'Placed in service'}</Label>
            <Input className="h-9" type="date" value={form.placedInServiceDate} onChange={(event) => onChange('placedInServiceDate', event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Anschaffungskosten' : 'Acquisition cost'}</Label>
            <Input className="h-9" type="number" min="0.01" step="0.01" value={form.acquisitionCost} onChange={(event) => onChange('acquisitionCost', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Restwert' : 'Salvage value'}</Label>
            <Input className="h-9" type="number" min="0" step="0.01" value={form.salvageValue} onChange={(event) => onChange('salvageValue', event.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Nutzungsdauer Monate' : 'Useful life months'}</Label>
            <Input className="h-9" type="number" min="1" step="1" value={form.usefulLifeMonths} onChange={(event) => onChange('usefulLifeMonths', event.target.value)} required />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label className="text-xs">{de ? 'Methode' : 'Method'}</Label>
            <SelectField value={form.depreciationMethod} onValueChange={(value) => onChange('depreciationMethod', value)} options={FIXED_ASSET_METHODS} />
          </div>
          <div className="flex flex-col gap-1.5 md:col-span-2">
            <Label className="text-xs">{de ? 'Beschreibung' : 'Description'}</Label>
            <Textarea value={form.description} onChange={(event) => onChange('description', event.target.value)} maxLength={500} />
          </div>
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="submit" form="fixed-asset-form" disabled={!valid || pending}>
            <Save className="mr-1.5 h-4 w-4" />
            {pending ? '...' : (de ? 'Speichern' : 'Save')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ActionDialog({ target, de, pending, depreciationForm, disposalForm, onDepreciationChange, onDisposalChange, onClose, onSubmit }) {
  const isDepreciate = target?.action === 'depreciate';
  const isDispose = target?.action === 'dispose';

  return (
    <Dialog open={!!target} onOpenChange={(nextOpen) => { if (!nextOpen) onClose(); }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {target?.action === 'activate' && (de ? 'Anlage aktivieren' : 'Activate asset')}
            {isDepreciate && (de ? 'Abschreibung buchen' : 'Post depreciation')}
            {isDispose && (de ? 'Anlage abgehen' : 'Dispose asset')}
          </DialogTitle>
        </DialogHeader>
        <form id="fixed-asset-action-form" onSubmit={onSubmit} className="grid gap-4">
          <div>
            <p className="text-sm font-semibold">{target?.asset?.assetNumber} - {target?.asset?.name}</p>
            <p className="mt-1 text-xs text-muted-foreground">{de ? 'Buchwert' : 'Book value'} {formatMoney(target?.asset?.bookValue, target?.asset?.currency)}</p>
          </div>
          {isDepreciate && (
            <div className="flex flex-col gap-1.5">
              <Label className="text-xs">{de ? 'Periode' : 'Period'}</Label>
              <Input className="h-9" type="date" value={depreciationForm.periodDate} onChange={(event) => onDepreciationChange('periodDate', event.target.value)} required />
            </div>
          )}
          {isDispose && (
            <>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{de ? 'Abgangsdatum' : 'Disposal date'}</Label>
                <Input className="h-9" type="date" value={disposalForm.disposalDate} onChange={(event) => onDisposalChange('disposalDate', event.target.value)} required />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label className="text-xs">{de ? 'Erloes' : 'Proceeds'}</Label>
                <Input className="h-9" type="number" min="0" step="0.01" value={disposalForm.proceeds} onChange={(event) => onDisposalChange('proceeds', event.target.value)} />
              </div>
            </>
          )}
          {target?.action === 'activate' && (
            <Alert>
              <AlertDescription>
                {de
                  ? 'Die Aktivierung bucht Anschaffungskosten gegen das Anlagen-Verrechnungskonto.'
                  : 'Activation posts acquisition cost against the asset acquisition clearing account.'}
              </AlertDescription>
            </Alert>
          )}
        </form>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="submit" form="fixed-asset-action-form" disabled={pending}>
            {pending ? '...' : (de ? 'Bestaetigen' : 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FixedAssetsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [filters, setFilters] = useState(defaultFixedAssetFilters());
  const [assetDialogOpen, setAssetDialogOpen] = useState(false);
  const [assetForm, setAssetForm] = useState(defaultFixedAssetForm());
  const [actionTarget, setActionTarget] = useState(null);
  const [depreciationForm, setDepreciationForm] = useState(defaultDepreciationForm());
  const [disposalForm, setDisposalForm] = useState(defaultDisposalForm());
  const params = useMemo(() => buildFixedAssetFilters(filters), [filters]);
  const { data: assets = [], isLoading, isError } = useFixedAssets(params);
  const { data: summary, isLoading: summaryLoading } = useFixedAssetSummary({ currency: filters.currency });
  const {
    createFixedAsset,
    activateFixedAsset,
    depreciateFixedAsset,
    disposeFixedAsset,
  } = useFixedAssetMutations();
  const pending = createFixedAsset.isPending || activateFixedAsset.isPending || depreciateFixedAsset.isPending || disposeFixedAsset.isPending;

  const setFilter = (key, value) => setFilters((current) => ({ ...current, [key]: value }));
  const setAsset = (key, value) => setAssetForm((current) => ({ ...current, [key]: value }));
  const setDepreciation = (key, value) => setDepreciationForm((current) => ({ ...current, [key]: value }));
  const setDisposal = (key, value) => setDisposalForm((current) => ({ ...current, [key]: value }));

  const submitAsset = async (event) => {
    event.preventDefault();
    await createFixedAsset.mutateAsync(buildFixedAssetPayload(assetForm));
    setAssetForm(defaultFixedAssetForm());
    setAssetDialogOpen(false);
  };

  const openAction = (asset, action) => {
    setActionTarget({ asset, action });
    setDepreciationForm(defaultDepreciationForm());
    setDisposalForm(defaultDisposalForm());
  };

  const submitAction = async (event) => {
    event.preventDefault();
    if (!actionTarget) return;
    if (actionTarget.action === 'activate') {
      await activateFixedAsset.mutateAsync({ id: actionTarget.asset._id, data: {} });
    }
    if (actionTarget.action === 'depreciate') {
      await depreciateFixedAsset.mutateAsync({
        id: actionTarget.asset._id,
        data: buildDepreciationPayload(depreciationForm),
      });
    }
    if (actionTarget.action === 'dispose') {
      await disposeFixedAsset.mutateAsync({
        id: actionTarget.asset._id,
        data: buildDisposalPayload(disposalForm),
      });
    }
    setActionTarget(null);
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <div className="mb-2 inline-flex items-center gap-2 rounded-full border border-lime-300/20 bg-lime-400/10 px-3 py-1 text-xs font-semibold text-lime-200">
            <Package className="h-3.5 w-3.5" />
            {de ? 'Anlagenbuchhaltung' : 'Fixed Asset Accounting'}
          </div>
          <h1 className="text-2xl font-bold">{de ? 'Anlagen' : 'Fixed Assets'}</h1>
          <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
            {de
              ? 'Anlagenregister mit Aktivierung, Abschreibung, Buchwert und Abgangsbuchungen.'
              : 'Asset register with activation, depreciation, book value, and disposal postings.'}
          </p>
        </div>
        <Button type="button" onClick={() => setAssetDialogOpen(true)}>
          <Plus className="mr-1.5 h-4 w-4" />
          {de ? 'Anlage' : 'Asset'}
        </Button>
      </div>

      <section className="grid gap-4 md:grid-cols-4">
        {summaryLoading ? Array.from({ length: 4 }).map((_, index) => (
          <Skeleton key={index} className="h-28 rounded-xl" />
        )) : (
          <>
            <MetricTile label={de ? 'Anschaffung' : 'Acquisition'} value={formatMoney(summary?.acquisitionCost, filters.currency)} icon={Banknote} tone="cyan" />
            <MetricTile label={de ? 'Kumulierte Abschreibung' : 'Accumulated depreciation'} value={formatMoney(summary?.accumulatedDepreciation, filters.currency)} icon={Calculator} tone="amber" />
            <MetricTile label={de ? 'Buchwert' : 'Book value'} value={formatMoney(summary?.bookValue, filters.currency)} icon={Activity} tone="lime" />
            <MetricTile label={de ? 'Aktive Anlagen' : 'Active assets'} value={summary?.activeCount ?? 0} icon={Package} tone="emerald" />
          </>
        )}
      </section>

      <section className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[10rem_10rem_1fr_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Status' : 'Status'}</Label>
          <SelectField value={filters.status} onValueChange={(value) => setFilter('status', value)} options={FIXED_ASSET_STATUSES} includeAll />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Waehrung' : 'Currency'}</Label>
          <SelectField value={filters.currency} onValueChange={(value) => setFilter('currency', value)} options={ACCOUNTING_CURRENCIES} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Suche' : 'Search'}</Label>
          <Input className="h-9" value={filters.search} onChange={(event) => setFilter('search', event.target.value)} placeholder={de ? 'Nummer, Name, Kategorie' : 'Number, name, category'} />
        </div>
        <Button type="button" variant="outline" onClick={() => setFilters(defaultFixedAssetFilters())} className="h-9">
          Reset
        </Button>
      </section>

      <section className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">{de ? 'Anlage' : 'Asset'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Status' : 'Status'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Daten' : 'Dates'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Kosten' : 'Cost'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Abschreibung' : 'Depreciation'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Buchwert' : 'Book value'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 5 }).map((_, index) => (
              <tr key={index} className="border-b border-border/50">
                <td colSpan={7} className="px-3 py-3"><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!isLoading && assets.map((asset) => (
              <tr key={asset._id} className="border-b border-border/50">
                <td className="px-3 py-3">
                  <div className="font-semibold">{asset.assetNumber}</div>
                  <div className="mt-1 text-xs text-muted-foreground">{asset.name} - {asset.category}</div>
                </td>
                <td className="px-3 py-3">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${statusBadgeClass(asset.status)}`}>
                    {asset.status}
                  </span>
                </td>
                <td className="px-3 py-3 text-muted-foreground">
                  <div>{formatDate(asset.acquisitionDate)}</div>
                  <div className="text-xs">{de ? 'Service' : 'Service'} {formatDate(asset.placedInServiceDate)}</div>
                </td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(asset.acquisitionCost, asset.currency)}</td>
                <td className="px-3 py-3 text-right tabular-nums">{formatMoney(asset.accumulatedDepreciation, asset.currency)}</td>
                <td className="px-3 py-3 text-right font-semibold tabular-nums">{formatMoney(asset.bookValue, asset.currency)}</td>
                <td className="px-3 py-3 text-right">
                  <div className="flex justify-end gap-2">
                    {asset.status === 'DRAFT' && (
                      <Button size="sm" variant="outline" type="button" onClick={() => openAction(asset, 'activate')}>
                        {de ? 'Aktivieren' : 'Activate'}
                      </Button>
                    )}
                    {asset.status === 'ACTIVE' && (
                      <Button size="sm" variant="outline" type="button" onClick={() => openAction(asset, 'depreciate')}>
                        {de ? 'Abschreiben' : 'Depreciate'}
                      </Button>
                    )}
                    {['ACTIVE', 'FULLY_DEPRECIATED'].includes(asset.status) && (
                      <Button size="sm" variant="outline" type="button" onClick={() => openAction(asset, 'dispose')}>
                        <Trash2 className="mr-1.5 h-4 w-4" />
                        {de ? 'Abgang' : 'Dispose'}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!isLoading && assets.length === 0 && (
              <tr>
                <td colSpan={7} className="px-3 py-12 text-center text-sm text-muted-foreground">
                  {isError ? (de ? 'Anlagen konnten nicht geladen werden.' : 'Could not load fixed assets.') : (de ? 'Noch keine Anlagen erfasst.' : 'No fixed assets yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <AssetDialog
        open={assetDialogOpen}
        form={assetForm}
        pending={createFixedAsset.isPending}
        de={de}
        onChange={setAsset}
        onClose={() => setAssetDialogOpen(false)}
        onSubmit={submitAsset}
      />
      <ActionDialog
        target={actionTarget}
        de={de}
        pending={pending}
        depreciationForm={depreciationForm}
        disposalForm={disposalForm}
        onDepreciationChange={setDepreciation}
        onDisposalChange={setDisposal}
        onClose={() => setActionTarget(null)}
        onSubmit={submitAction}
      />
    </div>
  );
}
