'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  Bell,
  RefreshCw,
  Info,
  LogOut,
  HardDrive,
  Trash2,
  Shield,
  AlertTriangle,
} from 'lucide-react';
import { useLanguage } from '@/lib/i18n/language-context';
import { useAuthStore } from '@/stores/auth-store';
import { MobileHeader } from '@/modules/mobile/components/mobile-header';
import { useNotificationPreferences } from '@/modules/mobile/hooks/use-notification-queries';
import { useDeviceRegistration } from '@/modules/mobile/hooks/use-device';
import { useSyncStatus } from '@/modules/mobile/hooks/use-sync-status';
import { useNetworkStatus } from '@/modules/mobile/hooks/use-network-status';
import { triggerSync } from '@/modules/mobile/lib/sync-engine';
import { checkStorageQuota } from '@/modules/mobile/db/cleanup';
import { cleanupExpiredData } from '@/modules/mobile/db/cleanup';
import { clearCachedTokens } from '@/modules/mobile/lib/auth-offline';
import { cn } from '@/lib/utils';
import {
  NOTIFICATION_PREFERENCE_TYPES,
  isPreferenceEnabled,
  setPreferenceEnabled,
  setQuietHoursValue,
} from '@/modules/notifications/utils/notification-preferences';
import toast from 'react-hot-toast';

export default function SettingsPage() {
  const { t, locale } = useLanguage();
  const lang = locale === 'en' ? 'en' : 'de';
  const router = useRouter();
  const isOnline = useNetworkStatus();
  const clearAuth = useAuthStore((s) => s.clearAuth);
  const user = useAuthStore((s) => s.user);
  const { lastSyncAt, pendingCount, failedCount, syncStatus } = useSyncStatus();

  const [storage, setStorage] = useState(null);
  const [cleaning, setCleaning] = useState(false);

  useEffect(() => {
    checkStorageQuota().then(setStorage);
  }, []);

  const handleSync = async () => {
    if (!isOnline) {
      toast.error(lang === 'de' ? 'Sync nur online möglich' : 'Sync requires internet');
      return;
    }
    await triggerSync();
    toast.success(lang === 'de' ? 'Synchronisierung gestartet' : 'Sync started');
  };

  const handleCleanup = async () => {
    setCleaning(true);
    try {
      const count = await cleanupExpiredData();
      const newStorage = await checkStorageQuota();
      setStorage(newStorage);
      toast.success(
        lang === 'de'
          ? `${count} alte Aufträge bereinigt`
          : `${count} old orders cleaned`
      );
    } catch {
      toast.error(lang === 'de' ? 'Bereinigung fehlgeschlagen' : 'Cleanup failed');
    } finally {
      setCleaning(false);
    }
  };

  const handleLogout = async () => {
    await clearCachedTokens();
    clearAuth();
    router.push('/login');
  };

  return (
    <div className="flex flex-col min-h-full">
      <MobileHeader title={t('mobile.settings.title', 'Einstellungen')} />

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-6">
        {/* User info */}
        {user && (
          <div className="flex items-center gap-3 p-4 bg-card border border-border rounded-xl">
            <div className="h-11 w-11 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-lg">
              {(user.firstName || user.first_name || user.name || 'U')[0].toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold truncate">
                {user.firstName || user.first_name || ''} {user.lastName || user.last_name || ''}
              </p>
              <p className="text-xs text-muted-foreground truncate">{user.email}</p>
            </div>
          </div>
        )}

        {/* Sync section */}
        <SettingsSection title={lang === 'de' ? 'Synchronisierung' : 'Synchronization'}>
          <SettingsItem
            icon={RefreshCw}
            label={t('mobile.settings.syncStatus', 'Sync-Status')}
            desc={getSyncDesc(syncStatus, lastSyncAt, pendingCount, failedCount, lang)}
            onClick={handleSync}
            iconClassName={syncStatus === 'syncing' ? 'animate-spin' : undefined}
            trailing={
              <span
                className={cn(
                  'h-2.5 w-2.5 rounded-full',
                  !isOnline
                    ? 'bg-amber-400'
                    : failedCount > 0
                    ? 'bg-red-500'
                    : pendingCount > 0
                    ? 'bg-amber-400'
                    : 'bg-green-500'
                )}
              />
            }
          />
        </SettingsSection>

        {/* Storage section */}
        <SettingsSection title={lang === 'de' ? 'Speicher' : 'Storage'}>
          {storage && (
            <div className="p-4 bg-card border border-border rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <HardDrive className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium">
                    {storage.usageMB} MB / {storage.quotaMB} MB
                  </span>
                </div>
                {storage.isWarning && (
                  <AlertTriangle className="h-4 w-4 text-amber-500" />
                )}
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className={cn(
                    'h-full rounded-full transition-all',
                    storage.isWarning ? 'bg-amber-500' : 'bg-primary'
                  )}
                  style={{ width: `${Math.min(storage.usageRatio * 100, 100)}%` }}
                />
              </div>
              {storage.isWarning && (
                <p className="text-xs text-amber-600">
                  {lang === 'de'
                    ? 'Speicher fast voll. Bitte alte Daten bereinigen.'
                    : 'Storage almost full. Please clean old data.'}
                </p>
              )}
            </div>
          )}
          <SettingsItem
            icon={Trash2}
            label={lang === 'de' ? 'Alte Daten bereinigen' : 'Clean old data'}
            desc={
              lang === 'de'
                ? 'Entfernt synchronisierte Aufträge älter als 30 Tage'
                : 'Removes synced orders older than 30 days'
            }
            onClick={handleCleanup}
            disabled={cleaning}
          />
        </SettingsSection>

        {/* Notifications section */}
        <SettingsSection title={t('mobile.settings.notificationPrefs', 'Notifications')}>
          <PushToggle t={t} />
          <NotificationPreferences t={t} />
          <QuietHoursSettings t={t} />
        </SettingsSection>

        {/* About section */}
        <SettingsSection title={lang === 'de' ? 'Über die App' : 'About'}>
          <SettingsItem
            icon={Info}
            label="Updata Techniker"
            desc="v1.0.0 — PWA"
          />
          <SettingsItem
            icon={Shield}
            label={lang === 'de' ? 'Datenschutz' : 'Privacy'}
            desc={
              lang === 'de'
                ? 'Daten werden verschlüsselt gespeichert'
                : 'Data is stored encrypted'
            }
          />
        </SettingsSection>

        {/* Logout */}
        <button
          onClick={handleLogout}
          className={cn(
            'w-full flex items-center gap-3 p-4 rounded-xl border',
            'bg-destructive/5 border-destructive/20 text-destructive',
            'active:bg-destructive/10 transition-colors'
          )}
        >
          <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-destructive/10">
            <LogOut className="h-5 w-5" />
          </div>
          <span className="text-sm font-medium">
            {t('mobile.settings.logout', 'Abmelden')}
          </span>
        </button>

        <div className="h-4" />
      </div>
    </div>
  );
}

function SettingsSection({ title, children }) {
  return (
    <div className="space-y-2">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider px-1">
        {title}
      </p>
      <div className="space-y-1.5">{children}</div>
    </div>
  );
}

function SettingsItem({ icon: Icon, label, desc, onClick, disabled, trailing, iconClassName }) {
  const Wrapper = onClick ? 'button' : 'div';
  return (
    <Wrapper
      onClick={disabled ? undefined : onClick}
      disabled={disabled}
      className={cn(
        'w-full flex items-center gap-3 p-4 bg-card border border-border rounded-xl text-left',
        onClick && 'active:bg-muted/50 transition-colors',
        disabled && 'opacity-50'
      )}
    >
      <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-muted shrink-0">
        <Icon className={cn('h-5 w-5 text-foreground', iconClassName)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{label}</p>
        {desc && <p className="text-xs text-muted-foreground">{desc}</p>}
      </div>
      {trailing && <div className="shrink-0">{trailing}</div>}
    </Wrapper>
  );
}

function PushToggle({ t }) {
  const [pushEnabled, setPushEnabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const { register: registerDevice } = useDeviceRegistration();

  useEffect(() => {
    if ('Notification' in window) {
      setPushEnabled(Notification.permission === 'granted');
    }
  }, []);

  const togglePush = async () => {
    if (loading) return;
    setLoading(true);
    try {
      if (!pushEnabled) {
        const permission = await Notification.requestPermission();
        if (permission === 'granted') {
          if ('serviceWorker' in navigator) {
            const reg = await navigator.serviceWorker.ready;
            const sub = await reg.pushManager.subscribe({
              userVisibleOnly: true,
              applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
            });
            await registerDevice.mutateAsync({
              push_subscription: sub.toJSON(),
              platform: 'web',
              device_name: navigator.userAgent.slice(0, 50),
            });
          }
          setPushEnabled(true);
          toast.success(t('mobile.notifications.pushEnabled', 'Push enabled'));
        } else {
          toast.error(t('mobile.notifications.permissionDenied', 'Permission denied'));
        }
      } else {
        setPushEnabled(false);
        toast.success(t('mobile.notifications.pushDisabled', 'Push disabled'));
      }
    } catch {
      toast.error(t('mobile.notifications.pushEnableFailed', 'Failed to enable'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <SettingsItem
      icon={Bell}
      label={t('mobile.notifications.push', 'Push Notifications')}
      desc={pushEnabled
        ? t('mobile.notifications.pushStatusEnabled', 'Enabled')
        : t('mobile.notifications.pushStatusDisabled', 'Tap to enable')
      }
      onClick={togglePush}
      disabled={loading}
      trailing={
        <div className={cn(
          'h-6 w-11 rounded-full transition-colors relative',
          pushEnabled ? 'bg-primary' : 'bg-muted'
        )}>
          <div className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            pushEnabled ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </div>
      }
    />
  );
}

function NotificationPreferences({ t }) {
  const { preferences, updatePreferences } = useNotificationPreferences();

  const prefTypes = [
    { key: 'new_assignment' },
    { key: 'order_changed' },
    { key: 'chat_message' },
    { key: 'daily_reminder' },
    { key: 'escalation' },
  ];

  const currentPrefs = preferences?.preferences || [];

  const togglePref = async (key) => {
    const updated = setPreferenceEnabled(currentPrefs, key, 'PUSH', !isPreferenceEnabled(currentPrefs, key, 'PUSH'));
    try {
      await updatePreferences.mutateAsync({ ...preferences, preferences: updated });
    } catch {
      toast.error(t('notifications.settings.saveFailed', 'Could not save notification settings.'));
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl overflow-hidden divide-y divide-border">
      {prefTypes.map((pref) => {
        const enabled = isPreferenceEnabled(currentPrefs, pref.key, 'PUSH');
        return (
          <button
            key={pref.key}
            onClick={() => togglePref(pref.key)}
            className="w-full flex items-center justify-between px-4 py-3 text-left active:bg-muted/50 transition-colors"
          >
            <span className="text-sm">{t(`notifications.type.${pref.key}`, pref.key)}</span>
            <div className={cn(
              'h-5 w-9 rounded-full transition-colors relative',
              enabled ? 'bg-primary' : 'bg-muted'
            )}>
              <div className={cn(
                'absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform',
                enabled ? 'translate-x-4' : 'translate-x-0.5'
              )} />
            </div>
          </button>
        );
      })}
    </div>
  );
}

function QuietHoursSettings({ t }) {
  const { preferences, updatePreferences } = useNotificationPreferences();

  const quietHours = preferences?.quietHours || { enabled: false, startTime: '20:00', endTime: '07:00', timezone: 'Europe/Zurich', bypassCritical: true };

  const toggleQuiet = async () => {
    try {
      await updatePreferences.mutateAsync({
        ...preferences,
        quietHours: setQuietHoursValue(quietHours, 'enabled', !quietHours.enabled),
      });
    } catch {
      toast.error(t('notifications.settings.saveFailed', 'Could not save notification settings.'));
    }
  };

  const updateTime = async (field, value) => {
    try {
      await updatePreferences.mutateAsync({
        ...preferences,
        quietHours: setQuietHoursValue(quietHours, field, value),
      });
    } catch {
      toast.error(t('notifications.settings.saveFailed', 'Could not save notification settings.'));
    }
  };

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3">
      <button
        onClick={toggleQuiet}
        className="w-full flex items-center justify-between"
      >
        <div>
          <p className="text-sm font-medium">{t('notifications.settings.quietHoursTitle', 'Quiet hours')}</p>
          <p className="text-xs text-muted-foreground">
            {t('notifications.settings.quietHoursDescription', 'Pause non-critical alerts during configured hours.')}
          </p>
        </div>
        <div className={cn(
          'h-6 w-11 rounded-full transition-colors relative',
          quietHours.enabled ? 'bg-primary' : 'bg-muted'
        )}>
          <div className={cn(
            'absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform',
            quietHours.enabled ? 'translate-x-5' : 'translate-x-0.5'
          )} />
        </div>
      </button>
      {quietHours.enabled && (
        <div className="flex items-center gap-3 pt-2 border-t border-border">
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('notifications.settings.start', 'Start')}
            </label>
            <input
              type="time"
              value={quietHours.startTime}
              onChange={(e) => updateTime('startTime', e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs text-muted-foreground mb-1 block">
              {t('notifications.settings.end', 'End')}
            </label>
            <input
              type="time"
              value={quietHours.endTime}
              onChange={(e) => updateTime('endTime', e.target.value)}
              className="w-full h-9 px-2 rounded-lg border border-border bg-background text-sm"
            />
          </div>
        </div>
      )}
    </div>
  );
}

function getSyncDesc(syncStatus, lastSyncAt, pendingCount, failedCount, lang) {
  if (syncStatus === 'syncing') {
    return lang === 'de' ? 'Synchronisiere...' : 'Syncing...';
  }
  const parts = [];
  if (lastSyncAt) {
    const time = new Date(lastSyncAt).toLocaleTimeString(lang === 'de' ? 'de-CH' : 'en-GB', {
      hour: '2-digit',
      minute: '2-digit',
    });
    parts.push(lang === 'de' ? `Letzte Sync: ${time}` : `Last sync: ${time}`);
  } else {
    parts.push(lang === 'de' ? 'Noch nicht synchronisiert' : 'Not yet synced');
  }
  if (pendingCount > 0) {
    parts.push(lang === 'de' ? `${pendingCount} ausstehend` : `${pendingCount} pending`);
  }
  if (failedCount > 0) {
    parts.push(lang === 'de' ? `${failedCount} fehlgeschlagen` : `${failedCount} failed`);
  }
  return parts.join(' · ');
}
