import { Suspense } from 'react';
import { AuthLayout } from '@/modules/auth/components/auth-layout';
import { ActivateAccountForm } from '@/modules/auth/components/activate-account-form';

export const metadata = {
  title: 'Konto aktivieren — MB Boiler ERP',
};

function ActivateFallback() {
  return (
    <div className="space-y-4">
      <div className="h-8 w-48 rounded-lg bg-muted animate-pulse" />
      <div className="h-4 w-64 rounded bg-muted animate-pulse" />
      <div className="space-y-3 mt-8">
        <div className="h-11 rounded-xl bg-muted animate-pulse" />
        <div className="h-11 rounded-xl bg-muted animate-pulse" />
        <div className="h-11 rounded-xl bg-muted animate-pulse" />
      </div>
    </div>
  );
}

export default function ActivatePage() {
  return (
    <AuthLayout>
      <Suspense fallback={<ActivateFallback />}>
        <ActivateAccountForm />
      </Suspense>
    </AuthLayout>
  );
}
