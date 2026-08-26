'use client';

import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { formatCurrency } from '@/lib/formatters/number';

/**
 * The list an agent answered with, as rows that open the record.
 *
 * The agents have always returned their findings as structured records
 * beside the written answer; only the prose reached the screen, so an office
 * reading "vier überfällige Wartungen" had to go and find each plant by hand.
 *
 * Two decisions shape what appears here.
 *
 * A row is built per action rather than guessed from the record's fields. The
 * seven agents that return lists return seven different shapes, and duck-typing
 * across them would silently mislabel a row the day a field is renamed. The
 * action is in the payload; it is the honest key.
 *
 * And only the three lists whose records have a detail page appear at all.
 * Rows for the others would repeat what the message above already says, and
 * add a click that leads nowhere — a list of monteurs, of classified documents
 * or of knowledge sources is already complete in the prose.
 *
 * How much a row shows follows from how much the message already said. Service
 * AI and Sales AI write out every field, so their rows carry only what tells
 * two of them apart; the customer search answers with a single sentence, so
 * its rows carry the address and the telephone number.
 */

/** Swiss dates, matching the rest of the office screens. */
function swissDate(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString('de-CH');
}

const HREF = {
  installation: (id) => `/crm/installations/${id}`,
  customer: (id) => `/crm/customers/${id}`,
  quotation: (id) => `/quotes?quotationId=${id}`,
};

/**
 * One builder per action. Each returns the row, or null for a record that
 * cannot be shown — never a half-filled row.
 */
const ROWS = {
  SERVICE_DUE: (record, t) => ({
    key: record.id,
    title: record.plant,
    // The plant name alone does not tell two services on the same boiler
    // apart; the customer and the service do.
    subtitle: [record.customer, record.maintenance].filter(Boolean).join(' · '),
    // The reason the row is in the list at all belongs on the right.
    badge: record.daysOverdue > 0
      ? t('ai.records.daysOverdue', '{days} Tage überfällig', { days: record.daysOverdue })
      : swissDate(record.nextDueDate),
    urgent: record.daysOverdue > 0,
    href: record.installationId ? HREF.installation(record.installationId) : null,
  }),

  SALES_FOLLOWUPS: (record, t, locale) => ({
    key: record.id,
    title: [record.quotationNumber, record.title].filter(Boolean).join(' · '),
    subtitle: record.customerName,
    badge: record.value ? formatCurrency(record.value, { locale }) : null,
    href: record.id ? HREF.quotation(record.id) : null,
  }),

  SEARCH_CUSTOMER: (record) => ({
    key: record.id,
    title: record.name,
    subtitle: [record.ownerName, record.city].filter(Boolean).join(' · '),
    detail: [record.phone, record.email].filter(Boolean).join(' · '),
    badge: record.customerNumber,
    href: record.id ? HREF.customer(record.id) : null,
  }),
};

/** Beyond this the bubble stops being readable; the message above has them all. */
const MAX_ROWS = 6;

function Row({ row }) {
  const body = (
    <>
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-foreground">{row.title}</p>
        {row.subtitle ? (
          <p className="truncate text-xs text-muted-foreground">{row.subtitle}</p>
        ) : null}
        {row.detail ? (
          <p className="truncate text-xs text-muted-foreground/70">{row.detail}</p>
        ) : null}
      </div>
      {row.badge ? (
        <span
          className={
            row.urgent
              ? 'shrink-0 rounded-md bg-destructive/10 px-2 py-0.5 text-xs font-medium text-destructive'
              : 'shrink-0 text-xs font-medium text-muted-foreground tabular-nums'
          }
        >
          {row.badge}
        </span>
      ) : null}
      {row.href ? <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground/60" /> : null}
    </>
  );

  const className = 'flex items-center gap-3 rounded-lg border border-border bg-card px-3 py-2 text-left';

  // A record without a detail page still belongs in the list — it just does
  // not pretend to be clickable.
  return row.href ? (
    <Link href={row.href} className={`${className} transition-colors hover:border-primary/40 hover:bg-primary/5`}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}

export function AiRecordCards({ output }) {
  const { t, locale } = useLanguage();
  const build = ROWS[output?.action];
  const records = Array.isArray(output?.records) ? output.records : [];
  if (!build || !records.length) return null;

  const rows = records.slice(0, MAX_ROWS).map((record) => build(record, t, locale)).filter(Boolean);
  if (!rows.length) return null;
  const hidden = records.length - rows.length;

  return (
    <div className="mt-3 flex flex-col gap-1.5">
      {/* Says what the rows are for, so they read as a way in rather than as
          the same list written twice. */}
      <p className="px-1 text-xs font-medium text-muted-foreground">
        {t('ai.records.openDirectly', 'Direkt öffnen')}
      </p>
      {rows.map((row) => <Row key={row.key} row={row} />)}
      {hidden > 0 ? (
        <p className="px-1 text-xs text-muted-foreground">
          {t('ai.records.more', '… und {count} weitere in der Antwort oben', { count: hidden })}
        </p>
      ) : null}
    </div>
  );
}
