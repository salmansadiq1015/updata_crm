import { Suspense } from 'react';
import { AuthLayout } from '@/modules/auth/components/auth-layout';
import { ResetPasswordConfirmForm } from '@/modules/auth/components/reset-password-confirm-form';

export const metadata = {
  title: 'Neues Passwort setzen — MB Boiler ERP',
};

function ConfirmFallback() {
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

export default function ResetPasswordConfirmPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<ConfirmFallback />}>
        <ResetPasswordConfirmForm />
      </Suspense>
    </AuthLayout>
  );
}
