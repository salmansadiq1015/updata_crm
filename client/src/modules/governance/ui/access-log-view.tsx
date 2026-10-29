'use client';

import { useMemo, useState } from 'react';
import { Loader2, RefreshCw, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLanguage } from '@/lib/i18n/language-context';
import { useUserDirectory } from '@/modules/users/hooks/use-user-directory';
import { useAccessLog } from '../hooks/use-governance';
import { accessActionLabel } from './access-log-labels';
import type { AccessLogAction, AccessLogFilters } from '../types/governance-types';

const ACTIONS: AccessLogAction[] = ['grant', 'access', 'reveal', 'export'];
const ALL = 'all';
const OBJECT_ID = /^[0-9a-f]{24}$/i;

type DirectoryUser = { _id: string; firstName?: string; lastName?: string; email?: string };
const nameOf = (u: DirectoryUser) => [u.firstName, u.lastName].filter(Boolean).join(' ') || u.email || u._id;

/** Admin "Access log": supervisor access with reasons, PII reveals and exports. */
export function AccessLogView({ initialLeadId = '' }: { initialLeadId?: string }) {
  const { t } = useLanguage();
  const [userId, setUserId] = useState(ALL);
  const [action, setAction] = useState<string>(ALL);
  const [leadId, setLeadId] = useState(initialLeadId);
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const users = useUserDirectory({ limit: 200 });

  const leadIdValid = !leadId || OBJECT_ID.test(leadId.trim());
  const rangeValid = !from || !to || from <= to;
  const filters = useMemo<AccessLogFilters>(() => ({
    ...(userId !== ALL ? { userId } : {}),
    ...(action !== ALL ? { action: action as AccessLogAction } : {}),
    ...(leadId && leadIdValid ? { leadId: leadId.trim() } : {}),
    ...(from ? { from: new Date(`${from}T00:00:00`).toISOString() } : {}),
    ...(to && rangeValid ? { to: new Date(`${to}T23:59:59`).toISOString() } : {}),
  }), [userId, action, leadId, leadIdValid, from, to, rangeValid]);
  const query = useAccessLog(filters);
  const rows = query.data?.pages.flatMap((p) => p.data) ?? [];
  const directory = (users.data ?? []) as DirectoryUser[];

  return (
    <div className="space-y-4">
      <div className="grid gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-2 lg:grid-cols-5">
        <label className="space-y-1 text-xs font-medium text-foreground">
          {t('governance.log.filter.user', 'User')}
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger aria-label={t('governance.log.filter.user', 'User')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('governance.log.filter.allUsers', 'All users')}</SelectItem>
              {directory.map((u) => <SelectItem key={u._id} value={u._id}>{nameOf(u)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium text-foreground">
          {t('governance.log.filter.action', 'Action')}
          <Select value={action} onValueChange={setAction}>
            <SelectTrigger aria-label={t('governance.log.filter.action', 'Action')}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t('governance.log.filter.allActions', 'All actions')}</SelectItem>
              {ACTIONS.map((a) => <SelectItem key={a} value={a}>{t(`governance.log.actionGroup.${a}`, a)}</SelectItem>)}
            </SelectContent>
          </Select>
        </label>
        <label className="space-y-1 text-xs font-medium text-foreground">
          {t('governance.log.filter.lead', 'Lead ID')}
          <Input value={leadId} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setLeadId(e.target.value)} placeholder="6ae3…" aria-invalid={!leadIdValid} dir="ltr" />
        </label>
        <label className="space-y-1 text-xs font-medium text-foreground">
          {t('governance.log.filter.from', 'From')}
          <Input type="date" value={from} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setFrom(e.target.value)} />
        </label>
        <label className="space-y-1 text-xs font-medium text-foreground">
          {t('governance.log.filter.to', 'To')}
          <Input type="date" value={to} onChange={(e: React.ChangeEvent<HTMLInputElement>) => setTo(e.target.value)} aria-invalid={!rangeValid} />
        </label>
      </div>
      {!leadIdValid && <p role="alert" className="text-xs text-destructive">{t('governance.log.invalidLead', 'Enter a complete 24-character lead ID.')}</p>}
      {!rangeValid && <p role="alert" className="text-xs text-destructive">{t('governance.log.invalidRange', 'The end date must be on or after the start date.')}</p>}

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        {query.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground"><Loader2 className="size-4 animate-spin" aria-hidden />{t('common.loading', 'Loading…')}</div>
        ) : query.isError ? (
          <div className="flex items-center justify-between gap-3 p-4">
            <p className="text-sm text-destructive">{t('governance.log.error', 'The access log could not be loaded.')}</p>
            <Button size="sm" variant="outline" onClick={() => void query.refetch()}><RefreshCw aria-hidden />{t('common.retry', 'Retry')}</Button>
          </div>
        ) : !rows.length ? (
          <div className="flex flex-col items-center gap-2 py-12 text-center">
            <ShieldCheck className="size-6 text-muted-foreground" aria-hidden />
            <p className="text-sm text-muted-foreground">{t('governance.log.empty', 'No access events match these filters.')}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead className="bg-muted/50 text-start text-xs text-muted-foreground">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('governance.log.col.when', 'When')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('governance.log.col.user', 'User')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('governance.log.col.action', 'Action')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('governance.log.col.lead', 'Lead')}</th>
                  <th scope="col" className="px-3 py-2 text-start font-medium">{t('governance.log.col.reason', 'Reason')}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {rows.map((row) => (
                  <tr key={row.id} className={row.result === 'failure' ? 'bg-destructive/5' : undefined}>
                    <td className="whitespace-nowrap px-3 py-2 text-xs text-muted-foreground"><time dateTime={row.timestamp}>{new Date(row.timestamp).toLocaleString()}</time></td>
                    <td className="px-3 py-2">{row.userName || t('governance.log.unknownUser', 'Unknown user')}</td>
                    <td className="px-3 py-2">
                      {accessActionLabel(row, t)}
                      {row.result === 'failure' && <span className="ms-1 text-xs text-destructive">({t('governance.log.denied', 'denied')})</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">
                      {row.leadId ? (
                        <a className="text-primary hover:underline" href={`/leads?detail=${row.leadId}`}>{row.leadName || row.leadId}</a>
                      ) : <span className="text-muted-foreground">—</span>}
                    </td>
                    <td className="px-3 py-2 text-xs">{row.reason || <span className="text-muted-foreground">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {query.hasNextPage && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>
            {query.isFetchingNextPage && <Loader2 className="animate-spin" aria-hidden />}{t('governance.log.loadMore', 'Load more')}
          </Button>
        </div>
      )}
    </div>
  );
}

export default AccessLogView;
