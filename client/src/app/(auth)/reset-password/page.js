import { AuthLayout } from '@/modules/auth/components/auth-layout';
import { ResetPasswordRequestForm } from '@/modules/auth/components/reset-password-request-form';

export const metadata = {
  title: 'Passwort zurücksetzen — MB Boiler ERP',
};

export default function ResetPasswordPage() {
  return (
    <AuthLayout>
      <ResetPasswordRequestForm />
    </AuthLayout>
  );
}
