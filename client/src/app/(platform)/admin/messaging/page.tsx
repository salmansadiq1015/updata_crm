'use client';

import { PermissionGate } from '@/shared/components/permission-gate';
import { ProviderSettingsPage } from '@/modules/messaging/components/provider-settings';

export default function MessagingSettingsRoute() {
  return <PermissionGate permission="settings:admin"><ProviderSettingsPage /></PermissionGate>;
}
