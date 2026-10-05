'use client';

import { ChevronDown, Download, FileSpreadsheet, FileText, Loader2 } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { useExportLeads } from '../hooks/use-leads';
import type { LeadExportFilters, LeadExportFormat } from '../services/lead-api';
import { useLeadsStore } from '../state/leads-store';
import type { LeadsFilters } from '../state/leads-store';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
  useLanguage,
} from './lead-ui-kit';
import { FILTER_ALL, FILTER_ME } from './lead-ui-constants';

type AuthSlice = { user?: { _id?: string; id?: string } | null };

/** Map the live list filters onto the export query, resolving the "me" sentinel. */
function buildExportFilters(filters: LeadsFilters, currentUserId: string | null): LeadExportFilters {
  const assignedTo =
    filters.assignedTo === FILTER_ALL
      ? undefined
      : filters.assignedTo === FILTER_ME
        ? (currentUserId ?? undefined)
        : filters.assignedTo;
  const q = filters.search.trim().slice(0, 100);
  return {
    ...(filters.status !== 'ALL' ? { status: filters.status } : {}),
    ...(filters.source !== 'ALL' ? { source: filters.source } : {}),
    ...(filters.type !== 'ALL' ? { type: filters.type } : {}),
    ...(filters.place !== 'ALL' ? { city: filters.place } : {}),
    ...(assignedTo ? { assignedTo } : {}),
    ...(q ? { q } : {}),
  };
}

const FORMATS: ReadonlyArray<{ value: LeadExportFormat; labelKey: string; label: string; Icon: typeof FileSpreadsheet }> = [
  { value: 'csv', labelKey: 'leads.export.csv', label: 'CSV', Icon: FileSpreadsheet },
  { value: 'xlsx', labelKey: 'leads.export.xlsx', label: 'Excel', Icon: FileSpreadsheet },
  { value: 'pdf', labelKey: 'leads.export.pdf', label: 'PDF', Icon: FileText },
];

/**
 * Export the current leads list (honouring its filters) to CSV, Excel or PDF.
 * The chosen format triggers a browser download via `useExportLeads`.
 */
export function LeadExportMenu() {
  const { t } = useLanguage();
  const filters = useLeadsStore((state) => state.filters);
  const currentUserId = useAuthStore((state: AuthSlice) => state.user?._id ?? state.user?.id ?? null);
  const exportLeads = useExportLeads();

  const handleExport = (format: LeadExportFormat) => {
    exportLeads.mutate({ format, filters: buildExportFilters(filters, currentUserId) });
  };

  const busy = exportLeads.isPending;

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" className="h-9 gap-2" disabled={busy}>
          {busy ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Download className="h-4 w-4" aria-hidden="true" />
          )}
          {busy ? t('leads.export.exporting', 'Exporting…') : t('leads.export.label', 'Export')}
          <ChevronDown className="h-3.5 w-3.5 opacity-60" aria-hidden="true" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-44">
        <DropdownMenuLabel>{t('leads.export.label', 'Export')}</DropdownMenuLabel>
        {FORMATS.map(({ value, labelKey, label, Icon }) => (
          <DropdownMenuItem key={value} onSelect={() => handleExport(value)} className="gap-2">
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
            {t(labelKey, label)}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
