'use client';

import { usePathname, useRouter } from 'next/navigation';
import { ArrowLeft } from 'lucide-react';
import { Button } from '@/components/ui/button';

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
    <div className="mb-4 flex items-center">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={handleBack}
        className="border-white/10 bg-white/[0.04] text-slate-200 hover:bg-white/[0.08] hover:text-white"
      >
        <ArrowLeft className="mr-1.5 size-4" />
        Back
      </Button>
    </div>
  );
}
