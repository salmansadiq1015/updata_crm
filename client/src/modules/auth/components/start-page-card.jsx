'use client';

import { useState } from 'react';
import { Home, Loader2, Save } from 'lucide-react';
import apiClient from '@/lib/api/client';
import { ENDPOINTS } from '@/lib/api/endpoints';
import { useAuthStore } from '@/stores/auth-store';
import { usePermissions } from '@/shared/hooks/use-permissions';
import { useLanguage } from '@/lib/i18n/language-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { showSuccess, showError } from '@/lib/toast';

const ROLE_DEFAULT = 'ROLE_DEFAULT';
// Only pages the user may actually open are offered (permission-gated).
const START_PAGES = [
  { value: '/dashboard', label: 'Dashboard', permission: null },
  { value: '/tasks', label: 'Aufgaben', permission: 'tasks:read' },
  { value: '/projects', label: 'Projekte', permission: 'projects:read' },
  { value: '/crm/sites', label: 'Objekte', permission: 'crm:read' },
  { value: '/crm/customers', label: 'Kunden', permission: 'crm:read' },
  { value: '/scheduling/calendar', label: 'Einsatzplanung', permission: 'scheduling:read' },
  { value: '/quotes', label: 'Offerten & Aufträge', permission: 'quotations:read' },
  { value: '/documents', label: 'Dokumente', permission: 'documents:read' },
  { value: '/vehicles', label: 'Fahrzeuge', permission: 'vehicles:read' },
  { value: '/field-ops/orders', label: 'Einsätze', permission: 'mobile:read' },
];

/**
 * Personal start page (overrides the role's configured start page). "Standard"
 * falls back to whatever the Key User configured for the user's role.
 */
export function StartPageCard() {
  const { t } = useLanguage();
  const user = useAuthStore((s) => s.user);
  const { hasPermission, isAdmin } = usePermissions();
  const pages = START_PAGES.filter((p) => !p.permission || isAdmin || hasPermission(p.permission));
  const roleStart = user?.role?.uiConfig?.desktop?.startPage || '/dashboard';
  const roleStartLabel = START_PAGES.find((p) => p.value === roleStart)?.label || roleStart;
  const [value, setValue] = useState(user?.preferences?.startPage || ROLE_DEFAULT);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      const res = await apiClient.patch(ENDPOINTS.AUTH.USER_PREFERENCES, {
        startPage: value === ROLE_DEFAULT ? null : value,
      });
      const prefs = res.data?.preferences ?? res.preferences ?? {};
      const currentUser = useAuthStore.getState().user;
      useAuthStore.getState().setUser({ ...currentUser, preferences: prefs });
      showSuccess(t('profile.startPageSaved', 'Startseite gespeichert'));
    } catch (err) {
      showError(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="mt-6">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Home className="h-4 w-4 text-muted-foreground" />
          {t('profile.startPage', 'Persönliche Startseite')}
        </CardTitle>
        <CardDescription>
          {t('profile.startPageDesc', 'Diese Seite öffnet sich nach Ihrer Anmeldung. «Standard» übernimmt die Vorgabe Ihrer Rolle.')}
        </CardDescription>
      </CardHeader>
      <CardContent className="flex flex-wrap items-center gap-3">
        <Select value={value} onValueChange={setValue}>
          <SelectTrigger className="w-64"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value={ROLE_DEFAULT}>
              {t('profile.startPageRole', 'Standard (Rolle)')} — {roleStartLabel}
            </SelectItem>
            {pages.map((p) => (
              <SelectItem key={p.value} value={p.value}>{p.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button className="gap-2" onClick={save} disabled={saving}>
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {t('common.save', 'Speichern')}
        </Button>
      </CardContent>
    </Card>
  );
}
