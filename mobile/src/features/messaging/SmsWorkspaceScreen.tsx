import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { randomUUID } from 'expo-crypto';
import { useRef, useState } from 'react';
import { View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard, AppPressableCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { analyzeSms } from '@/features/communication/domain/smsEncoding';
import { LEAD_STATUSES, type LeadStatus } from '@/features/leads/types';
import { useLeadList } from '@/features/leads/hooks/useLeads';
import { useSingleFlight } from '@/hooks/useSingleFlight';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { showApiErrorToast } from '@/utils/toast';

import { smsAnalytics, messagingApi, type Campaign, type Recipient, type SmsService } from './api';

const key = ['messaging'];
export function SmsWorkspaceScreen({ navigation }: RootScreenProps<'SmsWorkspace'>) {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string | undefined>();
  const [provider, setProvider] = useState<string | undefined>();
  const [page, setPage] = useState(1);
  const analytics = useQuery({
    queryKey: [...key, 'analytics'],
    queryFn: ({ signal }) => smsAnalytics(signal),
    refetchInterval: 15000,
  });
  const campaigns = useQuery({
    queryKey: [...key, 'campaigns', search, page, status, provider],
    queryFn: ({ signal }) => messagingApi.campaigns(search, page, signal, { status, provider }),
    refetchInterval: 10000,
  });
  return (
    <Screen mode="scroll" contentClassName="gap-4 pb-10 pt-3">
      <AppCard className="gap-3 bg-primary">
        <AppText variant="h2" className="text-primary-foreground">
          SMS campaigns
        </AppText>
        <AppText className="text-primary-foreground">
          Compose once. Preview every recipient. Follow each delivery.
        </AppText>
      </AppCard>
      {analytics.data && (
        <AppCard className="gap-3">
          <AppText variant="h3">SMS overview</AppText>
          <View className="flex-row flex-wrap gap-4">
            {[
              ['Campaigns', analytics.data.campaigns],
              ['Attempted', analytics.data.submitted],
              ['Delivered', analytics.data.delivered],
              ['Attempted segments', analytics.data.totalSegments],
              ['Delivery rate', `${Math.round(analytics.data.deliveryRate * 100)}%`],
            ].map(([label, value]) => (
              <View key={label}>
                <AppText variant="h3">{value}</AppText>
                <AppText variant="caption" tone="muted">
                  {label}
                </AppText>
              </View>
            ))}
          </View>
          <AppText variant="caption" tone="muted">
            Provider usage:{' '}
            {analytics.data.byProvider.map((row) => `${row._id}: ${row.count}`).join(' · ') ||
              'No submissions'}
          </AppText>
        </AppCard>
      )}
      <AppButton title="Create SMS campaign" onPress={() => navigation.navigate('SmsCampaignCreate')} />
      <View className="flex-row flex-wrap gap-2">
        <AppButton
          title="Phone SIM queue"
          variant="outline"
          onPress={() => navigation.navigate('CallAgentLeadPicker', { purpose: 'smsQueue' })}
        />
        <AppButton
          title="AI SIM history"
          variant="outline"
          onPress={() => navigation.navigate('SimSmsCampaigns')}
        />
      </View>
      <AppInput
        label="Search campaigns"
        value={search}
        onChangeText={(value) => {
          setSearch(value);
          setPage(1);
        }}
      />
      <View className="flex-row flex-wrap gap-2">
        {['draft', 'running', 'completed', 'cancelled'].map((value) => (
          <AppChip
            key={value}
            label={value}
            selected={status === value}
            onPress={() => {
              setStatus(status === value ? undefined : value);
              setPage(1);
            }}
          />
        ))}
      </View>
      <View className="flex-row gap-2">
        {['textbee', 'twilio'].map((value) => (
          <AppChip
            key={value}
            label={value === 'textbee' ? 'TextBee' : 'Twilio'}
            selected={provider === value}
            onPress={() => {
              setProvider(provider === value ? undefined : value);
              setPage(1);
            }}
          />
        ))}
      </View>
      {campaigns.isPending ? (
        <AppSkeleton className="h-32 rounded-2xl" />
      ) : campaigns.isError ? (
        <AppErrorState error={campaigns.error} onRetry={() => void campaigns.refetch()} />
      ) : (
        <>
          {!campaigns.data.length && (
            <AppCard>
              <AppText>No campaigns found. Create a campaign to get started.</AppText>
            </AppCard>
          )}
          {campaigns.data.map((campaign) => (
            <AppPressableCard
              key={campaign._id}
              className="gap-2"
              accessibilityLabel={`Open ${campaign.name}`}
              onPress={() => navigation.navigate('SmsCampaignDetail', { campaignId: campaign._id })}
            >
              <AppText variant="h3">{campaign.name}</AppText>
              <AppText tone="muted">
                {campaign.routing?.smsProvider} · {campaign.status}
              </AppText>
              <CampaignSummary campaign={campaign} />
            </AppPressableCard>
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
              disabled={campaigns.data.length < 25}
              onPress={() => setPage(page + 1)}
            />
          </View>
        </>
      )}
    </Screen>
  );
}

export function SmsCampaignCreateScreen({ navigation }: RootScreenProps<'SmsCampaignCreate'>) {
  const requestKey = useRef({ payload: '', key: '' });
  const [step, setStep] = useState(0);
  const [previousDraft, setPreviousDraft] = useState<string | null>(null);
  const [service, setService] = useState<SmsService | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [body, setBody] = useState('');
  const [company, setCompany] = useState('');
  const [language, setLanguage] = useState('auto');
  const [url, setUrl] = useState('');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string[]>([]);
  const [allMatching, setAllMatching] = useState(false);
  const services = useQuery({
    queryKey: [...key, 'services'],
    queryFn: ({ signal }) => messagingApi.services(signal),
    refetchInterval: 30000,
  });
  const [leadStatus, setLeadStatus] = useState<LeadStatus | undefined>();
  const [country, setCountry] = useState('');
  const [city, setCity] = useState('');
  const leads = useLeadList({
    q: search,
    status: leadStatus,
    country: country.length === 2 ? country : undefined,
    city: city.trim() || undefined,
  });
  const create = useMutation({
    mutationFn: async () => {
      if (previousDraft) {
        const previous = await messagingApi.campaign(previousDraft);
        if (previous.status !== 'cancelled') {
          if (previous.status !== 'draft')
            throw new Error('This campaign has already started. Open it from SMS history.');
          await messagingApi.action(previousDraft, 'cancel');
        }
      }
      const payload = JSON.stringify({
        name,
        description,
        body,
        url,
        company,
        language,
        selected,
        allMatching,
        search,
        leadStatus,
        country,
        city,
        previousDraft,
        service: service!.id,
      });
      if (requestKey.current.payload !== payload) requestKey.current = { payload, key: randomUUID() };
      return messagingApi.create({
        idempotencyKey: requestKey.current.key,
        name: name.trim(),
        description: description.trim(),
        channel: 'sms',
        purpose: 'promotional',
        content: {
          language: language.trim() || 'auto',
          bodyText: [body.trim(), url.trim()].filter(Boolean).join('\n'),
          fallbackValues: company.trim() ? { companyName: company.trim() } : {},
        },
        routing: { smsProvider: service!.id, allowFallback: false },
        selection: allMatching
          ? {
              mode: 'filters',
              filters: {
                ...(search.trim() ? { q: search.trim().slice(0, 100) } : {}),
                ...(leadStatus ? { status: leadStatus } : {}),
                ...(country.length === 2 ? { country } : {}),
                ...(city.trim() ? { city: city.trim() } : {}),
              },
            }
          : { mode: 'explicit', leadIds: selected },
      });
    },
    onSuccess: (campaign) => {
      setPreviousDraft(campaign._id);
      navigation.navigate('SmsCampaignDetail', { campaignId: campaign._id, canEdit: true });
    },
    onError: showApiErrorToast,
  });
  const submit = useSingleFlight(async () => {
    if (!create.isPending) await create.mutateAsync();
  });
  const info = analyzeSms([body, url].filter(Boolean).join('\n'));
  let validUrl = !url.trim();
  try {
    validUrl = ['http:', 'https:'].includes(new URL(url.trim()).protocol);
  } catch {
    /* validated below */
  }
  const currentService = services.data?.find((entry) => entry.id === service?.id);
  const toggle = (id: string) => {
    setAllMatching(false);
    setSelected((ids) => (ids.includes(id) ? ids.filter((value) => value !== id) : [...ids, id]));
  };
  return (
    <Screen mode="keyboard" contentClassName="gap-4 pb-10 pt-3">
      <AppText variant="h2">
        {['Choose sending service', 'Compose your message', 'Choose recipients'][step]}
      </AppText>
      <View className="flex-row gap-2">
        {['Service', 'Message', 'Recipients'].map((label, index) => (
          <AppChip
            key={label}
            label={`${index + 1}. ${label}`}
            selected={step === index}
            onPress={() => {
              if (index < step) setStep(index);
            }}
          />
        ))}
      </View>
      {step === 0 && (
        <>
          {services.isPending ? (
            <AppSkeleton className="h-28 rounded-2xl" />
          ) : services.isError ? (
            <AppErrorState error={services.error} onRetry={() => void services.refetch()} />
          ) : (
            services.data.map((entry) => (
              <AppPressableCard
                key={entry.id}
                className="gap-2"
                accessibilityLabel={`Select ${entry.name}`}
                disabled={!entry.available}
                onPress={() => setService(entry)}
              >
                <AppText variant="h3">
                  {service?.id === entry.id ? '✓ ' : ''}
                  {entry.name}
                </AppText>
                <AppText tone={entry.available ? 'success' : 'muted'}>
                  {entry.available ? 'Connected' : entry.reason || 'Unavailable'}
                </AppText>
                <AppText tone="muted">{entry.sender || 'Sender managed by provider'} · SMS</AppText>
                <AppText variant="caption">
                  {entry.capabilities.deliveryReceipts
                    ? 'Delivery callbacks configured'
                    : 'Delivery confirmation may be unavailable'}
                </AppText>
              </AppPressableCard>
            ))
          )}
          <AppButton
            title="Use this phone’s SIM"
            variant="outline"
            onPress={() => navigation.navigate('CallAgentLeadPicker', { purpose: 'smsQueue' })}
          />
          <AppAlert
            tone="info"
            message="To send through this phone’s SIM, use the Phone SIM queue on the SMS dashboard. Its existing permissions and SIM selection remain available."
          />
          <AppButton
            title="Continue to message"
            disabled={!currentService?.available}
            onPress={() => setStep(1)}
          />
        </>
      )}
      {step === 1 && (
        <>
          <AppInput label="Campaign title (internal)" value={name} onChangeText={setName} maxLength={160} />
          <AppInput
            label="Internal description (optional)"
            value={description}
            onChangeText={setDescription}
            maxLength={1000}
          />
          <AppInput
            label="Message language (auto, en, ur…)"
            value={language}
            onChangeText={setLanguage}
            maxLength={35}
            helperText="Metadata only; the message is sent as written."
          />
          <AppInput label="Company name for personalization" value={company} onChangeText={setCompany} />
          <AppInput
            label="Message"
            value={body}
            onChangeText={setBody}
            multiline
            maxLength={service?.capabilities.maxBodyLength ?? 10000}
          />
          <View className="flex-row flex-wrap gap-2">
            {['firstName', 'lastName', 'companyName', 'phone', 'email', 'city'].map((variable) => (
              <AppChip
                key={variable}
                label={`{{${variable}}}`}
                selected={false}
                onPress={() => setBody((value) => `${value}{{${variable}}}`)}
              />
            ))}
          </View>
          <AppInput
            label="Website, booking or hosted image URL (optional)"
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            keyboardType="url"
            error={!validUrl ? 'Enter a complete http:// or https:// URL' : undefined}
          />
          <AppText variant="caption" tone="muted">
            {info.characters} characters · {info.encoding} · {info.segments} segments ·{' '}
            {info.remainingInSegment} units remaining. Personalized counts appear in review.
          </AppText>
          <AppAlert
            tone="info"
            message="SMS has no subject or attachments. Include a hosted media URL in the message instead. Text language is preserved; Unicode may use more segments. Promotional messages require recorded consent."
          />
          <AppButton
            title="Choose recipients"
            disabled={
              !name.trim() ||
              !body.trim() ||
              !validUrl ||
              body.trim().length + url.trim().length + (url.trim() ? 1 : 0) >
                (service?.capabilities.maxBodyLength ?? 10000)
            }
            onPress={() => setStep(2)}
          />
        </>
      )}
      {step === 2 && (
        <>
          <AppText variant="h3">
            {allMatching ? 'All matching leads selected' : `${selected.length} selected`}
          </AppText>
          <AppInput label="Search leads by name or phone" value={search} onChangeText={setSearch} />
          <View className="flex-row flex-wrap gap-2">
            {LEAD_STATUSES.map((value) => (
              <AppChip
                key={value}
                label={value}
                selected={leadStatus === value}
                onPress={() => setLeadStatus(leadStatus === value ? undefined : value)}
              />
            ))}
          </View>
          <AppInput
            label="Country code (optional)"
            value={country}
            onChangeText={(value) => setCountry(value.toUpperCase())}
            maxLength={2}
            autoCapitalize="characters"
          />
          <AppInput label="City (optional)" value={city} onChangeText={setCity} />
          <AppButton
            title="Clear recipient selection"
            variant="ghost"
            onPress={() => {
              setSelected([]);
              setAllMatching(false);
            }}
          />
          <AppChip
            label="Select all matching leads (server validated)"
            selected={allMatching}
            onPress={() => setAllMatching(!allMatching)}
          />
          <AppButton
            title="Select loaded leads"
            variant="outline"
            onPress={() =>
              setSelected((ids) => [
                ...new Set([
                  ...ids,
                  ...(leads.data?.pages.flatMap((page) => page.items.map((lead) => lead.id)) ?? []),
                ]),
              ])
            }
          />
          {leads.isPending ? (
            <AppSkeleton className="h-24 rounded-2xl" />
          ) : leads.isError ? (
            <AppErrorState error={leads.error} onRetry={() => void leads.refetch()} />
          ) : (
            leads.data.pages
              .flatMap((page) => page.items)
              .map((lead) => (
                <AppPressableCard
                  key={lead.id}
                  className="gap-1"
                  accessibilityLabel={`${allMatching || selected.includes(lead.id) ? 'Deselect' : 'Select'} ${lead.name}`}
                  disabled={allMatching}
                  accessibilityState={{
                    selected: allMatching || selected.includes(lead.id),
                    disabled: allMatching,
                  }}
                  onPress={() => toggle(lead.id)}
                >
                  <AppText variant="label">
                    {allMatching || selected.includes(lead.id) ? '☑' : '☐'} {lead.name}
                  </AppText>
                  <AppText tone="muted">
                    {lead.mobile || lead.phone || 'Missing phone'} · {lead.status}
                  </AppText>
                </AppPressableCard>
              ))
          )}
          {leads.hasNextPage && (
            <AppButton
              title="Load more leads"
              variant="outline"
              loading={leads.isFetchingNextPage}
              onPress={() => void leads.fetchNextPage()}
            />
          )}
          <AppAlert
            tone="info"
            message="Next creates a draft only. The server checks phone numbers, duplicate destinations, consent and opt-outs. Review the personalized messages before confirming a send."
          />
          <AppButton
            title="Create draft & review"
            loading={create.isPending}
            disabled={
              (!allMatching && selected.length === 0) ||
              (!allMatching && selected.length > 5000) ||
              create.isPending ||
              !currentService?.available
            }
            onPress={() => submit()}
          />
        </>
      )}
    </Screen>
  );
}

function CampaignSummary({ campaign }: { campaign: Campaign }) {
  return (
    <View className="flex-row flex-wrap gap-3">
      {[
        'total',
        'eligible',
        'queued',
        'submitting',
        'accepted',
        'sent',
        'delivered',
        'failed',
        'undelivered',
        'unknown',
        'ineligible',
        'suppressed',
        'cancelled',
      ].map((status) => (
        <View key={status} className="min-w-20">
          <AppText variant="h3">{campaign.summary[status] ?? 0}</AppText>
          <AppText variant="caption" tone="muted">
            {status}
          </AppText>
        </View>
      ))}
    </View>
  );
}

export function SmsCampaignDetailScreen({ navigation, route }: RootScreenProps<'SmsCampaignDetail'>) {
  const { campaignId } = route.params;
  const client = useQueryClient();
  const [page, setPage] = useState(1);
  const [failedOnly, setFailedOnly] = useState(false);
  const campaign = useQuery({
    queryKey: [...key, campaignId],
    queryFn: ({ signal }) => messagingApi.campaign(campaignId, signal),
    refetchInterval: 5000,
  });
  const recipients = useQuery({
    queryKey: [...key, campaignId, 'recipients', page, failedOnly],
    queryFn: ({ signal }) =>
      messagingApi.recipients(campaignId, page, failedOnly ? 'failed' : undefined, signal),
    refetchInterval: 5000,
  });
  const action = useMutation({
    mutationFn: (value: 'start' | 'pause' | 'cancel') => messagingApi.action(campaignId, value),
    onSuccess: () => void client.invalidateQueries({ queryKey: key }),
    onError: showApiErrorToast,
  });
  if (campaign.isPending)
    return (
      <Screen>
        <AppSkeleton className="h-40 rounded-2xl" />
      </Screen>
    );
  if (campaign.isError)
    return (
      <Screen>
        <AppErrorState error={campaign.error} onRetry={() => void campaign.refetch()} />
      </Screen>
    );
  const data = campaign.data;
  return (
    <Screen mode="scroll" contentClassName="gap-4 pb-10 pt-3">
      <AppText variant="h2">{data.name}</AppText>
      <AppText tone="muted">
        {data.routing?.smsProvider} · {data.content.language || 'auto'} · {data.status} ·{' '}
        {new Date(data.createdAt).toLocaleString()}
      </AppText>
      {!!data.description && <AppText>{data.description}</AppText>}
      <AppCard className="gap-3">
        <CampaignSummary campaign={data} />
        <View
          accessibilityRole="progressbar"
          accessibilityValue={{
            min: 0,
            max: data.summary.total || 1,
            now: Math.max(
              0,
              (data.summary.total || 0) -
                (data.summary.draft || 0) -
                (data.summary.queued || 0) -
                (data.summary.submitting || 0),
            ),
          }}
          className="h-2 overflow-hidden rounded-full bg-muted"
        >
          <View
            className="h-2 rounded-full bg-primary"
            style={{
              width: `${data.summary.total ? Math.min(100, Math.max(0, (100 * (data.summary.total - (data.summary.draft || 0) - (data.summary.queued || 0) - (data.summary.submitting || 0))) / data.summary.total)) : 0}%`,
            }}
          />
        </View>
      </AppCard>
      <AppCard className="gap-2">
        <AppText variant="h3">Message template</AppText>
        <AppText selectable>{data.content.bodyText}</AppText>
      </AppCard>
      <AppAlert
        tone="info"
        message="Accepted means the provider accepted the request. Sent is transport evidence; delivered requires a receipt. Unknown outcomes must be reconciled before retrying. Sending continues on the server when you leave this screen."
      />
      {data.status === 'draft' && (
        <>
          <AppAlert
            tone="warning"
            message="Review the eligible and excluded recipients below. Confirming queues only eligible recipients; consent and suppression are checked again before sending. Carrier charges may apply."
          />
          <AppButton
            title="Confirm & send SMS"
            disabled={
              !data.summary.eligible || recipients.isPending || recipients.isError || action.isPending
            }
            loading={action.isPending}
            onPress={() => action.mutate('start')}
          />
          {route.params.canEdit && (
            <AppButton title="Back to edit" variant="outline" onPress={() => navigation.goBack()} />
          )}
        </>
      )}
      {['running', 'queued', 'scheduled', 'paused'].includes(data.status) && (
        <View className="gap-2">
          <AppButton
            title={data.status === 'paused' ? 'Confirm & resume' : 'Pause campaign'}
            variant="outline"
            disabled={action.isPending}
            onPress={() => action.mutate(data.status === 'paused' ? 'start' : 'pause')}
          />
          <AppButton
            title="Cancel unsent messages"
            variant="outline"
            disabled={action.isPending}
            onPress={() => action.mutate('cancel')}
          />
        </View>
      )}
      <AppText variant="h3">Personalized messages</AppText>
      <AppText tone="muted">
        Estimated eligible usage: {data.summary.totalSegments ?? 0} SMS segments. Pricing is not available for
        this route.
      </AppText>
      <AppChip
        label="Failed only"
        selected={failedOnly}
        onPress={() => {
          setFailedOnly(!failedOnly);
          setPage(1);
        }}
      />
      {recipients.isError ? (
        <AppErrorState error={recipients.error} onRetry={() => void recipients.refetch()} />
      ) : recipients.isPending ? (
        <AppSkeleton className="h-24 rounded-2xl" />
      ) : (
        recipients.data.map((recipient) => (
          <RecipientCard
            key={recipient._id}
            recipient={recipient}
            campaignId={campaignId}
            onLead={(leadId) => navigation.navigate('LeadDetail', { leadId })}
          />
        ))
      )}
      <View className="flex-row justify-between">
        <AppButton title="Previous" variant="ghost" disabled={page === 1} onPress={() => setPage(page - 1)} />
        <AppText>Page {page}</AppText>
        <AppButton
          title="Next"
          variant="ghost"
          disabled={(recipients.data?.length ?? 0) < 50}
          onPress={() => setPage(page + 1)}
        />
      </View>
    </Screen>
  );
}

function RecipientCard({
  recipient,
  campaignId,
  onLead,
}: {
  recipient: Recipient;
  campaignId: string;
  onLead: (id: string) => void;
}) {
  const client = useQueryClient();
  const retry = useMutation({
    mutationFn: () => messagingApi.retry(campaignId, recipient._id),
    onSuccess: () => void client.invalidateQueries({ queryKey: key }),
    onError: showApiErrorToast,
  });
  const lead = typeof recipient.leadId === 'object' ? recipient.leadId : null;
  const info = analyzeSms(recipient.rendered.bodyText);
  const retryable =
    ['failed', 'undelivered'].includes(recipient.status) &&
    recipient.latestAttempt?.outcome === 'rejected' &&
    recipient.latestAttempt?.failureClass !== 'permanent';
  return (
    <AppCard className="gap-2">
      <AppText variant="h3">{lead?.name || recipient.destination}</AppText>
      <AppText tone="muted">
        {recipient.destination} · {recipient.provider || 'Provider selected at dispatch'} · {recipient.status}
      </AppText>
      <AppText selectable>{recipient.rendered.bodyText}</AppText>
      <AppText variant="caption" tone="muted">
        {info.characters} characters · {info.encoding} · {info.segments} segments
      </AppText>
      {!recipient.eligibility.eligible && (
        <AppAlert tone="warning" message={`Excluded: ${recipient.eligibility.reasons.join(', ')}`} />
      )}
      {!!recipient.error?.message && <AppAlert tone="destructive" message={recipient.error.message} />}
      {!!recipient.sentAt && (
        <AppText variant="caption">Sent: {new Date(recipient.sentAt).toLocaleString()}</AppText>
      )}
      {!!recipient.deliveredAt && (
        <AppText variant="caption">Delivered: {new Date(recipient.deliveredAt).toLocaleString()}</AppText>
      )}
      {!!recipient.providerMessageId && (
        <AppText variant="caption" selectable>
          Provider ID: {recipient.providerMessageId}
        </AppText>
      )}
      {!!recipient.leadId && (
        <AppButton
          title="Open lead"
          variant="ghost"
          onPress={() => onLead(lead?._id || (recipient.leadId as string))}
        />
      )}

      {retryable && (
        <AppButton
          title="Retry failed message"
          variant="outline"
          loading={retry.isPending}
          disabled={retry.isPending}
          onPress={() => retry.mutate()}
        />
      )}
    </AppCard>
  );
}
