'use client';

import { useState } from 'react';
import { CalendarPlus, CalendarRange, CalendarX, Loader2, MapPin, TriangleAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { EmptyState } from '@/shared/components/empty-state';
import { ConfirmDialog } from '@/shared/components/confirm-dialog';
import { cn } from '@/lib/utils';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { useVehicleBookings, useVehicleMutations } from '../hooks/use-vehicles';
import { driverName, initialsOf, useFleetFormat } from '../lib/fleet-meta';

const pad = (n) => String(n).padStart(2, '0');
const localInput = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const nextHour = (offsetH = 0) => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1 + offsetH); return d; };

export function VehicleBookingsTab({ vehicle, canWrite }) {
  const { t } = useLanguage();
  const f = useFleetFormat();
  const id = vehicle._id;
  const me = useAuthStore((s) => s.user);
  const { data: bookings = [], isLoading } = useVehicleBookings(id);
  const { addBooking, cancelBooking } = useVehicleMutations(id);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ start: '', end: '', purpose: '', destination: '' });
  const [error, setError] = useState(null);
  const [cancelTarget, setCancelTarget] = useState(null);
  const bookable = !['retired', 'out_of_service'].includes(vehicle.status);
  const now = Date.now();

  const openDialog = () => {
    setForm({ start: localInput(nextHour()), end: localInput(nextHour(4)), purpose: '', destination: '' });
    setError(null);
    setOpen(true);
  };

  const submit = async (e) => {
    e.preventDefault();
    const start = new Date(form.start);
    const end = new Date(form.end);
    if (!(end > start)) { setError(t('fleet.bookings.endAfterStart', 'The end must be after the start.')); return; }
    try {
      await addBooking.mutateAsync({
        start: start.toISOString(),
        end: end.toISOString(),
        ...(form.purpose.trim() ? { purpose: form.purpose.trim() } : {}),
        ...(form.destination.trim() ? { destination: form.destination.trim() } : {}),
      });
      setOpen(false);
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  const mine = (b) => me && [b.bookedFor?._id, b.createdBy?._id].some((x) => x && String(x) === String(me._id || me.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">{t('fleet.bookings.desc', 'Reserve this vehicle for a trip. Overlapping bookings are prevented automatically.')}</p>
        <Button size="sm" className="gap-2 rounded-full" onClick={openDialog} disabled={!bookable}>
          <CalendarPlus className="size-4" />{t('fleet.bookings.add', 'Book vehicle')}
        </Button>
      </div>
      {!bookable ? (
        <p className="flex items-center gap-2 rounded-xl border border-amber-500/25 bg-amber-500/5 p-3 text-sm text-amber-700 dark:text-amber-300"><TriangleAlert className="size-4" />{t('fleet.bookings.unavailable', 'This vehicle cannot be booked in its current status.')}</p>
      ) : null}

      {isLoading ? (
        <div className="space-y-2">{[0, 1].map((i) => <Skeleton key={i} className="h-20 rounded-2xl" />)}</div>
      ) : !bookings.length ? (
        <EmptyState icon={CalendarRange} title={t('fleet.bookings.empty', 'No upcoming bookings')} description={t('fleet.bookings.emptyDesc', 'Anyone in the team can reserve a pool vehicle — or ask the AI: “Book the Zoe tomorrow 8 to 12”.')} />
      ) : (
        <ul className="space-y-2">
          {bookings.map((b) => {
            const live = new Date(b.start).getTime() <= now && new Date(b.end).getTime() >= now;
            const past = new Date(b.end).getTime() < now;
            return (
              <li key={b._id} className={cn('flex items-center gap-4 rounded-2xl border bg-card p-4', live ? 'border-sky-500/40 shadow-[0_0_0_4px_rgba(14,165,233,0.08)]' : 'border-border', past && 'opacity-60')}>
                <div className="hidden w-16 shrink-0 flex-col items-center rounded-xl bg-sky-500/10 py-2 text-sky-700 dark:text-sky-200 sm:flex">
                  <span className="text-[11px] font-medium uppercase">{f.monthShort(b.start)}</span>
                  <span className="text-xl font-semibold tabular-nums leading-none">{new Date(b.start).getDate()}</span>
                </div>
                <Avatar className="size-9"><AvatarFallback className="text-xs font-semibold">{initialsOf(b.bookedFor)}</AvatarFallback></Avatar>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-foreground">
                    {driverName(b.bookedFor) || '—'}
                    {live ? <span className="ms-2 rounded-full bg-sky-500/15 px-2 py-0.5 text-[11px] font-medium text-sky-700 dark:text-sky-200">{t('fleet.bookings.now', 'On the road')}</span> : null}
                  </p>
                  <p className="truncate text-xs tabular-nums text-muted-foreground">{f.dateTime(b.start)} → {f.dateTime(b.end)}</p>
                  {(b.purpose || b.destination) ? (
                    <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                      {b.destination ? <><MapPin className="size-3" aria-hidden="true" />{b.destination}{b.purpose ? ' · ' : ''}</> : null}{b.purpose}
                    </p>
                  ) : null}
                </div>
                {!past && (canWrite || mine(b)) ? (
                  <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground hover:text-destructive" onClick={() => setCancelTarget(b)}>
                    <CalendarX className="size-4" />{t('fleet.bookings.cancel', 'Cancel')}
                  </Button>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="rounded-3xl sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{t('fleet.bookings.add', 'Book vehicle')}</DialogTitle>
            <DialogDescription>{vehicle.kennzeichen}</DialogDescription>
          </DialogHeader>
          <form className="space-y-4" onSubmit={submit}>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor="b-start">{t('fleet.bookings.start', 'From')}</Label><Input id="b-start" type="datetime-local" value={form.start} onChange={(e) => { setForm((s) => ({ ...s, start: e.target.value })); setError(null); }} required /></div>
              <div className="space-y-1.5"><Label htmlFor="b-end">{t('fleet.bookings.end', 'Until')}</Label><Input id="b-end" type="datetime-local" value={form.end} min={form.start} onChange={(e) => { setForm((s) => ({ ...s, end: e.target.value })); setError(null); }} required /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor="b-dest">{t('fleet.bookings.destination', 'Destination')}</Label><Input id="b-dest" value={form.destination} onChange={(e) => setForm((s) => ({ ...s, destination: e.target.value }))} /></div>
            <div className="space-y-1.5"><Label htmlFor="b-purpose">{t('fleet.bookings.purpose', 'Purpose')}</Label><Input id="b-purpose" value={form.purpose} onChange={(e) => setForm((s) => ({ ...s, purpose: e.target.value }))} /></div>
            {error ? <p className="flex items-start gap-2 rounded-xl border border-rose-500/25 bg-rose-500/5 p-3 text-sm text-rose-700 dark:text-rose-300" role="alert"><TriangleAlert className="mt-0.5 size-4 shrink-0" />{error}</p> : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>{t('common.cancel', 'Cancel')}</Button>
              <Button type="submit" className="gap-2" disabled={addBooking.isPending}>
                {addBooking.isPending ? <Loader2 className="size-4 animate-spin" /> : <CalendarPlus className="size-4" />}{t('fleet.bookings.confirm', 'Confirm booking')}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={!!cancelTarget}
        onOpenChange={(o) => !o && setCancelTarget(null)}
        title={t('fleet.bookings.cancelTitle', 'Cancel booking?')}
        description={t('fleet.bookings.cancelDesc', 'The vehicle becomes available for this period again.')}
        confirmText={t('fleet.bookings.cancel', 'Cancel')}
        variant="destructive"
        onConfirm={async () => { await cancelBooking.mutateAsync(cancelTarget._id); setCancelTarget(null); }}
        isLoading={cancelBooking.isPending}
      />
    </div>
  );
}
