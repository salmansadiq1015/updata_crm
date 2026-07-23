'use client';

import { useMemo, useState } from 'react';
import { useSystemJobs } from '../hooks/use-platform-queries';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Inbox } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import type { QueueStats } from '../types/platform.types';

type QueueStatus = keyof Pick<QueueStats, 'waiting' | 'active' | 'completed' | 'failed' | 'delayed'>;
type QueueStatusFilter = QueueStatus | 'all';

const QUEUE_STATUS_COLUMNS: Array<{ key: QueueStatus; labelKey: string; fallback: string }> = [
  { key: 'waiting', labelKey: 'platform.status.waiting', fallback: 'Wartend' },
  { key: 'active', labelKey: 'platform.status.active', fallback: 'Aktiv' },
  { key: 'completed', labelKey: 'platform.status.completed', fallback: 'Abgeschlossen' },
  { key: 'failed', labelKey: 'platform.status.failed', fallback: 'Fehlgeschlagen' },
  { key: 'delayed', labelKey: 'platform.status.delayed', fallback: 'Verzögert' },
];
const QUEUE_STATUS_FILTERS = new Set<QueueStatusFilter>([
  'all',
  ...QUEUE_STATUS_COLUMNS.map((status) => status.key),
]);

const statusBadge: Record<QueueStatus, string> = {
  active: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  delayed: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  waiting: 'bg-muted text-muted-foreground',
};

function getErrorMessage(error: unknown) {
  if (error && typeof error === 'object' && 'message' in error && typeof error.message === 'string') {
    return error.message;
  }
  return null;
}

function isQueueStatusFilter(value: string): value is QueueStatusFilter {
  return QUEUE_STATUS_FILTERS.has(value as QueueStatusFilter);
}

export function JobsViewer() {
  const { t } = useLanguage();
  const [statusFilter, setStatusFilter] = useState<QueueStatusFilter>('all');
  const { data, error, isError, isLoading } = useSystemJobs();

  const visibleQueues = useMemo(() => {
    const queues = data?.data ?? [];
    if (statusFilter === 'all') return queues;
    return queues.filter((queue) => queue[statusFilter] > 0);
  }, [data?.data, statusFilter]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">{t('platform.jobs')}</CardTitle>
        <Select
          value={statusFilter}
          onValueChange={(value) => {
            if (isQueueStatusFilter(value)) setStatusFilter(value);
          }}
        >
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t('common.all')}</SelectItem>
            {QUEUE_STATUS_COLUMNS.map((status) => (
              <SelectItem key={status.key} value={status.key}>
                {t(status.labelKey, status.fallback)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold uppercase">{t('platform.queue')}</TableHead>
              {QUEUE_STATUS_COLUMNS.map((status) => (
                <TableHead key={status.key} className="text-right text-xs font-semibold uppercase">
                  {t(status.labelKey, status.fallback)}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, rowIndex) => (
                <TableRow key={rowIndex}>
                  {Array.from({ length: 6 }).map((_, cellIndex) => (
                    <TableCell key={cellIndex}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : isError ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32">
                  <div className="flex flex-col items-center gap-2 text-destructive">
                    <Inbox className="h-6 w-6 opacity-50" />
                    <p className="text-sm">
                      {getErrorMessage(error) ?? t('platform.jobsLoadFailed', 'Jobs konnten nicht geladen werden')}
                    </p>
                  </div>
                </TableCell>
              </TableRow>
            ) : visibleQueues.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-6 w-6 opacity-40" />
                    <p className="text-sm">{t('platform.noJobs')}</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              visibleQueues.map((queue) => (
                <TableRow key={queue.name} className="group/row">
                  <TableCell className="font-medium text-sm">
                    {queue.name}
                  </TableCell>
                  {QUEUE_STATUS_COLUMNS.map((status) => (
                    <TableCell key={status.key} className="text-right">
                      <Badge
                        variant="outline"
                        className={queue[status.key] > 0 ? statusBadge[status.key] : 'bg-muted/40 text-muted-foreground border-border'}
                      >
                        {queue[status.key]}
                      </Badge>
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
