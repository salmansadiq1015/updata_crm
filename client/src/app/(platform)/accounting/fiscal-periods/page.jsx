'use client';

import { useState } from 'react';
import { CalendarDays, LockKeyhole, Plus, UnlockKeyhole } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useLanguage } from '@/lib/i18n/language-context';
import { useFiscalPeriods } from '@/modules/accounting/hooks/use-accounting-queries';
import { useFiscalPeriodMutations } from '@/modules/accounting/hooks/use-accounting-mutations';

const STATUS_CONFIG = {
  OPEN: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400',
  CLOSED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  ARCHIVED: 'bg-slate-100 text-muted-foreground dark:bg-slate-900/30 dark:text-muted-foreground',
};

function fmtDate(value) {
  return value ? new Date(value).toLocaleDateString('de-CH') : '-';
}

function defaultForm() {
  const now = new Date();
  return {
    name: `${now.getFullYear()}`,
    startDate: `${now.getFullYear()}-01-01`,
    endDate: `${now.getFullYear()}-12-31`,
  };
}

function StatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STATUS_CONFIG[status] || STATUS_CONFIG.ARCHIVED}`}>
      {status}
    </span>
  );
}

function ActionDialog({ target, onClose, de }) {
  const [reason, setReason] = useState('');
  const { closeFiscalPeriod, reopenFiscalPeriod } = useFiscalPeriodMutations();
  const isClose = target?.action === 'close';
  const pending = closeFiscalPeriod.isPending || reopenFiscalPeriod.isPending;

  const handleConfirm = async () => {
    if (!target || reason.trim().length < 3) return;
    if (isClose) {
      await closeFiscalPeriod.mutateAsync({ id: target.period._id, reason });
    } else {
      await reopenFiscalPeriod.mutateAsync({ id: target.period._id, reason });
    }
    setReason('');
    onClose();
  };

  return (
    <Dialog open={!!target} onOpenChange={onClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isClose ? (de ? 'Periode schliessen' : 'Close period') : (de ? 'Periode wieder oeffnen' : 'Reopen period')}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium">{target?.period?.name}</p>
          <Label className="text-xs">{de ? 'Begruendung' : 'Reason'}</Label>
          <Input value={reason} onChange={(event) => setReason(event.target.value)} className="h-9" />
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pending}>{de ? 'Abbrechen' : 'Cancel'}</Button>
          <Button type="button" onClick={handleConfirm} disabled={pending || reason.trim().length < 3}>
            {pending ? '...' : (de ? 'Bestaetigen' : 'Confirm')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FiscalPeriodsPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const { data: periods = [], isLoading, isError } = useFiscalPeriods();
  const { createFiscalPeriod } = useFiscalPeriodMutations();
  const [form, setForm] = useState(defaultForm());
  const [actionTarget, setActionTarget] = useState(null);

  const set = (key, value) => setForm((current) => ({ ...current, [key]: value }));

  const handleCreate = async (event) => {
    event.preventDefault();
    await createFiscalPeriod.mutateAsync(form);
    setForm(defaultForm());
  };

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-5">
      <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
        <div>
          <h1 className="text-2xl font-bold">{de ? 'Buchungsperioden' : 'Fiscal Periods'}</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {de ? 'Offene und geschlossene Perioden fuer Buchungssperren.' : 'Open and closed periods used by accounting posting locks.'}
          </p>
        </div>
      </div>

      <form onSubmit={handleCreate} className="grid gap-3 rounded-xl border border-border bg-card p-4 md:grid-cols-[1fr_10rem_10rem_auto] md:items-end">
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Name' : 'Name'}</Label>
          <Input className="h-9" value={form.name} onChange={(event) => set('name', event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Start' : 'Start'}</Label>
          <Input type="date" className="h-9" value={form.startDate} onChange={(event) => set('startDate', event.target.value)} required />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label className="text-xs">{de ? 'Ende' : 'End'}</Label>
          <Input type="date" className="h-9" value={form.endDate} onChange={(event) => set('endDate', event.target.value)} required />
        </div>
        <Button type="submit" className="h-9" disabled={createFiscalPeriod.isPending}>
          <Plus className="mr-1.5 h-4 w-4" />
          {createFiscalPeriod.isPending ? '...' : (de ? 'Erstellen' : 'Create')}
        </Button>
      </form>

      <div className="overflow-hidden rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-muted/50 text-xs font-medium text-muted-foreground">
            <tr>
              <th className="px-3 py-2.5 text-left">{de ? 'Periode' : 'Period'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Zeitraum' : 'Range'}</th>
              <th className="px-3 py-2.5 text-left">{de ? 'Status' : 'Status'}</th>
              <th className="px-3 py-2.5 text-right">{de ? 'Aktion' : 'Action'}</th>
            </tr>
          </thead>
          <tbody>
            {isLoading && Array.from({ length: 4 }).map((_, index) => (
              <tr key={index} className="border-b border-border/50">
                <td className="px-3 py-3" colSpan={4}><Skeleton className="h-5 w-full" /></td>
              </tr>
            ))}
            {!isLoading && periods.map((period) => (
              <tr key={period._id} className="border-b border-border/50">
                <td className="px-3 py-3">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="h-4 w-4 text-muted-foreground" />
                    <span className="font-medium">{period.name}</span>
                  </div>
                </td>
                <td className="px-3 py-3 text-muted-foreground">{fmtDate(period.startDate)} - {fmtDate(period.endDate)}</td>
                <td className="px-3 py-3"><StatusBadge status={period.status} /></td>
                <td className="px-3 py-3 text-right">
                  {period.status === 'OPEN' && (
                    <Button size="sm" variant="outline" onClick={() => setActionTarget({ period, action: 'close' })}>
                      <LockKeyhole className="mr-1.5 h-4 w-4" />
                      {de ? 'Schliessen' : 'Close'}
                    </Button>
                  )}
                  {period.status === 'CLOSED' && (
                    <Button size="sm" variant="outline" onClick={() => setActionTarget({ period, action: 'reopen' })}>
                      <UnlockKeyhole className="mr-1.5 h-4 w-4" />
                      {de ? 'Oeffnen' : 'Reopen'}
                    </Button>
                  )}
                </td>
              </tr>
            ))}
            {!isLoading && periods.length === 0 && (
              <tr>
                <td colSpan={4} className="px-3 py-10 text-center text-sm text-muted-foreground">
                  {isError ? (de ? 'Perioden konnten nicht geladen werden.' : 'Could not load periods.') : (de ? 'Noch keine Perioden erstellt.' : 'No fiscal periods created yet.')}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <ActionDialog target={actionTarget} onClose={() => setActionTarget(null)} de={de} />
    </div>
  );
}
