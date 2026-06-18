'use client';

import { useMemo, useState } from 'react';
import { BellRing, Clock, Save, ShieldCheck } from 'lucide-react';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { useLanguage } from '@/lib/i18n/language-context';
import { cn } from '@/lib/utils';
import { useNotificationPreferences } from '../hooks/use-notification-preferences';
import {
  DEFAULT_QUIET_HOURS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_PREFERENCE_TYPES,
  isMandatoryNotificationType,
  isPreferenceEnabled,
  normalizeNotificationPreferences,
  setPreferenceEnabled,
  setQuietHoursValue,
} from '../utils/notification-preferences';
import { getNotificationCategoryLabel } from '../constants/notification-ui-config';

function ChannelHeader({ channel, t }) {
  return (
    <div className="flex h-9 items-center justify-center rounded-lg bg-muted/50 px-2 text-[11px] font-semibold uppercase text-muted-foreground">
      {t(`notifications.channel.${channel}`, channel)}
    </div>
  );
}

function PreferenceRow({ prefType, draft, onToggle, t }) {
  const mandatory = prefType.mandatory || isMandatoryNotificationType(prefType.type);

  return (
    <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_repeat(5,72px)] items-center gap-2 border-t px-3 py-2.5">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="truncate text-sm font-medium">{t(prefType.labelKey, prefType.type)}</p>
          {mandatory && <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-primary" />}
        </div>
        <p className="text-xs text-muted-foreground">
          {getNotificationCategoryLabel(prefType.category, t)}
        </p>
      </div>
      {NOTIFICATION_CHANNELS.map((channel) => (
        <div key={channel} className="flex justify-center">
          <Switch
            checked={isPreferenceEnabled(draft.preferences, prefType.type, channel)}
            disabled={mandatory}
            onCheckedChange={(checked) => onToggle(prefType.type, channel, checked)}
            aria-label={t('notifications.settings.channelToggle', 'Toggle notification channel')}
          />
        </div>
      ))}
    </div>
  );
}

export function NotificationSettingsDialog({ children }) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const { preferences, isLoading, updatePreferences } = useNotificationPreferences();
  const [draftOverride, setDraftOverride] = useState(null);

  const normalizedPreferences = useMemo(
    () => normalizeNotificationPreferences(preferences || { quietHours: DEFAULT_QUIET_HOURS }),
    [preferences],
  );
  const draft = draftOverride || normalizedPreferences;

  const groupedTypes = useMemo(() => {
    const groups = new Map();
    for (const prefType of NOTIFICATION_PREFERENCE_TYPES) {
      if (!groups.has(prefType.category)) groups.set(prefType.category, []);
      groups.get(prefType.category).push(prefType);
    }
    return [...groups.entries()];
  }, []);

  const handleToggle = (notificationType, channel, enabled) => {
    setDraftOverride((current) => {
      const base = current || normalizedPreferences;
      return {
        ...base,
        preferences: setPreferenceEnabled(base.preferences, notificationType, channel, enabled),
      };
    });
  };

  const handleQuietHours = (field, value) => {
    setDraftOverride((current) => {
      const base = current || normalizedPreferences;
      return {
        ...base,
        quietHours: setQuietHoursValue(base.quietHours, field, value),
      };
    });
  };

  const handleSave = async () => {
    const saved = await updatePreferences.mutateAsync(draft);
    setDraftOverride(normalizeNotificationPreferences(saved));
  };

  const trigger = children || (
    <Button size="sm" variant="outline" className="h-8 gap-1.5">
      <BellRing className="h-3.5 w-3.5" />
      {t('notifications.settings.open', 'Settings')}
    </Button>
  );

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        setOpen(nextOpen);
        if (!nextOpen) setDraftOverride(null);
      }}
    >
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="sm:max-w-5xl">
        <DialogHeader>
          <DialogTitle>{t('notifications.settings.title', 'Notification settings')}</DialogTitle>
          <DialogDescription>
            {t('notifications.settings.description', 'Control channels by notification type and define quiet hours.')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="space-y-5">
          <section className="rounded-lg border bg-card">
            <div className="flex items-center gap-2 border-b px-4 py-3">
              <BellRing className="h-4 w-4 text-primary" />
              <div>
                <p className="text-sm font-semibold">{t('notifications.settings.channelsTitle', 'Channels')}</p>
                <p className="text-xs text-muted-foreground">
                  {t('notifications.settings.channelsDescription', 'Critical notifications stay enabled.')}
                </p>
              </div>
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-[720px] grid-cols-[minmax(220px,1fr)_repeat(5,72px)] gap-2 px-3 py-2">
                <div />
                {NOTIFICATION_CHANNELS.map((channel) => (
                  <ChannelHeader key={channel} channel={channel} t={t} />
                ))}
              </div>
              {isLoading ? (
                <div className="space-y-2 px-3 py-3">
                  {Array.from({ length: 5 }).map((_, index) => (
                    <div key={index} className="h-10 animate-pulse rounded-lg bg-muted" />
                  ))}
                </div>
              ) : (
                groupedTypes.map(([category, types]) => (
                  <div key={category}>
                    <div className="border-t bg-muted/30 px-3 py-2 text-[11px] font-semibold uppercase text-muted-foreground">
                      {getNotificationCategoryLabel(category, t)}
                    </div>
                    {types.map((prefType) => (
                      <PreferenceRow
                        key={prefType.type}
                        prefType={prefType}
                        draft={draft}
                        onToggle={handleToggle}
                        t={t}
                      />
                    ))}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-lg border bg-card p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 gap-3">
                <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                  <Clock className="h-4 w-4" />
                </div>
                <div>
                  <p className="text-sm font-semibold">{t('notifications.settings.quietHoursTitle', 'Quiet hours')}</p>
                  <p className="text-xs text-muted-foreground">
                    {t('notifications.settings.quietHoursDescription', 'Pause non-critical alerts during configured hours.')}
                  </p>
                </div>
              </div>
              <Switch
                checked={draft.quietHours.enabled}
                onCheckedChange={(checked) => handleQuietHours('enabled', checked)}
                aria-label={t('notifications.settings.quietHoursTitle', 'Quiet hours')}
              />
            </div>

            <div className={cn('mt-4 grid gap-3 sm:grid-cols-3', !draft.quietHours.enabled && 'opacity-50')}>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                {t('notifications.settings.start', 'Start')}
                <Input
                  type="time"
                  value={draft.quietHours.startTime}
                  disabled={!draft.quietHours.enabled}
                  onChange={(event) => handleQuietHours('startTime', event.target.value)}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                {t('notifications.settings.end', 'End')}
                <Input
                  type="time"
                  value={draft.quietHours.endTime}
                  disabled={!draft.quietHours.enabled}
                  onChange={(event) => handleQuietHours('endTime', event.target.value)}
                />
              </label>
              <label className="space-y-1.5 text-xs font-medium text-muted-foreground">
                {t('notifications.settings.timezone', 'Timezone')}
                <Input
                  value={draft.quietHours.timezone}
                  disabled={!draft.quietHours.enabled}
                  onChange={(event) => handleQuietHours('timezone', event.target.value)}
                />
              </label>
            </div>

            <label className="mt-4 flex items-center justify-between gap-3 rounded-lg border px-3 py-2.5 text-sm">
              <span>
                <span className="block font-medium">{t('notifications.settings.bypassCritical', 'Critical alerts bypass quiet hours')}</span>
                <span className="block text-xs text-muted-foreground">
                  {t('notifications.settings.bypassCriticalHint', 'Required for safety and escalation notifications.')}
                </span>
              </span>
              <Switch
                checked={draft.quietHours.bypassCritical}
                onCheckedChange={(checked) => handleQuietHours('bypassCritical', checked)}
              />
            </label>
          </section>

          {updatePreferences.isError && (
            <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {t('notifications.settings.saveFailed', 'Could not save notification settings.')}
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button
            onClick={handleSave}
            disabled={isLoading || updatePreferences.isPending}
            className="gap-2"
          >
            <Save className="h-4 w-4" />
            {t('notifications.settings.save', 'Save settings')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
