import { ListChecks, UserPlus } from 'lucide-react-native';
import { useState } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppInput } from '@/components/ui/AppInput';
import { AppModal } from '@/components/ui/AppModal';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { useLeadDirectory } from '@/features/leads/hooks/useLeads';
import { formatDateTime } from '@/utils/date';

import { useUpdateWork } from '../hooks/useIncomingCalls';
import { WORK_STATUSES, type InboundCallDetail, type WorkHistoryEntry, type WorkStatus } from '../types';

export const WORK_STATUS_VARIANT: Record<WorkStatus, BadgeVariant> = {
  new: 'primary',
  in_progress: 'info',
  follow_up: 'warning',
  waiting_on_caller: 'warning',
  resolved: 'success',
  closed: 'muted',
  spam: 'destructive',
};

const isWorkStatus = (v: string | null | undefined): v is WorkStatus =>
  Boolean(v) && (WORK_STATUSES as readonly string[]).includes(v as string);

export function WorkStatusBadge({ status }: { status: string | null }) {
  const { t } = useTranslation();
  if (!isWorkStatus(status)) return null;
  return (
    <AppBadge
      label={t(`incomingCalls.work.status.${status}`)}
      variant={WORK_STATUS_VARIANT[status]}
      size="sm"
    />
  );
}

const UNASSIGNED = '__unassigned__';

/** Who did it: a named person, the AI agent or the system. */
function actorLabel(t: TFunction, entry: WorkHistoryEntry) {
  if (entry.source === 'agent') return t('incomingCalls.work.by.agent');
  if (entry.source === 'system') return t('incomingCalls.work.by.system');
  return entry.by?.name ?? t('incomingCalls.work.by.someone');
}

function reasonLabel(t: TFunction, reason: string | null) {
  if (!reason || reason === 'set_by_user' || reason === 'reassigned' || reason === 'note') return null;
  const qualification = /^qualification_(.+)$/.exec(reason)?.[1];
  if (qualification) {
    const result = qualification.toUpperCase();
    return t('incomingCalls.work.reason.qualification', {
      result: t(`incomingCalls.qualification.${result}`, {
        defaultValue: result.toLowerCase().replace(/_/g, ' '),
      }),
    });
  }
  return t(`incomingCalls.work.reason.${reason}`, { defaultValue: reason.replace(/_/g, ' ') });
}

/** Status pill, assignee, the two actions and the full change history of the call's work. */
export function WorkPanel({ call }: { call: InboundCallDetail }) {
  const { t, i18n } = useTranslation();
  const myId = useSessionStore((state) => state.user?.id ?? null);
  const [sheet, setSheet] = useState<null | 'status' | 'assign'>(null);
  const work = call.work;
  const assignee = work.assignee;
  const history = [...work.history].reverse();

  return (
    <AppCard className="gap-3">
      <View className="flex-row flex-wrap items-center gap-2">
        <AppText variant="title" accessibilityRole="header" className="flex-1">
          {t('incomingCalls.work.title')}
        </AppText>
        {isWorkStatus(work.status) ? (
          <WorkStatusBadge status={work.status} />
        ) : (
          <AppBadge label={t('incomingCalls.work.noStatus')} variant="muted" size="sm" />
        )}
      </View>
      <AppText>
        {assignee
          ? assignee.id === myId
            ? t('incomingCalls.work.assignedToYou')
            : t('incomingCalls.work.assignedTo', {
                name: assignee.name ?? t('incomingCalls.work.by.someone'),
              })
          : t('incomingCalls.work.unassigned')}
      </AppText>
      {work.updatedAt ? (
        <AppText variant="caption" tone="muted">
          {t('incomingCalls.work.updated', {
            who:
              work.source === 'agent'
                ? t('incomingCalls.work.by.agent')
                : work.source === 'system'
                  ? t('incomingCalls.work.by.system')
                  : (work.updatedBy?.name ?? t('incomingCalls.work.by.someone')),
            when: formatDateTime(work.updatedAt, i18n.language) ?? '',
          })}
        </AppText>
      ) : null}
      <View className="flex-row flex-wrap gap-2">
        <AppButton
          title={t('incomingCalls.work.changeStatus')}
          leftIcon={ListChecks}
          variant="outline"
          size="sm"
          onPress={() => setSheet('status')}
        />
        <AppButton
          title={t('incomingCalls.work.assign')}
          leftIcon={UserPlus}
          variant="outline"
          size="sm"
          onPress={() => setSheet('assign')}
        />
      </View>

      <View className="gap-2 border-t border-border pt-3">
        <AppText variant="label" className="font-geist-semibold">
          {t('incomingCalls.work.history')}
        </AppText>
        {history.length === 0 ? (
          <AppText variant="caption" tone="muted">
            {t('incomingCalls.work.noHistory')}
          </AppText>
        ) : (
          history.map((entry, i) => <HistoryRow key={`${entry.at ?? ''}-${i}`} entry={entry} myId={myId} />)
        )}
      </View>

      {sheet ? <WorkSheet call={call} mode={sheet} myId={myId} onClose={() => setSheet(null)} /> : null}
    </AppCard>
  );
}

function HistoryRow({ entry, myId }: { entry: WorkHistoryEntry; myId: string | null }) {
  const { t, i18n } = useTranslation();
  const changedStatus = entry.to !== entry.from && isWorkStatus(entry.to);
  const changedAssignee = Boolean(entry.assignedTo || entry.assignedFrom);
  const parts: string[] = [];
  if (changedStatus) {
    parts.push(
      isWorkStatus(entry.from)
        ? t('incomingCalls.work.change', {
            from: t(`incomingCalls.work.status.${entry.from}`),
            to: t(`incomingCalls.work.status.${entry.to as WorkStatus}`),
          })
        : t('incomingCalls.work.set', { to: t(`incomingCalls.work.status.${entry.to as WorkStatus}`) }),
    );
  }
  if (changedAssignee) {
    parts.push(
      entry.assignedTo
        ? entry.assignedTo.id === myId
          ? t('incomingCalls.work.assignedToYou')
          : t('incomingCalls.work.assignedTo', {
              name: entry.assignedTo.name ?? t('incomingCalls.work.by.someone'),
            })
        : t('incomingCalls.work.unassignedEntry'),
    );
  }
  if (parts.length === 0) parts.push(t('incomingCalls.work.noteOnly'));
  const reason = reasonLabel(t, entry.reason);
  return (
    <View className="gap-0.5">
      <AppText>{parts.join(' · ')}</AppText>
      {reason ? (
        <AppText variant="caption" tone="muted">
          {reason}
        </AppText>
      ) : null}
      {entry.note ? <AppText variant="caption">{`“${entry.note}”`}</AppText> : null}
      <AppText variant="caption" tone="muted">
        {[actorLabel(t, entry), formatDateTime(entry.at, i18n.language)].filter(Boolean).join(' · ')}
      </AppText>
    </View>
  );
}

/**
 * Change the status (with a note) or the assignee. The assignee list is the team directory the
 * leads feature already uses; if it cannot load, "me" and "unassigned" still work.
 */
function WorkSheet({
  call,
  mode,
  myId,
  onClose,
}: {
  call: InboundCallDetail;
  mode: 'status' | 'assign';
  myId: string | null;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const update = useUpdateWork(call.id);
  const directory = useLeadDirectory(mode === 'assign');
  const [status, setStatus] = useState<WorkStatus>(
    isWorkStatus(call.work.status) ? call.work.status : 'in_progress',
  );
  const [assignee, setAssignee] = useState<string>(call.work.assignee?.id ?? UNASSIGNED);
  const [note, setNote] = useState('');

  const people = new Map<string, string>();
  if (myId) people.set(myId, t('incomingCalls.work.me'));
  for (const user of directory.data ?? []) {
    if (!people.has(user.id)) people.set(user.id, user.name);
  }
  if (call.work.assignee && !people.has(call.work.assignee.id)) {
    people.set(call.work.assignee.id, call.work.assignee.name ?? t('incomingCalls.work.by.someone'));
  }
  const options = [
    { value: UNASSIGNED, label: t('incomingCalls.work.unassign') },
    ...[...people.entries()].map(([value, label]) => ({ value, label })),
  ];

  const unchanged =
    mode === 'status'
      ? status === call.work.status && !note.trim()
      : assignee === (call.work.assignee?.id ?? UNASSIGNED) && !note.trim();
  const save = () =>
    update.mutate(
      mode === 'status'
        ? { status, note: note.trim() || null }
        : { assignedTo: assignee === UNASSIGNED ? null : assignee, note: note.trim() || null },
      { onSuccess: onClose },
    );

  return (
    <AppModal
      visible
      presentation="sheet"
      title={mode === 'status' ? t('incomingCalls.work.statusTitle') : t('incomingCalls.work.assignTitle')}
      dismissible={!update.isPending}
      onClose={onClose}
      footer={
        <View className="flex-row gap-2">
          <AppButton
            title={t('common.cancel')}
            variant="ghost"
            onPress={onClose}
            disabled={update.isPending}
          />
          <AppButton
            title={t('incomingCalls.work.save')}
            className="flex-1"
            loading={update.isPending}
            disabled={unchanged}
            onPress={save}
          />
        </View>
      }
    >
      <View className="gap-3">
        {mode === 'status' ? (
          <AppRadioGroup
            accessibilityLabel={t('incomingCalls.work.statusTitle')}
            value={status}
            onChange={setStatus}
            disabled={update.isPending}
            options={WORK_STATUSES.map((value) => ({
              value,
              label: t(`incomingCalls.work.status.${value}`),
            }))}
          />
        ) : (
          <>
            {directory.isError ? (
              <AppAlert tone="warning" message={t('incomingCalls.work.directoryFailed')} />
            ) : null}
            {directory.isPending ? <AppText tone="muted">{t('common.loading')}</AppText> : null}
            <AppRadioGroup
              accessibilityLabel={t('incomingCalls.work.assignTitle')}
              value={assignee}
              onChange={setAssignee}
              disabled={update.isPending}
              options={options}
            />
          </>
        )}
        <AppInput
          label={t('incomingCalls.work.note')}
          value={note}
          onChangeText={setNote}
          maxLength={1000}
          multiline
        />
      </View>
    </AppModal>
  );
}
