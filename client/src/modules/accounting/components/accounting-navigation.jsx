'use client';

import { usePathname, useRouter } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, ChevronRight, Home, Landmark } from 'lucide-react';
import { Button } from '@/components/ui/button';

const PAGE_LABELS = {
  assets: 'Fixed Assets',
  bank: 'Bank',
  budgets: 'Budgets',
  cash: 'Cash Flow',
  'chart-of-accounts': 'Chart of Accounts',
  documents: 'Documents',
  entities: 'Accounting Structure',
  'exchange-rates': 'Exchange Rates',
  'fiscal-periods': 'Fiscal Periods',
  inventory: 'Inventory Accounting',
  journal: 'Journal',
  'open-items': 'Open Items',
  payables: 'Payables',
  receivables: 'Receivables',
  reconciliation: 'Reconciliation',
  recurring: 'Recurring Transactions',
  reports: 'Reports',
  search: 'Financial Search',
  tax: 'Tax Management',
};

function currentPageLabel(pathname) {
  const segment = pathname.split('/').filter(Boolean).at(-1);
  return PAGE_LABELS[segment] || 'Accounting';
}

export function AccountingBackBar() {
  const pathname = usePathname();
  const router = useRouter();
  const isAccountingRoot = pathname === '/accounting';

  if (isAccountingRoot) return null;

  const handleBack = () => {
    if (typeof window !== 'undefined' && window.history.length > 1) {
      router.back();
      return;
    }
    router.push('/accounting');
  };

  return (
    <div className="accounting-backbar mb-5 flex flex-col gap-3 rounded-xl border border-white/10 bg-white/[0.045] px-3 py-3 shadow-[0_16px_48px_rgb(0_0_0/0.18)] backdrop-blur-xl sm:flex-row sm:items-center sm:justify-between">
      <nav aria-label="Accounting breadcrumb" className="flex min-w-0 items-center gap-2 text-sm">
        <Link
          href="/accounting"
          className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-white/10 bg-white/[0.05] text-slate-300 transition-colors hover:text-white"
          aria-label="Accounting home"
          title="Accounting home"
        >
          <Home className="size-4" />
        </Link>
        <ChevronRight className="size-4 shrink-0 text-slate-600" />
        <span className="flex min-w-0 items-center gap-2">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-cyan-400/10 text-cyan-200 ring-1 ring-cyan-300/20">
            <Landmark className="size-4" />
          </span>
          <span className="min-w-0">
            <span className="block text-[11px] font-bold uppercase tracking-[0.18em] text-slate-500">Accounting</span>
            <span className="block truncate font-semibold text-slate-100">{currentPageLabel(pathname)}</span>
          </span>
        </span>
      </nav>
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleBack}
        className="h-9 w-full border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white sm:w-auto"
      >
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>
    </div>
  );
}
