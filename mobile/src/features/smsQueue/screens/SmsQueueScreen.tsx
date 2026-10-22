import { useQueries, useQuery } from '@tanstack/react-query';
import {
  CheckCircle2,
  CircleHelp,
  CircleSlash,
  Clock,
  MessageSquare,
  Send,
  Square,
  XCircle,
} from 'lucide-react-native';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AppState, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { Screen } from '@/components/layout/Screen';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppChip } from '@/components/ui/AppChip';
import { AppInput } from '@/components/ui/AppInput';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import { queryKeys } from '@/constants/queryKeys';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import { analyzeSms } from '@/features/communication/domain/smsEncoding';
import {
  ContactFlowError,
  startDirectSms,
  startSms,
  submitOutcome,
} from '@/features/communication/services/contactFlows';
import { useOperationsStore } from '@/features/communication/store/operationsStore';
import { leadsApi } from '@/features/leads/api/leadsApi';
import { linkAssistantApi } from '@/features/linkAssistant/api';
import { syncWatchedNumbers } from '@/features/smsAgent/services/agentControl';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError } from '@/services/api/apiErrors';
import { requestSendSmsPermission, telephony } from '@/services/telephony/telephonyService';
import type { SimInfo } from '@/services/telephony/types';

import {
  AUTOMATIC_GAP_MS,
  buildQueue,
  counts,
  failureReasonKey,
  hasLink,
  MAX_CONSECUTIVE_FAILURES,
  previewWithLink,
  missingValues,
  nextIndex,
  personalize,
  queueProgress,
  RECENT_WINDOW_MS,
  setItem,
  unknownPlaceholders,
  type ItemStatus,
  type QueueItem,
  type QueueMode,
} from '../domain/smsQueue';

const STATUS_ICON: Record<ItemStatus, typeof Clock> = {
  pending: Clock,
  composer_open: MessageSquare,
  sending: Send,
  sent: CheckCircle2,
  not_sent: XCircle,
  unknown: CircleHelp,
  skipped: CircleSlash,
  blocked: CircleSlash,
};

const STATUS_COLOR: Record<ItemStatus, 'success' | 'destructive' | 'warning' | 'mutedForeground'> = {
  pending: 'mutedForeground',
  composer_open: 'mutedForeground',
  sending: 'mutedForeground',
  sent: 'success',
  not_sent: 'destructive',
  unknown: 'warning',
  skipped: 'mutedForeground',
  blocked: 'destructive',
};

/** Start of the "texted recently" window (outside render: reads the clock). */
const recentSince = () => Date.now() - RECENT_WINDOW_MS;

const simLabel = (sim: SimInfo) => sim.displayName || sim.carrierName || `SIM ${sim.slotIndex + 1}`;

function failureDetail(error: unknown): string {
  if (error instanceof ContactFlowError) {
    if (error.code === 'NO_DESTINATION') return 'NO_NUMBER';
    const cause = error.cause instanceof ApiError ? error.cause : null;
    // Eligibility refusals list one detail per reason (e.g. SMS_SUPPRESSED, SMS_CONSENT_DENIED).
    const reasons = (cause?.details ?? []).map((d) => d.message).filter(Boolean);
    if (reasons.length) return reasons.join(', ');
    return cause?.code ?? error.code;
  }
  return error instanceof Error ? error.message : String(error);
}

/**
 * Text several leads from this phone, one at a time: through the Messages app (tap Send per
 * lead) or, where the build allows SEND_SMS, automatically from the chosen SIM. One-way: replies
 * arrive in the Messages app; the app never reads SMS.
 */
export function SmsQueueScreen({ route, navigation }: RootScreenProps<'SmsQueue'>) {
  const { t } = useTranslation();
  const userId = useSessionStore((s) => s.user?.id ?? null);
  const leadIds = useMemo(() => [...new Set(route.params.leadIds)], [route.params.leadIds]);
  const leadQueries = useQueries({
    queries: leadIds.map((id) => ({
      queryKey: queryKeys.leads.detail(id),
      queryFn: ({ signal }: { signal: AbortSignal }) => leadsApi.get(id, signal),
    })),
  });
  const caps = useQuery({
    queryKey: queryKeys.communication.capabilities,
    queryFn: () => telephony.getCapabilities(),
  });
  const sims = useQuery({
    queryKey: queryKeys.communication.sims,
    queryFn: () => telephony.getActiveSims().catch(() => []),
  });
  const automaticAvailable = Boolean(caps.data?.smsPermissionsDeclared && caps.data.hasTelephony);

  // SMS link assistant: an optional campaign whose personal link goes into each SMS ({link}).
  const reminder = route.params.linkPurpose === 'reminder';
  const [linkCampaignId, setLinkCampaignId] = useState<string | null>(route.params.linkCampaignId ?? null);
  const linkCampaigns = useQuery({
    queryKey: queryKeys.linkAssistant.campaigns,
    queryFn: ({ signal }) => linkAssistantApi.campaigns(signal),
  });
  const linkSettings = useQuery({
    queryKey: queryKeys.linkAssistant.settings,
    queryFn: ({ signal }) => linkAssistantApi.settings(signal),
    enabled: Boolean(linkCampaignId),
  });
  const templates = useQuery({
    queryKey: queryKeys.linkAssistant.templates(linkCampaignId),
    queryFn: ({ signal }) => linkAssistantApi.templates(linkCampaignId, signal),
    enabled: Boolean(linkCampaignId),
  });
  const linkCampaign = linkCampaigns.data?.find((c) => c.id === linkCampaignId) ?? null;
  const company = linkCampaign?.company ?? '';
  const link = linkCampaignId
    ? { campaignId: linkCampaignId, purpose: reminder ? ('reminder' as const) : ('initial' as const) }
    : null;

  const [body, setBody] = useState('');
  // Choosing a link campaign pre-fills its template in the campaign's language (editable).
  const defaultTemplate =
    templates.data?.find((tpl) => tpl.language === (linkCampaign?.defaultLanguage ?? 'en'))?.template ?? null;
  const [prefilledFor, setPrefilledFor] = useState<string | null>(null);
  if (linkCampaignId && defaultTemplate && prefilledFor !== linkCampaignId && !body.trim()) {
    setPrefilledFor(linkCampaignId);
    setBody(defaultTemplate);
  }
  const [mode, setMode] = useState<QueueMode>('composer');
  const [simId, setSimId] = useState<number | null>(null);
  const [phase, setPhase] = useState<'compose' | 'confirm' | 'running' | 'done'>('compose');
  const [items, setItems] = useState<QueueItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const itemsRef = useRef<QueueItem[]>([]);
  const stopRef = useRef(false);
  const [stopped, setStopped] = useState(false);
  const update = useCallback((next: QueueItem[]) => {
    itemsRef.current = next;
    setItems(next);
  }, []);

  const loaded = leadQueries.every((q) => q.isSuccess || q.isError);
  const leads = leadQueries.flatMap((q) => (q.data ? [q.data] : []));
  const firstLead = leads[0];
  const preview = previewWithLink(
    firstLead
      ? personalize(body, { name: firstLead.name, city: firstLead.address?.city ?? null }, company)
      : body,
    linkSettings.data?.baseUrl ?? null,
  );
  const info = analyzeSms(preview);
  const linkMissing = Boolean(linkCampaignId) && body.trim() !== '' && !hasLink(body);
  const linkWithoutCampaign = !linkCampaignId && hasLink(body);
  const unknown = unknownPlaceholders(body);
  const missing = missingValues(
    body,
    leads.map((lead) => ({ name: lead.name, city: lead.address?.city ?? null })),
  );
  const severalSims = (sims.data?.length ?? 0) > 1;
  const chosenSim =
    sims.data?.find((s) => s.subscriptionId === simId) ?? (severalSims ? null : (sims.data?.[0] ?? null));

  const begin = () => {
    // Leads texted from this phone recently start as skipped (the user can include them).
    const since = recentSince();
    const recent = new Set(
      Object.values(useOperationsStore.getState().operations)
        .filter(
          (op) =>
            op.channel === 'sms' &&
            op.createdAt >= since &&
            op.userId === userId &&
            // An SMS that certainly did not go out does not count as "texted".
            !['dispatch_failed', 'abandoned'].includes(op.phase) &&
            op.completePayload?.outcome.disposition !== 'not_sent',
        )
        .map((op) => op.leadId),
    );
    update(
      buildQueue(
        leads.map((lead) => ({
          id: lead.id,
          name: lead.name,
          city: lead.address?.city ?? null,
          hasNumber: Boolean(lead.mobile || lead.phone),
        })),
        recent,
      ),
    );
    setError(null);
    setPhase(mode === 'automatic' ? 'confirm' : 'running');
  };

  const leadFor = (item: QueueItem) => {
    const lead = leads.find((l) => l.id === item.lead.id)!;
    return { lead, field: (lead.mobile ? 'mobile' : 'phone') as 'mobile' | 'phone' };
  };

  // ---- automatic: send one by one from the SIM, paced, stoppable.
  const runAutomatic = useCallback(async () => {
    if (!userId) return;
    stopRef.current = false;
    setStopped(false);
    setPhase('running');
    const permission = await requestSendSmsPermission({
      title: t('smsAgent.permission.sendTitle'),
      message: t('readiness.sendSmsMessage'),
      buttonPositive: t('smsAgent.permission.allow'),
      buttonNegative: t('smsAgent.permission.deny'),
    });
    if (permission !== 'granted') {
      setError(t('smsQueue.permissionDenied'));
      setPhase('compose');
      return;
    }
    let refusedInARow = 0;
    for (let i = nextIndex(itemsRef.current); i !== -1; i = nextIndex(itemsRef.current)) {
      if (stopRef.current) break;
      // Repeated operator refusals mean the SIM can't send (no SMS package / balance): stop
      // instead of burning through the list.
      if (refusedInARow >= MAX_CONSECUTIVE_FAILURES) {
        stopRef.current = true;
        setStopped(true);
        setError(t('smsQueue.autoPaused', { count: refusedInARow }));
        break;
      }
      const item = itemsRef.current[i]!;
      update(setItem(itemsRef.current, i, { status: 'sending' }));
      try {
        const { lead, field } = leadFor(item);
        const result = await startDirectSms({
          userId,
          lead: { id: lead.id, name: lead.name },
          destinationField: field,
          body: personalize(body, item.lead, company),
          templateId: null,
          sim: chosenSim,
          link,
        });
        refusedInARow = result.status === 'failed' ? refusedInARow + 1 : 0;
        update(
          setItem(itemsRef.current, i, {
            operationId: result.operationId,
            status: result.status === 'sent' ? 'sent' : result.status === 'failed' ? 'not_sent' : 'unknown',
            detail: result.status === 'failed' ? result.errorCode : null,
          }),
        );
      } catch (e) {
        update(setItem(itemsRef.current, i, { status: 'blocked', detail: failureDetail(e) }));
      }
      if (nextIndex(itemsRef.current) !== -1 && !stopRef.current) {
        await new Promise((resolve) => setTimeout(resolve, AUTOMATIC_GAP_MS));
      }
    }
    setPhase(nextIndex(itemsRef.current) === -1 ? 'done' : 'running');
  }, [userId, t, update, body, chosenSim, company, linkCampaignId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ---- composer: open the Messages app for the next lead; the user reports what happened.
  const openComposer = async (index: number) => {
    if (!userId) return;
    const item = itemsRef.current[index]!;
    try {
      const { lead, field } = leadFor(item);
      const operationId = await startSms({
        userId,
        lead: { id: lead.id, name: lead.name },
        destinationField: field,
        body: personalize(body, item.lead, company),
        templateId: null,
        link,
      });
      update(setItem(itemsRef.current, index, { status: 'composer_open', operationId }));
    } catch (e) {
      update(setItem(itemsRef.current, index, { status: 'blocked', detail: failureDetail(e) }));
    }
  };
  const reportComposer = async (index: number, sent: boolean) => {
    const item = itemsRef.current[index]!;
    if (!item.operationId) return;
    const text = previewWithLink(personalize(body, item.lead, company), linkSettings.data?.baseUrl ?? null);
    const sms = analyzeSms(text);
    await submitOutcome(item.operationId, {
      disposition: sent ? 'sent' : 'not_sent',
      connected: 'unknown',
      notes: '',
      followUpAt: null,
      followUpTimezone: null,
      statusChange: null,
      doNotContact: false,
      answers: [],
      sms: {
        sendStatus: sent ? 'user_reported_sent' : 'user_reported_not_sent',
        encoding: sms.encoding,
        segments: sms.segments,
      },
    });
    const next = setItem(itemsRef.current, index, { status: sent ? 'sent' : 'not_sent' });
    update(next);
    if (nextIndex(next) === -1) setPhase('done');
  };

  // Company build: once link SMS went out, watch those numbers so a "STOP" reply reaches the CRM.
  useEffect(() => {
    if (phase === 'done' && linkCampaignId) void syncWatchedNumbers();
  }, [phase, linkCampaignId]);

  // Coming back from the Messages app re-renders the "did you send it?" question.
  const [, setTick] = useState(0);
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => state === 'active' && setTick((n) => n + 1));
    return () => sub.remove();
  }, []);

  const c = counts(items);
  const progress = queueProgress(items);
  // Known CRM refusal codes read as words; anything else (e.g. a modem error) stays as sent.
  const detailText = (detail: string) => {
    const key = failureReasonKey(detail);
    return key ? t(key) : detail;
  };
  const composerIndex = items.findIndex((item) => item.status === 'composer_open');
  const next = nextIndex(items);

  return (
    <Screen mode="keyboard" contentClassName="gap-4 px-4 pb-10 pt-3">
      {phase === 'compose' ? (
        <>
          <AppText tone="muted">{t('smsQueue.intro', { count: leadIds.length })}</AppText>
          {error ? <AppAlert tone="destructive" message={error} /> : null}
          {linkCampaigns.data?.length || linkCampaignId ? (
            <AppCard className="gap-3">
              <SectionHeader title={reminder ? t('smsQueue.link.reminderTitle') : t('smsQueue.link.title')} />
              <AppText variant="caption" tone="muted">
                {t('smsQueue.link.hint')}
              </AppText>
              <View className="flex-row flex-wrap gap-2">
                {!reminder ? (
                  <AppChip
                    label={t('smsQueue.link.none')}
                    selected={!linkCampaignId}
                    onPress={() => setLinkCampaignId(null)}
                  />
                ) : null}
                {(linkCampaigns.data ?? []).map((campaign) => (
                  <AppChip
                    key={campaign.id}
                    label={campaign.name}
                    selected={linkCampaignId === campaign.id}
                    onPress={() => setLinkCampaignId(campaign.id)}
                  />
                ))}
              </View>
              {linkCampaignId && templates.data?.length ? (
                <View className="gap-2">
                  <AppText variant="label">{t('smsQueue.link.templates')}</AppText>
                  <View className="flex-row flex-wrap gap-2">
                    {templates.data.map((tpl) => (
                      <AppChip
                        key={tpl.language}
                        selected={body === tpl.template}
                        label={t(`smsQueue.link.language.${tpl.language}` as never)}
                        onPress={() => setBody(tpl.template)}
                      />
                    ))}
                  </View>
                </View>
              ) : null}
            </AppCard>
          ) : null}
          <AppCard className="gap-3">
            <AppInput
              label={t('smsQueue.message')}
              value={body}
              onChangeText={setBody}
              multiline
              placeholder={t('smsQueue.placeholder')}
              accessibilityLabel={t('smsQueue.message')}
            />
            <View className="flex-row flex-wrap gap-2">
              {(linkCampaignId
                ? (['name', 'city', 'company', 'link'] as const)
                : (['name', 'city'] as const)
              ).map((key) => (
                <AppChip
                  key={key}
                  selected={false}
                  label={t(`smsQueue.insert.${key}`)}
                  onPress={() =>
                    setBody((current) => `${current}${current && !current.endsWith(' ') ? ' ' : ''}{${key}}`)
                  }
                />
              ))}
            </View>
            {linkMissing ? <AppAlert tone="warning" message={t('smsQueue.link.missing')} /> : null}
            {linkWithoutCampaign ? (
              <AppAlert tone="destructive" message={t('smsQueue.link.noCampaign')} />
            ) : null}
            {unknown.length ? (
              <AppAlert
                tone="warning"
                message={t('smsQueue.unknownPlaceholders', { names: unknown.join(', ') })}
              />
            ) : null}
            {missing.map((m) => (
              <AppAlert
                key={m.placeholder}
                tone="warning"
                message={t('smsQueue.missingValue', {
                  placeholder: `{${m.placeholder}}`,
                  count: m.names.length,
                  names: m.names.slice(0, 5).join(', '),
                })}
              />
            ))}
            {firstLead && body.trim() ? (
              <View className="gap-1">
                <AppText variant="label">{t('smsQueue.preview', { name: firstLead.name })}</AppText>
                {/* Shaped like the SMS the lead receives. */}
                <View className="max-w-[92%] self-start rounded-2xl rounded-bl-md bg-muted px-3.5 py-2.5">
                  <AppText selectable>{preview}</AppText>
                </View>
                <AppText variant="caption" tone={info.segments > 1 ? 'warning' : 'muted'}>
                  {t('communication.sms.meter', {
                    characters: info.characters,
                    encoding: info.encoding,
                    segments: info.segments,
                    remaining: info.remainingInSegment,
                  })}
                </AppText>
              </View>
            ) : null}
          </AppCard>

          <AppCard className="gap-3">
            <SectionHeader title={t('smsQueue.howTitle')} />
            <AppRadioGroup<QueueMode>
              accessibilityLabel={t('smsQueue.howTitle')}
              value={mode}
              onChange={setMode}
              options={[
                {
                  value: 'composer',
                  label: t('smsQueue.mode.composer'),
                  description: t('smsQueue.mode.composerHint'),
                },
                ...(automaticAvailable
                  ? [
                      {
                        value: 'automatic' as const,
                        label: t('smsQueue.mode.automatic'),
                        description: t('smsQueue.mode.automaticHint'),
                      },
                    ]
                  : []),
              ]}
            />
            {automaticAvailable ? null : (
              <AppText variant="caption" tone="muted">
                {t('smsQueue.mode.automaticUnavailable')}
              </AppText>
            )}
            {mode === 'automatic' && severalSims ? (
              <View className="gap-2">
                <AppText variant="label">{t('smsAgent.sim.label')}</AppText>
                <View className="flex-row flex-wrap gap-2">
                  {sims.data!.map((sim) => (
                    <AppChip
                      key={sim.subscriptionId}
                      label={simLabel(sim)}
                      selected={simId === sim.subscriptionId}
                      onPress={() => setSimId(sim.subscriptionId)}
                    />
                  ))}
                </View>
              </View>
            ) : null}
          </AppCard>

          <AppButton
            title={t('smsQueue.start', { count: leadIds.length })}
            leftIcon={Send}
            disabled={
              !loaded ||
              !leads.length ||
              !body.trim() ||
              linkWithoutCampaign ||
              (mode === 'automatic' && severalSims && !chosenSim)
            }
            onPress={begin}
          />
        </>
      ) : null}

      {phase === 'confirm' ? (
        <AppCard className="gap-3">
          <AppText variant="title">{t('smsQueue.confirmTitle', { count: c.pending })}</AppText>
          <AppText tone="muted">
            {t('smsQueue.confirmBody', { sim: chosenSim ? simLabel(chosenSim) : t('smsQueue.defaultSim') })}
          </AppText>
          {c.skipped > 0 ? (
            <View className="gap-2">
              <AppText tone="muted">{t('smsQueue.recentSkipped', { count: c.skipped })}</AppText>
              <AppButton
                title={t('smsQueue.includeAll')}
                variant="outline"
                onPress={() =>
                  update(
                    itemsRef.current.map((item) =>
                      item.status === 'skipped' && item.recentlyTexted
                        ? { ...item, status: 'pending' }
                        : item,
                    ),
                  )
                }
              />
            </View>
          ) : null}
          <AppButton
            title={t('smsQueue.confirmSend')}
            leftIcon={Send}
            disabled={c.pending === 0}
            onPress={() => void runAutomatic()}
          />
          <AppButton title={t('common.back')} variant="ghost" onPress={() => setPhase('compose')} />
        </AppCard>
      ) : null}

      {phase === 'running' || phase === 'done' ? (
        <>
          <AppCard className="gap-2">
            <AppText variant="title">
              {phase === 'done' ? t('smsQueue.doneTitle') : t('smsQueue.runningTitle')}
            </AppText>
            <View
              accessible
              accessibilityRole="progressbar"
              accessibilityLabel={t('smsQueue.progressLabel')}
              accessibilityValue={{ min: 0, max: progress.total, now: progress.processed }}
              className="gap-1.5"
            >
              <View className="h-2 overflow-hidden rounded-full bg-muted">
                <View
                  className="h-full rounded-full bg-primary"
                  style={{ width: `${Math.round(progress.fraction * 100)}%` }}
                />
              </View>
              <AppText variant="caption" tone="muted">
                {t('smsQueue.progressCount', progress)}
              </AppText>
            </View>
            <AppText tone="muted">{t('smsQueue.counts', c)}</AppText>
            {c.sent > 0 ? (
              <AppText variant="caption" tone="muted">
                {mode === 'automatic' ? t('smsQueue.sentMeaningAutomatic') : t('smsQueue.sentMeaningComposer')}
              </AppText>
            ) : null}
            {mode === 'automatic' &&
            phase === 'running' &&
            items.some((i) => i.status === 'sending' || i.status === 'pending') ? (
              <AppButton
                title={t('smsQueue.stop')}
                leftIcon={Square}
                variant="outline"
                onPress={() => {
                  stopRef.current = true;
                  setStopped(true);
                }}
              />
            ) : null}
            {mode === 'automatic' && phase === 'running' && stopped && next !== -1 ? (
              <AppButton title={t('smsQueue.resume')} onPress={() => void runAutomatic()} />
            ) : null}
            {mode === 'automatic' && c.notSent > 0 ? (
              <AppText tone="destructive">{t('smsQueue.networkRefused')}</AppText>
            ) : null}
          </AppCard>

          {mode === 'composer' && composerIndex !== -1 ? (
            <AppCard className="gap-3">
              <AppText variant="title">
                {t('smsQueue.didYouSend', { name: items[composerIndex]!.lead.name })}
              </AppText>
              <View className="flex-row flex-wrap gap-2">
                <AppButton
                  title={t('smsQueue.yesSent')}
                  onPress={() => void reportComposer(composerIndex, true)}
                />
                <AppButton
                  title={t('smsQueue.notSent')}
                  variant="outline"
                  onPress={() => void reportComposer(composerIndex, false)}
                />
              </View>
            </AppCard>
          ) : mode === 'composer' && next !== -1 ? (
            <AppCard className="gap-3">
              <AppText variant="title">{items[next]!.lead.name}</AppText>
              <AppText tone="muted">
                {previewWithLink(
                  personalize(body, items[next]!.lead, company),
                  linkSettings.data?.baseUrl ?? null,
                )}
              </AppText>
              <AppButton
                title={t('smsQueue.openMessages')}
                leftIcon={MessageSquare}
                onPress={() => void openComposer(next)}
              />
              <AppButton
                title={t('smsQueue.skip')}
                variant="ghost"
                onPress={() => {
                  const skipped = setItem(itemsRef.current, next, { status: 'skipped' });
                  update(skipped);
                  if (nextIndex(skipped) === -1) setPhase('done');
                }}
              />
            </AppCard>
          ) : null}

          <SectionHeader title={t('smsQueue.leads')} />
          {items.map((item, index) => (
            <AppCard key={item.lead.id} className="flex-row items-center gap-3">
              <Icon icon={STATUS_ICON[item.status]} size="sm" color={STATUS_COLOR[item.status]} />
              <View className="min-w-0 flex-1">
                <AppText variant="label" numberOfLines={1}>
                  {item.lead.name}
                </AppText>
                <AppText variant="caption" tone="muted">
                  {t(`smsQueue.status.${item.status}`)}
                  {item.detail ? ` · ${detailText(item.detail)}` : ''}
                  {item.recentlyTexted && item.status === 'skipped' ? ` · ${t('smsQueue.recent')}` : ''}
                </AppText>
              </View>
              {item.status === 'skipped' && item.recentlyTexted && phase === 'running' ? (
                <AppButton
                  title={t('smsQueue.include')}
                  size="sm"
                  variant="ghost"
                  onPress={() => update(setItem(itemsRef.current, index, { status: 'pending' }))}
                />
              ) : null}
            </AppCard>
          ))}
          {phase === 'done' ? (
            <AppButton title={t('common.close')} variant="outline" onPress={() => navigation.goBack()} />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}
