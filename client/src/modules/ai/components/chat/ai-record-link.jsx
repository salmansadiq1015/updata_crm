'use client';

import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';

/**
 * Deep link to whatever the agent just created or changed.
 *
 * Without it the assistant announces a quotation number and leaves the reader
 * to go and find it. Only record types with a real detail route appear.
 */
// Every type here opens the record itself. Three of them used to land on a
// list — "one click to the right place" that still left the reader hunting for
// the row the assistant had just been talking about.
const ROUTES = {
  project: (id) => `/projects/${id}`,
  customer: (id) => `/crm/customers/${id}`,
  order: (id) => `/field-ops/orders/${id}`,
  chatRoom: (id) => `/field-ops/chat?chatId=${id}`,
  quotation: (id) => `/quotes?quotationId=${id}`,
  invoice: (id) => `/quotes?invoiceId=${id}`,
  task: (id) => `/tasks/all/${id}`,
  workReport: (id) => `/field-ops/reports?reportId=${id}`,
  assignment: (id) => `/scheduling/calendar?assignmentId=${id}`,
  installation: (id) => `/crm/installations/${id}`,
  vehicle: (id) => `/vehicles/${id}`,
};

const LABEL_KEYS = {
  task: 'ai.record.openTask',
  project: 'ai.record.openProject',
  quotation: 'ai.record.openQuotation',
  invoice: 'ai.record.openInvoice',
  order: 'ai.record.openOrder',
  customer: 'ai.record.openCustomer',
  installation: 'ai.record.openInstallation',
  workReport: 'ai.record.openReport',
  assignment: 'ai.record.openAssignment',
  chatRoom: 'ai.record.openChat',
  vehicle: 'ai.record.openVehicle',
};

export function AiRecordLink({ output }) {
  const { t } = useLanguage();
  const recordType = output?.recordType;
  const recordId = output?.recordId || output?.record?.id;
  if (!recordType || !recordId) return null;

  const href = ROUTES[recordType]?.(recordId);
  if (!href) return null;

  const record = output.record || {};
  const caption = record.quotationNumber || record.projectNumber || record.orderNumber
    || record.invoiceNumber || record.reportNumber || record.installationNumber
    || record.plate || record.title || record.name || null;

  return (
    <Link
      href={href}
      className="mt-3 inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground transition-colors hover:border-primary/40 hover:bg-primary/5"
    >
      {t(LABEL_KEYS[recordType], 'Öffnen')}
      {caption ? <span className="text-muted-foreground">· {caption}</span> : null}
      <ArrowUpRight className="h-3.5 w-3.5 text-muted-foreground" />
    </Link>
  );
}
