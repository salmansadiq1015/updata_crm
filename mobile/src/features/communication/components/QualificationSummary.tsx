import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { AppBadge } from '@/components/ui/AppBadge';
import { AppCard } from '@/components/ui/AppCard';
import { AppText } from '@/components/ui/AppText';
import { cn } from '@/utils/cn';
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
    <View className="gap-1.5">
      <SectionHeader
        title={t('communication.qualification.title')}
        size="group"
        right={
          <AppBadge
            label={t('communication.qualification.progress', { answered, total: schema.length })}
            variant="primary"
            size="sm"
          />
        }
      />
      <AppCard variant="outline" className="py-1">
        {known.length === 0 ? (
          <AppText tone="muted" className="py-2.5">
            {t('communication.qualification.empty')}
          </AppText>
        ) : (
          known.map((field, index) => (
            <View
              key={field.fieldKey}
              className={cn('gap-0.5 py-2.5', index > 0 && 'border-t border-border')}
            >
              <AppText variant="caption" tone="muted">
                {label(field)}
                {field.updatedAt ? ` · ${formatDate(field.updatedAt, i18n.language)}` : ''}
              </AppText>
              <AppText className="font-geist-medium">
                {field.status === 'answered'
                  ? String(field.value ?? '')
                  : tKey(t, `communication.answerStatus.${field.status}`)}
              </AppText>
            </View>
          ))
        )}
      </AppCard>
    </View>
  );
}
