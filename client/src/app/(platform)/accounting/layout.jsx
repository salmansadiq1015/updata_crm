import { AccountingBackBar } from '@/modules/accounting/components/accounting-navigation';

export default function AccountingLayout({ children }) {
  return (
    <section className="accounting-premium -m-4 min-h-[calc(100dvh-4rem)] overflow-hidden sm:-m-6">
      <div className="accounting-premium__aurora" aria-hidden="true" />
      <div className="accounting-premium__mesh" aria-hidden="true" />
      <div className="relative z-10 mx-auto w-full max-w-[1600px] p-4 sm:p-6 lg:p-8">
        <AccountingBackBar />
        {children}
      </div>
    </section>
  );
}
