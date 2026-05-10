'use client';

import { useState } from 'react';
import { RefreshCw, Download, ChevronDown, ChevronRight } from 'lucide-react';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { format } from 'date-fns';
import { useIghImportHistory, useIghImportJob, useIghConfig } from '../hooks/use-igh-queries';
import { useIghMutations } from '../hooks/use-igh-mutations';
import { useLanguage } from '@/lib/i18n/language-context';

const STATUS_VARIANT = {
  PENDING: 'secondary',
  RUNNING: 'default',
  COMPLETED: 'outline',
  FAILED: 'destructive',
};

function JobRow({ job }) {
  const { t } = useLanguage();
  const [expanded, setExpanded] = useState(false);
  const isActive = job.status === 'RUNNING' || job.status === 'PENDING';

  const { data: liveJob } = useIghImportJob(isActive ? job._id : null);
  const current = liveJob ?? job;

  return (
    <>
      <TableRow>
        <TableCell>
          <button
            type="button"
            className="flex items-center gap-1 text-sm"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            {current.type === 'FULL' ? 'Full Import' : 'Delta Sync'}
          </button>
        </TableCell>
        <TableCell>
          <Badge variant={STATUS_VARIANT[current.status] ?? 'secondary'}>
            {t(`catalog.igh.status.${current.status?.toLowerCase()}`)}
          </Badge>
          {isActive && (
            <Progress value={current.progress ?? 0} className="mt-1.5 h-1.5 w-24" />
          )}
        </TableCell>
        <TableCell className="text-sm text-muted-foreground">
          {current.createdAt ? format(new Date(current.createdAt), 'dd.MM.yyyy HH:mm') : '—'}
        </TableCell>
        <TableCell className="text-sm">
          {current.status === 'COMPLETED' && (
            <span>
              +{current.articlesCreated ?? 0} / ~{current.articlesUpdated ?? 0}
            </span>
          )}
          {current.status === 'FAILED' && (
            <span className="text-destructive text-xs">{current.log}</span>
          )}
        </TableCell>
      </TableRow>
      {expanded && current.log && (
        <TableRow>
          <TableCell colSpan={4} className="bg-muted/30 p-3">
            <pre className="text-xs font-mono whitespace-pre-wrap max-h-32 overflow-y-auto">
              {current.log}
            </pre>
          </TableCell>
        </TableRow>
      )}
    </>
  );
}

export function IghImportHistoryTable() {
  const { t } = useLanguage();
  const { data: jobs = [], isLoading } = useIghImportHistory();
  const { importFull, importDelta } = useIghMutations();
  const { data: config } = useIghConfig();

  if (!config?.isEnabled) {
    return (
      <div className="rounded-md border p-6 text-center text-sm text-muted-foreground">
        IGH integration is disabled. Enable it in the configuration above.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Button
          size="sm"
          variant="outline"
          disabled={importFull.isPending}
          onClick={() => importFull.mutate()}
        >
          <Download className="w-4 h-4 mr-2" />
          {t('catalog.igh.importFull')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={importDelta.isPending}
          onClick={() => importDelta.mutate()}
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          {t('catalog.igh.importDelta')}
        </Button>
      </div>

      <div className="rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Type</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Started</TableHead>
              <TableHead>Result</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  Loading...
                </TableCell>
              </TableRow>
            ) : jobs.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                  No imports yet.
                </TableCell>
              </TableRow>
            ) : (
              jobs.map((job) => <JobRow key={job._id} job={job} />)
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
