'use client';

import { PageHeader } from '@/components/common/page-header';
import { ProfileForm } from '@/components/forms/profile-form';
import { ChangePasswordForm } from '@/components/forms/change-password-form';

export default function ProfilePage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Profil"
        description="Verwalten Sie Ihre persoenlichen Daten und Ihr Passwort."
      />
      <div className="grid gap-6 lg:grid-cols-2">
        <ProfileForm />
        <ChangePasswordForm />
      </div>
    </div>
  );
}
