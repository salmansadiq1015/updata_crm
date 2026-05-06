'use client';

import { useState } from 'react';
import { PageHeader } from '@/shared/components/page-header';
import { QuotationsTable } from '@/modules/qop/components/quotations-table';
import { OrdersTable } from '@/modules/qop/components/orders-table';
import { InvoicesTable } from '@/modules/qop/components/invoices-table';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';

const TABS = ['quotations', 'orders', 'invoices'];

const TAB_LABEL = {
  quotations: { de: 'Offerten', en: 'Quotations' },
  orders:     { de: 'Aufträge', en: 'Orders' },
  invoices:   { de: 'Rechnungen', en: 'Invoices' },
};

export default function QuotesPage() {
  const { locale: language } = useLanguage();
  const de = language === 'de';
  const [tab, setTab] = useState('quotations');

  return (
    <div className="flex flex-col gap-5 w-full min-w-0">
      <PageHeader
        title={de ? 'Offerten, Aufträge & Rechnungen' : 'Quotations, Orders & Invoices'}
        description={de
          ? 'Kundenangebote erstellen, Aufträge verwalten und Rechnungen stellen'
          : 'Create customer quotes, manage orders and issue invoices'}
      />

      {/* Tabs */}
      <div className="flex gap-1 border-b">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={cn(
              'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
              tab === t
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {de ? TAB_LABEL[t].de : TAB_LABEL[t].en}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab === 'quotations' && <QuotationsTable />}
        {tab === 'orders' && <OrdersTable />}
        {tab === 'invoices' && <InvoicesTable />}
      </div>
    </div>
  );
}
