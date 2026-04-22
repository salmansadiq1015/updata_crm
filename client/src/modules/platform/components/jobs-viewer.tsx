'use client';

import { useState } from 'react';
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
import { formatDistanceToNow } from 'date-fns';
import { de } from 'date-fns/locale';
import { Inbox } from 'lucide-react';

const statusBadge: Record<string, string> = {
  active: 'bg-blue-500/10 text-blue-600 border-blue-500/20',
  completed: 'bg-emerald-500/10 text-emerald-600 border-emerald-500/20',
  failed: 'bg-red-500/10 text-red-600 border-red-500/20',
  delayed: 'bg-amber-500/10 text-amber-600 border-amber-500/20',
  waiting: 'bg-muted text-muted-foreground',
};

export function JobsViewer() {
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const { data, isLoading } = useSystemJobs(
    statusFilter !== 'all' ? { status: statusFilter } : undefined
  );

  const jobs = data?.data ?? [];

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="text-base">Hintergrundjobs</CardTitle>
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-9">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Alle</SelectItem>
            <SelectItem value="active">Aktiv</SelectItem>
            <SelectItem value="completed">Abgeschlossen</SelectItem>
            <SelectItem value="failed">Fehlgeschlagen</SelectItem>
            <SelectItem value="delayed">Verzögert</SelectItem>
            <SelectItem value="waiting">Wartend</SelectItem>
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/30">
              <TableHead className="text-xs font-semibold uppercase">Job</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Queue</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Status</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Versuche</TableHead>
              <TableHead className="text-xs font-semibold uppercase">Zeit</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <TableRow key={i}>
                  {Array.from({ length: 5 }).map((_, j) => (
                    <TableCell key={j}>
                      <Skeleton className="h-4 w-full" />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-32">
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <Inbox className="h-6 w-6 opacity-40" />
                    <p className="text-sm">Keine Jobs gefunden</p>
                  </div>
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job: Record<string, unknown>) => (
                <TableRow key={job.id as string} className="group/row">
                  <TableCell className="font-medium text-sm">
                    {job.name as string}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.queue as string}
                  </TableCell>
                  <TableCell>
                    <Badge
                      variant="outline"
                      className={statusBadge[(job.status as string) ?? 'waiting']}
                    >
                      {job.status as string}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.attempts as number}/{job.maxAttempts as number}
                  </TableCell>
                  <TableCell className="text-sm text-muted-foreground">
                    {job.createdAt
                      ? formatDistanceToNow(new Date(job.createdAt as string), {
                          addSuffix: true,
                          locale: de,
                        })
                      : '–'}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}
