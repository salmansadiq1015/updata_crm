import { Suspense } from 'react';
import { AuthLayout } from '@/modules/auth/components/auth-layout';
import { LoginForm } from '@/modules/auth/components/login-form';

export const metadata = {
  title: 'Anmelden — MB Boiler ERP',
};

function LoginFallback() {
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

export default function LoginPage() {
  return (
    <AuthLayout>
      <Suspense fallback={<LoginFallback />}>
        <LoginForm />
      </Suspense>
    </AuthLayout>
  );
}
