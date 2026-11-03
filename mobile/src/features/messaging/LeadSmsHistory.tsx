import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { View } from 'react-native';

import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';

import { smsLeadHistory } from './api';

export function LeadSmsHistory({
  leadId,
  onCampaign,
  onSimCampaign,
}: {
  leadId: string;
  onCampaign: (id: string) => void;
  onSimCampaign: (id: string) => void;
}) {
  const [page, setPage] = useState(1);
  const history = useQuery({
    queryKey: ['messaging', 'lead', leadId, page],
    queryFn: ({ signal }) => smsLeadHistory(leadId, page, signal),
    refetchInterval: 10000,
  });
  return (
    <View className="gap-3">
      <AppText variant="h3">SMS message history</AppText>
      {history.isPending ? (
        <AppSkeleton className="h-20 rounded-2xl" />
      ) : history.isError ? (
        <AppErrorState error={history.error} onRetry={() => void history.refetch()} />
      ) : (
        <>
          {!history.data.length && <AppText tone="muted">No SMS message history for this lead.</AppText>}
          {history.data.map((entry) => (
            <AppCard key={entry._id} className="gap-2">
              <AppText variant="label">
                {typeof entry.campaignId === 'object' ? entry.campaignId?.name : 'SMS'}
              </AppText>
              <AppText tone="muted">
                {entry.provider || 'Pending provider'} · {entry.status}
              </AppText>
              <AppText selectable>{entry.rendered?.bodyText || 'Content unavailable'}</AppText>
              {!!entry.sentAt && (
                <AppText variant="caption">Sent: {new Date(entry.sentAt).toLocaleString()}</AppText>
              )}
              {!!entry.deliveredAt && (
                <AppText variant="caption">Delivered: {new Date(entry.deliveredAt).toLocaleString()}</AppText>
              )}
              {!!entry.error?.message && <AppText tone="destructive">{entry.error.message}</AppText>}
              {!!entry.campaignId && (
                <AppButton
                  title="Open campaign"
                  variant="ghost"
                  onPress={() =>
                    (entry.source === 'sim_sms' ? onSimCampaign : onCampaign)(
                      typeof entry.campaignId === 'object' ? entry.campaignId!._id : entry.campaignId!,
                    )
                  }
                />
              )}
            </AppCard>
          ))}
          <View className="flex-row justify-between">
            <AppButton
              title="Previous"
              variant="ghost"
              disabled={page === 1}
              onPress={() => setPage(page - 1)}
            />
            <AppText>Page {page}</AppText>
            <AppButton
              title="Next"
              variant="ghost"
              disabled={history.data.length < 25}
              onPress={() => setPage(page + 1)}
            />
          </View>
        </>
      )}
    </View>
  );
}
