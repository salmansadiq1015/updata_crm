import { zodResolver } from '@hookform/resolvers/zod';
import { Building2, Globe, Mail, MapPin, Phone, Smartphone, Tag, UserRound } from 'lucide-react-native';
import { useMemo, useState, type ReactNode } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useTranslation } from 'react-i18next';
import { Switch, View } from 'react-native';

import { AppAlert } from '@/components/feedback/AppAlert';
import { FormTextField } from '@/components/forms/FormFields';
import { Screen } from '@/components/layout/Screen';
import { AppButton } from '@/components/ui/AppButton';
import { AppErrorState } from '@/components/ui/AppErrorState';
import { AppRadioGroup } from '@/components/ui/AppRadioGroup';
import { AppSkeleton } from '@/components/ui/AppSkeleton';
import { AppText } from '@/components/ui/AppText';
import { useSessionStore } from '@/features/auth/store/sessionStore';
import type { RootScreenProps } from '@/navigation/navigationTypes';
import { ApiError, fieldErrors } from '@/services/api/apiErrors';
import { useTheme } from '@/theme/ThemeProvider';
import { errorMessageKey } from '@/utils/errorMessages';
import { showInfoToast, showSuccessToast, showWarningToast } from '@/utils/toast';

import { LeadPhoneField } from '../components/LeadPhoneField';
import { isLeadId, useCreateLead, useLead, useUpdateLead } from '../hooks/useLeads';
import type { Lead } from '../types';
import {
  BLANK_LEAD_FORM,
  buildLeadCreateInput,
  buildLeadPatch,
  createLeadFormSchema,
  formFieldForServerField,
  isEmptyPatch,
  leadToFormValues,
  type LeadFormValues,
} from '../utils/leadForm';

const NOT_FOUND = new ApiError({ kind: 'http', status: 404, message: 'Invalid lead id' });

/** Create (no `leadId`) or edit a lead. Converted leads are read-only. */
export function LeadFormScreen({ route, navigation }: RootScreenProps<'LeadForm'>) {
  const leadId = route.params?.leadId;
  if (!leadId) return <LeadForm navigation={navigation} />;
  return <EditLead leadId={leadId} navigation={navigation} />;
}

type Navigation = RootScreenProps<'LeadForm'>['navigation'];

function EditLead({ leadId, navigation }: { leadId: string; navigation: Navigation }) {
  const { t } = useTranslation();
  const query = useLead(leadId);
  if (!isLeadId(leadId)) return <AppErrorState error={NOT_FOUND} className="flex-1 bg-background" />;
  if (query.isPending) {
    return (
      <Screen edges={[]} contentClassName="gap-4 pt-4">
        {Array.from({ length: 6 }, (_, index) => (
          <AppSkeleton key={index} className="h-12 w-full rounded-xl" />
        ))}
      </Screen>
    );
  }
  if (query.isError) {
    return (
      <AppErrorState
        error={query.error}
        retrying={query.isRefetching}
        onRetry={() => void query.refetch()}
        className="flex-1 bg-background"
      />
    );
  }
  if (query.data.status === 'converted') {
    return (
      <Screen edges={[]} contentClassName="gap-4 pt-4">
        <AppAlert tone="info" message={t('leads.convertedLocked')} />
        <AppButton title={t('common.back')} variant="outline" onPress={() => navigation.goBack()} />
      </Screen>
    );
  }
  return <LeadForm lead={query.data} navigation={navigation} />;
}

function LeadForm({ lead, navigation }: { lead?: Lead; navigation: Navigation }) {
  const { t } = useTranslation();
  const { colors } = useTheme();
  const me = useSessionStore((state) => state.user);
  const myId = me?.id ?? null;
  const create = useCreateLead();
  const update = useUpdateLead(lead?.id ?? '');
  const [formError, setFormError] = useState<string | null>(null);

  const initial = useMemo(() => (lead ? leadToFormValues(lead, myId) : BLANK_LEAD_FORM), [lead, myId]);
  const schema = useMemo(() => createLeadFormSchema(t), [t]);
  const { control, handleSubmit, setError, formState } = useForm<LeadFormValues>({
    resolver: zodResolver(schema),
    defaultValues: initial,
  });
  const busy = formState.isSubmitting;

  const applyServerErrors = (error: unknown): boolean => {
    let applied = false;
    for (const [field, message] of Object.entries(fieldErrors(error))) {
      const target = formFieldForServerField(field);
      if (target) {
        setError(target, { type: 'server', message });
        applied = true;
      }
    }
    return applied;
  };

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      if (!lead) {
        const { lead: created, duplicateWarning } = await create.mutateAsync(
          buildLeadCreateInput(values, myId),
        );
        if (duplicateWarning) showWarningToast(t('leadForm.duplicateWarning'));
        else showSuccessToast(t('leadForm.created'));
        navigation.replace('LeadDetail', { leadId: created.id });
        return;
      }
      const patch = buildLeadPatch(initial, values, myId);
      if (isEmptyPatch(patch)) {
        showInfoToast(t('leadForm.noChanges'));
        navigation.goBack();
        return;
      }
      await update.mutateAsync(patch);
      showSuccessToast(t('leadForm.updated'));
      navigation.goBack();
    } catch (error) {
      if (!applyServerErrors(error)) setFormError(t(errorMessageKey(error)));
    }
  });

  const otherAssignee =
    lead?.assignedTo && lead.assignedTo.id !== myId
      ? (lead.assignedTo.name ?? t('leadForm.someoneElse'))
      : null;

  return (
    <Screen mode="keyboard" edges={['bottom']} contentClassName="gap-4 pt-3">
      {formError ? <AppAlert tone="destructive" message={formError} /> : null}

      <Section title={t('leadForm.sectionBasics')}>
        <FormTextField
          control={control}
          name="name"
          label={t('leadForm.name')}
          placeholder={t('leadForm.namePlaceholder')}
          leftIcon={Building2}
          autoCapitalize="words"
          disabled={busy}
        />
        <View className="gap-1.5">
          <AppText variant="label" className="ms-0.5">
            {t('leads.typeLabel')}
          </AppText>
          <Controller
            control={control}
            name="type"
            render={({ field }) => (
              <AppRadioGroup
                appearance="segmented"
                accessibilityLabel={t('leads.typeLabel')}
                value={field.value}
                onChange={field.onChange}
                disabled={busy}
                options={[
                  { value: 'business', label: t('leads.type.business') },
                  { value: 'private', label: t('leads.type.private') },
                ]}
              />
            )}
          />
        </View>
      </Section>

      <Section title={t('leads.contact')}>
        <LeadPhoneField
          control={control}
          name="phone"
          label={t('leads.phone')}
          icon={Phone}
          disabled={busy}
        />
        <LeadPhoneField
          control={control}
          name="mobile"
          label={t('leads.mobile')}
          icon={Smartphone}
          disabled={busy}
        />
        <FormTextField
          control={control}
          name="email"
          label={t('leads.email')}
          placeholder="name@company.com"
          leftIcon={Mail}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          disabled={busy}
        />
        <FormTextField
          control={control}
          name="website"
          label={t('leads.website')}
          placeholder="https://example.ch"
          leftIcon={Globe}
          keyboardType="url"
          autoCapitalize="none"
          autoCorrect={false}
          disabled={busy}
        />
      </Section>

      <Section title={t('leads.address')}>
        <FormTextField
          control={control}
          name="street"
          label={t('leadForm.street')}
          leftIcon={MapPin}
          disabled={busy}
        />
        <View className="flex-row gap-3">
          <View className="w-28">
            <FormTextField
              control={control}
              name="postalCode"
              label={t('leadForm.postalCode')}
              keyboardType="number-pad"
              disabled={busy}
            />
          </View>
          <View className="flex-1">
            <FormTextField control={control} name="city" label={t('leadForm.city')} disabled={busy} />
          </View>
        </View>
        <FormTextField
          control={control}
          name="country"
          label={t('leadForm.country')}
          helperText={t('leadForm.countryHint')}
          autoCapitalize="characters"
          autoCorrect={false}
          maxLength={2}
          disabled={busy}
        />
      </Section>

      <Section title={t('leadForm.sectionNotes')}>
        <Controller
          control={control}
          name="assignToMe"
          render={({ field }) => (
            <View className="min-h-12 flex-row items-center gap-3 rounded-xl border border-border bg-card px-4 py-2">
              <UserRound size={18} color={colors.mutedForeground} />
              <View className="flex-1">
                <AppText variant="title">{t('leadForm.assignToMe')}</AppText>
                {otherAssignee && !field.value ? (
                  <AppText variant="caption" tone="muted">
                    {t('leadForm.assignedToOther', { name: otherAssignee })}
                  </AppText>
                ) : null}
              </View>
              <Switch
                accessibilityLabel={t('leadForm.assignToMe')}
                value={field.value}
                onValueChange={field.onChange}
                disabled={busy || !myId}
                trackColor={{ true: colors.primary, false: colors.border }}
                thumbColor={colors.card}
              />
            </View>
          )}
        />
        <FormTextField
          control={control}
          name="tagsText"
          label={t('leads.tags')}
          helperText={t('leadForm.tagsHint')}
          leftIcon={Tag}
          autoCapitalize="none"
          disabled={busy}
        />
        <FormTextField
          control={control}
          name="notes"
          label={t('leads.notes')}
          multiline
          numberOfLines={4}
          textAlignVertical="top"
          disabled={busy}
        />
      </Section>

      <AppButton
        title={lead ? t('common.save') : t('leadForm.create')}
        size="lg"
        loading={busy}
        onPress={onSubmit}
        fullWidth
      />
    </Screen>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="gap-3">
      <AppText variant="overline" tone="muted" accessibilityRole="header" className="px-1">
        {title}
      </AppText>
      {children}
    </View>
  );
}
