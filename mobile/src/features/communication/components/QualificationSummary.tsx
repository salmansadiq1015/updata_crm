import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { formatDate } from '@/utils/date';

import { useQualification } from '../hooks/useCommunication';
import { tKey } from '../i18n';
import { useFieldLabel } from './QualificationEditor';

/** The CRM's reviewed qualification answers for the lead (read-only here). */
export function QualificationSummary({ leadId }: { leadId: string }) {
  const { t, i18n } = useTranslation();
  const label = useFieldLabel();
  const query = useQualification(leadId);
  if (!query.data) return null;
  const { schema, fields } = query.data;
  const known = fields.filter((field) => field.status !== 'unknown');
  const answered = known.filter((field) => field.status === 'answered').length;

  return (
    <AppCard className="gap-2">
      <View className="flex-row items-center gap-2">
        <SectionHeader title={t('communication.qualification.title')} className="flex-1" />
        <AppBadge
          label={t('communication.qualification.progress', { answered, total: schema.length })}
          variant="primary"
        />
      </View>
      {known.length === 0 ? (
        <AppText tone="muted">{t('communication.qualification.empty')}</AppText>
      ) : (
        known.map((field) => (
          <View key={field.fieldKey} className="gap-0.5 border-t border-border py-2">
            <AppText variant="caption" tone="muted">
              {label(field)}
              {field.updatedAt ? ` · ${formatDate(field.updatedAt, i18n.language)}` : ''}
            </AppText>
            <AppText>
              {field.status === 'answered'
                ? String(field.value ?? '')
                : tKey(t, `communication.answerStatus.${field.status}`)}
            </AppText>
          </View>
        ))
      )}
    </AppCard>
  );
}
