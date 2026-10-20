import { ListChecks, Trash2, UserRoundCog } from 'lucide-react-native';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { AppButton } from '@/components/ui/AppButton';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppModal } from '@/components/ui/AppModal';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { showApiErrorToast, showSuccessToast, showWarningToast } from '@/utils/toast';

import {
  useBulkAssignLeads,
  useBulkDeleteLeads,
  useBulkUpdateLeadStatus,
  useLeadDirectory,
} from '../hooks/useLeads';
import {
  ASSIGNABLE_LEAD_STATUSES,
  type AssignableLeadStatus,
  type BulkLeadResult,
  type Lead,
} from '../types';

type Mode = 'menu' | 'status' | 'assign' | 'delete';
const UNASSIGNED = '__unassigned__';

type Props = {
  visible: boolean;
  leads: Lead[];
  onClose: () => void;
  /** Failed ids remain selected; an empty array means the selection can close. */
  onComplete: (failedIds: string[]) => void;
};

/** CRM bulk actions for the explicit, visible lead selection. */
export function LeadBulkActionsSheet({ visible, leads, onClose, onComplete }: Props) {
  const { t } = useTranslation();
  const [mode, setMode] = useState<Mode>('menu');
  const [status, setStatus] = useState<AssignableLeadStatus>('contacted');
  const [assignee, setAssignee] = useState<string>(UNASSIGNED);
  const directory = useLeadDirectory(visible && mode === 'assign');
  const changeStatus = useBulkUpdateLeadStatus();
  const assign = useBulkAssignLeads();
  const remove = useBulkDeleteLeads();
  const ids = leads.map((lead) => lead.id);
  const hasConverted = leads.some((lead) => lead.status === 'converted');
  const busy = changeStatus.isPending || assign.isPending || remove.isPending;

  const close = () => {
    if (busy) return;
    setMode('menu');
    onClose();
  };

  const finish = (result: BulkLeadResult) => {
    const done = result.succeededIds.length;
    const failed = result.failedIds.length;
    if (failed > 0) {
      showWarningToast(t('leads.bulk.partial', { done, failed }));
    } else {
      showSuccessToast(t('leads.bulk.success', { count: done }));
    }
    setMode('menu');
    onComplete(result.failedIds);
  };

  const run = async (operation: () => Promise<BulkLeadResult>) => {
    try {
      finish(await operation());
    } catch (error) {
      showApiErrorToast(error);
    }
  };

  const title =
    mode === 'status'
      ? t('leads.bulk.statusTitle')
      : mode === 'assign'
        ? t('leads.bulk.assignTitle')
        : mode === 'delete'
          ? t('leads.bulk.deleteTitle')
          : t('leads.bulk.title', { count: leads.length });

  return (
    <AppModal
      visible={visible}
      title={title}
      description={
        mode === 'delete'
          ? t('leads.bulk.deleteBody', { count: leads.length })
          : mode === 'menu'
            ? t('leads.bulk.description')
            : undefined
      }
      presentation="sheet"
      dismissible={!busy}
      onClose={close}
      footer={
        mode === 'menu' ? (
          <AppButton title={t('common.cancel')} variant="ghost" onPress={close} />
        ) : (
          <>
            <AppButton
              title={t('common.back')}
              variant="ghost"
              disabled={busy}
              onPress={() => setMode('menu')}
            />
            {mode === 'status' ? (
              <AppButton
                title={t('leads.bulk.applyStatus')}
                loading={changeStatus.isPending}
                onPress={() => run(() => changeStatus.mutateAsync({ ids, status }))}
              />
            ) : mode === 'assign' ? (
              <AppButton
                title={t('leads.bulk.applyAssignment')}
                loading={assign.isPending}
                disabled={directory.isPending || directory.isError}
                onPress={() =>
                  run(() =>
                    assign.mutateAsync({ ids, assignedTo: assignee === UNASSIGNED ? null : assignee }),
                  )
                }
              />
            ) : (
              <AppButton
                title={t('leads.bulk.deleteConfirm', { count: leads.length })}
                variant="destructive"
                loading={remove.isPending}
                onPress={() => run(() => remove.mutateAsync(ids))}
              />
            )}
          </>
        )
      }
    >
      {mode === 'menu' ? (
        <View className="gap-2">
          <AppButton
            title={t('leads.bulk.changeStatus')}
            leftIcon={ListChecks}
            variant="outline"
            fullWidth
            disabled={hasConverted}
            onPress={() => setMode('status')}
          />
          {hasConverted ? (
            <AppText variant="caption" tone="muted">
              {t('leads.bulk.convertedStatusBlocked')}
            </AppText>
          ) : null}
          <AppButton
            title={t('leads.bulk.assign')}
            leftIcon={UserRoundCog}
            variant="outline"
            fullWidth
            onPress={() => setMode('assign')}
          />
          <AppButton
            title={t('leads.bulk.delete')}
            leftIcon={Trash2}
            variant="outline"
            className="border-destructive/30"
            fullWidth
            onPress={() => setMode('delete')}
          />
        </View>
      ) : mode === 'status' ? (
        <AppRadioGroup
          accessibilityLabel={t('leads.bulk.statusTitle')}
          value={status}
          onChange={setStatus}
          disabled={busy}
          options={ASSIGNABLE_LEAD_STATUSES.map((value) => ({
            value,
            label: t(`leads.status.${value}`),
          }))}
        />
      ) : mode === 'assign' ? (
        directory.isPending ? (
          <AppText tone="muted">{t('common.loading')}</AppText>
        ) : directory.isError ? (
          <AppErrorState
            error={directory.error}
            retrying={directory.isRefetching}
            onRetry={() => void directory.refetch()}
            size="inline"
          />
        ) : (
          <AppRadioGroup
            accessibilityLabel={t('leads.bulk.assignTitle')}
            value={assignee}
            onChange={setAssignee}
            disabled={busy}
            options={[
              { value: UNASSIGNED, label: t('leads.unassigned') },
              ...directory.data.map((user) => ({
                value: user.id,
                label: user.name,
                description: user.email,
              })),
            ]}
          />
        )
      ) : (
        <AppAlert tone="destructive" message={t('leads.bulk.deleteWarning')} />
      )}
    </AppModal>
  );
}
