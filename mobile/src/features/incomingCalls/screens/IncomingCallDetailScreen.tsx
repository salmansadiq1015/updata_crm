import { CalendarPlus, ChevronRight, Radio } from 'lucide-react-native';
import { useState, type ReactNode } from 'react';
import type { TFunction } from 'i18next';
import { useTranslation } from 'react-i18next';
import { Pressable, View } from 'react-native';

import { Screen } from '@/components/layout/Screen';
import { AppBadge, type BadgeVariant } from '@/components/ui/AppBadge';
import { AppButton } from '@/components/ui/AppButton';
import { AppCard } from '@/components/ui/AppCard';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppInput } from '@/components/ui/AppInput';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { Icon } from '@/components/ui/Icon';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { formatDateTime } from '@/utils/date';

import {
  AiStatusBadge,
  CallerHeader,
  CallRouting,
  CallStatusBadge,
  CallWaitingNote,
  HandoffBanner,
} from '../components/CallBadges';
import { CallControls } from '../components/CallControls';
import { FollowUpSheet } from '../components/FollowUpSheet';
import { LeadChooserSheet, needsLeadChoice } from '../components/LeadChooserSheet';
import { WorkPanel } from '../components/WorkPanel';
import { TranscriptView } from '../components/TranscriptView';
import {
  formatCost,
  formatDuration,
  isLive,
  isTerminal,
  rangDuringOtherCall,
} from '../domain/incomingCallDomain';
import {
  useAddInboundNote,
  useDecideRecommendation,
  useInboundCall,
  useInboundRealtime,
} from '../hooks/useIncomingCalls';
import type { ClosingQuestion, InboundCallDetail, LeadChoice, Recommendation } from '../types';

const ANSWER_VARIANT: Record<string, BadgeVariant> = {
  answered: 'success',
  partially_answered: 'warning',
  unanswered: 'destructive',
  deferred: 'muted',
};
const QUALIFICATION_VARIANT: Record<string, BadgeVariant> = {
  QUALIFIED: 'success',
  PARTIALLY_QUALIFIED: 'info',
  CALLBACK_REQUIRED: 'warning',
  SUPPORT_REQUIRED: 'warning',
  NOT_QUALIFIED: 'muted',
  INFORMATION_ONLY: 'muted',
  UNRESOLVED: 'muted',
};

/**
 * Label for a caller field key: the app's translation for the standard fields, otherwise the
 * label the server sends (custom keys such as custom_party_size → "Party size").
 */
function useFieldLabel(call: InboundCallDetail) {
  const { t } = useTranslation();
  const labels = new Map<string, string>();
  for (const q of call.qa.closingQuestions) if (q.label) labels.set(q.key, q.label);
  for (const f of call.fields) if (f.label && f.label !== f.key) labels.set(f.key, f.label);
  return (key: string) =>
    t(`incomingCalls.fields.${key}`, { defaultValue: labels.get(key) ?? key.replace(/_/g, ' ') });
}

/** Everything recorded about one incoming call, plus the owner's follow-up actions. */
export function IncomingCallDetailScreen({ navigation, route }: RootScreenProps<'IncomingCallDetail'>) {
  const { id } = route.params;
  const connected = useInboundRealtime();
  const call = useInboundCall(id, connected);

  if (call.isPending) {
    return (
      <Screen contentClassName="gap-4 pt-1">
        <AppSkeleton className="h-40 rounded-2xl" />
        <AppSkeleton className="h-64 rounded-2xl" />
      </Screen>
    );
  }
  if (call.isError || !call.data) {
    return (
      <Screen contentClassName="pt-1">
        <AppErrorState error={call.error} retrying={call.isRefetching} onRetry={() => void call.refetch()} />
      </Screen>
    );
  }
  const data = call.data;
  const openLead = (leadId: string) => navigation.navigate('LeadDetail', { leadId });

  // Keyboard-aware for the note field (that mode has no pull-to-refresh): the call polls while
  // it is live or still being processed, and realtime events refresh it.
  return (
    <Screen mode="keyboard" contentClassName="gap-4 pt-1 pb-10">
      <HeaderCard call={data} onOpenLive={() => navigation.navigate('IncomingCallLive', { id })} />
      <WorkPanel call={data} />
      <LeadCard call={data} onOpenLead={openLead} />
      <CallInfoCard call={data} />
      <SummaryCard call={data} />
      <QuestionsCard call={data} />
      <ClosingQuestionsCard call={data} />
      <FieldsCard call={data} />
      <TranscriptCard call={data} />
      <RecommendationsCard call={data} />
      <NotesCard call={data} />
    </Screen>
  );
}

function Section({ title, children, right }: { title: string; children: ReactNode; right?: ReactNode }) {
  return (
    <AppCard className="gap-3">
      <View className="flex-row items-center justify-between gap-2">
        <AppText variant="title" accessibilityRole="header" className="flex-1">
          {title}
        </AppText>
        {right}
      </View>
      {children}
    </AppCard>
  );
}

function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  if (value == null || value === '') return null;
  return (
    <View className="flex-row items-start gap-3">
      <AppText variant="caption" tone="muted" className="w-28 pt-0.5">
        {label}
      </AppText>
      {typeof value === 'string' ? (
        <AppText className="flex-1">{value}</AppText>
      ) : (
        <View className="flex-1">{value}</View>
      )}
    </View>
  );
}

function HeaderCard({ call, onOpenLive }: { call: InboundCallDetail; onOpenLive: () => void }) {
  const { t } = useTranslation();
  const live = isLive(call.status);
  const handoffWaiting = Boolean(call.handoff?.requested) && call.handoff?.status === 'waiting' && live;
  return (
    <AppCard className="gap-3">
      <CallerHeader call={call} />
      {handoffWaiting ? <HandoffBanner reason={call.handoff?.reason ?? null} /> : null}
      {rangDuringOtherCall(call) ? <CallWaitingNote /> : null}
      <View className="flex-row flex-wrap gap-1.5">
        <CallStatusBadge status={call.status} />
        <AiStatusBadge aiStatus={call.aiStatus} />
      </View>
      <CallRouting call={call} />
      {live ? (
        <>
          <CallControls call={call} />
          <Pressable
            onPress={onOpenLive}
            accessibilityRole="button"
            accessibilityLabel={t('incomingCalls.openLive')}
            className="flex-row items-center gap-2 rounded-xl bg-primary/10 px-3 py-2.5 active:bg-primary/15"
          >
            <Icon icon={Radio} size="sm" color="primary" />
            <AppText variant="label" tone="primary" className="flex-1">
              {t('incomingCalls.openLive')}
            </AppText>
            <Icon icon={ChevronRight} size="sm" color="primary" flipRtl />
          </Pressable>
        </>
      ) : null}
    </AppCard>
  );
}

function LeadCard({ call, onOpenLead }: { call: InboundCallDetail; onOpenLead: (id: string) => void }) {
  const { t } = useTranslation();
  const lead = call.leadDetail;
  return (
    <Section title={t('incomingCalls.detail.lead')}>
      {lead ? (
        <View className="gap-2">
          <View className="flex-row flex-wrap items-center gap-1.5">
            <AppText variant="title">{lead.name ?? lead.number ?? '—'}</AppText>
            {lead.number ? <AppBadge label={lead.number} variant="outline" size="sm" /> : null}
            {call.lead?.created ? (
              <AppBadge label={t('incomingCalls.detail.leadCreated')} variant="primary" size="sm" />
            ) : null}
          </View>
          <InfoRow label={t('incomingCalls.detail.leadStatus')} value={lead.status} />
          <InfoRow label={t('incomingCalls.detail.phone')} value={lead.phone} />
          <InfoRow label={t('incomingCalls.detail.email')} value={lead.email} />
          <InfoRow label={t('incomingCalls.detail.city')} value={lead.city} />
          <AppButton
            title={t('incomingCalls.detail.openLead')}
            variant="soft"
            size="sm"
            rightIcon={ChevronRight}
            onPress={() => onOpenLead(lead.id)}
          />
        </View>
      ) : (
        <View className="gap-2">
          <AppText tone="muted">{t('incomingCalls.detail.noLead')}</AppText>
          {call.match.candidates.length > 0 ? (
            <>
              <AppText variant="label">{t('incomingCalls.detail.candidates')}</AppText>
              {call.match.candidates.map((c) => (
                <AppButton
                  key={c.id}
                  title={[c.name, c.number].filter(Boolean).join(' · ') || c.id}
                  variant="outline"
                  size="sm"
                  rightIcon={ChevronRight}
                  onPress={() => onOpenLead(c.id)}
                />
              ))}
            </>
          ) : null}
        </View>
      )}
    </Section>
  );
}

function CallInfoCard({ call }: { call: InboundCallDetail }) {
  const { t, i18n } = useTranslation();
  const answeredBy =
    call.answeredBy === 'ai'
      ? t('incomingCalls.detail.answeredByAi')
      : call.answeredBy === 'human'
        ? t('incomingCalls.detail.answeredByHuman')
        : isTerminal(call.status)
          ? t('incomingCalls.detail.answeredByNone')
          : null;
  return (
    <Section title={t('incomingCalls.detail.callInfo')}>
      <View className="gap-2">
        <InfoRow
          label={t('incomingCalls.detail.started')}
          value={formatDateTime(call.detectedAt, i18n.language)}
        />
        <InfoRow label={t('incomingCalls.detail.answeredBy')} value={answeredBy} />
        <InfoRow
          label={t('incomingCalls.detail.outcome')}
          value={
            call.outcome ? t(`incomingCalls.outcome.${call.outcome}`, { defaultValue: call.outcome }) : null
          }
        />
        <InfoRow
          label={t('incomingCalls.meta.duration')}
          value={call.durationSeconds > 0 ? formatDuration(call.durationSeconds) : null}
        />
        <InfoRow
          label={t('incomingCalls.detail.ring')}
          value={call.ringSeconds != null ? formatDuration(call.ringSeconds) : null}
        />
        <InfoRow
          label={t('incomingCalls.detail.inquiry')}
          value={
            call.primaryInquiry
              ? t(`incomingCalls.inquiry.${call.primaryInquiry}`, { defaultValue: call.primaryInquiry })
              : null
          }
        />
        <InfoRow
          label={t('incomingCalls.detail.language')}
          value={call.language?.current?.toUpperCase() ?? null}
        />
        <InfoRow label={t('incomingCalls.detail.rule')} value={call.rule} />
        <InfoRow
          label={t('incomingCalls.detail.endReason')}
          value={call.endReason?.replace(/_/g, ' ') ?? null}
        />
        <InfoRow label={t('incomingCalls.cost.label')} value={costText(call, t, i18n.language)} />
        {call.error?.message ? (
          <AppText variant="caption" tone="destructive">
            {t('incomingCalls.detail.error', { message: call.error.message })}
          </AppText>
        ) : null}
      </View>
    </Section>
  );
}

function BulletList({ title, items }: { title: string; items: string[] }) {
  if (items.length === 0) return null;
  return (
    <View className="gap-0.5">
      <AppText variant="label">{title}</AppText>
      {items.map((item, i) => (
        <AppText key={`${i}-${item}`}>{`• ${item}`}</AppText>
      ))}
    </View>
  );
}

function SummaryCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  const s = call.summary;
  const q = call.qualificationDetail;
  const fieldLabel = useFieldLabel(call);
  return (
    <Section title={t('incomingCalls.detail.summary')}>
      <View className="gap-3">
        {s?.text ? (
          <AppText>{s.text}</AppText>
        ) : (
          <AppText tone="muted">
            {call.processedAt ? t('incomingCalls.detail.noSummary') : t('incomingCalls.detail.processing')}
          </AppText>
        )}
        {s?.reason ? <InfoRow label={t('incomingCalls.detail.reason')} value={s.reason} /> : null}
        <BulletList title={t('incomingCalls.detail.requirements')} items={s?.requirements ?? []} />
        <BulletList title={t('incomingCalls.detail.concerns')} items={s?.concerns ?? []} />
        <BulletList title={t('incomingCalls.detail.unresolved')} items={s?.unresolvedQuestions ?? []} />
        {call.callback?.requested ? (
          <AppBadge
            label={
              call.callback.whenText
                ? t('incomingCalls.detail.callbackWhen', { when: call.callback.whenText })
                : t('incomingCalls.detail.callback')
            }
            variant="warning"
            size="sm"
          />
        ) : null}
        {call.doNotContact ? (
          <AppBadge label={t('incomingCalls.detail.doNotContact')} variant="destructive" size="sm" />
        ) : null}

        <View className="gap-2 border-t border-border pt-3">
          <View className="flex-row flex-wrap items-center gap-2">
            <AppText variant="label" className="font-geist-semibold">
              {t('incomingCalls.detail.qualification')}
            </AppText>
            {q?.result ? (
              <AppBadge
                label={t(`incomingCalls.qualification.${q.result}`, { defaultValue: q.result })}
                variant={QUALIFICATION_VARIANT[q.result] ?? 'muted'}
                size="sm"
              />
            ) : (
              <AppText tone="muted">{t('incomingCalls.detail.notEvaluated')}</AppText>
            )}
            {q?.score != null ? (
              <AppText variant="caption" tone="muted">
                {t('incomingCalls.detail.score', { score: q.score })}
              </AppText>
            ) : null}
          </View>
          {q && q.met.length > 0 ? (
            <InfoRow label={t('incomingCalls.detail.met')} value={q.met.map(fieldLabel).join(', ')} />
          ) : null}
          {q && q.missing.length > 0 ? (
            <InfoRow label={t('incomingCalls.detail.missing')} value={q.missing.map(fieldLabel).join(', ')} />
          ) : null}
        </View>
      </View>
    </Section>
  );
}

function QuestionsCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  const questions = call.qa.callerQuestions;
  return (
    <Section title={t('incomingCalls.detail.questions')}>
      {questions.length === 0 ? (
        <AppText tone="muted">{t('incomingCalls.detail.noQuestions')}</AppText>
      ) : (
        <View className="gap-3">
          {questions.map((q) => (
            <View key={q.id} className="gap-1">
              <AppText>{q.text}</AppText>
              <View className="flex-row flex-wrap gap-1.5">
                <AppBadge
                  label={t(`incomingCalls.inquiry.${q.category}`, { defaultValue: q.category })}
                  variant="muted"
                  size="sm"
                />
                <AppBadge
                  label={t(`incomingCalls.answerStatus.${q.answerStatus}`, { defaultValue: q.answerStatus })}
                  variant={ANSWER_VARIANT[q.answerStatus] ?? 'muted'}
                  size="sm"
                />
              </View>
              {q.answerSummary ? (
                <AppText variant="caption" tone="muted">
                  {q.answerSummary}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </Section>
  );
}

const CLOSING_VARIANT: Record<ClosingQuestion['status'], BadgeVariant> = {
  answered: 'success',
  declined: 'warning',
  not_asked: 'muted',
};

/** "Questions before goodbye": what the agent had to ask at the end, and what came of each. */
function ClosingQuestionsCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel(call);
  const questions = call.qa.closingQuestions;
  if (questions.length === 0) return null;
  return (
    <Section title={t('incomingCalls.closing.title')}>
      <View className="gap-3">
        {questions.map((q) => (
          <View key={q.key} className="gap-1">
            <View className="flex-row flex-wrap items-center gap-1.5">
              <AppText variant="label" className="font-geist-semibold">
                {q.label ?? fieldLabel(q.key)}
              </AppText>
              <AppBadge
                label={t(`incomingCalls.closing.status.${q.status}`)}
                variant={CLOSING_VARIANT[q.status]}
                size="sm"
              />
              {q.required ? (
                <AppBadge label={t('incomingCalls.closing.required')} variant="outline" size="sm" />
              ) : null}
              {q.status === 'answered' && q.explicit === false ? (
                <AppBadge label={t('incomingCalls.detail.inferred')} variant="warning" size="sm" />
              ) : null}
            </View>
            {q.question ? (
              <AppText variant="caption" tone="muted">
                {`“${q.question}”`}
              </AppText>
            ) : null}
            {q.status === 'answered' && q.value ? <AppText>{q.value}</AppText> : null}
          </View>
        ))}
      </View>
    </Section>
  );
}

function FieldsCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  const fieldLabel = useFieldLabel(call);
  const fields = call.fields.filter((f) => !f.superseded);
  const missing = call.qa.missingInformation;
  return (
    <Section title={t('incomingCalls.detail.fields')}>
      {fields.length === 0 ? (
        <AppText tone="muted">{t('incomingCalls.detail.noFields')}</AppText>
      ) : (
        <View className="gap-3">
          {fields.map((f) => (
            <View key={f.id} className="gap-1">
              <View className="flex-row flex-wrap items-center gap-1.5">
                <AppText variant="caption" tone="muted">
                  {fieldLabel(f.key)}
                </AppText>
                <AppBadge
                  label={f.explicit ? t('incomingCalls.detail.explicit') : t('incomingCalls.detail.inferred')}
                  variant={f.explicit ? 'success' : 'warning'}
                  size="sm"
                />
                {f.verification !== 'unverified' ? (
                  <AppBadge
                    label={t(`incomingCalls.verification.${f.verification}`, {
                      defaultValue: f.verification,
                    })}
                    variant={f.verification === 'rejected' ? 'destructive' : 'info'}
                    size="sm"
                  />
                ) : null}
              </View>
              <AppText className={f.verification === 'rejected' ? 'line-through' : undefined}>
                {f.value}
              </AppText>
              {f.evidence ? (
                <AppText variant="caption" tone="muted" numberOfLines={3}>
                  {`“${f.evidence}”`}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      )}
      {missing.length > 0 ? (
        <AppText variant="caption" tone="warning">
          {t('incomingCalls.detail.stillMissing', {
            fields: missing.map(fieldLabel).join(', '),
          })}
        </AppText>
      ) : null}
    </Section>
  );
}

function TranscriptCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  return (
    <Section title={t('incomingCalls.transcript.fullTitle')}>
      <TranscriptView turns={call.transcript} />
    </Section>
  );
}

function RecommendationsCard({ call }: { call: InboundCallDetail }) {
  const { t } = useTranslation();
  const decide = useDecideRecommendation(call.id);
  const [followUpOpen, setFollowUpOpen] = useState(false);
  const [followUpLead, setFollowUpLead] = useState<LeadChoice | null>(null);
  // No lead linked yet: ask which lead (or a new one) before the action that needs it.
  const [choosing, setChoosing] = useState<null | { recId: string } | 'followUp'>(null);
  const noLead = needsLeadChoice(call);

  const execute = (recId: string) => {
    if (noLead) setChoosing({ recId });
    else decide.mutate({ recId, decision: 'execute' });
  };
  const openFollowUp = () => {
    if (noLead) setChoosing('followUp');
    else {
      setFollowUpLead(null);
      setFollowUpOpen(true);
    }
  };
  const chosen = (lead: LeadChoice) => {
    const target = choosing;
    setChoosing(null);
    if (target === 'followUp') {
      setFollowUpLead(lead);
      setFollowUpOpen(true);
    } else if (target) {
      decide.mutate({ recId: target.recId, decision: 'execute', lead });
    }
  };

  return (
    <Section title={t('incomingCalls.recommendations.title')}>
      {call.recommendations.length === 0 ? (
        <AppText tone="muted">{t('incomingCalls.recommendations.none')}</AppText>
      ) : (
        <View className="gap-3">
          {call.recommendations.map((rec) => (
            <RecommendationRow
              key={rec.id}
              rec={rec}
              busy={decide.isPending && decide.variables?.recId === rec.id}
              onDecide={(decision) =>
                decision === 'execute' ? execute(rec.id) : decide.mutate({ recId: rec.id, decision })
              }
            />
          ))}
        </View>
      )}
      <View className="gap-1 border-t border-border pt-3">
        <AppButton
          title={t('incomingCalls.followUp.button')}
          leftIcon={CalendarPlus}
          variant="outline"
          onPress={openFollowUp}
        />
        {noLead ? (
          <AppText variant="caption" tone="muted">
            {t('incomingCalls.followUp.chooseLead')}
          </AppText>
        ) : call.followUpIds.length > 0 ? (
          <AppText variant="caption" tone="muted">
            {t('incomingCalls.followUp.existing', { count: call.followUpIds.length })}
          </AppText>
        ) : null}
      </View>
      <LeadChooserSheet
        call={call}
        visible={choosing !== null}
        onChoose={chosen}
        onClose={() => setChoosing(null)}
      />
      <FollowUpSheet
        callId={call.id}
        lead={followUpLead}
        visible={followUpOpen}
        onClose={() => setFollowUpOpen(false)}
      />
    </Section>
  );
}

function RecommendationRow({
  rec,
  busy,
  onDecide,
}: {
  rec: Recommendation;
  busy: boolean;
  onDecide: (decision: 'execute' | 'dismiss') => void;
}) {
  const { t } = useTranslation();
  const pending = rec.status === 'pending';
  return (
    <View className="gap-1.5">
      <View className="flex-row flex-wrap items-center gap-1.5">
        <AppText variant="label" className="font-geist-semibold">
          {t(`incomingCalls.recommendations.action.${rec.action}`, { defaultValue: rec.action })}
        </AppText>
        {!pending ? (
          <AppBadge
            label={
              rec.status === 'executed'
                ? t('incomingCalls.recommendations.executed')
                : t('incomingCalls.recommendations.dismissed')
            }
            variant={rec.status === 'executed' ? 'success' : 'muted'}
            size="sm"
          />
        ) : null}
      </View>
      {rec.reason ? (
        <AppText variant="caption" tone="muted">
          {rec.reason}
        </AppText>
      ) : null}
      {pending ? (
        <View className="flex-row flex-wrap gap-2">
          <AppButton
            title={t('incomingCalls.recommendations.execute')}
            size="sm"
            disabled={busy}
            loading={busy}
            onPress={() => onDecide('execute')}
          />
          <AppButton
            title={t('incomingCalls.recommendations.dismiss')}
            size="sm"
            variant="ghost"
            disabled={busy}
            onPress={() => onDecide('dismiss')}
          />
        </View>
      ) : null}
    </View>
  );
}

function NotesCard({ call }: { call: InboundCallDetail }) {
  const { t, i18n } = useTranslation();
  const add = useAddInboundNote(call.id);
  const [text, setText] = useState('');
  const save = () => {
    const value = text.trim();
    if (!value) return;
    add.mutate(value, { onSuccess: () => setText('') });
  };
  return (
    <Section title={t('incomingCalls.detail.notes')}>
      {call.notes.length === 0 ? (
        <AppText tone="muted">{t('incomingCalls.detail.noNotes')}</AppText>
      ) : (
        <View className="gap-2">
          {call.notes.map((n) => (
            <View key={n.id} className="gap-0.5 rounded-xl bg-muted/60 p-3">
              <AppText>{n.text}</AppText>
              {n.at || n.byName ? (
                <AppText variant="caption" tone="muted">
                  {[n.byName, formatDateTime(n.at, i18n.language)].filter(Boolean).join(' · ')}
                </AppText>
              ) : null}
            </View>
          ))}
        </View>
      )}
      <AppInput
        accessibilityLabel={t('incomingCalls.detail.notePlaceholder')}
        placeholder={t('incomingCalls.detail.notePlaceholder')}
        value={text}
        onChangeText={setText}
        maxLength={2000}
        multiline
      />
      <AppButton
        title={t('incomingCalls.detail.addNote')}
        variant="soft"
        loading={add.isPending}
        disabled={!text.trim()}
        onPress={save}
      />
    </Section>
  );
}

/** "AI cost: $0.042 (estimate) · gpt-realtime · 12,400 tokens" from the priced cost. */
function costText(call: InboundCallDetail, t: TFunction, language: string): string | null {
  const cost = call.cost;
  if (!cost) return null;
  if (cost.unpriced) return t('incomingCalls.cost.unpriced');
  if (!(cost.amount > 0) && !call.durationSeconds) return null;
  const parts = [formatCost(cost.amount, cost.currency, language)];
  if (cost.estimate) parts[0] = `${parts[0]} (${t('incomingCalls.cost.estimate')})`;
  if (cost.model) parts.push(cost.model);
  if (cost.tokens?.total)
    parts.push(
      t('incomingCalls.cost.tokens', { tokens: new Intl.NumberFormat(language).format(cost.tokens.total) }),
    );
  return parts.join(' · ');
}
