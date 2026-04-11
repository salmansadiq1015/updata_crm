import { AuthLayout } from '@/components/layout/auth-layout';
import { ResetPasswordRequestForm } from '@/components/forms/reset-password-request-form';

export const metadata = {
  title: 'Passwort zuruecksetzen — MB Boiler ERP',
};

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPasswordRequestForm />
    </AuthLayout>
  );
}
